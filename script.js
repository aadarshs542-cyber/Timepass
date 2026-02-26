const ui = {
  narrative: document.getElementById('narrative'),
  actionForm: document.getElementById('actionForm'),
  actionInput: document.getElementById('actionInput'),
  hpBar: document.getElementById('hpBar'),
  mpBar: document.getElementById('mpBar'),
  bossBar: document.getElementById('bossBar'),
  bossPanel: document.getElementById('bossPanel'),
  bossName: document.getElementById('bossName'),
  hpLabel: document.getElementById('hpLabel'),
  mpLabel: document.getElementById('mpLabel'),
  inventoryList: document.getElementById('inventoryList'),
  inventoryPanel: document.getElementById('inventoryPanel'),
  loading: document.getElementById('loading'),
  popup: document.getElementById('popupContainer'),
  allocationModal: document.getElementById('allocationModal'),
  allocationGrid: document.getElementById('allocationGrid'),
  pointsRemaining: document.getElementById('pointsRemaining'),
  skillTree: document.getElementById('skillTree'),
  skillPoints: document.getElementById('skillPoints'),
  miniMap: document.getElementById('miniMap'),
  eventLog: document.getElementById('eventLog'),
  leaderboard: document.getElementById('leaderboard'),
  modeBadge: document.getElementById('modeBadge'),
  sheetModal: document.getElementById('sheetModal'),
  sheetContent: document.getElementById('sheetContent'),
};

const state = {
  player: null,
  skillTree: null,
  alloc: { strength: 0, intelligence: 0, dexterity: 0, charisma: 0 },
  points: 5,
  sound: true,
};

const statTips = {
  strength: 'Melee power',
  intelligence: 'Spell damage',
  dexterity: 'Dodge and crit flow',
  charisma: 'Dialogue and faction sway',
};

function appendNarrative(text, cls = 'engine') {
  const d = document.createElement('div');
  d.className = `entry ${cls}`;
  d.textContent = text;
  ui.narrative.appendChild(d);
  ui.narrative.scrollTop = ui.narrative.scrollHeight;
}

function popup(text) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.textContent = text;
  ui.popup.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function tone(freq) {
  if (!state.sound) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

function damageFx(v, target = 'player') {
  const el = document.createElement('div');
  el.className = 'damage-number';
  el.style.left = target === 'player' ? '20%' : '68%';
  el.style.top = '38%';
  el.style.color = v > 0 ? '#ff6e6e' : '#67d688';
  el.textContent = v > 0 ? `-${v}` : `+${Math.abs(v)}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

async function api(url, body = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function renderBars(p) {
  ui.hpBar.style.width = `${(p.health / p.maxHealth) * 100}%`;
  ui.mpBar.style.width = `${(p.mana / p.maxMana) * 100}%`;
  ui.hpLabel.textContent = `${p.health}/${p.maxHealth}`;
  ui.mpLabel.textContent = `${p.mana}/${p.maxMana}`;
  if (p.inCombat && p.enemy) {
    ui.bossPanel.classList.remove('hidden');
    ui.bossName.textContent = `${p.enemy.name}${p.enemy.phase ? ` • Phase ${p.enemy.phase}` : ''}`;
    ui.bossBar.style.width = `${(p.enemy.health / p.enemy.maxHealth) * 100}%`;
  } else {
    ui.bossPanel.classList.add('hidden');
  }
}

function renderInventory(p) {
  ui.inventoryList.innerHTML = '';
  if (!p.inventory.length) {
    ui.inventoryList.innerHTML = '<li>No items.</li>';
    return;
  }
  p.inventory.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `${item.name} (${item.type}) `;
    const b = document.createElement('button');
    b.textContent = 'Use';
    b.onclick = async () => {
      try {
        const data = await api('/api/use-item', { itemName: item.name });
        update(data.state, data.events || []);
        appendNarrative(data.message);
      } catch (e) {
        popup(e.message);
      }
    };
    li.appendChild(b);
    ui.inventoryList.appendChild(li);
  });
}

function renderMap(p) {
  ui.miniMap.innerHTML = '';
  for (let y = 0; y < p.mapSize; y += 1) {
    for (let x = 0; x < p.mapSize; x += 1) {
      const key = `${x},${y}`;
      const t = document.createElement('div');
      t.className = 'tile';
      if (p.discoveredTiles.includes(key)) t.classList.add('discovered');
      if (p.playerPosition.x === x && p.playerPosition.y === y) t.classList.add('current');
      ui.miniMap.appendChild(t);
    }
  }
}

function nodeClass(p, node) {
  if (p.unlockedSkills.includes(node.id)) return 'node unlocked';
  if (!node.prereq || p.unlockedSkills.includes(node.prereq)) return 'node available';
  return 'node locked';
}

function renderSkillTree(p) {
  ui.skillPoints.textContent = p.skillPoints;
  ui.skillTree.innerHTML = '';
  Object.entries(state.skillTree || {}).forEach(([branch, nodes]) => {
    const block = document.createElement('div');
    block.className = 'skill-branch';
    const title = document.createElement('strong');
    title.textContent = branch.toUpperCase();
    const row = document.createElement('div');
    row.className = 'nodes';

    nodes.forEach((node) => {
      const btn = document.createElement('button');
      btn.className = nodeClass(p, node);
      btn.textContent = node.name;
      btn.disabled = btn.className.includes('locked') || btn.className.includes('unlocked') || p.skillPoints <= 0;
      btn.onclick = async () => {
        try {
          const data = await api('/api/skill', { skillId: node.id });
          update(data.state, []);
          popup(`Unlocked ${node.name}`);
        } catch (e) {
          popup(e.message);
        }
      };
      row.appendChild(btn);
    });

    block.append(title, row);
    ui.skillTree.appendChild(block);
  });
}

function renderEvents(p) {
  ui.eventLog.innerHTML = '';
  (p.worldEvents || []).slice().reverse().forEach((e) => {
    const li = document.createElement('li');
    li.textContent = `T${e.turn}: ${e.event}`;
    ui.eventLog.appendChild(li);
  });
}

function renderLeaderboard(items = []) {
  ui.leaderboard.innerHTML = '';
  if (!items.length) {
    ui.leaderboard.innerHTML = '<li>No entries yet.</li>';
    return;
  }
  items.forEach((e) => {
    const li = document.createElement('li');
    li.textContent = `${e.name} | XP ${e.xp} | Turns ${e.turns} | Boss ${e.bossDefeated ? 'Yes' : 'No'}`;
    ui.leaderboard.appendChild(li);
  });
}

function renderSheet(p) {
  ui.sheetContent.innerHTML = `
    <p><b>Name:</b> ${p.name}</p>
    <p><b>Level:</b> ${p.level} | <b>XP:</b> ${p.xp} | <b>Turns:</b> ${p.turn}</p>
    <p><b>HP/MP:</b> ${p.health}/${p.maxHealth} • ${p.mana}/${p.maxMana}</p>
    <p><b>Morality:</b> ${p.morality}</p>
    <p><b>Factions:</b> Iron ${p.factions.ironLegion}, Arcane ${p.factions.arcaneCircle}, Shadow ${p.factions.shadowGuild}</p>
    <p><b>Titles:</b> ${p.titles.join(', ') || 'None'}</p>
    <p><b>Achievements:</b> ${p.achievements.join(', ') || 'None'}</p>
  `;
}

function eventFx(events = []) {
  events.forEach((e) => {
    if (e.type === 'achievement') popup(`🏆 ${e.value}`);
    if (e.type === 'title') popup(`✨ ${e.value}`);
    if (e.type === 'damageToPlayer') {
      damageFx(e.value, 'player');
      tone(160);
    }
    if (e.type === 'damageToEnemy') {
      damageFx(e.value, 'enemy');
      tone(360);
    }
    if (e.type === 'heal') damageFx(-e.value, 'player');
    if (e.type === 'bossPhase') popup(`⚔️ Boss Phase ${e.value}`);
    if (e.type === 'worldEvent') popup(`🌍 ${e.value}`);
  });
}

function update(p, events = [], board = null) {
  state.player = p;
  renderBars(p);
  renderInventory(p);
  renderMap(p);
  renderSkillTree(p);
  renderEvents(p);
  renderSheet(p);
  if (board) renderLeaderboard(board);
  eventFx(events);
  ui.modeBadge.textContent = `${p.hardcoreMode ? '💀 Hardcore' : 'Normal'}${p.ngPlus ? ' | NG+' : ''}${p.dailyMode ? ' | Daily' : ''}`;
}

function renderAlloc() {
  ui.allocationGrid.innerHTML = '';
  Object.keys(state.alloc).forEach((s) => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<strong>${s}</strong><small>${statTips[s]}</small>`;
    const c = document.createElement('div');
    c.className = 'stat-controls';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.textContent = '-';
    const v = document.createElement('span');
    v.textContent = state.alloc[s];
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.textContent = '+';
    minus.onclick = () => {
      if (state.alloc[s] > 0) {
        state.alloc[s] -= 1;
        state.points += 1;
        renderAlloc();
      }
    };
    plus.onclick = () => {
      if (state.points > 0) {
        state.alloc[s] += 1;
        state.points -= 1;
        renderAlloc();
      }
    };
    c.append(minus, v, plus);
    row.appendChild(c);
    ui.allocationGrid.appendChild(row);
  });
  ui.pointsRemaining.textContent = `Points Remaining: ${state.points}`;
}

async function startGame(overrides = {}) {
  if (state.points !== 0) return popup('Allocate all 5 points first.');
  ui.loading.classList.remove('hidden');
  try {
    const data = await api('/api/start', {
      name: document.getElementById('playerName').value.trim() || 'Adventurer',
      stats: state.alloc,
      hardcoreMode: document.getElementById('hardcoreMode').checked,
      ngPlus: document.getElementById('ngPlusMode').checked,
      dailyMode: document.getElementById('dailyMode').checked,
      ...overrides,
    });
    state.skillTree = data.skillTree;
    ui.allocationModal.classList.remove('open');
    ui.narrative.innerHTML = '';
    appendNarrative(data.narrative);
    update(data.state, [], data.dailyLeaderboard || []);
  } catch (e) {
    popup(e.message);
  } finally {
    ui.loading.classList.add('hidden');
  }
}

async function act(action) {
  ui.loading.classList.remove('hidden');
  appendNarrative(`> ${action}`, 'player');
  try {
    const data = await api('/api/action', { action });
    appendNarrative(data.narrative);
    if (!state.skillTree) state.skillTree = data.skillTree;
    update(data.state, data.events || [], data.dailyLeaderboard || []);
  } catch (e) {
    appendNarrative(`System: ${e.message}`);
  } finally {
    ui.loading.classList.add('hidden');
  }
}

async function saveGame() {
  try {
    const data = await api('/api/save', { slot: 'slot1' });
    popup(data.message);
  } catch (e) {
    popup(e.message);
  }
}

async function loadGame() {
  try {
    const data = await api('/api/load', { slot: 'slot1' });
    appendNarrative(data.message);
    update(data.state, []);
  } catch (e) {
    popup(e.message);
  }
}

function initTheme() {
  const t = localStorage.getItem('theme') || 'light';
  if (t === 'dark') document.body.classList.add('dark');
}

document.getElementById('startGameBtn').onclick = () => startGame();
document.getElementById('dailyBtn').onclick = () => {
  document.getElementById('dailyMode').checked = true;
  if (!ui.allocationModal.classList.contains('open')) {
    state.alloc = { strength: 0, intelligence: 0, dexterity: 0, charisma: 0 };
    state.points = 5;
    renderAlloc();
    ui.allocationModal.classList.add('open');
  }
};

document.getElementById('inventoryBtn').onclick = () => ui.inventoryPanel.classList.toggle('hidden');
document.getElementById('sheetBtn').onclick = () => ui.sheetModal.classList.add('open');
document.getElementById('closeSheetBtn').onclick = () => ui.sheetModal.classList.remove('open');
document.getElementById('saveBtn').onclick = saveGame;
document.getElementById('loadBtn').onclick = loadGame;

document.getElementById('themeToggle').onclick = () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
};

document.getElementById('soundToggle').onclick = (e) => {
  state.sound = !state.sound;
  e.target.textContent = state.sound ? '🔊' : '🔇';
  tone(state.sound ? 480 : 200);
};

ui.actionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.player) return;
  const a = ui.actionInput.value.trim();
  if (!a) return;
  ui.actionInput.value = '';
  act(a);
});

renderAlloc();
initTheme();
appendNarrative('Allocate stats, choose mode, and begin your AI-powered dungeon run.');
