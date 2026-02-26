const state = {
  player: null,
  alloc: { strength: 0, intelligence: 0, dexterity: 0, charisma: 0 },
  points: 5,
  soundOn: true,
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

async function callApi(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }
  return data;
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
    appendNarrative(`${data.message}`, 'engine');
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
    minus.textContent = '-';
    const value = document.createElement('span');
    value.textContent = state.alloc[stat];
    const plus = document.createElement('button');
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
appendNarrative('Allocate your stats and begin your adventure.', 'engine');
