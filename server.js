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

const RPG_SYSTEM_PROMPT =
  'You are an advanced RPG engine. Track player stats, HP, MP, inventory, morality, achievements, and titles. Respond with immersive narrative only. Internally update state based on player actions. Combat reduces HP. Spells consume MP. Dialogue may alter morality. Trigger appropriate endings when conditions are met.';

const STARTER_ITEMS = [
  { name: 'Minor Health Potion', type: 'potion', effect: { health: 25 } },
  { name: 'Ember Wand', type: 'weapon', effect: { intelligence: 2, spellBoost: 1 } },
  { name: 'Veil Charm', type: 'artifact', effect: { dodge: 8 } },
];

function createInitialState() {
  return {
    started: false,
    name: 'Adventurer',
    level: 1,
    xp: 0,
    health: 100,
    maxHealth: 100,
    mana: 60,
    maxMana: 60,
    stats: {
      strength: 3,
      intelligence: 3,
      dexterity: 3,
      charisma: 3,
    },
    inventory: [...STARTER_ITEMS],
    morality: 0,
    titles: ['Novice Adventurer'],
    achievements: [],
    rareItemFound: false,
    inCombat: false,
    enemy: null,
    firstSpellCast: false,
    firstBattleDone: false,
    damageEvents: [],
    gameOver: false,
    ending: null,
    history: [
      {
        role: 'assistant',
        content:
          'The wind carries a prophecy to the Ember Frontier. A gate of obsidian opens before you as your fate awakens.',
      },
    ],
  };
}

function getState(req) {
  if (!req.session.playerState) {
    req.session.playerState = createInitialState();
    req.session.saves = {};
  }
  return req.session.playerState;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addAchievement(state, achievement, events) {
  if (!state.achievements.includes(achievement)) {
    state.achievements.push(achievement);
    events.push({ type: 'achievement', value: achievement });
  }
}

function addTitle(state, title, events) {
  if (!state.titles.includes(title)) {
    state.titles.push(title);
    events.push({ type: 'title', value: title });
  }
}

function applyLeveling(state, events) {
  let requiredXp = state.level * 100;
  while (state.xp >= requiredXp) {
    state.level += 1;
    state.maxHealth += 12;
    state.maxMana += 8;
    state.health = Math.min(state.maxHealth, state.health + 12);
    state.mana = Math.min(state.maxMana, state.mana + 8);
    state.stats.strength += 1;
    state.stats.intelligence += 1;
    state.stats.dexterity += 1;
    state.stats.charisma += 1;
    events.push({ type: 'levelup', value: state.level });
    requiredXp = state.level * 100;
  }
}

function determineEnding(state) {
  if (state.health <= 0) return 'Death Ending';
  if (state.gameOver && state.inventory.some((item) => item.name === 'Celestial Sigil') && state.level >= 6) return 'Secret God Ending';
  if (state.gameOver && state.morality >= 45 && !state.inCombat) return 'Hero Ending';
  if (state.gameOver && state.stats.intelligence >= 14 && state.morality > -15) return 'Scholar Ending';
  if (state.gameOver && state.morality <= -45) return 'Tyrant Ending';
  if (state.gameOver && state.morality < 0) return 'Corrupted Ending';
  return null;
}

function startBossFight(state) {
  state.inCombat = true;
  state.enemy = {
    name: 'Abyssal Dragon',
    health: 120,
    maxHealth: 120,
    attack: 18,
  };
}

function computeCombatRound(state, action, events) {
  const lower = action.toLowerCase();
  if (!state.inCombat || !state.enemy) return '';

  let narrative = '';
  const critRoll = Math.random();
  const dodgeChance = 0.08 + state.stats.dexterity * 0.01;

  if (lower.includes('spell')) {
    const manaCost = 12;
    if (state.mana < manaCost) {
      narrative += 'You attempt to cast, but your mana sputters into ash. ';
    } else {
      state.mana -= manaCost;
      let damage = 10 + state.stats.intelligence * 3;
      if (critRoll > 0.87) {
        damage = Math.floor(damage * 1.8);
        narrative += 'A blazing critical spell tears the battlefield apart. ';
        events.push({ type: 'critical', value: damage });
      }
      state.enemy.health -= damage;
      events.push({ type: 'damageToEnemy', value: damage });
      if (!state.firstSpellCast) {
        state.firstSpellCast = true;
        addAchievement(state, 'First Spell', events);
        addTitle(state, 'Mage of Embers', events);
      }
      narrative += `Your arcane blast strikes for ${damage} damage. `;
    }
  } else {
    let damage = 8 + state.stats.strength * 2;
    if (critRoll > 0.9) {
      damage = Math.floor(damage * 1.7);
      narrative += 'Critical hit! Steel and fury collide perfectly. ';
      events.push({ type: 'critical', value: damage });
    }
    state.enemy.health -= damage;
    events.push({ type: 'damageToEnemy', value: damage });
    narrative += `You carve into ${state.enemy.name} for ${damage} damage. `;
  }

  if (state.enemy.health <= 0) {
    state.enemy.health = 0;
    state.inCombat = false;
    state.gameOver = true;
    state.xp += 180;
    state.morality += 10;
    addTitle(state, 'Dragon Slayer', events);
    narrative += 'The Abyssal Dragon crashes to the stone and the realm falls silent. ';
    return narrative;
  }

  if (Math.random() < dodgeChance) {
    narrative += 'You slip through the return strike like a shadow. ';
    addTitle(state, 'Shadow Walker', events);
    return narrative;
  }

  const incoming = state.enemy.attack + Math.floor(Math.random() * 6);
  state.health -= incoming;
  events.push({ type: 'damageToPlayer', value: incoming });
  narrative += `${state.enemy.name} retaliates and wounds you for ${incoming}. `;

  return narrative;
}

function maybeFindRareItem(state, action, events) {
  const lower = action.toLowerCase();
  if (state.rareItemFound) return '';
  if (lower.includes('search') || lower.includes('ruin') || lower.includes('altar')) {
    const rareItem = { name: 'Celestial Sigil', type: 'artifact', effect: { morality: 10, ascension: true } };
    state.inventory.push(rareItem);
    state.rareItemFound = true;
    addAchievement(state, 'First Rare Item', events);
    return 'In the ruins, you uncover the Celestial Sigil pulsing with forgotten light. ';
  }
  return '';
}

function applyNarrativeRules(state, action, events) {
  const lower = action.toLowerCase();
  let additions = '';

  if (!state.firstBattleDone && (lower.includes('attack') || lower.includes('fight') || lower.includes('battle'))) {
    state.firstBattleDone = true;
    addAchievement(state, 'First Battle', events);
    state.inCombat = true;
    state.enemy = {
      name: 'Ashfang Raider',
      health: 50,
      maxHealth: 50,
      attack: 12,
    };
    additions += 'An Ashfang Raider leaps from the smoke and battle begins. ';
  }

  if (lower.includes('help') || lower.includes('spare') || lower.includes('protect')) {
    state.morality += 6 + state.stats.charisma;
  }
  if (lower.includes('threaten') || lower.includes('steal') || lower.includes('betray')) {
    state.morality -= 7;
  }

  if (lower.includes('trap')) {
    const trapDamage = 7 + Math.floor(Math.random() * 9);
    state.health -= trapDamage;
    events.push({ type: 'damageToPlayer', value: trapDamage });
    additions += `A hidden trap snaps shut and drains ${trapDamage} HP. `;
  }

  if (lower.includes('spell') && !state.inCombat) {
    const manaCost = 8;
    if (state.mana >= manaCost) {
      state.mana -= manaCost;
      state.xp += 12 + state.stats.intelligence;
      additions += 'You weave a controlled spell and your mastery grows. ';
      if (!state.firstSpellCast) {
        state.firstSpellCast = true;
        addAchievement(state, 'First Spell', events);
        addTitle(state, 'Mage of Embers', events);
      }
    }
  }

  additions += maybeFindRareItem(state, action, events);

  if (lower.includes('dragon') || lower.includes('final boss')) {
    if (!state.inCombat && !state.gameOver) {
      startBossFight(state);
      additions += 'The sky splits as the Abyssal Dragon descends for the final battle. ';
    }
  }

  if (state.inCombat) {
    additions += computeCombatRound(state, action, events);
    if (!state.inCombat && state.enemy && state.enemy.name === 'Ashfang Raider' && state.enemy.health <= 0) {
      state.xp += 45;
      state.morality += 2;
      additions += 'The raider collapses; nearby villagers hail your courage. ';
      state.enemy = null;
    }
  }

  state.xp += 8;

  if (state.xp >= 100) {
    addAchievement(state, '100 XP Gained', events);
  }

  if (state.health <= 0) {
    state.health = 0;
    state.gameOver = true;
    addTitle(state, 'Fallen One', events);
  }

  if (state.inventory.some((item) => item.name === 'Celestial Sigil') && state.level >= 6) {
    addTitle(state, 'Ascended', events);
  }

  state.health = clamp(state.health, 0, state.maxHealth);
  state.mana = clamp(state.mana, 0, state.maxMana);
  state.morality = clamp(state.morality, -100, 100);

  applyLeveling(state, events);

  state.ending = determineEnding(state);
  if (state.ending === 'Secret God Ending') {
    addAchievement(state, 'Secret Ending Found', events);
  }

  return additions;
}

async function generateAiNarrative(state, action, rulesNarrative) {
  const apiKey = process.env.OPENAI_API_KEY;
  const messages = [
    { role: 'system', content: RPG_SYSTEM_PROMPT },
    ...state.history.slice(-10),
    { role: 'user', content: action },
  ];

  if (!apiKey) {
    return `You advance with intent. ${rulesNarrative}The world answers your will, and every choice etches deeper into legend.`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.8,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || `The journey continues. ${rulesNarrative}`;
  } catch (error) {
    return `A storm of fate interrupts the oracle. ${rulesNarrative}Still, your quest surges onward.`;
  }
}

app.get('/api/state', (req, res) => {
  const state = getState(req);
  res.json({ state });
});

app.post('/api/start', (req, res) => {
  const { name, stats } = req.body;
  const total = Object.values(stats || {}).reduce((sum, val) => sum + Number(val || 0), 0);

  if (total !== 5) {
    return res.status(400).json({ error: 'Allocate exactly 5 points.' });
  }

  const state = createInitialState();
  state.started = true;
  state.name = (name || 'Adventurer').slice(0, 24);
  state.stats.strength += Number(stats.strength || 0);
  state.stats.intelligence += Number(stats.intelligence || 0);
  state.stats.dexterity += Number(stats.dexterity || 0);
  state.stats.charisma += Number(stats.charisma || 0);

  req.session.playerState = state;
  req.session.saves = {};

  res.json({
    state,
    narrative: `Welcome, ${state.name}. Your boots touch the Ember Frontier as destiny stirs around you.`,
    events: [{ type: 'title', value: 'Novice Adventurer' }],
  });
});

app.post('/api/action', async (req, res) => {
  const state = getState(req);
  if (!state.started) {
    return res.status(400).json({ error: 'Start the game first.' });
  }

  const action = String(req.body.action || '').trim();
  if (!action) {
    return res.status(400).json({ error: 'Action is required.' });
  }

  if (state.ending) {
    return res.json({
      state,
      narrative: `Your fate is sealed: ${state.ending}. Begin a new journey to alter destiny.`,
      events: [],
    });
  }

  const events = [];
  const rulesNarrative = applyNarrativeRules(state, action, events);
  const aiNarrative = await generateAiNarrative(state, action, rulesNarrative);

  const endingText = state.ending
    ? `\n\nEnding Unlocked: ${state.ending}.`
    : '';

  const finalNarrative = `${aiNarrative}${endingText}`;

  state.history.push({ role: 'user', content: action });
  state.history.push({ role: 'assistant', content: finalNarrative });

  if (state.history.length > 30) {
    state.history = state.history.slice(-30);
  }

  res.json({ state, narrative: finalNarrative, events });
});

app.post('/api/use-item', (req, res) => {
  const state = getState(req);
  const { itemName } = req.body;
  const index = state.inventory.findIndex((item) => item.name === itemName);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found.' });
  }

  const events = [];
  const item = state.inventory[index];

  if (item.type === 'potion') {
    const heal = item.effect.health || 0;
    state.health = clamp(state.health + heal, 0, state.maxHealth);
    state.inventory.splice(index, 1);
    events.push({ type: 'heal', value: heal });
  } else if (item.type === 'weapon') {
    state.stats.strength += item.effect.strength || 1;
    state.stats.intelligence += item.effect.intelligence || 0;
    state.inventory.splice(index, 1);
    state.xp += 15;
  } else if (item.type === 'artifact') {
    state.morality = clamp(state.morality + (item.effect.morality || 0), -100, 100);
    state.xp += 20;
    if (item.effect.ascension) {
      addTitle(state, 'Ascended', events);
    }
  }

  applyLeveling(state, events);
  state.ending = determineEnding(state);
  res.json({ state, events, message: `${item.name} used.` });
});

app.post('/api/save', (req, res) => {
  const state = getState(req);
  const slot = String(req.body.slot || 'slot1');
  req.session.saves[slot] = JSON.parse(JSON.stringify(state));
  res.json({ message: `Game saved to ${slot}.` });
});

app.post('/api/load', (req, res) => {
  const slot = String(req.body.slot || 'slot1');
  const saved = req.session.saves?.[slot];
  if (!saved) {
    return res.status(404).json({ error: `No save data in ${slot}.` });
  }
  req.session.playerState = JSON.parse(JSON.stringify(saved));
  res.json({ state: req.session.playerState, message: `Loaded ${slot}.` });
});

app.listen(PORT, () => {
  console.log(`RPG server running on http://localhost:${PORT}`);
});
