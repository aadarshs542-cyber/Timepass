const state = {
  player: null,
  alloc: { strength: 0, intelligence: 0, dexterity: 0, charisma: 0 },
  points: 5,
  soundOn: true,
  backendOnline: true,
};

const narrativeEl = document.getElementById('narrative');
const actionForm = document.getElementById('actionForm');
const actionInput = document.getElementById('actionInput');
const hpBar = document.getElementById('hpBar');
const mpBar = document.getElementById('mpBar');
const hpLabel = document.getElementById('hpLabel');
const mpLabel = document.getElementById('mpLabel');
const inventoryList = document.getElementById('inventoryList');
const inventoryPanel = document.getElementById('inventoryPanel');
const loadingEl = document.getElementById('loading');
const popupContainer = document.getElementById('popupContainer');
const sheetModal = document.getElementById('sheetModal');
const sheetContent = document.getElementById('sheetContent');
const allocationGrid = document.getElementById('allocationGrid');
const pointsRemaining = document.getElementById('pointsRemaining');
const allocationModal = document.getElementById('allocationModal');

const statDescriptions = {
  strength: 'Melee outcomes and physical impact.',
  intelligence: 'Spell efficiency and magical power.',
  dexterity: 'Dodge chance and agility.',
  charisma: 'Dialogue influence and diplomacy.',
};

const localEngine = {
  saveSlots: JSON.parse(localStorage.getItem('rpgSaveSlots') || '{}'),
  state: null,
};

function appendNarrative(text, cls = 'engine') {
  const div = document.createElement('div');
  div.className = `entry ${cls}`;
  div.textContent = text;
  narrativeEl.appendChild(div);
  narrativeEl.scrollTop = narrativeEl.scrollHeight;
}

function showPopup(text) {
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.textContent = text;
  popupContainer.appendChild(popup);
  setTimeout(() => popup.remove(), 3200);
}

function showDamage(amount, target = 'player') {
  const el = document.createElement('div');
  el.className = 'damage-number';
  el.style.left = target === 'player' ? '20%' : '70%';
  el.style.top = '40%';
  el.style.color = amount > 0 ? '#ff6767' : '#5adf8c';
  el.textContent = amount > 0 ? `-${amount}` : `+${Math.abs(amount)}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function playTone(freq = 440, duration = 0.09) {
  if (!state.soundOn) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createInitialPlayer(name, alloc) {
  return {
    started: true,
    name,
    level: 1,
    xp: 0,
    health: 100,
    maxHealth: 100,
    mana: 60,
    maxMana: 60,
    stats: {
      strength: 3 + alloc.strength,
      intelligence: 3 + alloc.intelligence,
      dexterity: 3 + alloc.dexterity,
      charisma: 3 + alloc.charisma,
    },
    inventory: [
      { name: 'Minor Health Potion', type: 'potion', effect: { health: 25 } },
      { name: 'Ironblade', type: 'weapon', effect: { strength: 2 } },
      { name: 'Moon Sigil', type: 'artifact', effect: { morality: 8 } },
    ],
    morality: 0,
    titles: ['Novice Adventurer'],
    achievements: [],
    rareItemFound: false,
    inCombat: false,
    enemy: null,
    gameOver: false,
    ending: null,
  };
}

function addEventTitle(player, value, events) {
  if (!player.titles.includes(value)) {
    player.titles.push(value);
    events.push({ type: 'title', value });
  }
}

function addEventAchievement(player, value, events) {
  if (!player.achievements.includes(value)) {
    player.achievements.push(value);
    events.push({ type: 'achievement', value });
  }
}

function applyLevel(player, events) {
  while (player.xp >= player.level * 100) {
    player.level += 1;
    player.maxHealth += 12;
    player.maxMana += 8;
    player.health = Math.min(player.maxHealth, player.health + 12);
    player.mana = Math.min(player.maxMana, player.mana + 8);
    events.push({ type: 'levelup', value: player.level });
  }
}

function determineEnding(player) {
  if (player.health <= 0) return 'Death Ending';
  if (player.gameOver && player.inventory.some((i) => i.name === 'Celestial Sigil') && player.level >= 6) return 'Secret God Ending';
  if (player.gameOver && player.morality >= 45) return 'Hero Ending';
  if (player.gameOver && player.stats.intelligence >= 14 && player.morality > -15) return 'Scholar Ending';
  if (player.gameOver && player.morality <= -45) return 'Tyrant Ending';
  if (player.gameOver && player.morality < 0) return 'Corrupted Ending';
  return null;
}

function runLocalAction(action) {
  const player = localEngine.state;
  const lower = action.toLowerCase();
  const events = [];

  if (player.ending) {
    return { state: player, events, narrative: `Your fate is sealed: ${player.ending}. Start a new journey to alter destiny.` };
  }

  let narrative = 'The world twists around your decision. ';

  if (!player.inCombat && (lower.includes('fight') || lower.includes('attack') || lower.includes('battle'))) {
    player.inCombat = true;
    player.enemy = { name: 'Ashfang Raider', health: 48, attack: 12 };
    narrative += 'An Ashfang Raider lunges from the ruins. '; 
    addEventAchievement(player, 'First Battle', events);
  }

  if (lower.includes('help') || lower.includes('spare') || lower.includes('save')) player.morality += 6 + player.stats.charisma;
  if (lower.includes('steal') || lower.includes('betray') || lower.includes('threaten')) player.morality -= 8;

  if (lower.includes('trap')) {
    const trap = 6 + Math.floor(Math.random() * 8);
    player.health -= trap;
    events.push({ type: 'damageToPlayer', value: trap });
    narrative += `A hidden trap snaps for ${trap} damage. `;
  }

  if (lower.includes('search') && !player.rareItemFound) {
    player.rareItemFound = true;
    player.inventory.push({ name: 'Celestial Sigil', type: 'artifact', effect: { morality: 10, ascension: true } });
    addEventAchievement(player, 'First Rare Item', events);
    narrative += 'You discover the Celestial Sigil glowing in a buried altar. ';
  }

  if (lower.includes('spell')) {
    if (player.mana >= 10) {
      player.mana -= 10;
      addEventAchievement(player, 'First Spell', events);
      addEventTitle(player, 'Mage of Embers', events);
      narrative += 'Arcane fire coils around your hands. ';
    } else {
      narrative += 'Your mana is too low to complete the incantation. ';
    }
  }

  if (lower.includes('dragon') && !player.gameOver && !player.inCombat) {
    player.inCombat = true;
    player.enemy = { name: 'Abyssal Dragon', health: 120, attack: 18 };
    narrative += 'The Abyssal Dragon descends and blocks out the moon. ';
  }

  if (player.inCombat && player.enemy) {
    let damage = 8 + player.stats.strength * 2;
    if (lower.includes('spell') && player.mana >= 0) {
      damage = 10 + player.stats.intelligence * 3;
    }
    if (Math.random() > 0.88) {
      damage = Math.floor(damage * 1.7);
      events.push({ type: 'critical', value: damage });
    }
    player.enemy.health -= damage;
    events.push({ type: 'damageToEnemy', value: damage });
    narrative += `You strike ${player.enemy.name} for ${damage} damage. `;

    if (player.enemy.health <= 0) {
      const slainDragon = player.enemy.name === 'Abyssal Dragon';
      player.inCombat = false;
      player.enemy = null;
      player.xp += slainDragon ? 180 : 45;
      player.morality += slainDragon ? 10 : 2;
      narrative += slainDragon ? 'The dragon is slain and the valley trembles in silence. ' : 'Your foe collapses at your feet. ';
      if (slainDragon) {
        player.gameOver = true;
        addEventTitle(player, 'Dragon Slayer', events);
      }
    } else if (Math.random() < 0.08 + player.stats.dexterity * 0.01) {
      narrative += 'You dodge the counterattack in a blur. ';
      addEventTitle(player, 'Shadow Walker', events);
    } else {
      const incoming = player.enemy.attack + Math.floor(Math.random() * 5);
      player.health -= incoming;
      events.push({ type: 'damageToPlayer', value: incoming });
      narrative += `${player.enemy.name} counters for ${incoming} damage. `;
    }
  }

  player.xp += 8;
  if (player.xp >= 100) addEventAchievement(player, '100 XP Gained', events);

  if (player.health <= 0) {
    player.health = 0;
    player.gameOver = true;
    addEventTitle(player, 'Fallen One', events);
  }

  if (player.inventory.some((i) => i.name === 'Celestial Sigil') && player.level >= 6) {
    addEventTitle(player, 'Ascended', events);
  }

  player.health = clamp(player.health, 0, player.maxHealth);
  player.mana = clamp(player.mana, 0, player.maxMana);
  player.morality = clamp(player.morality, -100, 100);

  applyLevel(player, events);
  player.ending = determineEnding(player);

  if (player.ending === 'Secret God Ending') addEventAchievement(player, 'Secret Ending Found', events);

  const aiFlair = ['Dust swirls as fate rewrites itself.', 'An unseen chorus marks your choice in legend.', 'The frontier bends to your will for one more turn.'][Math.floor(Math.random() * 3)];
  const endingText = player.ending ? ` Ending Unlocked: ${player.ending}.` : '';
  return { state: player, events, narrative: `${narrative}${aiFlair}${endingText}` };
}

function runLocalUseItem(itemName) {
  const player = localEngine.state;
  const idx = player.inventory.findIndex((item) => item.name === itemName);
  if (idx < 0) throw new Error('Item not found.');
  const item = player.inventory[idx];
  const events = [];
  if (item.type === 'potion') {
    const heal = item.effect.health || 0;
    player.health = clamp(player.health + heal, 0, player.maxHealth);
    player.inventory.splice(idx, 1);
    events.push({ type: 'heal', value: heal });
  } else if (item.type === 'weapon') {
    player.stats.strength += item.effect.strength || 1;
    player.inventory.splice(idx, 1);
    player.xp += 15;
  } else if (item.type === 'artifact') {
    player.morality = clamp(player.morality + (item.effect.morality || 0), -100, 100);
    player.xp += 20;
  }
  applyLevel(player, events);
  player.ending = determineEnding(player);
  return { state: player, events, message: `${item.name} used.` };
}

function saveLocalSlots() {
  localStorage.setItem('rpgSaveSlots', JSON.stringify(localEngine.saveSlots));
}

async function callApi(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    if (!state.backendOnline) {
      state.backendOnline = true;
      showPopup('Server connection restored.');
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError || String(error.message || '').includes('Failed to fetch')) {
      if (state.backendOnline) {
        state.backendOnline = false;
        showPopup('Server unavailable: switched to offline AI Dungeon mode.');
      }
      const body = options.body ? JSON.parse(options.body) : {};
      if (url === '/api/start') {
        localEngine.state = createInitialPlayer(body.name || 'Adventurer', body.stats || state.alloc);
        return { state: localEngine.state, narrative: `Welcome, ${localEngine.state.name}. The Ember Gate opens to your story.`, events: [{ type: 'title', value: 'Novice Adventurer' }] };
      }
      if (!localEngine.state) {
        throw new Error('Start a new game to initialize offline mode.');
      }
      if (url === '/api/action') return runLocalAction(body.action || '');
      if (url === '/api/use-item') return runLocalUseItem(body.itemName);
      if (url === '/api/save') {
        const slot = body.slot || 'slot1';
        localEngine.saveSlots[slot] = JSON.parse(JSON.stringify(localEngine.state));
        saveLocalSlots();
        return { message: `Game saved to ${slot}.` };
      }
      if (url === '/api/load') {
        const slot = body.slot || 'slot1';
        if (!localEngine.saveSlots[slot]) throw new Error(`No save data in ${slot}.`);
        localEngine.state = JSON.parse(JSON.stringify(localEngine.saveSlots[slot]));
        return { state: localEngine.state, message: `Loaded ${slot}.` };
      }
    }
    throw error;
  }
}

function renderBars(player) {
  const hpPercent = (player.health / player.maxHealth) * 100;
  const mpPercent = (player.mana / player.maxMana) * 100;
  hpBar.style.width = `${hpPercent}%`;
  mpBar.style.width = `${mpPercent}%`;
  hpLabel.textContent = `${player.health}/${player.maxHealth}`;
  mpLabel.textContent = `${player.mana}/${player.maxMana}`;
}

function renderInventory(player) {
  inventoryList.innerHTML = '';
  if (!player.inventory.length) {
    inventoryList.innerHTML = '<li>No items.</li>';
    return;
  }
  player.inventory.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.name}</strong> <small>(${item.type})</small>`;
    const btn = document.createElement('button');
    btn.textContent = 'Use Item';
    btn.addEventListener('click', () => useItem(item.name));
    li.appendChild(btn);
    inventoryList.appendChild(li);
  });
}

function renderSheet(player) {
  const statsRows = Object.entries(player.stats)
    .map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`)
    .join('');
  const invRows = player.inventory.map((item) => `<li>${item.name} (${item.type})</li>`).join('') || '<li>None</li>';
  const titleRows = player.titles.map((t) => `<li>${t}</li>`).join('') || '<li>None</li>';
  const achievementRows = player.achievements.map((a) => `<li>${a}</li>`).join('') || '<li>None</li>';

  sheetContent.innerHTML = `
    <p><strong>Name:</strong> ${player.name}</p>
    <p><strong>Level:</strong> ${player.level} | <strong>XP:</strong> ${player.xp}</p>
    <p><strong>HP/MP:</strong> ${player.health}/${player.maxHealth} HP • ${player.mana}/${player.maxMana} MP</p>
    <p><strong>Morality:</strong> ${player.morality}</p>
    <h3>Stats</h3>
    <ul>${statsRows}</ul>
    <h3>Titles</h3>
    <ul>${titleRows}</ul>
    <h3>Achievements</h3>
    <ul>${achievementRows}</ul>
    <h3>Inventory</h3>
    <ul>${invRows}</ul>
  `;
}

function handleEvents(events = []) {
  events.forEach((event) => {
    if (event.type === 'achievement') showPopup(`🏆 Achievement Unlocked: ${event.value}`);
    if (event.type === 'title') showPopup(`✨ New Title: ${event.value}`);
    if (event.type === 'damageToPlayer') {
      showDamage(event.value, 'player');
      playTone(180, 0.12);
    }
    if (event.type === 'damageToEnemy') {
      showDamage(event.value, 'enemy');
      playTone(340, 0.08);
    }
    if (event.type === 'heal') {
      showDamage(-event.value, 'player');
      playTone(600, 0.08);
    }
    if (event.type === 'levelup') showPopup(`⬆️ Level Up! Reached level ${event.value}`);
    if (event.type === 'critical') showPopup(`💥 Critical Hit! ${event.value} damage`);
  });
}

function updateUI(player, events) {
  state.player = player;
  renderBars(player);
  renderInventory(player);
  renderSheet(player);
  handleEvents(events);
}

async function submitAction(action) {
  appendNarrative(`> ${action}`, 'player');
  loadingEl.classList.remove('hidden');
  try {
    const data = await callApi('/api/action', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    appendNarrative(data.narrative, 'engine');
    updateUI(data.state, data.events);
  } catch (error) {
    appendNarrative(`System: ${error.message}`, 'engine');
  } finally {
    loadingEl.classList.add('hidden');
  }
}

async function useItem(itemName) {
  try {
    const data = await callApi('/api/use-item', {
      method: 'POST',
      body: JSON.stringify({ itemName }),
    });
    appendNarrative(data.message, 'engine');
    updateUI(data.state, data.events);
  } catch (error) {
    appendNarrative(`System: ${error.message}`, 'engine');
  }
}

function renderAllocation() {
  allocationGrid.innerHTML = '';
  Object.keys(state.alloc).forEach((stat) => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<strong>${stat}</strong><p>${statDescriptions[stat]}</p>`;

    const controls = document.createElement('div');
    controls.className = 'stat-controls';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.textContent = '-';
    const value = document.createElement('span');
    value.textContent = state.alloc[stat];
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.textContent = '+';

    minus.onclick = () => {
      if (state.alloc[stat] > 0) {
        state.alloc[stat] -= 1;
        state.points += 1;
        renderAllocation();
      }
    };

    plus.onclick = () => {
      if (state.points > 0) {
        state.alloc[stat] += 1;
        state.points -= 1;
        renderAllocation();
      }
    };

    controls.append(minus, value, plus);
    row.appendChild(controls);
    allocationGrid.appendChild(row);
  });

  pointsRemaining.textContent = `Points Remaining: ${state.points}`;
}

async function startGame() {
  if (state.points !== 0) {
    showPopup('Allocate all 5 points first.');
    return;
  }
  const name = document.getElementById('playerName').value.trim() || 'Adventurer';
  try {
    const data = await callApi('/api/start', {
      method: 'POST',
      body: JSON.stringify({ name, stats: state.alloc }),
    });
    allocationModal.classList.remove('open');
    narrativeEl.innerHTML = '';
    appendNarrative(data.narrative, 'engine');
    updateUI(data.state, data.events);
  } catch (error) {
    showPopup(error.message);
  }
}

async function saveGame() {
  try {
    const data = await callApi('/api/save', {
      method: 'POST',
      body: JSON.stringify({ slot: 'slot1' }),
    });
    showPopup(data.message);
  } catch (error) {
    showPopup(error.message);
  }
}

async function loadGame() {
  try {
    const data = await callApi('/api/load', {
      method: 'POST',
      body: JSON.stringify({ slot: 'slot1' }),
    });
    appendNarrative(data.message, 'engine');
    updateUI(data.state, []);
  } catch (error) {
    showPopup(error.message);
  }
}

function initializeTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  if (saved === 'dark') document.body.classList.add('dark');
}

document.getElementById('startGameBtn').addEventListener('click', startGame);
document.getElementById('inventoryBtn').addEventListener('click', () => inventoryPanel.classList.toggle('hidden'));
document.getElementById('sheetBtn').addEventListener('click', () => sheetModal.classList.add('open'));
document.getElementById('closeSheetBtn').addEventListener('click', () => sheetModal.classList.remove('open'));
document.getElementById('saveBtn').addEventListener('click', saveGame);
document.getElementById('loadBtn').addEventListener('click', loadGame);
document.getElementById('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
});
document.getElementById('soundToggle').addEventListener('click', (event) => {
  state.soundOn = !state.soundOn;
  event.target.textContent = state.soundOn ? '🔊 Sound On' : '🔇 Sound Off';
  playTone(state.soundOn ? 520 : 220, 0.06);
});

actionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const action = actionInput.value.trim();
  if (!action || !state.player) return;
  actionInput.value = '';
  await submitAction(action);
});

renderAllocation();
initializeTheme();
appendNarrative('Allocate your stats and begin your adventure. If server APIs are down, offline AI Dungeon mode auto-enables.', 'engine');
