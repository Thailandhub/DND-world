
const stats = [
  "STR", "DEX", "CON",
  "INT", "WIS", "CHA"
];

// ระบบค่าสถานะ
document.getElementById("stats").innerHTML =
  stats.map(stat => `
    <div class="stat">
      <label>${stat}</label>
      <input
        type="number"
        id="${stat}"
        value="10"
        min="3"
        max="20"
      >
    </div>
  `).join("");

// เปลี่ยนหน้า
function showPage(page) {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.add("hidden");
  });

  document.getElementById(page)
    .classList.remove("hidden");
}

// ข้อมูลตัวละคร
let characters = JSON.parse(
  localStorage.getItem("dndCharacters") || "[]"
);

// สร้างตัวละคร
function createCharacter() {
  const name = document.getElementById("name").value.trim();
  const race = document.getElementById("race").value;
  const job = document.getElementById("job").value;

  if (!name) {
    alert("กรุณาใส่ชื่อตัวละคร");
    return;
  }

  const characterStats = {};

  for (const stat of stats) {
    const value = Number(
      document.getElementById(stat).value
    );

    if (!Number.isInteger(value) || value < 3 || value > 20) {
      alert("ค่าสถานะต้องอยู่ระหว่าง 3–20");
      return;
    }

    characterStats[stat] = value;
  }

  characters.push({
    id: Date.now(),
    name,
    race,
    job,
    stats: characterStats
  });

  localStorage.setItem(
    "dndCharacters",
    JSON.stringify(characters)
  );

  document.getElementById("name").value = "";

  renderCharacters();

  alert("สร้างตัวละครสำเร็จ!");
}

// แสดงตัวละคร
function renderCharacters() {
  const list = document.getElementById("characterList");

  list.innerHTML = characters.map(c => `
    <div class="card">
      <h3>⚔️ ${escapeHTML(c.name)}</h3>
      <p>เผ่า: ${escapeHTML(c.race)}</p>
      <p>อาชีพ: ${escapeHTML(c.job)}</p>
      <p>
        ${stats.map(s => s + ": " + c.stats[s]).join(" | ")}
      </p>
      <button onclick="deleteCharacter(${c.id})">
        ลบตัวละคร
      </button>
    </div>
  `).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function deleteCharacter(id) {
  if (!confirm("ต้องการลบตัวละครนี้หรือไม่?")) return;

  characters = characters.filter(c => c.id !== id);

  localStorage.setItem(
    "dndCharacters",
    JSON.stringify(characters)
  );

  renderCharacters();
}

// ระบบแผนที่ 2D
const mapGrid = document.getElementById("mapGrid");

let map = JSON.parse(
  localStorage.getItem("dndMap") || "[]"
);

if (map.length !== 64) {
  map = Array(64).fill("");
}

function renderMap() {
  mapGrid.innerHTML = "";

  map.forEach((item, index) => {
    const cell = document.createElement("button");

    cell.className = "cell" + (item === "player" ? " character" : "");
    cell.textContent = item === "player" ? "♙" : item === "wall" ? "▧" : "·";

    cell.onclick = () => {
      map[index] =
        item === "player" ? "" : "player";

      localStorage.setItem(
        "dndMap",
        JSON.stringify(map)
      );

      renderMap();
    };

    mapGrid.appendChild(cell);
  });
}

renderMap();

// ระบบลูกเต๋า
function rollDice() {
  const sides = Number(
    document.getElementById("diceType").value
  );

  const result = Math.floor(
    Math.random() * sides
  ) + 1;

  document.getElementById("diceResult")
    .textContent = result;
}

renderCharacters();
