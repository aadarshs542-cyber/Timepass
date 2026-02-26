const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'timepass-rpg-secret',
    resave: false,
    saveUninitialized: true,
  })
);
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT =
  'You are an advanced RPG engine. Track player stats, HP, MP, inventory, morality, achievements, titles, factions, events, map position, and boss phases. Respond with immersive narrative only.';

const SKILL_TREE = {
  warrior: [
    { id: 'power_strike', name: 'Power Strike', prereq: null },
    { id: 'iron_skin', name: 'Iron Skin', prereq: 'power_strike' },
    { id: 'berserker_rage', name: 'Berserker Rage', prereq: 'iron_skin' },
  ],
  mage: [
    { id: 'fireball', name: 'Fireball', prereq: null },
    { id: 'mana_surge', name: 'Mana Surge', prereq: 'fireball' },
    { id: 'arcane_shield', name: 'Arcane Shield', prereq: 'mana_surge' },
  ],
  rogue: [
    { id: 'backstab', name: 'Backstab', prereq: null },
    { id: 'shadow_step', name: 'Shadow Step', prereq: 'backstab' },
    { id: 'poison_blade', name: 'Poison Blade', prereq: 'shadow_step' },
  ],
};

const dailyBoards = {};

const TILE_TYPES = ['Forest', 'Dungeon', 'Village', 'Ruins', 'Boss Arena', 'Event Zone'];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function seedHash(seed, x, y) {
  const str = `${seed}:${x}:${y}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function tileAt(seed, x, y) {
  const idx = seedHash(seed, x, y) % TILE_TYPES.length;
  return TILE_TYPES[idx];
}

function todaySeed() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return Number(`${y}${m}${day}`);
}

function defaultState() {
  return {
    started: false,
    name: 'Adventurer',
    turn: 0,
    level: 1,
    xp: 0,
    skillPoints: 0,
    unlockedSkills: [],
    health: 100,
    maxHealth: 100,
    mana: 60,
    maxMana: 60,
    stats: { strength: 3, intelligence: 3, dexterity: 3, charisma: 3 },
    inventory: [{ name: 'Minor Potion', type: 'potion', effect: { health: 25 } }],
    morality: 0,
    titles: ['Novice Adventurer'],
    achievements: [],
    factions: { ironLegion: 0, arcaneCircle: 0, shadowGuild: 0 },
    worldEvents: [],
    activeEffects: [],
    mapSeed: Math.floor(Math.random() * 10_000_000),
    mapSize: 10,
    playerPosition: { x: 0, y: 0 },
    discoveredTiles: ['0,0'],
    inCombat: false,
    enemy: null,
    hardcoreMode: false,
    ngPlus: false,
    ngPlusUnlocked: false,
    dailyMode: false,
    dailySeed: null,
    gameOver: false,
    ending: null,
    bossPhaseTransition: null,
    history: [{ role: 'assistant', content: 'The Ember Gate opens. Destiny waits in the ash-winds.' }],
  };
}

function getState(req) {
  if (!req.session.playerState) {
    req.session.playerState = defaultState();
    req.session.saves = {};
    req.session.profile = { completed: false, titles: [], achievements: [], carryStats: null, hardcoreClear: false };
  }
  return req.session.playerState;
}

function addAchievement(state, value, events) {
  if (!state.achievements.includes(value)) {
    state.achievements.push(value);
    events.push({ type: 'achievement', value });
  }
}

function addTitle(state, value, events) {
  if (!state.titles.includes(value)) {
    state.titles.push(value);
    events.push({ type: 'title', value });
  }
}

function movePlayer(state, dir) {
  const d = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[dir];
  if (!d) return { ok: false, text: '' };
  const nx = state.playerPosition.x + d[0];
  const ny = state.playerPosition.y + d[1];
  if (nx < 0 || ny < 0 || nx >= state.mapSize || ny >= state.mapSize) {
    return { ok: false, text: 'Ancient barriers block your path at the world edge.' };
  }
  state.playerPosition = { x: nx, y: ny };
  const key = `${nx},${ny}`;
  if (!state.discoveredTiles.includes(key)) state.discoveredTiles.push(key);
  const tile = tileAt(state.mapSeed, nx, ny);
  let text = `You travel ${dir} into a ${tile}. `;
  if (tile === 'Boss Arena' && !state.gameOver && !state.inCombat) {
    state.inCombat = true;
    state.enemy = { name: 'Abyssal Sovereign', kind: 'boss', health: 220, maxHealth: 220, attack: 16, phase: 1, poisonTurns: 0 };
    text += 'A colossal sovereign emerges; final battle begins. ';
  }
  return { ok: true, text };
}

function weightedEvent() {
  const roll = Math.random() * 100;
  if (roll < 20) return 'Meteor Strike';
  if (roll < 40) return 'Plague';
  if (roll < 58) return 'Traveling Merchant';
  if (roll < 80) return 'Bandit Ambush';
  return 'Divine Blessing';
}

function triggerEvent(state, events) {
  const event = weightedEvent();
  let text = '';
  if (event === 'Meteor Strike') {
    const dmg = 10 + Math.floor(Math.random() * 10);
    state.health -= dmg;
    state.factions.ironLegion -= 5;
    state.factions.arcaneCircle -= 5;
    state.factions.shadowGuild -= 5;
    text = `Meteor Strike scorches the realm. You lose ${dmg} HP.`;
    events.push({ type: 'damageToPlayer', value: dmg });
  } else if (event === 'Plague') {
    state.activeEffects.push({ id: 'plague', turns: 4 });
    text = 'A plague spreads. Your vitality decays each turn until cured.';
  } else if (event === 'Traveling Merchant') {
    const rare = { name: `Relic-${Math.floor(Math.random() * 999)}`, type: 'artifact', effect: { morality: 5 } };
    state.inventory.push(rare);
    text = `A traveling merchant appears and offers a rare ${rare.name}.`;
  } else if (event === 'Bandit Ambush') {
    state.inCombat = true;
    state.enemy = { name: 'Bandit Captain', kind: 'enemy', health: 70, maxHealth: 70, attack: 12, poisonTurns: 0 };
    text = 'Bandits ambush your camp. Forced combat begins.';
  } else {
    state.activeEffects.push({ id: 'divineBlessing', turns: 3 });
    text = 'Divine Blessing surrounds you. Your power surges for a short time.';
  }
  state.worldEvents.push({ turn: state.turn, event, text });
  if (state.worldEvents.length > 15) state.worldEvents = state.worldEvents.slice(-15);
  events.push({ type: 'worldEvent', value: text });
  return text;
}

function applyEffects(state, events) {
  state.activeEffects = state.activeEffects
    .map((e) => ({ ...e, turns: e.turns - 1 }))
    .filter((e) => e.turns >= 0);

  const plague = state.activeEffects.find((e) => e.id === 'plague' && e.turns >= 0);
  if (plague) {
    state.health -= 4;
    events.push({ type: 'damageToPlayer', value: 4 });
  }
}

function hasSkill(state, id) {
  return state.unlockedSkills.includes(id);
}

function combatRound(state, action, events) {
  if (!state.inCombat || !state.enemy) return '';
  const lower = action.toLowerCase();
  let text = '';
  let damage = 6 + state.stats.strength * 2;
  let manaCost = 0;

  if (lower.includes('spell') || lower.includes('cast') || hasSkill(state, 'fireball')) {
    manaCost = hasSkill(state, 'fireball') ? 10 : 8;
    if (state.mana >= manaCost) {
      state.mana -= manaCost;
      damage = 9 + state.stats.intelligence * 3;
    }
  }
  if (hasSkill(state, 'power_strike') && lower.includes('strike')) damage += 7;
  if (hasSkill(state, 'berserker_rage') && state.health < state.maxHealth * 0.5) damage += 6;
  if (hasSkill(state, 'backstab') && Math.random() > 0.7) {
    damage = Math.floor(damage * 1.9);
    events.push({ type: 'critical', value: damage });
  }
  if (hasSkill(state, 'poison_blade') && lower.includes('attack')) {
    state.enemy.poisonTurns = 3;
  }

  state.enemy.health -= damage;
  text += `You deal ${damage} damage to ${state.enemy.name}. `;
  events.push({ type: 'damageToEnemy', value: damage });

  if (state.enemy.poisonTurns > 0) {
    state.enemy.health -= 5;
    state.enemy.poisonTurns -= 1;
    text += 'Poison gnaws at your foe. ';
    events.push({ type: 'damageToEnemy', value: 5 });
  }

  if (state.enemy.kind === 'boss') {
    const hpPct = state.enemy.health / state.enemy.maxHealth;
    if (hpPct <= 0.6 && state.enemy.phase === 1) {
      state.enemy.phase = 2;
      state.bossPhaseTransition = 2;
      text += 'Phase 2: the sovereign unleashes area devastation and summons shades. ';
      events.push({ type: 'bossPhase', value: 2 });
    }
    if (hpPct <= 0.25 && state.enemy.phase === 2) {
      state.enemy.phase = 3;
      state.bossPhaseTransition = 3;
      text += 'Phase 3: reality fractures under ultimate wrath. ';
      events.push({ type: 'bossPhase', value: 3 });
    }
  }

  if (state.enemy.health <= 0) {
    const wasBoss = state.enemy.kind === 'boss';
    state.inCombat = false;
    state.enemy.health = 0;
    text += `${state.enemy.name} falls. `;
    state.xp += wasBoss ? 280 : 70;
    if (wasBoss) {
      state.gameOver = true;
      addTitle(state, 'Dragon Slayer', events);
      if (state.hardcoreMode) reqProfileFromState(state).hardcoreClear = true;
    }
    state.enemy = null;
    return text;
  }

  let incoming = state.enemy.attack + Math.floor(Math.random() * 6);
  if (state.enemy.kind === 'boss' && state.enemy.phase >= 2) incoming += 4;
  if (state.enemy.kind === 'boss' && state.enemy.phase === 3) incoming += 6;

  const dodgeBonus = hasSkill(state, 'shadow_step') ? 0.15 : 0;
  if (Math.random() < 0.07 + state.stats.dexterity * 0.01 + dodgeBonus) {
    text += 'You evade the incoming strike. ';
  } else {
    if (hasSkill(state, 'arcane_shield')) incoming = Math.floor(incoming * 0.75);
    state.health -= incoming;
    events.push({ type: 'damageToPlayer', value: incoming });
    text += `${state.enemy.name} hits you for ${incoming}. `;
  }

  return text;
}

function reqProfileFromState(state) {
  return state.__profileRef;
}

function applyFactionLogic(state, action, events) {
  const lower = action.toLowerCase();
  if (lower.includes('iron legion') && lower.includes('help')) state.factions.ironLegion += 10;
  if (lower.includes('arcane circle') && lower.includes('help')) state.factions.arcaneCircle += 10;
  if (lower.includes('shadow guild') && lower.includes('help')) state.factions.shadowGuild += 10;
  if (lower.includes('iron legion') && lower.includes('attack')) state.factions.ironLegion -= 12;
  if (lower.includes('arcane circle') && lower.includes('attack')) state.factions.arcaneCircle -= 12;
  if (lower.includes('shadow guild') && lower.includes('attack')) state.factions.shadowGuild -= 12;

  Object.keys(state.factions).forEach((key) => {
    state.factions[key] = clamp(state.factions[key], -100, 100);
    if (state.factions[key] <= -70 && Math.random() < 0.2 && !state.inCombat) {
      state.inCombat = true;
      state.enemy = { name: `${key} Assassin`, kind: 'enemy', health: 60, maxHealth: 60, attack: 14, poisonTurns: 0 };
      events.push({ type: 'worldEvent', value: `${key} sends assassins after your betrayal.` });
    }
  });
}

function computeEnding(state, events) {
  if (state.health <= 0) return 'Death Ending';
  if (!state.gameOver) return null;

  const domFaction = Object.entries(state.factions).sort((a, b) => b[1] - a[1])[0];
  if (state.ngPlus && domFaction[1] >= 60) {
    addAchievement(state, 'Secret Ending Found', events);
    return 'Eternal Paragon Ending';
  }
  if (domFaction[0] === 'ironLegion' && domFaction[1] > 40) return 'Hero Ending';
  if (domFaction[0] === 'arcaneCircle' && state.stats.intelligence >= 14) return 'Scholar Ending';
  if (domFaction[0] === 'shadowGuild' && state.morality < 0) return 'Corrupted Ending';
  if (state.morality <= -40) return 'Tyrant Ending';
  if (state.inventory.some((i) => i.name.includes('Relic')) && state.level >= 7) return 'Secret God Ending';
  return 'Hero Ending';
}

function applyXpAndLevel(state, events) {
  while (state.xp >= state.level * 100) {
    state.level += 1;
    state.skillPoints += 1;
    state.maxHealth += 10;
    state.maxMana += 8;
    state.health = Math.min(state.maxHealth, state.health + 10);
    state.mana = Math.min(state.maxMana, state.mana + 8);
    events.push({ type: 'levelup', value: state.level });
  }
}

async function aiNarrative(state, action, systemAdditions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return `You act: ${action}. ${systemAdditions}`;
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.8,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...state.history.slice(-8),
          {
            role: 'system',
            content: `State summary: HP ${state.health}/${state.maxHealth}, MP ${state.mana}/${state.maxMana}, pos (${state.playerPosition.x},${state.playerPosition.y}), combat=${state.inCombat}, events=${state.worldEvents.map((w) => w.event).join(', ')}`,
          },
          { role: 'user', content: action },
        ],
      }),
    });
    if (!response.ok) throw new Error('OpenAI request failed');
    const json = await response.json();
    return `${json.choices?.[0]?.message?.content?.trim() || ''} ${systemAdditions}`.trim();
  } catch {
    return `The oracle falters, yet fate advances. ${systemAdditions}`;
  }
}

app.get('/api/state', (req, res) => {
  const state = getState(req);
  res.json({ state, skillTree: SKILL_TREE, dailyLeaderboard: dailyBoards[todaySeed()] || [] });
});

app.post('/api/start', (req, res) => {
  const { name, stats, hardcoreMode, ngPlus, dailyMode } = req.body;
  const total = Object.values(stats || {}).reduce((s, v) => s + Number(v || 0), 0);
  if (total !== 5) return res.status(400).json({ error: 'Allocate exactly 5 points.' });

  if (!req.session.profile) req.session.profile = { completed: false, titles: [], achievements: [], carryStats: null, hardcoreClear: false };
  if (ngPlus && !req.session.profile.completed) return res.status(400).json({ error: 'New Game Plus unlocks after one completion.' });

  const state = defaultState();
  state.started = true;
  state.name = String(name || 'Adventurer').slice(0, 24);
  state.stats.strength += Number(stats.strength || 0);
  state.stats.intelligence += Number(stats.intelligence || 0);
  state.stats.dexterity += Number(stats.dexterity || 0);
  state.stats.charisma += Number(stats.charisma || 0);
  state.hardcoreMode = Boolean(hardcoreMode);
  state.ngPlus = Boolean(ngPlus);
  state.dailyMode = Boolean(dailyMode);
  state.dailySeed = state.dailyMode ? todaySeed() : null;
  if (state.dailyMode) state.mapSeed = state.dailySeed;

  if (state.ngPlus && req.session.profile.carryStats) {
    state.stats.strength += req.session.profile.carryStats.strength;
    state.stats.intelligence += req.session.profile.carryStats.intelligence;
    state.stats.dexterity += req.session.profile.carryStats.dexterity;
    state.stats.charisma += req.session.profile.carryStats.charisma;
    state.titles = Array.from(new Set([...state.titles, ...req.session.profile.titles]));
    state.achievements = Array.from(new Set([...state.achievements, ...req.session.profile.achievements]));
  }

  state.__profileRef = req.session.profile;
  req.session.playerState = state;
  req.session.saves = {};

  res.json({ state, skillTree: SKILL_TREE, narrative: `Welcome ${state.name}. The frontier awakens around you.` });
});

app.post('/api/skill', (req, res) => {
  const state = getState(req);
  state.__profileRef = req.session.profile;
  const { skillId } = req.body;
  if (!state.started) return res.status(400).json({ error: 'Start first.' });
  if (state.skillPoints <= 0) return res.status(400).json({ error: 'No skill points available.' });
  if (state.unlockedSkills.includes(skillId)) return res.status(400).json({ error: 'Skill already unlocked.' });

  const node = Object.values(SKILL_TREE).flat().find((s) => s.id === skillId);
  if (!node) return res.status(404).json({ error: 'Unknown skill.' });
  if (node.prereq && !state.unlockedSkills.includes(node.prereq)) return res.status(400).json({ error: 'Prerequisite skill locked.' });

  if (skillId === 'iron_skin') state.maxHealth += 20;
  if (skillId === 'mana_surge') state.maxMana += 20;

  state.unlockedSkills.push(skillId);
  state.skillPoints -= 1;
  res.json({ state, unlocked: skillId });
});

app.post('/api/action', async (req, res) => {
  const state = getState(req);
  state.__profileRef = req.session.profile;
  if (!state.started) return res.status(400).json({ error: 'Start the game first.' });
  const action = String(req.body.action || '').trim();
  if (!action) return res.status(400).json({ error: 'Action required.' });

  if (state.ending) return res.json({ state, events: [], narrative: `Ending achieved: ${state.ending}.` });

  state.turn += 1;
  const events = [];
  let sysText = '';

  if (/go north|go south|go east|go west/i.test(action)) {
    const dir = action.toLowerCase().replace('go ', '').trim();
    const move = movePlayer(state, dir);
    sysText += move.text;
  }

  applyFactionLogic(state, action, events);

  if (state.turn % 5 === 0 || Math.random() < 0.18 || (state.ngPlus && Math.random() < 0.15)) {
    sysText += `${triggerEvent(state, events)} `;
  }

  if (action.toLowerCase().includes('help')) {
    state.morality += 6;
    state.xp += 15;
  }
  if (action.toLowerCase().includes('betray') || action.toLowerCase().includes('steal')) {
    state.morality -= 8;
    state.xp += 8;
  }

  sysText += combatRound(state, action, events);

  if (action.toLowerCase().includes('cure') || action.toLowerCase().includes('antidote')) {
    state.activeEffects = state.activeEffects.filter((e) => e.id !== 'plague');
    sysText += 'The plague is purged from your veins. ';
  }

  state.xp += 8;
  applyEffects(state, events);

  if (state.xp >= 100) addAchievement(state, '100 XP Gained', events);

  state.health = clamp(state.health, 0, state.maxHealth);
  state.mana = clamp(state.mana, 0, state.maxMana);
  state.morality = clamp(state.morality, -100, 100);

  applyXpAndLevel(state, events);

  if (state.health <= 0) {
    state.gameOver = true;
    addTitle(state, 'Fallen One', events);
  }

  state.ending = computeEnding(state, events);
  if (state.ending) {
    req.session.profile.completed = true;
    req.session.profile.titles = Array.from(new Set([...req.session.profile.titles, ...state.titles]));
    req.session.profile.achievements = Array.from(new Set([...req.session.profile.achievements, ...state.achievements]));
    req.session.profile.carryStats = {
      strength: Math.floor(state.stats.strength * 0.2),
      intelligence: Math.floor(state.stats.intelligence * 0.2),
      dexterity: Math.floor(state.stats.dexterity * 0.2),
      charisma: Math.floor(state.stats.charisma * 0.2),
    };
    if (state.hardcoreMode && state.health > 0) addAchievement(state, 'Hardcore Conqueror', events);
  }

  if (state.hardcoreMode && state.health <= 0) {
    req.session.saves = {};
  }

  if (state.dailyMode) {
    const seed = state.dailySeed;
    if (!dailyBoards[seed]) dailyBoards[seed] = [];
    const entry = {
      name: state.name,
      xp: state.xp,
      turns: state.turn,
      bossDefeated: Boolean(state.gameOver && state.health > 0),
    };
    dailyBoards[seed] = dailyBoards[seed].filter((e) => e.name !== state.name);
    dailyBoards[seed].push(entry);
    dailyBoards[seed].sort((a, b) => (b.bossDefeated - a.bossDefeated) || (b.xp - a.xp) || (b.turns - a.turns));
    dailyBoards[seed] = dailyBoards[seed].slice(0, 20);
  }

  const narrative = await aiNarrative(state, action, `${sysText}${state.ending ? ` Ending: ${state.ending}.` : ''}`);
  state.history.push({ role: 'user', content: action }, { role: 'assistant', content: narrative });
  if (state.history.length > 30) state.history = state.history.slice(-30);

  res.json({ state, events, narrative, skillTree: SKILL_TREE, dailyLeaderboard: dailyBoards[state.dailySeed || todaySeed()] || [] });
});

app.post('/api/use-item', (req, res) => {
  const state = getState(req);
  const { itemName } = req.body;
  const idx = state.inventory.findIndex((i) => i.name === itemName);
  if (idx < 0) return res.status(404).json({ error: 'Item not found.' });
  const item = state.inventory[idx];
  const events = [];

  if (item.type === 'potion') {
    const heal = item.effect.health || 0;
    state.health = clamp(state.health + heal, 0, state.maxHealth);
    events.push({ type: 'heal', value: heal });
    state.inventory.splice(idx, 1);
  } else if (item.type === 'artifact') {
    state.morality = clamp(state.morality + (item.effect.morality || 0), -100, 100);
  }

  res.json({ state, events, message: `${item.name} used.` });
});

app.post('/api/save', (req, res) => {
  const state = getState(req);
  if (state.hardcoreMode) return res.status(403).json({ error: 'Hardcore mode cannot save/load.' });
  const slot = String(req.body.slot || 'slot1');
  req.session.saves[slot] = JSON.parse(JSON.stringify(state));
  res.json({ message: `Saved to ${slot}.` });
});

app.post('/api/load', (req, res) => {
  const state = getState(req);
  if (state.hardcoreMode) return res.status(403).json({ error: 'Hardcore mode cannot save/load.' });
  const slot = String(req.body.slot || 'slot1');
  const saved = req.session.saves?.[slot];
  if (!saved) return res.status(404).json({ error: `No save in ${slot}.` });
  req.session.playerState = JSON.parse(JSON.stringify(saved));
  req.session.playerState.__profileRef = req.session.profile;
  res.json({ state: req.session.playerState, message: `Loaded ${slot}.` });
});

app.listen(PORT, () => {
  console.log(`RPG server running on http://localhost:${PORT}`);
});
