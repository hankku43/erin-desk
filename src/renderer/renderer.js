'use strict';
/* global api */
const $ = (s) => document.querySelector(s);
const GREET_COOLDOWN = 30 * 60000; // 半小時內再點她，就不重複報告任務，改成閒聊
const state = { view: null, character: null, queue: [], typing: false, panel: null, boardTab: 'quests', expanded: new Set(), busy: false, mini: false, miniAlert: false, pending: [], addingObj: null, confirmDel: null, panelBack: null, starSeen: {}, flMode: 'auto', flSlotId: null, flFlashUntil: 0, lastActive: null };
const FORM_PANELS = new Set(['questForm', 'rowForm', 'remForm', 'divine']); // 表單面板：畫面更新時不重畫，免得打到一半的字不見

// 未捕捉的錯誤印到主程式終端機（啟動.bat 的視窗看得到）
window.addEventListener('error', (e) => console.error('[renderer error]', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', (e) => console.error('[renderer rejection]', e.reason && (e.reason.stack || e.reason)));

// ---------- 小工具 ----------
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rich(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }
function dueChip(q) {
  if (q.status === 'done') return `<span class="chip ok">${q.submitted.onTime ? '✔ 準時完成' : '✔ 已完成'}</span>`;
  if (q.daysLeft === null) return '';
  if (q.daysLeft < 0) return `<span class="chip late">⚠ 逾期 ${-q.daysLeft} 天</span>`;
  if (q.daysLeft === 0) return '<span class="chip today">🔥 今天截止</span>';
  if (q.daysLeft === 1) return '<span class="chip today">⏳ 明天截止</span>';
  return `<span class="chip">📅 剩 ${q.daysLeft} 天・${esc(q.deadlineLabel)}</span>`;
}
const TIER_ICON = { main: '👑', major: '⚔️', side: '🌿' };
function tierBadge(q) { return `<span class="badge ${q.tier}">${TIER_ICON[q.tier] || ''} ${q.tierName}</span>`; }
function hhmm(iso) { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function histIcon(reason) {
  if (/^占卜魔法/.test(reason)) return '✨';
  if (/^今日運勢/.test(reason)) return '🔮';
  if (/^完成專注/.test(reason)) return '🍅';
  if (/^交付任務/.test(reason)) return '🏆';
  if (/^完成目標/.test(reason)) return '☑️';
  if (/^完成行程/.test(reason)) return '⏰';
  if (/下班回報/.test(reason)) return '📝';
  return '✨';
}
// 紀錄的獎勵欄：占卜是花錢（負數），沒有經驗值就不顯示 XP
function gainHtml(h) {
  const g = h.gold < 0 ? `<small class="spend">🪙 −${-h.gold}</small>` : `<small>🪙 +${h.gold}</small>`;
  return h.xp ? `+${h.xp} XP${g}` : g;
}
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}

// ---------- 滑鼠穿透：只有卡片/角色區域接收滑鼠 ----------
let lastIgnore = null, dragging = false;
function updateHit(e) {
  if (dragging) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const hit = !!(el && el.closest('[data-hit]'));
  if (hit === lastIgnore) return; // lastIgnore 記的是「是否命中」
  lastIgnore = hit;
  api.setIgnoreMouse(!hit);
}
window.addEventListener('mousemove', updateHit);
window.addEventListener('mouseleave', () => { lastIgnore = null; });

// ---------- 角色：點擊 / 拖曳 / 右鍵 ----------
(function setupCharacter() {
  const wrap = $('#npcWrap');
  let down = null;
  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY, moved: false };
  });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    const dx = e.screenX - down.x, dy = e.screenY - down.y;
    if (!down.moved && Math.hypot(dx, dy) < 5) return;
    down.moved = true; dragging = true;
    api.moveWindow(dx, dy);
    down.x = e.screenX; down.y = e.screenY;
  });
  window.addEventListener('mouseup', () => {
    if (!down) return;
    const wasClick = !down.moved;
    down = null; dragging = false;
    if (wasClick) onNpcClick(); else api.dragEnd();
  });
  wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); api.openMenu(); });
  $('#hud').addEventListener('contextmenu', (e) => { e.preventDefault(); api.openMenu(); });
})();

function setEmotion(emo) {
  const c = state.character;
  if (!c) return;
  const src = state.mini
    ? (state.miniAlert ? c.miniAlert : c.mini)
    : (c.images[emo] || c.images.normal);
  if (src && $('#npcImg').getAttribute('src') !== src) $('#npcImg').src = src;
}
// 頭上的提示圖示：ready = 可交付（藍色問號）、alert = 有新訊息（粉色驚嘆號）
function setMarker(kind) {
  const m = $('#marker');
  if (!kind) { m.classList.add('hidden'); m.dataset.kind = ''; return; }
  const src = state.character && state.character.markers && state.character.markers[kind];
  m.dataset.kind = kind;
  m.classList.toggle('q', kind === 'ready');
  m.innerHTML = src ? `<img src="${src}" alt="${kind === 'ready' ? '?' : '!'}" draggable="false">` : (kind === 'ready' ? '?' : '!');
  m.classList.toggle('img', !!src);
  m.classList.remove('hidden');
}
function jump() { const w = $('#npcWrap'); w.classList.remove('jump'); void w.offsetWidth; w.classList.add('jump'); }
// 跳完就把 jump 拿掉，說話的抖動才能接回去
$('#npcWrap').addEventListener('animationend', (e) => { if (e.animationName === 'jump') $('#npcWrap').classList.remove('jump'); });

async function onNpcClick() {
  if (state.mini) { if (!fx.busy) api.setMini(false); return; } // 展開後由 ui:mini 事件接手（縮小動畫中先不理）
  jump();
  $('#marker').classList.add('hidden');
  if (state.queue.length || state.typing) { advance(); return; } // 還有話沒說完 → 先聽完
  if (state.busy) return;
  const stale = !state.lastGreetAt || Date.now() - state.lastGreetAt > GREET_COOLDOWN;
  if ($('#dialog').classList.contains('hidden') && (stale || state.pendingAmbient)) {
    openDialog();
    await greet();
  } else {
    openDialog();
    await run(() => api.poke());
  }
}
async function greet() {
  state.lastGreetAt = Date.now();
  const pending = state.pendingAmbient; state.pendingAmbient = null;
  const r = await run(() => api.greet());
  if (pending && pending.length) enqueue(pending);
  return r;
}

// ---------- 縮小化（貓咪型態） ----------
function applyMini(on, { greet: sayHi = true } = {}) { // 參數改名，避免和下面的 greet() 函式撞名
  const was = state.mini;
  state.mini = !!on;
  document.body.classList.toggle('mini', state.mini);
  document.body.classList.remove('shrinking'); $('#npcWrap').classList.remove('shrinking');
  lastIgnore = null;
  state.miniAlert = false;
  setEmotion('normal'); // 先換成對應型態的圖（貓 ↔ 貓娘），後面的動作出錯也不會卡在大貓
  const useFx = was !== state.mini && state.fx !== false && !!state.character;
  fx.busy = false; // 視窗已經換好大小，之後的點擊都可以處理
  if (state.mini) {
    closePanel(); closeDialog();
    if (useFx) fx.catPop();
  } else {
    $('#marker').classList.add('hidden');
    if (useFx) fx.morph();
    if (was && sayHi) {
      openDialog();
      if (state.pending.length) { const p = state.pending; state.pending = []; enqueue(p); } // 縮小期間累積的提醒
      else if (state.view && state.view.focus && state.view.focus.active) peekFocus();       // 專注中點貓咪：告訴你還剩幾分鐘
      else if (state.lastLine) showLine(state.lastLine);                                   // 沒有新訊息：把上一句直接放回來，不打字、不觸發任何事件
      else greet();                                                                         // 什麼都沒有（例如第一次）才打招呼
    }
  }
  if (state.view) applyView(state.view);
}
function miniNotify(lines) {
  state.pending.push(...lines.filter((l) => !l.ambient));
  if (!state.pending.length) state.pending.push(...lines); // 只有閒聊也保留一句
  state.pending = state.pending.slice(-5);
  state.miniAlert = true;
  setMarker('alert');
  setEmotion('normal');
  if (!(state.view && state.view.focus && state.view.focus.active)) jump(); // 專注中安靜亮個 ! 就好，不跳
}
async function goMini() {
  if (state.mini || fx.busy) return;
  if (state.fx === false || !state.character) { api.setMini(true); return; }
  await fx.shrink();   // 先把貓娘縮成一團光，再請主程式縮視窗
  api.setMini(true);
}

// ---------- 變身特效 ----------
const fx = {
  busy: false,
  layer(html) {
    const old = $('#morph'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'morph'; el.innerHTML = html;
    $('#npcWrap').appendChild(el);
    return el;
  },
  sparks(n, { cx = 80, cy = 80, spread = 150, delay = .35, chars = ['✦', '✧', '❄', '⋆', '✦'] } = {}) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * .5;
      const r = spread * (.55 + Math.random() * .45);
      const cls = Math.random() < .3 ? 'gold' : Math.random() < .5 ? 'snow' : '';
      html += `<span class="m-spark ${cls}" style="right:${cx}px;bottom:${cy}px;--dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(-Math.sin(a) * r - 20).toFixed(0)}px;--dur:${(.7 + Math.random() * .5).toFixed(2)}s;--delay:${(delay + Math.random() * .2).toFixed(2)}s;font-size:${12 + Math.random() * 12}px">${chars[i % chars.length]}</span>`;
    }
    return html;
  },
  // 貓 → 貓娘：貓發光膨脹消散、魔法陣、閃光、星星四散，貓娘從白光中淡入；面板隨後滑入
  morph() {
    this.busy = true;
    const wrap = $('#npcWrap');
    const catSrc = state.character.mini || state.character.images.normal;
    this.layer(`<div class="m-circle"></div><img class="m-cat" src="${catSrc}" alt=""><div class="m-flash"></div><div class="m-ring"></div>${this.sparks(16)}`);
    wrap.classList.remove('transforming'); void wrap.offsetWidth; wrap.classList.add('transforming');
    document.body.classList.remove('appearing'); void document.body.offsetWidth; document.body.classList.add('appearing');
    setTimeout(() => { this.busy = false; }, 700);
    setTimeout(() => { wrap.classList.remove('transforming'); const m = $('#morph'); if (m) m.remove(); }, 1300);
    setTimeout(() => document.body.classList.remove('appearing'), 1400);
  },
  // 貓娘 → 貓：面板淡出、貓娘縮成光球（在縮視窗之前播）
  shrink() {
    this.busy = true;
    const wrap = $('#npcWrap');
    closePanel(); closeDialog();
    this.layer(`<div class="m-orb"></div>${this.sparks(8, { cx: 40, cy: 40, spread: 90, delay: .1, chars: ['✧', '⋆', '✦'] })}`);
    wrap.classList.add('shrinking'); document.body.classList.add('shrinking');
    return new Promise((r) => setTimeout(r, 560));
  },
  // 貓咪彈出（在小視窗裡）
  catPop() {
    const wrap = $('#npcWrap');
    this.layer(this.sparks(6, { cx: 70, cy: 60, spread: 60, delay: .05, chars: ['✧', '⋆'] }));
    wrap.classList.remove('catpop'); void wrap.offsetWidth; wrap.classList.add('catpop');
    setTimeout(() => { wrap.classList.remove('catpop'); const m = $('#morph'); if (m) m.remove(); }, 900);
  },
};

// ---------- 對話框 ----------
function openDialog() { if (FORM_PANELS.has(state.panel)) return; $('#dialog').classList.remove('hidden'); } // 表單開著時先不冒出來，關掉表單再顯示
function closeDialog() { showProposal(null); $('#dialog').classList.add('hidden'); $('#chatRow').classList.add('hidden'); state.queue = []; state.typing = false; $('#npcWrap').classList.remove('talking'); setEmotion('normal'); }
$('#dlgClose').addEventListener('click', () => { closeDialog(); closePanel(); });
$('#dlgMini').addEventListener('click', goMini);
$('#aiDot').addEventListener('click', () => api.toggleAI());
$('#hudMini').addEventListener('click', goMini);

function showThinking() {
  openDialog();
  $('#dlgText').innerHTML = '<span class="thinking-dots"><span></span><span></span><span></span></span>';
  setEmotion('thinking');
}

function enqueue(lines) {
  if (!lines || !lines.length) return;
  state.queue.push(...lines);
  if (!state.typing) advance();
}

let typeTimer = null;
function advance() {
  const box = $('#dlgText');
  if (state.typing) { // 直接顯示完整句子
    clearInterval(typeTimer); state.typing = false;
    box.innerHTML = rich(state.current.text);
    afterLine();
    return;
  }
  const line = state.queue.shift();
  if (!line) return;
  openDialog();
  state.current = line; state.lastLine = line;
  setEmotion(line.emotion || 'normal');
  if (line.emotion === 'cheer' || line.emotion === 'surprised') jump();
  $('#npcWrap').classList.add('talking');
  state.typing = true;
  let i = 0;
  const text = line.text || '';
  const plain = text.replace(/`/g, ''); // 打字中先不顯示反引號，打完再用 rich() 上色
  box.innerHTML = '<span class="typing"></span>';
  $('#dlgMore').classList.add('hidden');
  typeTimer = setInterval(() => {
    i += 1;
    box.innerHTML = `<span class="typing">${esc(plain.slice(0, i))}</span>`;
    if (i >= plain.length) { clearInterval(typeTimer); state.typing = false; box.innerHTML = rich(text); afterLine(); }
  }, 32);
}
// 直接顯示一句（不打字、不排隊）：展開時放回上一句用
function showLine(line) {
  clearInterval(typeTimer); state.typing = false; state.queue = [];
  openDialog();
  state.current = line;
  setEmotion(line.emotion || 'normal');
  $('#dlgText').innerHTML = rich(line.text || '');
  afterLine();
}
function afterLine() {
  $('#npcWrap').classList.remove('talking');
  $('#dlgMore').classList.toggle('hidden', !state.queue.length);
}
$('#dlgText').addEventListener('click', () => advance());
$('#dlgMore').addEventListener('click', () => advance());

// ---------- 通用執行（等待 NPC 回覆） ----------
async function run(fn, { thinking = true } = {}) {
  if (state.busy) return null;
  state.busy = true;
  if (thinking) showThinking();
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, error: String(e) }; }
  state.busy = false;
  if (r && r.view) applyView(r.view);
  if (!r || !r.ok) {
    toast(`⚠ ${r && r.error ? r.error : '發生錯誤'}`, 4000);
    if (thinking) { $('#dlgText').textContent = '嗯……好像哪裡怪怪的，再試一次看看？'; setEmotion('worried'); }
    return r;
  }
  if (r.writeError) toast(`⚠ 回寫計畫檔失敗：${r.writeError}`, 5000);
  if (r.reward) celebrate(r.reward);
  enqueue(r.lines);
  showProposal(r.proposal || null);
  return r;
}

// ---------- 獎勵特效 ----------
function celebrate(reward) {
  if (!reward || !reward.xp) return;
  const fx = $('#fx');
  const el = document.createElement('div');
  el.className = 'float-reward';
  el.innerHTML = `<span>✨ +${reward.xp} XP</span><span class="g">🪙 +${reward.gold}</span>`;
  fx.appendChild(el); setTimeout(() => el.remove(), 2100);
  if (reward.levelUp) {
    const lv = document.createElement('div');
    lv.className = 'levelup';
    lv.innerHTML = `<div class="big">LEVEL UP!</div><div class="small">Lv.${reward.levelUp.level}　${esc(reward.levelUp.title)}</div>`;
    fx.appendChild(lv); setTimeout(() => lv.remove(), 2900);
    confetti(60);
  } else if (reward.xp >= 60) confetti(28);
}
function confetti(n) {
  const colors = ['#ffd66b', '#ff7aa2', '#7ee0ff', '#8ef0a8', '#b69cff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    $('#fx').appendChild(c); setTimeout(() => c.remove(), 3600);
  }
}

// ---------- 畫面更新 ----------
function applyView(v) {
  // 剛勾完當前任務的目標：焦點行先切到任務、讓新的星星亮一下
  const la = state.lastActive, na = v.active;
  if (la && na && la.id === na.id && na.doneCount > la.done) { state.flFlashUntil = Date.now() + 4500; setTimeout(renderTracker, 4600); }
  state.lastActive = na ? { id: na.id, done: na.doneCount } : null;
  state.view = v;
  state.clockOffset = new Date(v.now).getTime() - Date.now(); // 面板倒數用主程式的時間
  state.fx = v.fx !== false;
  const p = v.player;
  $('#lv').textContent = `Lv.${p.level}`;
  $('#ptitle').textContent = p.title;
  $('#gold').textContent = `🪙 ${p.gold}`;
  $('#xpfill').style.width = `${Math.min(100, (p.xpInLevel / p.xpForNext) * 100)}%`;
  $('#xptext').textContent = `${p.xpInLevel} / ${p.xpForNext} XP`;
  $('#npcName').textContent = v.npc.name;
  const cold = !!(v.affection && v.affection.cold); // 冷戰中：名牌上一片雪花（好感度本身不顯示）
  $('#npcName').classList.toggle('cold', cold);
  $('#npcName').title = cold ? `${v.npc.name}好像還在生氣……` : '';
  
  const dot = $('#aiDot');
  const online = !!(v.npc.status && v.npc.status.online);
  dot.classList.toggle('on', online);
  dot.classList.toggle('off', !v.npc.enabled);
  dot.title = (v.npc.enabled ? (online ? `AI 已連線：${v.npc.model}` : `AI 離線：${(v.npc.status && v.npc.status.message) || ''}`) : 'AI 對話已關閉') + '（點一下切換開關）';
  renderTracker();
  renderFocus();
  renderFortuneTag();
  const a = v.active;
  $('#btnSubmit').disabled = !(a && a.status === 'ready');
  const m = $('#marker');
  if (state.mini && state.miniAlert) { /* 保留 ! */ }
  else if (a && a.status === 'ready') setMarker('ready');
  else if (m.dataset.kind === 'ready' || state.mini) setMarker(null);
  if (v.planError) toast(`⚠ ${v.planError}`, 6000);
  if (state.panel && !FORM_PANELS.has(state.panel)) renderPanel();
}
// 日期小工具：<input type="date"> 的值 ↔ 計畫檔裡的 M/D
function isoToLabel(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const nowYear = state.view ? new Date(state.view.now).getFullYear() : new Date().getFullYear();
  return y === nowYear ? `${m}/${d}` : isoDate; // 跨年就寫完整日期
}
function todayISO() { const d = state.view ? new Date(state.view.now) : new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function nowHHMM() { const d = state.view ? new Date(state.view.now) : new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function shortTitle(s, n = 14) { return s.length > n ? s.slice(0, n) + '…' : s; }

// ---------- 狀態面板：一行焦點 ----------
// 在時段內顯示時段（⏳ 沙漏），不在時段內顯示當前任務（⭐ 星星）；左邊的圖示可以切換。細項在滑過去的小卡裡
const nowMs = () => Date.now() + (state.clockOffset || 0);
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function slotTimes(row, date) {
  if (!row || !row.start) return null;
  const s = new Date(`${date}T${row.start}:00`).getTime();
  const e = row.end ? new Date(`${date}T${row.end}:00`).getTime() : null;
  return { s, e };
}
function rowText(row, t) {
  if (!row) return '';
  return t.branch ? (t.chosenBranch === 'b' ? row.b : t.chosenBranch === 'a' ? row.a : (row.a === row.b ? row.a : `${row.a}／${row.b}`)) : row.a;
}
// 用現在的時間重新找「這一格」和「下一格」（面板每 15 秒更新一次，不用等主程式）
function slotNow() {
  const t = state.view && state.view.today;
  if (!t || !t.rows || !t.rows.length) return { cur: null, next: null, t };
  const now = nowMs();
  let cur = null, next = null;
  for (const r of t.rows) {
    const tm = slotTimes(r, t.date);
    if (!tm) continue;
    if (tm.e && now >= tm.s && now < tm.e) cur = { row: r, ...tm };
    else if (!next && now < tm.s) next = { row: r, ...tm };
  }
  return { cur, next, t };
}
function starsHtml(q, animate) {
  const n = q.objectives.length;
  if (!n) return '';
  if (n > 6) return `<span class="stars few">★ ${q.doneCount}/${n}</span>`;
  const seen = state.starSeen[q.id] ?? q.doneCount;
  return `<span class="stars">${q.objectives.map((o, i) => {
    const lit = i < q.doneCount; // 依完成數量點亮，看起來一顆一顆往右亮
    const pop = animate && lit && i >= seen;
    return `<i class="${lit ? 'on' : ''} ${pop ? 'pop' : ''}">${lit ? '★' : '☆'}</i>`;
  }).join('')}</span>`;
}
function dueSub(q) {
  if (q.status === 'ready') return `<em class="ready">・✨ 目標都完成了，點${esc(state.view.npc.name)}交付</em>`;
  if (q.status === 'done' || q.daysLeft === null) return '';
  if (q.daysLeft < 0) return `<em class="late">・⚠ 逾期 ${-q.daysLeft} 天</em>`;
  if (q.daysLeft === 0) return '<em class="today">・🔥 今天截止</em>';
  if (q.daysLeft === 1) return '<em class="today">・明天截止</em>';
  return `・剩 ${q.daysLeft} 天（${esc(q.deadlineLabel)}）`;
}
function flMode() {
  const { cur, next } = slotNow();
  const slotId = cur ? cur.row.id : null;
  if (slotId !== state.flSlotId) { state.flSlotId = slotId; state.flMode = 'auto'; } // 換到下一格就回到自動
  if (state.flFlashUntil && Date.now() < state.flFlashUntil) return 'quest';       // 剛勾完目標：先秀一下星星
  if (state.flMode === 'quest') return 'quest';
  if (state.flMode === 'slot') return cur || next ? 'slot' : 'quest';
  return cur ? 'slot' : 'quest';
}
function renderTracker() {
  const v = state.view;
  if (!v) return;
  const el = $('#tracker');
  if (state.focusConfirm && v.focus && v.focus.active) {
    el.innerHTML = `<div class="fl confirm"><span class="fl-ico">🍅</span><div class="fl-main"><div class="fl-text">還剩 ${v.focus.leftMin} 分鐘，要結束專注嗎？</div></div><button class="btn small danger" data-focus-stop>結束</button><button class="btn small ghost" data-focus-keep>繼續</button></div>`;
    return;
  }
  const mode = flMode();
  const { cur, next, t } = slotNow();
  const canSlot = !!(cur || next);
  const a = v.active;
  let html = '';
  if (mode === 'slot' && cur) {
    const total = cur.e - cur.s, done = nowMs() - cur.s;
    const pct = Math.max(0, Math.min(100, (done / total) * 100));
    const left = Math.max(0, Math.ceil((cur.e - nowMs()) / 60000));
    const cls = left <= 3 ? 'end' : left <= 10 ? 'soon' : '';
    html = `<div class="fl ${cls}"><button class="fl-ico" data-flip title="切換成當前任務">⏳</button>
      <div class="fl-main"><div class="fl-text">${rich(rowText(cur.row, t))}</div>
        <div class="fl-sub fl-barrow"><span>${esc(cur.row.start)}</span><div class="fl-bar"><i style="width:${pct.toFixed(1)}%"></i></div><span>${esc(cur.row.end)}</span></div></div>
      <span class="fl-side">剩 ${left} 分</span></div>`;
  } else if (mode === 'slot' && next) {
    const mins = Math.max(0, Math.ceil((next.s - nowMs()) / 60000));
    html = `<div class="fl"><button class="fl-ico" data-flip title="切換成當前任務">🕒</button>
      <div class="fl-main"><div class="fl-text">${rich(rowText(next.row, t))}</div><div class="fl-sub">下一格・${esc(next.row.slot)}</div></div>
      <span class="fl-side">${mins >= 60 ? `${Math.floor(mins / 60)} 小時後` : `${mins} 分後`}</span></div>`;
  } else if (a) {
    const ready = a.status === 'ready';
    html = `<div class="fl fl-q ${ready ? 'ready' : ''}"><button class="fl-ico" ${canSlot ? 'data-flip title="切換成今天的時段"' : 'disabled'}>${TIER_ICON[a.tier] || '📌'}</button>
      <div class="fl-main"><div class="fl-text">${rich(a.title)}</div><div class="fl-sub">${esc(a.tierName)}${dueSub(a)}</div></div>
      <span class="fl-side">${starsHtml(a, true)}</span></div>`;
    state.starSeen[a.id] = a.doneCount;
  } else {
    const allDone = v.quests.length && v.quests.every((q) => q.status === 'done');
    html = `<div class="fl"><span class="fl-ico">${allDone ? '🎉' : '📜'}</span><div class="fl-main"><div class="fl-text">${allDone ? '本週任務全部完成！' : '目前沒有任務'}</div><div class="fl-sub">點這裡打開任務板</div></div></div>`;
  }
  el.innerHTML = html;
  if (state.peekOpen) renderPeek();
}
$('#tracker').addEventListener('click', async (e) => {
  if (e.target.closest('[data-flip]')) {
    e.stopPropagation();
    state.flFlashUntil = 0;
    state.flMode = flMode() === 'slot' ? 'quest' : 'slot';
    renderTracker();
    return;
  }
  if (e.target.closest('[data-focus-stop]')) { state.focusConfirm = false; await run(() => api.cancelFocus(), { thinking: false }); return; }
  if (e.target.closest('[data-focus-keep]')) { state.focusConfirm = false; renderTracker(); return; }
  if (e.target.closest('button')) return;
  hidePeek();
  openPanel('board');
});

// ---------- 滑過去看細項 ----------
function renderPeek() {
  const v = state.view, a = v && v.active;
  const { cur, next, t } = slotNow();
  let html = '';
  if (a) {
    html += `<div class="pk-head">${TIER_ICON[a.tier] || '📌'} <b>${rich(a.title)}</b>${dueChip(a)}</div>`;
    html += a.objectives.slice(0, 7).map((o) => `<div class="pk-obj ${o.done ? 'done' : ''}"><i>${o.done ? '★' : '☆'}</i><span>${rich(o.text)}</span></div>`).join('');
    if (a.objectives.length > 7) html += `<div class="pk-obj more">…還有 ${a.objectives.length - 7} 項</div>`;
    if (a.status === 'ready') html += `<div class="pk-ready">✨ 目標都完成了，點${esc(v.npc.name)}交付吧！</div>`;
  }
  const r = cur || next;
  if (r) {
    const txt = rowText(r.row, t), out = t.branch ? '' : r.row.b;
    let meta = '';
    if (cur) { const pct = Math.round(((nowMs() - cur.s) / (cur.e - cur.s)) * 100); meta = `已過 ${pct}%・剩 ${Math.max(0, Math.ceil((cur.e - nowMs()) / 60000))} 分`; }
    else meta = `${next.row.start} 開始`;
    html += `<div class="pk-slot"><div>${cur ? '⏳' : '🕒'} <b>${esc(r.row.slot)}</b> ${rich(txt)}</div>${out ? `<div class="pk-out">→ ${rich(out)}</div>` : ''}<div class="pk-meta">${meta}</div></div>`;
  }
  if (!html) html = '<div class="pk-obj">目前沒有任務或時段</div>';
  html += '<div class="pk-hint">點一下打開任務板</div>';
  const pk = $('#hudPeek');
  pk.innerHTML = html;
  pk.style.bottom = `${$('#hud').offsetHeight + 20}px`;
}
function hidePeek() { clearTimeout(state.peekTimer); state.peekOpen = false; $('#hudPeek').classList.add('hidden'); }
$('#tracker').addEventListener('mouseenter', () => {
  clearTimeout(state.peekTimer);
  state.peekTimer = setTimeout(() => { if (state.mini || state.focusConfirm) return; state.peekOpen = true; renderPeek(); $('#hudPeek').classList.remove('hidden'); }, 280);
});
$('#tracker').addEventListener('mouseleave', hidePeek);

// ---------- 🔮 今日運勢 ----------
function renderFortuneTag() {
  const f = state.view && state.view.fortune;
  const tag = $('#fortuneTag');
  tag.className = `fortune-tag ${f ? `drawn t${f.tier}` : 'new'}`;
  tag.textContent = f ? f.rank : '🔮';
  tag.title = f ? `今日運勢：${f.rank}（點一下再看一次）` : '點一下抽今日運勢';
}
async function drawFortune() {
  if (state.mini) return;
  const r = await run(() => api.drawFortune(), { thinking: false });
  if (!r || !r.ok) return;
  showFortuneCard(r.fortune, r.again ? null : r.reward);
  if (!r.again && r.fortune.tier >= 5) confetti(36);
}
function showFortuneCard(f, reward) {
  const c = $('#fortuneCard');
  clearTimeout(state.fortuneTimer);
  c.className = `t${f.tier}`;
  c.innerHTML = `<div class="fc-inner"><div class="fc-back"><div class="fc-emblem">🔮</div><div>星盾公會・今日運勢</div></div>
    <div class="fc-front"><div class="fc-date">${+f.date.slice(5, 7)}/${+f.date.slice(8, 10)} 的運勢</div><div class="fc-rank">${esc(f.rank)}</div>
      <div class="fc-advice">${esc(f.advice)}</div><div class="fc-item">幸運物：<b>${esc(f.item)}</b></div>
      <div class="fc-reward">${reward ? `✨ +${reward.xp} XP　🪙 +${reward.gold}` : '今天已經抽過囉'}</div></div></div>`;
  c.style.bottom = `${$('#hud').offsetHeight + 22}px`;
  void c.offsetWidth;
  c.classList.add('show');
  setTimeout(() => c.classList.add('flip'), reward ? 650 : 60);
  state.fortuneTimer = setTimeout(hideFortuneCard, reward ? 8000 : 5000);
}
function hideFortuneCard() { const c = $('#fortuneCard'); c.classList.add('bye'); setTimeout(() => { c.className = 'hidden'; }, 350); }
$('#fortuneCard').addEventListener('click', hideFortuneCard);
$('#hudTop').addEventListener('click', (e) => { if (e.target.closest('button')) return; drawFortune(); });

// ---------- ✨ 占卜魔法（星環占＝梅花易數）----------
const DV_METHODS = [
  { key: 'circle', icon: '🌀', name: '魔法陣', hint: '點兩下讓星環停下' },
  { key: 'numbers', icon: '🔢', name: '報數', hint: '自己想兩個數字' },
  { key: 'time', icon: '🕰', name: '此刻', hint: '用現在的年月日時' },
];
const DV_METHOD_NAME = { circle: '魔法陣', numbers: '報數', time: '此刻起卦' };
function openDivine(arg) {
  const prev = state.dv;
  state.dv = { step: 'ask', method: (prev && prev.method) || 'circle', question: (arg && arg.question) || '', a: '', b: '', info: null, notice: '' };
  api.divineInfo().then((r) => { if (r && r.ok && state.panel === 'divine' && state.dv.step === 'ask') { state.dv.info = r.info; renderPanel(); const q = $('#dvQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } } });
}
function guaHtml(hex, moving) {
  let h = '';
  for (let i = 5; i >= 0; i--) h += `<i class="yao ${hex.lines[i] ? 'yang' : 'yin'} ${moving === i + 1 ? 'mv' : ''}" style="--d:${i}"><b></b><b></b></i>`;
  return `<div class="gua" title="${esc(hex.upper.name)}上${esc(hex.lower.name)}下">${h}</div>`;
}
function dvCol(k, label, role, hex, moving) {
  return `<div class="dv-col" style="--col:${k}"><div class="dv-lab">${label}<small>${role}</small></div>${guaHtml(hex, moving)}<div class="dv-name">${esc(hex.name)}</div><div class="dv-mean">${esc(hex.meaning)}</div></div>`;
}
function dvDetail(r) {
  const t = (x) => `<b>${esc(x.name)}${x.sym}</b>（${esc(x.nature)}・${esc(x.el)}）`;
  return `<div class="dv-detail">
    <div>🌀 起卦：${esc(r.formula.source)}</div>
    <div>上卦：${esc(r.formula.upper)}</div><div>下卦：${esc(r.formula.lower)}</div><div>動爻：${esc(r.formula.moving)}</div>
    <div>體卦 ${t(r.ti)}・用卦 ${t(r.yong)}（有動爻的是用）</div>
    <div>體用：<b>${esc(r.relation)}</b> → ${esc(r.verdict.tag)}，${esc(r.verdict.text)}</div>
    <div>過程（互卦 ${esc(r.hu.upper.name)}${esc(r.hu.upper.el)}・${esc(r.hu.lower.name)}${esc(r.hu.lower.el)} 對體）：${esc(r.huRel.join('、'))}</div>
    <div>結果（用卦變成 ${t(r.bianYong)} 對體）：${esc(r.bianRel)}</div>
  </div>`;
}
function renderDivine(el, v) {
  const d = state.dv; if (!d) return;
  const info = d.info || v.divination || { cost: 10, repeatHours: 24, recent: [] };
  const goldChip = `<span class="dv-gold">🪙 ${v.player.gold}</span>`;
  if (d.step === 'ask') {
    const tiles = DV_METHODS.map((m) => {
      const off = m.key === 'time' && !info.timeAvailable;
      const sub = m.key === 'time' ? (info.timeAvailable ? esc(info.timeText) : '要先重跑一次安裝.bat') : m.hint;
      return `<label class="dv-m ${d.method === m.key ? 'on' : ''} ${off ? 'off' : ''}"><input type="radio" name="dvm" value="${m.key}" ${d.method === m.key ? 'checked' : ''} ${off ? 'disabled' : ''}><span class="ic">${m.icon}</span><b>${m.name}</b><small>${sub}</small></label>`;
    }).join('');
    const nums = d.method === 'numbers' ? `<div class="field-row"><div class="field">第一個數字（上卦）<input id="dvA" type="number" min="1" max="9999" value="${esc(d.a)}" placeholder="例如 17"></div><div class="field">第二個數字（下卦）<input id="dvB" type="number" min="1" max="9999" value="${esc(d.b)}" placeholder="例如 6"></div></div>` : '';
    const recent = (info.recent || []).slice(0, 3);
    const rec = recent.length ? `<div class="dv-recent"><div class="dv-rtitle">🌙 最近的占卜（點一下再看一次，不花錢）</div>${recent.map((r) => `<button class="dv-ritem" data-dv-recent="${r.id}"><span class="dv-tag l${r.level}">${esc(r.tag)}</span><b>${esc(r.ben)}</b><span class="q">${esc(r.question)}</span></button>`).join('')}</div>` : '';
    el.innerHTML = head('✨ 占卜魔法', '星環占・梅花易數', goldChip) + `<div class="panel-body form dv-ask">
      ${d.notice ? `<div class="dv-notice">${rich(d.notice)}</div>` : ''}
      <div class="field">🌙 想問什麼？<input id="dvQ" maxlength="60" value="${esc(d.question)}" placeholder="例如：這週的發表會會順利嗎？"></div>
      <div class="field">🔮 起卦方式<div class="dv-methods">${tiles}</div></div>
      ${nums}${rec}
    </div>
    <div class="panel-foot"><span class="spacer">一次 ${info.cost} 金幣・同一件事 ${info.repeatHours} 小時內只占一次（一事不二占）</span><button class="btn ghost" data-close>取消</button><button class="btn gold" id="dvStart">✨ 開始施法</button></div>`;
    return;
  }
  if (d.step === 'circle') {
    const ring = (n, r) => Array.from({ length: n }, (_, i) => `<span style="transform:rotate(${(i * 360) / n}deg) translateY(-${r}px)">${i + 1}</span>`).join('');
    const tri = '☰☱☲☳☴☵☶☷'.split('').map((x, i) => `<span style="transform:rotate(${i * 45}deg) translateY(-30px)">${x}</span>`).join('');
    el.innerHTML = head('✨ 占卜魔法', '心裡默念你的問題', goldChip) + `<div class="panel-body dv-circle-body">
      <div class="dv-q">「${esc(d.question)}」</div>
      <div class="mc" id="dvCircle"><div class="mc-ring outer" id="mcOuter">${ring(24, 103)}</div><div class="mc-ring inner" id="mcInner">${ring(16, 66)}</div>
        <div class="mc-core"><div class="mc-tri">${tri}</div><div class="mc-star">✦</div></div><div class="mc-pointer">▼</div></div>
      <div class="dv-hint" id="dvHint">點一下，讓外環停下</div>
      <div class="dv-nums"><span>外環 <b id="dvNa">？</b></span><span>內環 <b id="dvNb">？</b></span></div>
    </div>
    <div class="panel-foot dark"><span class="spacer">點魔法陣任何地方都可以</span><button class="btn ghost" data-dv-back>換個方法</button></div>`;
    startCircle();
    return;
  }
  // 結果
  const r = d.rec.result;
  const sub = d.mode === 'repeat' ? '一事不二占・上次的結果' : d.mode === 'history' ? '之前的占卜' : `${DV_METHOD_NAME[d.rec.method] || ''}・${r.hour ? `${r.hour.name}時` : ''}`;
  el.innerHTML = head('✨ 占卜魔法', sub, goldChip) + `<div class="panel-body dv-result ${d.fresh ? 'casting' : ''}">
    <div class="dv-q">「${esc(d.rec.question)}」${d.mode === 'repeat' ? '<span class="dv-stamp">一事不二占</span>' : ''}</div>
    <div class="dv-guas">${dvCol(0, '本卦', '現在', r.ben, r.moving)}<span class="dv-arrow">➜</span>${dvCol(1, '互卦', '過程', r.hu, 0)}<span class="dv-arrow">➜</span>${dvCol(2, '變卦', '結果', r.bian, r.moving)}</div>
    <div class="dv-verdict"><span class="dv-tag big l${r.verdict.level}">${esc(r.verdict.tag)}</span><span>${esc(r.verdict.text)}</span></div>
    <div class="dv-reading" id="dvReading"><div class="dv-rh">💬 ${esc(v.npc.name)}的解讀</div><div class="dv-rt">${d.reading ? rich(d.reading) : '<span class="thinking-dots"><span></span><span></span><span></span></span>'}</div></div>
    <button class="dv-detail-btn" id="dvDetail">📖 ${d.showDetail ? '收起解析' : '看解析（體用、五行、動爻）'}</button>
    ${d.showDetail ? dvDetail(r) : ''}
  </div>
  <div class="panel-foot"><span class="spacer">${d.mode ? '這次沒有花金幣' : `花了 ${info.cost} 金幣`}・${esc(r.movingName)}動</span><button class="btn ghost" id="dvAgain" ${d.reading ? '' : 'disabled'}>🌙 再問別的事</button><button class="btn gold" data-close>完成</button></div>`;
  d.fresh = false;
}
// 魔法陣：外環 24 格順時針、內環 16 格逆時針；點一下就減速停在某一格（指針在正上方）
function startCircle() {
  const c = state.dv.circle = {
    rings: [
      { el: $('#mcOuter'), n: 24, angle: Math.random() * 360, speed: 110 + Math.random() * 70, stop: null, value: null },
      { el: $('#mcInner'), n: 16, angle: Math.random() * 360, speed: -(140 + Math.random() * 80), stop: null, value: null },
    ],
    next: 0, last: performance.now(),
  };
  cancelAnimationFrame(state.dvRaf);
  const tick = (t) => {
    if (state.panel !== 'divine' || !state.dv || state.dv.step !== 'circle' || state.dv.circle !== c) return;
    const dt = Math.min(0.05, (t - c.last) / 1000); c.last = t;
    for (const r of c.rings) {
      if (r.value !== null) continue;
      if (r.stop) {
        const p = Math.min(1, (t - r.stop.t0) / r.stop.dur), e = 1 - Math.pow(1 - p, 3);
        r.angle = r.stop.from + (r.stop.to - r.stop.from) * e;
        if (p >= 1) { r.angle = r.stop.to; r.value = slotAtTop(r); ringStopped(r); }
      } else r.angle += r.speed * dt;
      r.el.style.transform = `rotate(${r.angle}deg)`;
    }
    state.dvRaf = requestAnimationFrame(tick);
  };
  state.dvRaf = requestAnimationFrame(tick);
}
function slotAtTop(r) { const step = 360 / r.n; return ((((Math.round(-r.angle / step)) % r.n) + r.n) % r.n) + 1; }
function stopRing() {
  const c = state.dv && state.dv.circle; if (!c) return;
  const r = c.rings[c.next]; if (!r || r.stop) return;
  const step = 360 / r.n, extra = 2 + Math.floor(Math.random() * 2);
  const to = r.speed > 0 ? (Math.floor(r.angle / step) + extra) * step : (Math.ceil(r.angle / step) - extra) * step;
  r.stop = { t0: performance.now(), dur: 900, from: r.angle, to };
  c.next++;
  $('#dvHint').textContent = c.next === 1 ? '外環慢下來了……' : '內環也慢下來了……';
}
function ringStopped(r) {
  const spans = r.el.querySelectorAll('span');
  if (spans[r.value - 1]) spans[r.value - 1].classList.add('hit');
  const c = state.dv.circle, [o, i] = c.rings;
  if (r === o) { $('#dvNa').textContent = o.value; $('#dvHint').textContent = '再點一下，讓內環停下'; }
  if (r === i) $('#dvNb').textContent = i.value;
  if (o.value !== null && i.value !== null) {
    state.dv.a = o.value; state.dv.b = i.value;
    $('#dvHint').textContent = '✨ 星象成形……';
    $('#dvCircle').classList.add('done');
    setTimeout(divineCast, 900);
  }
}
async function divineStart() {
  const d = state.dv;
  d.question = ($('#dvQ') && $('#dvQ').value.trim()) || d.question.trim();
  if (!d.question) { toast('⚠ 先寫下想問的事'); const q = $('#dvQ'); if (q) q.focus(); return; }
  if (d.method === 'numbers') {
    d.a = $('#dvA').value; d.b = $('#dvB').value;
    if (!(+d.a >= 1) || !(+d.b >= 1)) { toast('⚠ 請填兩個大於 0 的整數'); return; }
  }
  // 先確認：同一件事問過了？金幣夠嗎？（都不扣錢）
  const chk = await run(() => api.divineCheck(d.question), { thinking: false });
  if (!chk || !chk.ok) return;
  if (chk.repeat) { Object.assign(d, { step: 'result', rec: chk.record, mode: 'repeat', reading: chk.lines[0].text, fresh: true, showDetail: false }); renderPanel(); return; }
  if (chk.poor) { d.notice = chk.lines[0].text; renderPanel(); return; }
  d.notice = '';
  if (d.method === 'circle') { d.step = 'circle'; renderPanel(); return; }
  await divineCast();
}
async function divineCast() {
  const d = state.dv;
  const r = await run(() => api.divineCast({ question: d.question, method: d.method, a: d.a, b: d.b }), { thinking: false });
  if (!r || !r.ok) { d.step = 'ask'; renderPanel(); return; }
  if (r.poor || r.repeat) { d.step = 'ask'; d.notice = r.lines[0].text; renderPanel(); return; }
  Object.assign(d, { step: 'result', rec: r.record, mode: '', reading: '', fresh: true, showDetail: false });
  renderPanel();
  const id = r.record.id;
  const rr = await run(() => api.divineRead(id), { thinking: false }); // 艾琳解讀（AI 可能要想一下）
  if (!rr || !rr.ok || !state.dv || !state.dv.rec || state.dv.rec.id !== id) return;
  state.dv.reading = rr.lines[0].text;
  if (state.panel === 'divine' && state.dv.step === 'result') {
    const rt = document.querySelector('#dvReading .dv-rt'); if (rt) rt.innerHTML = rich(state.dv.reading);
    const again = $('#dvAgain'); if (again) again.disabled = false;
  }
}
async function divineClick(e) {
  const t = e.target, d = state.dv;
  if (!d) return false;
  if (t.closest('#dvStart')) { await divineStart(); return true; }
  if (t.closest('#dvCircle')) { stopRing(); return true; }
  if (t.closest('[data-dv-back]')) { d.step = 'ask'; renderPanel(); return true; }
  if (t.closest('#dvDetail')) {
    d.showDetail = !d.showDetail; renderPanel();
    if (d.showDetail) { const dt = document.querySelector('.dv-detail'); if (dt) dt.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    return true;
  }
  if (t.closest('#dvAgain')) { openDivine(); renderPanel(); return true; }
  const ri = t.closest('[data-dv-recent]');
  if (ri) {
    const rr = await run(() => api.divineRead(ri.dataset.dvRecent), { thinking: false });
    if (rr && rr.ok) { Object.assign(d, { step: 'result', rec: rr.record, mode: 'history', reading: rr.lines[0].text, fresh: true, showDetail: false }); renderPanel(); }
    return true;
  }
  return false;
}

// ---------- 🍅 專注模式 ----------
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
function renderFocus() {
  const f = state.view && state.view.focus;
  const on = !!(f && f.active);
  document.body.classList.toggle('focusing', on);
  const b = $('#hudFocus');
  b.classList.toggle('on', on);
  b.textContent = on ? `🍅${mmss(f.endAt - nowMs())}` : '🍅';
  b.title = on ? '專注中（點一下可以結束）' : `專注 ${(f && f.minutes) || 25} 分鐘：${state.view ? state.view.npc.name : ''}變回貓咪陪你，時間到叫你休息`;
  $('#focusBadge').classList.toggle('hidden', !on);
  $('#zzz').classList.toggle('hidden', !on);
  if (on) $('#focusBadge').textContent = `🍅 ${mmss(f.endAt - nowMs())}`;
  clearInterval(state.focusTick);
  if (on) state.focusTick = setInterval(() => {
    const ff = state.view && state.view.focus;
    if (!ff || !ff.active) { clearInterval(state.focusTick); return; }
    $('#hudFocus').textContent = `🍅${mmss(ff.endAt - nowMs())}`; $('#focusBadge').textContent = `🍅 ${mmss(ff.endAt - nowMs())}`;
  }, 1000);
}
async function startFocus() {
  if (state.view && state.view.focus && state.view.focus.active) { state.focusConfirm = true; renderTracker(); clearTimeout(state.focusConfirmT); state.focusConfirmT = setTimeout(() => { state.focusConfirm = false; renderTracker(); }, 6000); return; }
  closePanel(); hidePeek();
  const r = await run(() => api.startFocus(), { thinking: false });
  if (!r || !r.ok) return;
  setTimeout(() => { if (!state.mini && state.view.focus && state.view.focus.active) goMini(); }, 2800); // 說完話再變回貓咪
}
$('#hudFocus').addEventListener('click', (e) => { e.stopPropagation(); startFocus(); });
async function peekFocus() {
  const r = await run(() => api.focusPeek(), { thinking: false });
  return r;
}

// ---------- 聊天改進度：確認卡 ----------
function showProposal(p) {
  const el = $('#proposal');
  state.proposal = p;
  if (!p) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.innerHTML = `<div class="pp-title">📋 要照這樣更新嗎？</div>
    ${p.items.map((it, i) => `<label class="pp-item"><input type="checkbox" data-pp="${i}" checked><span>${rich(it.label)}</span></label>`).join('')}
    <div class="q-actions"><button class="btn small ghost" id="ppNo">先不要</button><button class="btn small gold" id="ppYes">✔ 確認更新</button></div>`;
  el.classList.remove('hidden');
}
$('#proposal').addEventListener('click', async (e) => {
  if (e.target.id === 'ppYes') {
    const p = state.proposal; if (!p) return;
    const keep = [...document.querySelectorAll('#proposal input[data-pp]')].filter((x) => x.checked).map((x) => Number(x.dataset.pp));
    showProposal(null);
    if (!keep.length) { await run(() => api.cancelProposal()); return; }
    await run(() => api.confirmProposal(p.id, keep));
  }
  if (e.target.id === 'ppNo') { showProposal(null); await run(() => api.cancelProposal(), { thinking: false }); }
});

// ---------- 選項 ----------
$('#choices').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'board') openPanel('board');
  if (act === 'submit' && state.view.active) openPanel('submit', state.view.active.id);
  if (act === 'daily') { openPanel('daily'); run(() => api.daily()); }
  if (act === 'report') openPanel('report');
  if (act === 'chat') { $('#chatRow').classList.toggle('hidden'); $('#chatInput').focus(); }
  if (act === 'divine') openPanel('divine');
});
// 聊天裡說「幫我占卜…」「算一卦」就直接打開占卜面板（問「梅花易數是什麼」這種還是聊天）
const DV_RE = /(占卜|算一卦|卜一卦|卜個卦|起一?卦|算個卦)/;
function questionFromChat(t) {
  const q = t.replace(/(請|幫我|幫忙|可以|能不能|用梅花易數|梅花易數|占卜|算一卦|卜一卦|卜個卦|起一?卦|算個卦|一下|看看|關於|艾琳)/g, '').replace(/^[，,：:、\s]+|[，,：:、\s]+$/g, '').trim();
  return q.length >= 2 ? q : '';
}
async function sendChat() {
  const inp = $('#chatInput');
  const text = inp.value.trim();
  if (!text || state.busy) return;
  if (DV_RE.test(text) && !/(是什麼|什麼是|怎麼算|原理|準不準)/.test(text)) { inp.value = ''; openPanel('divine', { question: questionFromChat(text) }); return; }
  inp.value = '';
  await run(() => api.chat(text));
  inp.focus();
}
$('#chatSend').addEventListener('click', sendChat);
$('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) sendChat(); });

// ---------- 面板 ----------
// 表單面板比較高：開著的時候先把對話框收起來，關掉表單再放回來
function openPanel(kind, arg) {
  if (kind === 'divine') openDivine(arg);
  state.panel = kind; state.panelArg = arg; state.confirmDel = null; state.addingObj = null;
  if (FORM_PANELS.has(kind)) $('#dialog').classList.add('hidden'); else openDialog();
  $('#dialog').classList.add('compact'); renderPanel();
}
function closePanel() {
  cancelAnimationFrame(state.dvRaf);
  const wasForm = FORM_PANELS.has(state.panel);
  state.panel = null; state.panelBack = null; state.confirmDel = null; state.addingObj = null;
  $('#panel').classList.add('hidden'); $('#dialog').classList.remove('compact');
  if (wasForm) openDialog();
}

function renderPanel() {
  const el = $('#panel');
  const v = state.view;
  el.classList.remove('hidden');
  // 同一個面板重畫時保住捲動位置（勾目標、刪東西時畫面不會跳回最上面）
  const prevBody = el.querySelector('.panel-body');
  const keepScroll = el.dataset.kind === state.panel && prevBody ? prevBody.scrollTop : 0;
  el.dataset.kind = state.panel;
  renderPanelInner(el, v);
  const body = el.querySelector('.panel-body');
  if (body && keepScroll) body.scrollTop = keepScroll;
}
// 面板標題列（所有面板共用）
const head = (title, sub, extra = '') => `<div class="panel-head"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}${extra}<button class="icon-btn" data-close>✕</button></div>`;
function renderPanelInner(el, v) {
  if (state.panel === 'board') {
    const addBtn = v.editable && state.boardTab === 'quests' ? '<button class="tab add" data-new="quest" title="登記一筆新委託">＋ 新任務</button>' : '';
    const tabs = `<div class="tabs"><button class="tab ${state.boardTab === 'quests' ? 'on' : ''}" data-tab="quests">任務</button><button class="tab ${state.boardTab === 'hist' ? 'on' : ''}" data-tab="hist">紀錄</button>${addBtn}</div>`;
    let body = '';
    if (state.boardTab === 'quests') {
      const order = { active: 0, ready: 1, available: 2, done: 3 };
      const qs = [...v.quests].sort((a, b) => ((a.active ? -1 : order[a.status]) - (b.active ? -1 : order[b.status])));
      for (const q of qs) {
        const open = state.expanded.has(q.id) || q.active;
        const canEdit = v.editable && q.status !== 'done';
        const confirming = state.confirmDel === `quest:${q.id}`;
        const editTools = !canEdit ? '' : confirming
          ? `<span class="confirm">🗑 刪掉「${esc(shortTitle(q.title))}」和它的目標？<button class="btn small danger" data-del-quest-yes="${q.id}">刪除</button><button class="btn small ghost" data-del-no>取消</button></span>`
          : `<span class="q-edit"><button class="btn small ghost" data-obj-add="${q.id}">＋ 目標</button><button class="icon-btn" data-edit-quest="${q.id}" title="編輯名稱／類型／截止日">✎</button><button class="icon-btn" data-del-quest="${q.id}" title="刪除任務">🗑</button></span>`;
        body += `<div class="quest ${q.tier} ${q.status === 'done' ? 'done' : ''} ${q.active ? 'is-active' : ''}">
          <div class="q-head" data-toggle="${q.id}">${tierBadge(q)}<span class="q-title">${q.active ? '▶ ' : ''}${rich(q.title)}</span>${dueChip(q)}</div>
          <div class="q-prog"><div style="width:${q.total ? (q.doneCount / q.total) * 100 : 0}%"></div></div>
          ${open ? `<div class="q-body">${q.reason ? `<p class="q-reason">💬 ${rich(q.reason)}</p>` : ''}
            ${q.objectives.map((o, i) => `<label class="obj ${o.done ? 'checked' : ''}"><input type="checkbox" data-obj="${q.id}" data-idx="${i}" ${o.done ? 'checked' : ''} ${q.status === 'done' ? 'disabled' : ''}><span>${rich(o.text)}</span>${canEdit ? `<button class="icon-btn del" data-del-obj="${q.id}" data-idx="${i}" title="刪除這個目標">✕</button>` : ''}</label>`).join('')}
            ${!q.objectives.length && canEdit ? '<p class="hint">還沒有目標，按「＋ 目標」加一個吧。</p>' : ''}
            ${state.addingObj === q.id ? `<div class="obj-add"><span class="plus">☐</span><input data-obj-input="${q.id}" placeholder="新目標…（Enter 送出）" maxlength="120"><button class="btn small gold" data-obj-save="${q.id}">加入</button><button class="icon-btn" data-obj-cancel title="取消">✕</button></div>` : ''}
            <div class="q-actions">${editTools}
              ${!confirming && q.status !== 'done' && !q.active ? `<button class="btn small" data-activate="${q.id}">📌 設為當前任務</button>` : ''}
              ${!confirming && q.status === 'ready' ? `<button class="btn small gold" data-submit="${q.id}">🏆 交付任務</button>` : ''}
              ${q.status === 'done' ? `<span class="chip ok">✨ +${q.submitted.xp} XP　🪙 +${q.submitted.gold}</span>` : ''}
            </div></div>` : ''}
        </div>`;
      }
      if (!qs.length) body = v.editable ? '<p class="hint">計畫檔裡還沒有任務。按上面的「＋ 新任務」登記第一筆委託吧！</p>' : '<p class="hint">計畫檔裡沒有任務。右鍵角色 →「選擇週計畫檔…」</p>';
      else if (!v.editable) body += '<p class="hint">🔒 這份計畫檔是舊版表格格式，程式裡不能直接新增／編輯。用 <code>node tools/convert_plan.js</code> 轉成新格式就可以了。</p>';
    } else {
      body = '<div class="hist">' + (v.history.length
        ? v.history.map((h) => `<div class="hist-item"><span class="ico">${histIcon(h.reason)}</span><span><span class="when">${hhmm(h.at)}</span>${rich(h.reason)}</span><span class="gain">${gainHtml(h)}</span></div>`).join('')
        : '<p class="hint">還沒有紀錄。完成第一個目標，就會出現在這裡！</p>') + '</div>';
    }
    const done = v.quests.filter((q) => q.status === 'done').length;
    el.innerHTML = head('📜 任務板', `${done}/${v.quests.length} 完成`, tabs) + `<div class="panel-body">${body}</div>`;
  }

  if (state.panel === 'daily') {
    const t = v.today;
    let body = `<p class="day-theme">🗓 <b>${esc(t.label)}</b>${t.theme ? `｜${rich(t.theme)}` : ''}</p>`;
    if (!t.rows.length) body += '<p class="hint">今天沒有排定的行程。</p>';
    if (t.branch) {
      body += `<div class="branch">🔀 路線：<button class="btn small ${t.chosenBranch === 'a' ? 'on' : ''}" data-branch="a">${esc(t.columns[1])}</button><button class="btn small ${t.chosenBranch === 'b' ? 'on' : ''}" data-branch="b">${esc(t.columns[2])}</button></div>`;
    }
    for (const r of t.rows) {
      const blk = t.branch ? (t.chosenBranch === 'b' ? r.b : t.chosenBranch === 'a' ? r.a : (r.a === r.b ? r.a : `${r.a}　／　${r.b}`)) : r.a;
      const out = t.branch ? '' : r.b;
      const del = !v.editable ? '' : state.confirmDel === `row:${r.id}`
        ? `<span class="confirm"><button class="btn small danger" data-del-row-yes="${r.id}">刪除</button><button class="btn small ghost" data-del-no>取消</button></span>`
        : `<button class="icon-btn del" data-del-row="${r.id}" title="刪除這一格">✕</button>`;
      body += `<label class="row ${r.current ? 'current' : ''} ${r.past ? 'past' : ''} ${r.done ? 'done' : ''}"><input type="checkbox" data-row="${r.id}" ${r.done ? 'checked' : ''}><span class="slot">${esc(r.slot)}</span><span><span class="blk">${rich(blk)}</span>${out ? `<span class="out">→ ${rich(out)}</span>` : ''}</span>${del}</label>`;
    }
    if (v.decisions.length) {
      body += '<div class="decisions"><h3>⏰ 提醒與決策點</h3>' + v.decisions.map((d) => {
        const del = !v.editable ? '' : state.confirmDel === `rem:${d.id}`
          ? `<span class="confirm"><button class="btn small danger" data-del-rem-yes="${d.id}">刪除</button><button class="btn small ghost" data-del-no>取消</button></span>`
          : `<button class="icon-btn del" data-del-rem="${d.id}" title="刪除這個提醒">✕</button>`;
        return `<div class="dec"><span>${d.shown ? '✔' : '⏳'} <b>${rich(d.label)}</b>${d.action ? ` → ${rich(d.action)}` : ''}</span>${del}</div>`;
      }).join('') + '</div>';
    }
    const tools = `<div class="tabs">${v.editable ? '<button class="tab add" data-new="row" title="加一格時段">＋ 時段</button><button class="tab add" data-new="rem" title="設一個提醒">⏰ 提醒</button><button class="tab add" data-new="ics-in" title="把 Google／Outlook 匯出的 .ics 檔加進本週行程">📥 匯入</button>' : ''}<button class="tab add" data-new="ics-out" title="把本週的時段、提醒、截止日匯出成 .ics，給 Google／Outlook 匯入">📤 匯出</button></div>`;
    el.innerHTML = head('📅 今日行程', '每格 +10 XP', tools) + `<div class="panel-body">${body}</div>`;
  }

  if (state.panel === 'questForm') {
    const q = state.panelArg ? v.quests.find((x) => x.id === state.panelArg) : null;
    if (state.panelArg && !q) { closePanel(); return; }
    const tier = q ? q.tier : 'major';
    const due = q && q.deadline && q.deadlineLabel !== '本週內' ? q.deadline : '';
    const pick = (val, icon, name, tok) => `<label class="tp ${val} ${tier === val ? 'on' : ''}" title="檔案裡會寫成 ${tok}"><input type="radio" name="qfTier" value="${val}" ${tier === val ? 'checked' : ''}>${icon} ${name}<small>${tok}</small></label>`;
    el.innerHTML = head(q ? '✎ 編輯任務' : '📜 新任務', q ? rich(q.title) : '登記一筆新委託') + `<div class="panel-body form">
      <div class="field">📝 任務名稱<input id="qfTitle" value="${esc(q ? q.title : '')}" placeholder="例如：完成週報" maxlength="80" autofocus></div>
      <div class="field-row">
        <div class="field">🏷 類型<div class="tier-pick">${pick('main', '👑', '主線', '⭐')}${pick('major', '⚔️', '重要支線', '🔧')}${pick('side', '🌿', '支線', '🌿')}</div></div>
        <div class="field">📅 截止日<input type="date" id="qfDue" value="${due}"><small class="fnote">留空＝本週內</small></div>
      </div>
      <div class="field">💬 一句話說明<input id="qfNote" value="${esc(q ? q.reason : '')}" placeholder="為什麼要做、要注意什麼（選填）" maxlength="120"></div>
      ${q ? '' : '<div class="field">☑ 目標（一行一個）<textarea id="qfObjs" rows="3" placeholder="整理會議紀錄&#10;寄給相關的人（選填，之後也能在任務卡加）"></textarea></div>'}
    </div>
    <div class="panel-foot"><span class="spacer">${q ? '目標要改的話，回任務卡用「＋ 目標」或 ✕' : '會直接寫進計畫檔，之後也能在檔案裡改'}</span><button class="btn ghost" data-back>取消</button><button class="btn gold" id="qfSave">${q ? '💾 儲存' : '📜 登記委託'}</button></div>`;
    setTimeout(() => { const i = $('#qfTitle'); if (i) { i.focus(); i.select(); } }, 30);
  }

  if (state.panel === 'rowForm') {
    el.innerHTML = head('⏱ 新增時段', '寫進那一天的行程') + `<div class="panel-body form">
      <div class="field-row three">
        <div class="field">📅 日期<input type="date" id="rfDate" value="${todayISO()}"></div>
        <div class="field">🕘 開始<input type="time" id="rfStart" value="${nowHHMM().slice(0, 3)}00"></div>
        <div class="field">🕔 結束<input type="time" id="rfEnd"><small class="fnote">選填</small></div>
      </div>
      <div class="field">📌 要做什麼<input id="rfText" placeholder="例如：整理會議紀錄" maxlength="120"></div>
      <div class="field">🎯 產出<input id="rfOut" placeholder="做完會有什麼（選填），例如：紀錄送出" maxlength="120"></div>
    </div>
    <div class="panel-foot"><span class="spacer">完成時勾起來 +10 XP</span><button class="btn ghost" data-back>取消</button><button class="btn gold" id="rfSave">⏱ 加入行程</button></div>`;
    setTimeout(() => { const i = $('#rfText'); if (i) i.focus(); }, 30);
  }

  if (state.panel === 'remForm') {
    el.innerHTML = head('⏰ 設提醒', `${esc(v.npc.name)}到時候會來叫你`) + `<div class="panel-body form">
      <div class="field-row">
        <div class="field">📅 日期<input type="date" id="mfDate" value="${todayISO()}"></div>
        <div class="field">🕒 時間<input type="time" id="mfTime" value="${nowHHMM().slice(0, 3)}00"></div>
      </div>
      <div class="field">🔔 提醒什麼<input id="mfText" placeholder="例如：報價還沒回覆" maxlength="120"></div>
      <div class="field">🧭 到時要怎麼做<input id="mfAction" placeholder="決策點用：例如「打電話追一次」（選填）" maxlength="120"></div>
    </div>
    <div class="panel-foot"><span class="spacer">會寫成「⏰ 時間 條件 → 應對」放進那一天</span><button class="btn ghost" data-back>取消</button><button class="btn gold" id="mfSave">⏰ 設定提醒</button></div>`;
    setTimeout(() => { const i = $('#mfText'); if (i) i.focus(); }, 30);
  }

  if (state.panel === 'divine') renderDivine(el, v);

  if (state.panel === 'report') {
    const t = v.today;
    const doneRows = t.rows.filter((r) => r.done).map((r) => (t.branch && t.chosenBranch === 'b' ? r.b : r.a));
    const pt = v.progressToday || {};
    const pre = pt.done || doneRows.join('；');
    el.innerHTML = head('📝 下班回報', esc(t.label)) + `<div class="panel-body">
      <div class="field">✅ 實際完成<textarea id="rDone" rows="3">${esc(pre)}</textarea></div>
      <div class="field-row">
        <div class="field">🧱 卡點<textarea id="rBlock" rows="2">${esc(pt.blocker || '')}</textarea></div>
        <div class="field">🌅 明日調整<textarea id="rNext" rows="2">${esc(pt.next || '')}</textarea></div>
      </div></div>
      <div class="panel-foot"><span class="spacer">${v.writeBack ? '會寫進計畫檔最後的「進度紀錄」' : '只存在遊戲裡（回寫已關閉）'}・首次回報 +30 XP</span><button class="btn gold" id="rSend">📨 交出日報</button></div>`;
  }

  if (state.panel === 'submit') {
    const q = v.quests.find((x) => x.id === state.panelArg);
    if (!q) { closePanel(); return; }
    const base = { main: [100, 50], major: [80, 40], side: [40, 20] }[q.tier];
    const onTime = q.daysLeft === null || q.daysLeft >= 0;
    const xp = Math.round(base[0] * (onTime ? 1.2 : 1)), gold = Math.round(base[1] * (onTime ? 1.2 : 1));
    el.innerHTML = head('🏆 交付任務', rich(q.title)) + `<div class="panel-body">
      ${q.objectives.map((o) => `<div class="obj checked"><input type="checkbox" checked disabled><span>${rich(o.text)}</span></div>`).join('')}
      <div class="reward-card"><span class="rc-title">🎁 任務報酬</span><span class="rc-num">✨ ${xp}<small>XP</small></span><span class="rc-num">🪙 ${gold}</span><span class="rc-bonus ${onTime ? '' : 'late'}">${onTime ? '⏱ 準時加成 +20%' : '⚠ 已逾期，沒有加成'}</span></div>
      <div class="field">💬 給${esc(v.npc.name)}的回報（選填）<textarea id="sReport" placeholder="做了什麼、有什麼發現…"></textarea></div></div>
      <div class="panel-foot"><button class="btn ghost" data-close>再等等</button><button class="btn gold" id="sSend">🏆 交付！</button></div>`;
  }
}

// 表單面板：記住從哪個面板來，存檔或取消後回去
function openForm(kind, arg) { state.panelBack = state.panel && !FORM_PANELS.has(state.panel) ? state.panel : 'board'; openPanel(kind, arg); }
function backFromForm() { const back = state.panelBack || 'board'; state.panelBack = null; openPanel(back); }
const dataAttr = (t, name) => { const el = t.closest(`[data-${name}]`); return el ? el.dataset[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : undefined; };

async function saveQuestForm() {
  const title = $('#qfTitle').value.trim();
  if (!title) { toast('⚠ 任務要有名稱'); $('#qfTitle').focus(); return; }
  const tierEl = document.querySelector('input[name="qfTier"]:checked');
  const fields = { title, tier: tierEl ? tierEl.value : 'major', deadlineLabel: isoToLabel($('#qfDue').value), note: $('#qfNote').value.trim() };
  const editing = state.panelArg;
  let r;
  if (editing) r = await run(() => api.editQuest(editing, fields), { thinking: false });
  else {
    fields.objectives = $('#qfObjs').value.split('\n').map((s) => s.trim()).filter(Boolean);
    r = await run(() => api.addQuest(fields), { thinking: false });
  }
  if (!r || !r.ok) return;
  if (r.questId) state.expanded.add(r.questId);
  state.panelBack = null; openPanel('board');
  const card = r.questId && document.querySelector(`[data-toggle="${r.questId}"]`);
  if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast(editing ? '✎ 已更新任務' : '📜 新委託已寫進計畫檔');
}
async function saveRowForm() {
  const date = $('#rfDate').value, start = $('#rfStart').value, end = $('#rfEnd').value, text = $('#rfText').value.trim(), output = $('#rfOut').value.trim();
  if (!date || !start) { toast('⚠ 請填日期和開始時間'); return; }
  if (!text) { toast('⚠ 請填要做什麼'); $('#rfText').focus(); return; }
  if (end && end <= start) { toast('⚠ 結束時間要在開始之後'); $('#rfEnd').focus(); return; }
  const r = await run(() => api.addRow(date, { start, end, text, output }), { thinking: false });
  if (!r || !r.ok) return;
  state.panelBack = null; openPanel('daily');
  toast(date === todayISO() ? '⏱ 已加進今天的行程' : `⏱ 已加進 ${isoToLabel(date)} 的行程`);
}
async function saveRemForm() {
  const date = $('#mfDate').value, time = $('#mfTime').value, text = $('#mfText').value.trim(), action = $('#mfAction').value.trim();
  if (!date || !time) { toast('⚠ 請填日期和時間'); return; }
  if (!text) { toast('⚠ 請填要提醒什麼'); $('#mfText').focus(); return; }
  const r = await run(() => api.addReminder({ at: `${date}T${time}:00`, text, action }), { thinking: false });
  if (!r || !r.ok) return;
  state.panelBack = null; openPanel('daily');
}

$('#panel').addEventListener('click', async (e) => {
  const t = e.target;
  if (state.panel === 'divine' && await divineClick(e)) return;
  if (t.closest('[data-close]')) { closePanel(); return; }
  if (t.closest('[data-back]')) { backFromForm(); return; }
  const tab = t.closest('[data-tab]'); if (tab) { state.boardTab = tab.dataset.tab; renderPanel(); return; }
  const tog = t.closest('[data-toggle]');
  if (tog) { const id = tog.dataset.toggle; state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id); renderPanel(); return; }
  const act = t.closest('[data-activate]'); if (act) { await run(() => api.setActive(act.dataset.activate)); return; }
  const sub = t.closest('[data-submit]'); if (sub) { openPanel('submit', sub.dataset.submit); return; }
  const br = t.closest('[data-branch]'); if (br) { await run(() => api.chooseBranch(state.view.today.date, br.dataset.branch)); return; }

  // ---- 新增／編輯／刪除 ----
  const nw = dataAttr(t, 'new');
  if (nw === 'quest') { openForm('questForm', null); return; }
  if (nw === 'row') { openForm('rowForm'); return; }
  if (nw === 'rem') { openForm('remForm'); return; }
  if (nw === 'ics-in') { const r = await run(() => api.importIcs(), { thinking: false }); if (r && r.ok && !r.canceled) toast(r.reason, 4500); return; }
  if (nw === 'ics-out') { const r = await run(() => api.exportIcs(), { thinking: false }); if (r && r.ok && !r.canceled) toast(r.reason, 5500); return; }
  const ed = dataAttr(t, 'edit-quest'); if (ed) { openForm('questForm', ed); return; }
  if (t.id === 'qfSave') { await saveQuestForm(); return; }
  if (t.id === 'rfSave') { await saveRowForm(); return; }
  if (t.id === 'mfSave') { await saveRemForm(); return; }
  // 刪除都先問一次（在原地變成「刪除／取消」）
  if (t.closest('[data-del-no]')) { state.confirmDel = null; renderPanel(); return; }
  const dq = dataAttr(t, 'del-quest'); if (dq) { state.confirmDel = `quest:${dq}`; renderPanel(); return; }
  const dr = dataAttr(t, 'del-row'); if (dr) { e.preventDefault(); state.confirmDel = `row:${dr}`; renderPanel(); return; }
  const dm = dataAttr(t, 'del-rem'); if (dm) { state.confirmDel = `rem:${dm}`; renderPanel(); return; }
  const dqy = dataAttr(t, 'del-quest-yes');
  if (dqy) { state.confirmDel = null; const r = await run(() => api.deleteQuest(dqy), { thinking: false }); if (r && r.ok) toast('🗑 任務已從計畫檔移除'); return; }
  const dry = dataAttr(t, 'del-row-yes');
  if (dry) { e.preventDefault(); state.confirmDel = null; const r = await run(() => api.deleteRow(dry), { thinking: false }); if (r && r.ok) toast('🗑 已刪掉那一格'); return; }
  const dmy = dataAttr(t, 'del-rem-yes');
  if (dmy) { state.confirmDel = null; const r = await run(() => api.deleteReminder(dmy), { thinking: false }); if (r && r.ok) toast('🗑 提醒已取消'); return; }
  const dob = t.closest('[data-del-obj]');
  if (dob) {
    e.preventDefault();
    const r = await run(() => api.deleteObjective(dob.dataset.delObj, Number(dob.dataset.idx)), { thinking: false });
    if (r && r.ok) toast('🗑 目標已刪除');
    return;
  }
  const oa = dataAttr(t, 'obj-add');
  if (oa) { state.addingObj = oa; state.expanded.add(oa); renderPanel(); const i = document.querySelector(`[data-obj-input="${oa}"]`); if (i) i.focus(); return; }
  if (t.closest('[data-obj-cancel]')) { state.addingObj = null; renderPanel(); return; }
  const os = dataAttr(t, 'obj-save'); if (os) { await saveObjective(os); return; }
  if (t.id === 'rSend') {
    const fields = { done: $('#rDone').value.trim(), blocker: $('#rBlock').value.trim(), next: $('#rNext').value.trim() };
    const r = await run(() => api.dailyReport(fields));
    if (r && r.ok) closePanel();
    return;
  }
  if (t.id === 'sSend') {
    const qid = state.panelArg;
    const r = await run(() => api.submit(qid, $('#sReport').value.trim()));
    if (r && r.ok) { state.panel = 'board'; renderPanel(); }
  }
});
async function saveObjective(qid) {
  const inp = document.querySelector(`[data-obj-input="${qid}"]`);
  const text = inp ? inp.value.trim() : '';
  if (!text) { toast('⚠ 目標要有內容'); if (inp) inp.focus(); return; }
  const r = await run(() => api.addObjective(qid, text), { thinking: false });
  if (!r || !r.ok) return;
  state.addingObj = qid; renderPanel(); // 留在輸入狀態，方便連續加好幾個
  const again = document.querySelector(`[data-obj-input="${qid}"]`); if (again) again.focus();
}
$('#panel').addEventListener('input', (e) => {
  const d = state.dv, t = e.target;
  if (!d) return;
  if (t.id === 'dvQ') d.question = t.value;
  if (t.id === 'dvA') d.a = t.value;
  if (t.id === 'dvB') d.b = t.value;
});
$('#panel').addEventListener('keydown', async (e) => {
  const t = e.target;
  if (e.isComposing) return;
  if (e.key === 'Enter' && state.panel === 'divine' && state.dv && state.dv.step === 'ask' && t.tagName === 'INPUT') { e.preventDefault(); divineStart(); return; }
  if (e.key === 'Escape') { if (state.addingObj) { state.addingObj = null; renderPanel(); } else if (FORM_PANELS.has(state.panel)) backFromForm(); return; }
  if (e.key !== 'Enter') return;
  if (t.dataset.objInput) { e.preventDefault(); await saveObjective(t.dataset.objInput); return; }
  if (t.tagName === 'INPUT' && state.panel === 'questForm') { e.preventDefault(); await saveQuestForm(); }
  else if (t.tagName === 'INPUT' && state.panel === 'rowForm') { e.preventDefault(); await saveRowForm(); }
  else if (t.tagName === 'INPUT' && state.panel === 'remForm') { e.preventDefault(); await saveRemForm(); }
});
$('#panel').addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'dvm' && state.dv) { state.dv.method = t.value; renderPanel(); return; }
  if (t.name === 'qfTier') { document.querySelectorAll('.tp').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked)); return; }
  if (t.dataset.obj) {
    const r = await run(() => api.setObjective(t.dataset.obj, Number(t.dataset.idx), t.checked), { thinking: false });
    if (r && r.ok && t.checked) openDialog();
  }
  if (t.dataset.row) await run(() => api.toggleDaily(t.dataset.row, t.checked), { thinking: false });
});

// ---------- 主程序推送 ----------
api.on('view:update', ({ view, reason }) => { applyView(view); if (reason) toast(reason); });
api.on('npc:lines', (lines) => {
  if (!lines || !lines.length) return;
  if (state.mini) { miniNotify(lines); return; }
  if ($('#dialog').classList.contains('hidden') && lines.every((l) => l.ambient)) {
    setMarker('alert');
    state.pendingAmbient = lines; // 點角色時會重新打招呼
    return;
  }
  openDialog(); enqueue(lines);
});
api.on('ui:mini', (on) => applyMini(on));
api.on('ui:focus', () => startFocus());
api.on('ui:fortune', () => drawFortune());
api.on('fx:reward', (reward) => { if (!state.mini) celebrate(reward); });
setInterval(() => { if (state.view && !state.mini) renderTracker(); }, 15000); // 沙漏、下一格、切換時段
api.on('ui:shrink', () => goMini());
api.on('ui:open', (kind) => { openPanel(kind); if (kind === 'daily') run(() => api.daily()); });

// ---------- 啟動 ----------
(async function init() {
  const r = await api.getView();
  state.character = r.character;
  if (!r.character.images.normal) $('#npcImg').alt = '（找不到角色圖片）';
  applyMini(r.mini, { greet: false });
  applyView(r.view);
  if (!state.mini) setTimeout(() => { openDialog(); greet(); }, 600);
  else setTimeout(async () => { state.lastGreetAt = Date.now(); const g = await api.greet(); if (g && g.ok && g.lines) miniNotify(g.lines); }, 600); // 縮小時啟動：貓咪揮手，點開才說
})();
