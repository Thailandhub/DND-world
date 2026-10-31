'use strict';
const $ = id => document.getElementById(id);
const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const mod = s => Math.floor((s - 10) / 2);
const sign = n => (n >= 0 ? '+' : '') + n;
const CELL = 40;
const TYPES = {field: 'ทุ่งโล่ง', dungeon: 'ดันเจี้ยน', city: 'เมือง'};
const PAL = {
  field:   [['หญ้า','#8fbf6a'],['ต้นไม้','#2f6b3a'],['น้ำ','#4d86b5'],['ทางดิน','#b99a6b'],['หินผา','#8a8f94']],
  dungeon: [['พื้นหิน','#9a9aa2'],['กำแพง','#2b2d33'],['ประตู','#8b5a2b'],['น้ำ/หลุม','#1f4e79'],['กับดัก','#a33a3a']],
  city:    [['ถนน','#b8b0a0'],['อาคาร','#6d5a4a'],['ตลาด','#d29a3d'],['ซอย/สลัม','#6e6259'],['น้ำ','#4d86b5'],['สวน','#8fbf6a']]
};
const ABS = [['str','STR กำลัง'],['dex','DEX คล่องแคล่ว'],['con','CON ร่างกาย'],['int','INT ปัญญา'],['wis','WIS การรับรู้'],['cha','CHA เสน่ห์']];
const XP = [0,300,900,2700,6500,14000,23000,34000,48000,64000,85000,100000,120000,140000,165000,195000,225000,265000,305000,355000];
const COLORS = ['#2a6fb0','#2a8f8a','#6b4fb0','#b07a2a','#a0407a','#4a7a2a'];

let role, peer, hostConn, conns = {}, ST, VIEW, viewId, sel = null, mode = 'move', brush = 0, myId = 'dm';

/* ---------- ลูกเต๋า: รับสูตรอิสระ เช่น 1d37+1, 2d6+1d4-2 ---------- */
function rollExpr(s) {
  s = String(s).replace(/\s/g, '').toLowerCase();
  if (!/^([+-]?(\d*d\d+|\d+))+$/.test(s)) return null;
  let total = 0; const det = [];
  for (const m of s.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g)) {
    const sg = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      const n = +(m[2] || 1), f = +m[3];
      if (n < 1 || n > 100 || f < 1 || f > 1000) return null;
      const r = Array.from({length: n}, () => 1 + Math.floor(Math.random() * f));
      total += sg * r.reduce((a, b) => a + b, 0);
      det.push(`${sg < 0 ? '-' : ''}${n}d${f}[${r.join(',')}]`);
    } else { total += sg * +m[4]; det.push((sg < 0 ? '-' : '+') + m[4]); }
  }
  return {total, det: det.join(' ')};
}

/* ---------- ตัวละคร (เขียนอิสระ) ---------- */
const newChar = name => ({name, race: '', cls: '', lvl: 1, xp: 0, hp: 10, max: 10, ac: 10, speed: 30,
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, weapons: '', spells: '', skills: '', items: '', notes: ''});
const fields = () => document.querySelectorAll('#sheet [data-f]');
function getChar() {
  const c = {};
  fields().forEach(e => c[e.dataset.f] = e.type === 'number' ? (+e.value || 0) : e.value);
  return c;
}
function setChar(c) { fields().forEach(e => e.value = c[e.dataset.f] ?? ''); abilInfo(); }
function abilInfo() {
  const c = getChar(), prof = 2 + Math.floor((Math.max(c.lvl, 1) - 1) / 4);
  let xl = 1; XP.forEach((x, i) => { if (c.xp >= x) xl = i + 1; });
  $('lvlInfo').textContent = `โปรฟิเชียนซี ${sign(prof)} · ตาม XP ควรเป็นเลเวล ${xl} (DM ตัดสินใจเรื่องเลเวลอัปได้เอง)`;
  ABS.forEach(([k]) => { const e = document.querySelector(`[data-m="${k}"]`); if (e) e.textContent = sign(mod(c[k])); });
}
function saveChar() {
  const c = getChar(); if (!c.name.trim()) c.name = 'ไม่มีชื่อ';
  const lib = store('dnd_chars') || {}; lib[c.name] = c; store('dnd_chars', lib); store('dnd_last', c.name);
  renderLib(); abilInfo();
  if (hostConn && hostConn.open) hostConn.send({t: 'char', char: c});
}
function renderLib() {
  const lib = store('dnd_chars') || {}, cur = getChar().name;
  $('lib').innerHTML = '';
  Object.keys(lib).forEach(n => $('lib').add(new Option(n, n, false, n === cur)));
}

/* ---------- บันทึกเหตุการณ์ / แชท ---------- */
function post(kind, text, secret) {
  if (role === 'dm') { ST.log.push({kind, who: 'DM', text, secret: !!secret}); dmSync(); }
  else if (hostConn && hostConn.open) hostConn.send({t: 'msg', kind, text});
}
function doRoll() {
  const n = $('notation').value.trim(), r = rollExpr(n);
  if (!r) { $('diceMsg').textContent = 'สูตรไม่ถูกต้อง ตัวอย่าง: 1d20+3, 2d6+1d4-1, 1d37+1'; return; }
  $('diceMsg').textContent = '';
  rollTo(n, r);
}
function rollTo(n, r, why) {
  why = why ?? $('why').value.trim();
  post('roll', `${why ? why + ': ' : ''}${n} → ${r.det} = ${r.total}`, role === 'dm' && $('secret').checked);
}
function renderLog() {
  const L = role === 'dm' ? ST.log : VIEW ? VIEW.log : [];
  $('log').innerHTML = '';
  L.slice(-80).reverse().forEach(l => {
    const li = document.createElement('li'); li.className = l.kind;
    li.textContent = (l.kind === 'sys' ? '' : l.who + ': ') + l.text + (l.secret ? ' (ลับ)' : '');
    $('log').appendChild(li);
  });
}

/* ---------- สถานะฝั่ง DM + ส่งต่อให้ผู้เล่น ---------- */
function view() {
  return {scene: ST.scenes.find(s => s.id === ST.cur) || null,
    log: ST.log.filter(l => !l.secret).slice(-80)};
}
function dmSync() {
  store('dnd_dm', ST);
  const v = view(); Object.values(conns).forEach(c => c.open && c.send({t: 'view', v}));
  renderAll();
}
const scene = () => role === 'dm' ? ST.scenes.find(s => s.id === viewId) : (VIEW && VIEW.scene);
const sceneName = s => [TYPES[s.type], s.district, s.sub, s.name].filter(Boolean).join(' › ');
function freeCell(sc) {
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++)
    if (!sc.tokens.some(t => t.x === x && t.y === y)) return [x, y];
  return [0, 0];
}
function makeTok(id) {
  const keys = Object.keys(ST.party), c = ST.party[id];
  return {id: 'p' + id, owner: id, name: c.name, color: COLORS[keys.indexOf(id) % COLORS.length], hp: c.hp, max: c.max};
}
function placeParty(to) {
  const owned = [];
  ST.scenes.forEach(s => { s.tokens = s.tokens.filter(t => t.owner ? (owned.push(t), false) : true); });
  Object.keys(ST.party).forEach(id => { if (!owned.some(t => t.owner === id)) owned.push(makeTok(id)); });
  owned.forEach(t => { [t.x, t.y] = freeCell(to); to.tokens.push(t); });
  ST.cur = to.id;
}
function onData(c, m) {
  const id = c.peer, name = () => (ST.party[id] || {}).name || '?';
  if (m.t === 'join') {
    const old = Object.keys(ST.party).find(k => ST.party[k].name === m.char.name && !(conns[k] && conns[k].open));
    if (old) { ST.scenes.forEach(s => s.tokens.forEach(t => { if (t.owner === old) { t.owner = id; t.id = 'p' + id; } })); delete ST.party[old]; }
    ST.party[id] = m.char;
    const cs = ST.scenes.find(s => s.id === ST.cur);
    if (cs && !cs.tokens.some(t => t.owner === id)) { const t = makeTok(id); [t.x, t.y] = freeCell(cs); cs.tokens.push(t); }
    ST.log.push({kind: 'sys', who: '', text: `${m.char.name} เข้าร่วมแล้ว`});
  } else if (m.t === 'char' && ST.party[id]) {
    ST.party[id] = m.char;
    ST.scenes.forEach(s => s.tokens.forEach(t => { if (t.owner === id) { t.name = m.char.name; t.hp = m.char.hp; t.max = m.char.max; } }));
  } else if (m.t === 'move') {
    const t = ST.scenes.flatMap(s => s.tokens).find(t => t.id === m.id);
    if (t && t.owner === id) { t.x = m.x; t.y = m.y; }
  } else if (m.t === 'msg') {
    ST.log.push({kind: m.kind === 'roll' ? 'roll' : 'say', who: name(), text: String(m.text).slice(0, 500)});
  }
  dmSync();
}

/* ---------- แผนที่ ---------- */
function draw() {
  const cv = $('map'), ctx = cv.getContext('2d'), sc = scene();
  if (!sc) { cv.width = 480; cv.height = 120; ctx.clearRect(0, 0, 480, 120); ctx.fillStyle = '#888'; ctx.font = '18px sans-serif';
    ctx.fillText(role === 'dm' ? 'ยังไม่มีฉาก ไปแท็บ “ฉาก” เพื่อสร้าง' : 'รอ DM เลือกฉาก…', 16, 64); return; }
  cv.width = sc.w * CELL; cv.height = sc.h * CELL;
  const pal = PAL[sc.type];
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    ctx.fillStyle = pal[sc.tiles[y * sc.w + x]]?.[1] || '#999'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
  }
  sc.tokens.forEach(t => {
    const cx = t.x * CELL + CELL / 2, cy = t.y * CELL + CELL / 2 - 2;
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(cx, cy, CELL * .38, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = t.id === sel ? '#e0b020' : (t.owner === myId ? '#fff' : 'rgba(0,0,0,.4)'); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#fff'; ctx.font = '700 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...t.name][0] || '?', cx, cy);
    if (t.max > 0) { ctx.fillStyle = '#333'; ctx.fillRect(t.x * CELL + 4, t.y * CELL + CELL - 6, CELL - 8, 4);
      ctx.fillStyle = '#3fae5a'; ctx.fillRect(t.x * CELL + 4, t.y * CELL + CELL - 6, (CELL - 8) * clamp(t.hp / t.max, 0, 1), 4); }
  });
}
const selTok = () => { const sc = scene(); return sc && sc.tokens.find(t => t.id === sel); };
function cellAt(e) {
  const sc = scene(), r = $('map').getBoundingClientRect();
  return [clamp(Math.floor((e.clientX - r.left) / r.width * sc.w), 0, sc.w - 1), clamp(Math.floor((e.clientY - r.top) / r.height * sc.h), 0, sc.h - 1)];
}
function mapPointer(e) {
  const sc = scene(); if (!sc) return;
  const [x, y] = cellAt(e);
  if (role === 'dm' && mode === 'paint') {
    if (e.type === 'pointerdown' || e.buttons) { const i = y * sc.w + x; if (sc.tiles[i] !== brush) { sc.tiles[i] = brush; draw(); if (e.type === 'pointerdown') e.target.setPointerCapture(e.pointerId); } }
    return;
  }
  if (e.type !== 'pointerdown') return;
  const t = sc.tokens.find(t => t.x === x && t.y === y);
  if (t && (role === 'dm' || t.owner === myId)) sel = t.id;
  else if (selTok() && !t) {
    if (role === 'dm') { selTok().x = x; selTok().y = y; return dmSync(); }
    hostConn && hostConn.send({t: 'move', id: sel, x, y});
  }
  renderTok(); draw();
}
function renderTok() {
  const t = selTok();
  $('tokInfo').textContent = t ? `เลือก: ${t.name}${t.max > 0 ? ` · HP ${t.hp}/${t.max}` : ''}` : (role === 'dm' ? 'แตะโทเคนเพื่อเลือก แล้วแตะช่องเพื่อย้าย' : 'แตะโทเคนของคุณ แล้วแตะช่องเพื่อเดิน');
}
function renderPalette() {
  const sc = scene(); $('palette').innerHTML = '';
  if (!sc) return;
  PAL[sc.type].forEach(([n, c], i) => {
    const b = document.createElement('button'); b.className = 'sw' + (i === brush ? ' on' : ''); b.style.background = c; b.title = n; b.setAttribute('aria-label', n);
    b.onclick = () => { brush = i; mode = 'paint'; renderAll(); }; $('palette').appendChild(b);
  });
}

/* ---------- วาดหน้าจอ ---------- */
function renderAll() {
  const sc = scene();
  $('sceneTitle').textContent = sc ? sceneName(sc) : '';
  $('modeMove').classList.toggle('on', mode === 'move'); $('modePaint').classList.toggle('on', mode === 'paint');
  if (role === 'dm') {
    $('viewScene').innerHTML = '';
    ST.scenes.forEach(s => $('viewScene').add(new Option(sceneName(s) + (s.id === ST.cur ? ' (ปาร์ตี้อยู่ที่นี่)' : ''), s.id, false, s.id === viewId)));
    $('sceneList').innerHTML = '';
    ST.scenes.forEach(s => {
      const li = document.createElement('li'), sp = document.createElement('span'); sp.textContent = sceneName(s);
      const open = document.createElement('button'); open.textContent = 'เปิด'; open.onclick = () => { viewId = s.id; showTab('map'); renderAll(); };
      const del = document.createElement('button'); del.textContent = 'ลบ';
      del.onclick = () => { if (!confirm('ลบฉากนี้?')) return; ST.scenes = ST.scenes.filter(x => x !== s); if (ST.cur === s.id) ST.cur = null; if (viewId === s.id) viewId = ST.cur || (ST.scenes[0] || {}).id; dmSync(); };
      li.append(sp, open, del); $('sceneList').appendChild(li);
    });
    $('partyList').innerHTML = '';
    Object.entries(ST.party).forEach(([id, c]) => {
      const d = document.createElement('details'), s = document.createElement('summary');
      s.textContent = `${conns[id] && conns[id].open ? '🟢' : '⚪'} ${c.name} · ${c.cls || '-'} เลเวล ${c.lvl} · HP ${c.hp}/${c.max} · AC ${c.ac}`;
      const p = document.createElement('pre');
      p.textContent = ABS.map(([k]) => `${k.toUpperCase()} ${c[k]} (${sign(mod(c[k]))})`).join('  ') + `\nXP ${c.xp} · ความเร็ว ${c.speed}\n\nอาวุธ:\n${c.weapons}\n\nเวทมนตร์:\n${c.spells}\n\nสกิล:\n${c.skills}\n\nไอเท็ม:\n${c.items}\n\nบันทึก:\n${c.notes}`;
      d.append(s, p); $('partyList').appendChild(d);
    });
  }
  renderPalette(); renderTok(); renderLog(); draw();
}
function showTab(n) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === n));
  document.querySelectorAll('.tab').forEach(s => s.hidden = s.id !== 'tab-' + n);
}

/* ---------- เริ่มต้น ---------- */
function enter() {
  $('start').hidden = true; $('app').hidden = false; document.body.className = role;
  $('who').textContent = role === 'dm' ? 'DM' : 'ผู้เล่น';
  $('sayLabel').textContent = role === 'dm' ? 'เล่าเรื่อง (ผู้เล่นทุกคนเห็น)' : 'พูดกับปาร์ตี้';
  $('abil').innerHTML = '';
  ABS.forEach(([k, l]) => {
    const r = document.createElement('div'); r.className = 'ab';
    r.innerHTML = `<span>${l}</span><input type="number" data-f="${k}"><b data-m="${k}"></b><button type="button" data-roll="${k}">ทอย</button>`;
    $('abil').appendChild(r);
  });
  showTab(role === 'pl' ? 'char' : 'map');
}
function netMsg(t) { $('net').textContent = t; $('startMsg').textContent = t; }

$('goDM').onclick = () => {
  role = 'dm';
  ST = store('dnd_dm') || {code: Math.random().toString(36).slice(2, 7), scenes: [], cur: null, party: {}, log: []};
  viewId = ST.cur || (ST.scenes[0] || {}).id;
  enter(); $('room').textContent = 'รหัสห้อง: ' + ST.code; netMsg('กำลังเปิดห้อง…');
  peer = new Peer('dndroom-' + ST.code);
  peer.on('open', () => netMsg('ห้องเปิดแล้ว ส่งรหัสให้เพื่อน'));
  peer.on('error', e => netMsg('เปิดห้องไม่ได้: ' + e.type + ' (ปิดแท็บเก่าที่เปิดห้องนี้แล้วลองใหม่)'));
  peer.on('connection', c => {
    c.on('open', () => { conns[c.peer] = c; c.send({t: 'view', v: view()}); });
    c.on('data', m => onData(c, m));
    c.on('close', () => { delete conns[c.peer]; renderAll(); });
  });
  renderAll();
};
$('goPlayer').onclick = () => {
  const code = $('code').value.trim().toLowerCase(), name = $('joinName').value.trim();
  if (!code || !name) { $('startMsg').textContent = 'กรอกรหัสห้องและชื่อตัวละครก่อน'; return; }
  role = 'pl'; enter(); renderLib();
  setChar((store('dnd_chars') || {})[name] || newChar(name)); saveChar();
  $('room').textContent = 'ห้อง: ' + code; netMsg('กำลังเชื่อมต่อ…');
  peer = new Peer();
  peer.on('error', e => netMsg('เชื่อมต่อไม่ได้: ' + e.type));
  peer.on('open', id => {
    myId = id;
    hostConn = peer.connect('dndroom-' + code, {reliable: true});
    hostConn.on('open', () => { netMsg('เชื่อมต่อกับ DM แล้ว'); hostConn.send({t: 'join', char: getChar()}); });
    hostConn.on('close', () => netMsg('หลุดการเชื่อมต่อ กรุณาเข้าห้องใหม่'));
    hostConn.on('data', m => {
      if (m.t === 'view') { VIEW = m.v; renderAll(); }
      if (m.t === 'hp') { fields().forEach(e => { if (e.dataset.f === 'hp') e.value = m.v; }); saveChar(); }
      if (m.t === 'xp') { fields().forEach(e => { if (e.dataset.f === 'xp') e.value = (+e.value || 0) + m.n; }); saveChar(); }
    });
    setTimeout(() => { if (!hostConn.open) netMsg('ต่อไม่ได้ ตรวจรหัสห้อง และให้ DM เปิดหน้าเว็บค้างไว้'); }, 9000);
  });
};

/* ---------- ปุ่มต่างๆ ---------- */
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { showTab(b.dataset.tab); if (b.dataset.tab === 'char') renderLib(); });
Object.keys(TYPES).forEach(k => $('sType').add(new Option(TYPES[k], k)));
['4','6','8','10','12','20','100'].forEach(n => { const b = document.createElement('button'); b.textContent = 'd' + n; b.onclick = () => { $('notation').value = '1d' + n; }; $('quick').appendChild(b); });
$('map').addEventListener('pointerdown', mapPointer); $('map').addEventListener('pointermove', mapPointer);
$('modeMove').onclick = () => { mode = 'move'; renderAll(); };
$('modePaint').onclick = () => { mode = 'paint'; renderAll(); };
$('viewScene').onchange = e => { viewId = e.target.value; brush = 0; sel = null; renderAll(); };
$('sendParty').onclick = () => {
  const to = scene(); if (!to) return;
  placeParty(to); ST.log.push({kind: 'sys', who: '', text: 'ปาร์ตี้เดินทางไปยัง ' + sceneName(to)}); dmSync();
};
$('addScene').onclick = () => {
  const w = clamp(+$('sW').value || 16, 5, 40), h = clamp(+$('sH').value || 12, 5, 40);
  const s = {id: 's' + Date.now(), name: $('sName').value.trim() || 'ฉากใหม่', type: $('sType').value,
    district: $('sDistrict').value.trim(), sub: $('sSub').value.trim(), w, h, tiles: Array(w * h).fill(0), tokens: []};
  ST.scenes.push(s); viewId = s.id; if (!ST.cur) ST.cur = s.id; ST.party && Object.keys(ST.party).length && !ST.scenes.some(x => x.tokens.length) && placeParty(s);
  dmSync(); showTab('map');
};
$('addTok').onclick = () => {
  const sc = scene(); if (!sc) return;
  const hp = +$('tHp').value || 0, t = {id: 'm' + Date.now(), owner: null, name: $('tName').value.trim() || 'มอนสเตอร์', color: $('tColor').value, hp, max: hp};
  [t.x, t.y] = freeCell(sc); sc.tokens.push(t); sel = t.id; dmSync();
};
function hpChange(sgn) {
  const t = selTok(); if (!t) return;
  t.hp = Math.max(0, t.hp + sgn * (+$('hpAmt').value || 0));
  if (t.owner && conns[t.owner]) conns[t.owner].send({t: 'hp', v: t.hp});
  dmSync();
}
$('hpMinus').onclick = () => hpChange(-1); $('hpPlus').onclick = () => hpChange(1);
$('tokDel').onclick = () => { const sc = scene(), t = selTok(); if (!t || t.owner || !confirm('ลบโทเคนนี้?')) return; sc.tokens = sc.tokens.filter(x => x !== t); sel = null; dmSync(); };
$('giveXp').onclick = () => { const n = +$('xpAmt').value || 0; Object.values(conns).forEach(c => c.send({t: 'xp', n})); post('sys', `DM แจก ${n} XP ให้ทุกคน`); };
$('rollBtn').onclick = doRoll;
$('manualBtn').onclick = () => {
  const v = $('manual').value; if (v === '') return;
  post('roll', `${$('why').value.trim() ? $('why').value.trim() + ': ' : ''}${$('notation').value.trim()} → ${v} (ลูกเต๋าจริง)`, role === 'dm' && $('secret').checked); $('manual').value = '';
};
$('sayBtn').onclick = () => { const t = $('say').value.trim(); if (!t) return; post(role === 'dm' ? 'dm' : 'say', t); $('say').value = ''; };
$('saveChar').onclick = saveChar;
$('newChar').onclick = () => { const n = prompt('ชื่อตัวละครใหม่'); if (n) { setChar(newChar(n.trim())); saveChar(); } };
$('lib').onchange = e => { const c = (store('dnd_chars') || {})[e.target.value]; if (c) { setChar(c); store('dnd_last', c.name); } };
$('sheet').addEventListener('input', abilInfo);
$('sheet').addEventListener('click', e => {
  const k = e.target.dataset.roll; if (!k) return;
  const c = getChar(), n = `1d20${sign(mod(c[k]))}`;
  rollTo(n, rollExpr(n), 'เช็ค ' + k.toUpperCase()); showTab('dice');
});
