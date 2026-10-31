const $ = id => document.getElementById(id);

const ACCOUNTS = ["ปาม", "เครป", "ภูเขา", "อลิส"];
const STORAGE_KEY = "dndWorld30";

let state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {
  currentUser: "เครป",
  activeServerId: null,
  servers: []
};

let currentTool = "move";

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeServer() {
  return state.servers.find(s => s.id === state.activeServerId);
}

function isDM(server) {
  return server && server.owner === state.currentUser;
}

function createId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createServer() {
  const name = prompt("ตั้งชื่อเซิร์ฟเวอร์:");
  if (!name || !name.trim()) return;

  const server = {
    id: createId(),
    name: name.trim(),
    owner: state.currentUser,
    members: [state.currentUser],
    map: Array(64).fill(""),
    players: {},
    monsters: [],
    chat: [],
    created: new Date().toISOString()
  };

  server.players[state.currentUser] = {
    hp: 100,
    maxHp: 100,
    x: 0,
    y: 0
  };

  state.servers.push(server);
  state.activeServerId = server.id;

  save();
  render();
}

function joinServer() {
  const code = prompt("กรอกรหัสเซิร์ฟเวอร์:");
  if (!code) return;

  const server = state.servers.find(s => s.id === code.trim().toUpperCase());

  if (!server) {
    alert("ไม่พบเซิร์ฟเวอร์นี้");
    return;
  }

  if (!server.members.includes(state.currentUser)) {
    server.members.push(state.currentUser);
  }

  if (!server.players[state.currentUser]) {
    server.players[state.currentUser] = {
      hp: 100,
      maxHp: 100,
      x: 0,
      y: 0
    };
  }

  state.activeServerId = server.id;
  save();
  render();
}

function selectServer(id) {
  state.activeServerId = id;

  const server = activeServer();

  if (!server.members.includes(state.currentUser)) {
    alert("คุณยังไม่ได้เข้าร่วมเซิร์ฟเวอร์นี้");
    state.activeServerId = null;
  }

  save();
  render();
}

function render() {
  $("accountSelect").value = state.currentUser;
  renderServers();

  const server = activeServer();

  if (!server || !server.members.includes(state.currentUser)) {
    $("gameArea").classList.add("hidden");
    $("welcome").classList.remove("hidden");
    return;
  }

  $("welcome").classList.add("hidden");
  $("gameArea").classList.remove("hidden");

  $("serverTitle").textContent = server.name;
  $("serverCode").textContent = "รหัสห้อง: " + server.id;

  const dm = isDM(server);

  $("serverRole").textContent = dm
    ? "สถานะ: DM / เจ้าของเซิร์ฟเวอร์"
    : "สถานะ: ผู้เล่น";

  $("dmPanel").classList.toggle("hidden", !dm);
  $("dmTools").classList.toggle("hidden", !dm);

  $("mapHint").textContent = dm
    ? "เลือกเครื่องมือแล้วแตะช่องบนแผนที่เพื่อแก้ไข"
    : "แตะช่องบนแผนที่เพื่อเดินตัวละคร";

  renderMap();
  renderPlayers();
  renderCharacter();
  renderMonsters();
  renderChat();
}

function renderServers() {
  const list = $("serverList");
  list.replaceChildren();

  state.servers
    .filter(s => s.members.includes(state.currentUser))
    .forEach(server => {
      const button = document.createElement("button");
      button.className = "server-item" +
        (server.id === state.activeServerId ? " active" : "");

      button.textContent =
        server.name + " | เจ้าของ: " + server.owner;

      button.addEventListener("click", () => selectServer(server.id));
      list.appendChild(button);
    });

  $("serverInfo").textContent = state.servers.length
    ? "มีเซิร์ฟเวอร์ในเครื่อง " + state.servers.length + " ห้อง"
    : "ยังไม่มีเซิร์ฟเวอร์";
}

function renderMap() {
  const server = activeServer();
  const map = $("map");
  map.replaceChildren();

  for (let i = 0; i < 64; i++) {
    const x = i % 8;
    const y = Math.floor(i / 8);
    const tile = server.map[i] || "";

    const cell = document.createElement("button");
    cell.className = "map-cell " + tile;

    const playersHere = Object.entries(server.players)
      .filter(([name, p]) => p.x === x && p.y === y)
      .map(([name]) => name[0]);

    const monstersHere = server.monsters
      .filter(m => m.x === x && m.y === y)
      .map(m => "☠");

    const symbols = {
      wall: "■",
      water: "≈",
      tree: "♣",
      monster: "☠"
    };

    cell.textContent =
      playersHere.join("") ||
      monstersHere.join("") ||
      symbols[tile] ||
      "·";

    cell.title = `ตำแหน่ง ${x + 1}, ${y + 1}`;

    cell.addEventListener("click", () => mapClick(x, y));
    map.appendChild(cell);
  }
}

function mapClick(x, y) {
  const server = activeServer();
  if (!server) return;

  if (isDM(server) && currentTool !== "move") {
    const index = y * 8 + x;

    if (currentTool === "monster") {
      const name = prompt("ชื่อมอนสเตอร์:");
      if (!name) return;

      server.monsters.push({
        id: createId(),
        name,
        hp: 30,
        maxHp: 30,
        x,
        y
      });
    } else {
      server.map[index] =
        currentTool === "clear" ? "" : currentTool;
    }
  } else {
    const player = server.players[state.currentUser];

    if (!player) return;

    player.x = x;
    player.y = y;
  }

  save();
  render();
}

function renderPlayers() {
  const server = activeServer();
  const list = $("playerList");
  list.replaceChildren();

  server.members.forEach(name => {
    const player = server.players[name];

    const row = document.createElement("div");
    row.className = "player-row";

    const info = document.createElement("span");
    info.textContent =
      name + (name === server.owner ? " (DM)" : " (ผู้เล่น)");

    const hp = document.createElement("span");
    hp.textContent = player
      ? `HP ${player.hp}/${player.maxHp}`
      : "ยังไม่มีตัวละคร";

    row.append(info, hp);
    list.appendChild(row);
  });
}

function renderCharacter() {
  const server = activeServer();
  const player = server.players[state.currentUser];

  if (!player) {
    $("characterStatus").textContent = "ยังไม่มีตัวละคร";
    return;
  }

  $("characterStatus").textContent =
    `${state.currentUser} | HP ${player.hp}/${player.maxHp} | ` +
    `ตำแหน่ง ${player.x + 1}, ${player.y + 1}`;
}

function changeHP(amount) {
  const server = activeServer();
  if (!server) return;

  const player = server.players[state.currentUser];
  if (!player) return;

  player.hp = Math.max(
    0,
    Math.min(player.maxHp, player.hp + amount)
  );

  save();
  render();
}

function renderMonsters() {
  const server = activeServer();
  const list = $("monsterList");
  list.replaceChildren();

  server.monsters.forEach(monster => {
    const row = document.createElement("div");
    row.className = "monster-row";

    const info = document.createElement("span");
    info.textContent =
      `${monster.name} | HP ${monster.hp}/${monster.maxHp}`;

    row.appendChild(info);

    if (isDM(server)) {
      const damage = document.createElement("button");
      damage.textContent = "-5 HP";
      damage.className = "danger";

      damage.addEventListener("click", () => {
        monster.hp = Math.max(0, monster.hp - 5);

        if (monster.hp === 0) {
          server.monsters =
            server.monsters.filter(m => m.id !== monster.id);
        }

        save();
        render();
      });

      const heal = document.createElement("button");
      heal.textContent = "+5 HP";
      heal.className = "secondary";

      heal.addEventListener("click", () => {
        monster.hp = Math.min(monster.maxHp, monster.hp + 5);
        save();
        render();
      });

      row.append(damage, heal);
    }

    list.appendChild(row);
  });

  if (!server.monsters.length) {
    list.textContent = "ยังไม่มีมอนสเตอร์";
  }
}

function renderChat() {
  const server = activeServer();
  const box = $("chatMessages");
  box.replaceChildren();

  server.chat.forEach(message => {
    const line = document.createElement("div");
    line.className = "chat-message";

    const name = document.createElement("strong");
    name.textContent = message.name + ": ";

    const text = document.createElement("span");
    text.textContent = message.text;

    line.append(name, text);
    box.appendChild(line);
  });

  box.scrollTop = box.scrollHeight;
}

function sendChat() {
  const server = activeServer();
  const input = $("chatInput");
  const text = input.value.trim();

  if (!server || !text) return;

  server.chat.push({
    name: state.currentUser,
    text,
    time: Date.now()
  });

  if (server.chat.length > 200) {
    server.chat.shift();
  }

  input.value = "";
  save();
  renderChat();
}

function rollDice() {
  const input = $("diceInput").value.trim().toLowerCase();
  const match = input.match(/^(\d*)d(\d+)$/);

  if (!match) {
    $("diceResult").textContent = "รูปแบบไม่ถูกต้อง เช่น 1d20 หรือ 4d6";
    return;
  }

  const count = Number(match[1] || 1);
  const sides = Number(match[2]);

  if (count < 1 || count > 100 || sides < 2 || sides > 100000) {
    $("diceResult").textContent = "จำนวนลูกเต๋าหรือหน้าเต๋าไม่อยู่ในช่วงที่กำหนด";
    return;
  }

  const results = [];

  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides) + 1);
  }

  const total = results.reduce((a, b) => a + b, 0);

  $("diceResult").textContent =
    `ผลลัพธ์: ${results.join(" + ")} = ${total}`;
}

function addMonster() {
  const server = activeServer();

  if (!isDM(server)) return;

  const name = prompt("ชื่อมอนสเตอร์:");
  if (!name) return;

  server.monsters.push({
    id: createId(),
    name,
    hp: 30,
    maxHp: 30,
    x: 0,
    y: 0
  });

  save();
  render();
}

function saveWorld() {
  const server = activeServer();
  if (!server || !isDM(server)) return;

  save();
  alert("บันทึกโลกเรียบร้อย");
}

function resetMap() {
  const server = activeServer();

  if (!isDM(server)) return;
  if (!confirm("ต้องการล้างแผนที่ทั้งหมดหรือไม่?")) return;

  server.map = Array(64).fill("");
  server.monsters = [];

  save();
  render();
}

/* EVENTS */

$("accountSelect").addEventListener("change", event => {
  state.currentUser = event.target.value;
  state.activeServerId = null;
  save();
  render();
});

$("createServer").addEventListener("click", createServer);
$("joinServer").addEventListener("click", joinServer);

$("healButton").addEventListener("click", () => changeHP(5));
$("damageButton").addEventListener("click", () => changeHP(-5));

$("rollButton").addEventListener("click", rollDice);
$("sendChat").addEventListener("click", sendChat);

$("chatInput").addEventListener("keydown", event => {
  if (event.key === "Enter") sendChat();
});

$("addMonster").addEventListener("click", addMonster);
$("resetMap").addEventListener("click", resetMap);
$("saveWorld").addEventListener("click", saveWorld);

document.querySelectorAll("[data-tool]").forEach(button => {
  button.addEventListener("click", () => {
    currentTool = button.dataset.tool;

    document.querySelectorAll("[data-tool]").forEach(item => {
      item.classList.toggle("active", item === button);
    });
  });
});

render();