// Electron 主程式：透明置頂的桌面 NPC 視窗
'use strict';

const { app, BrowserWindow, ipcMain, Menu, screen, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Engine } = require('./engine');
const { EMOTIONS } = require('./npc');

const APP_DIR = path.join(__dirname, '..', '..');
const CHAR_DIR = path.join(APP_DIR, 'assets', 'character');
const WIN_W = 610, WIN_H = 800; // 加寬：狀態面板和角色並排、不重疊

let win, engine, tickTimer, idleTimer, watchTimer, focusTimer;
let moving = false; // 程式自己調整視窗大小時，不記錄位置

if (!app.requestSingleInstanceLock()) app.quit();

const MINI_SIZE = 140;

function findImage(base) {
  for (const ext of ['png', 'webp', 'gif', 'apng', 'svg']) {
    const f = path.join(CHAR_DIR, `${base}.${ext}`);
    if (fs.existsSync(f)) return 'file:///' + f.replace(/\\/g, '/');
  }
  return null;
}

function uiImage(base) {
  for (const ext of ['png', 'webp', 'svg']) {
    const f = path.join(APP_DIR, 'assets', 'ui', `${base}.${ext}`);
    if (fs.existsSync(f)) return 'file:///' + f.replace(/\\/g, '/');
  }
  return null;
}

function characterImages() {
  const found = {};
  for (const emo of EMOTIONS) found[emo] = findImage(emo);
  const fallback = found.normal || Object.values(found).find(Boolean) || null;
  for (const emo of EMOTIONS) if (!found[emo]) found[emo] = fallback;
  const mini = findImage('mini');
  return {
    images: found,
    mini: mini || fallback,           // 縮小時的貓咪型態
    miniAlert: findImage('mini_alert') || mini || fallback, // 有新訊息時
    avatar: findImage('avatar'),
    // 頭上提示圖示：assets/character/ 放同名圖可覆蓋，否則用 assets/ui/ 內建的
    markers: {
      ready: findImage('marker_ready') || uiImage('marker_ready'),
      alert: findImage('marker_alert') || uiImage('marker_alert'),
    },
  };
}

// ---------- 多顯示器（邏輯在 displays.js，方便測試） ----------
const DM = require('./displays');
const dm = () => DM.create({ screen, state: engine.state, sizes: { WIN_W, WIN_H, MINI_SIZE }, isMini, win: () => win });
const dispSig = DM.dispSig;
const displaysSorted = () => dm().displaysSorted();
const displayLabel = (d, i) => dm().displayLabel(d, i);
const pinnedDisplay = () => dm().pinnedDisplay();
const centerIn = DM.centerIn;
const targetDisplay = () => dm().targetDisplay();
const boundsOn = (d, kind) => dm().boundsOn(d, kind);

function fullBounds(d = targetDisplay()) { return boundsOn(d, 'full'); }
function miniBounds(d = targetDisplay()) { return boundsOn(d, 'mini'); }

function isMini() { return !!(engine.state.ui && engine.state.ui.mini); }

function applyBounds(b) {
  if (!win) return;
  moving = true;
  win.setResizable(true);
  win.setBounds(b);
  win.setResizable(false);
  setTimeout(() => { moving = false; }, 300);
}

function rememberPosition() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const d = screen.getDisplayMatching(b);
  const sig = dispSig(d);
  engine.state.positions = engine.state.positions || {};
  const per = engine.state.positions[sig] = engine.state.positions[sig] || {};
  if (isMini()) per.mini = { x: b.x, y: b.y }; else per.full = { x: b.x, y: b.y, w: WIN_W };
  engine.state.lastDisplay = sig;
  engine.saveState();
}

// 以目前視窗的右下角為基準算另一個型態的位置：貓和貓娘都貼在視窗右下角，這樣變身時她會留在原地
function inPlaceBounds(cur, d, kind) {
  const w = kind === 'mini' ? MINI_SIZE : WIN_W;
  const h = kind === 'mini' ? MINI_SIZE : WIN_H;
  const wa = d.workArea;
  let x = cur.x + cur.width - w, y = cur.y + cur.height - h;
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - w);
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - h);
  return { x, y, width: w, height: h };
}

function setMini(on) {
  const d = targetDisplay(); // 先記下「現在在哪台」，再切換大小
  const cur = win && !win.isDestroyed() ? win.getBounds() : null;
  engine.state.ui = { ...(engine.state.ui || {}), mini: !!on };
  engine.state.lastDisplay = dispSig(d);
  engine.saveState();
  if (!win) return;
  const inPlace = engine.config.window.transformInPlace !== false && cur;
  applyBounds(inPlace ? inPlaceBounds(cur, d, on ? 'mini' : 'full') : (on ? miniBounds(d) : fullBounds(d)));
  setTimeout(rememberPosition, 350); // 記住這個型態的新位置
  push('ui:mini', !!on);
}

// 固定到某台顯示器；pin = 'auto' 或 display 物件
function pinTo(d) {
  engine.state.ui = { ...(engine.state.ui || {}), display: d === 'auto' ? 'auto' : { id: d.id, sig: dispSig(d) } };
  engine.saveState();
  if (d === 'auto') { push('view:update', { view: engine.view(), reason: '會跟著你拖到的顯示器' }); return; }
  applyBounds(isMini() ? miniBounds(d) : fullBounds(d));
  engine.state.lastDisplay = dispSig(d);
  engine.saveState();
  const i = displaysSorted().findIndex((x) => x.id === d.id);
  push('view:update', { view: engine.view(), reason: `已固定在顯示器 ${i + 1}` });
}

// 拖曳結束：固定模式下如果被拖到別台，彈回固定的那台
function onDragEnd() {
  const pinned = pinnedDisplay();
  if (pinned && win && !centerIn(win.getBounds(), pinned)) {
    applyBounds(isMini() ? miniBounds(pinned) : fullBounds(pinned));
    const i = displaysSorted().findIndex((x) => x.id === pinned.id);
    push('view:update', { view: engine.view(), reason: `已固定在顯示器 ${i + 1}，要換顯示器請從右鍵選單更改` });
    return;
  }
  rememberPosition();
}

// 顯示器插拔或解析度變更：視窗跑出畫面就拉回來
function ensureVisible() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const d = pinnedDisplay() || screen.getDisplayMatching(b);
  if (!centerIn(b, d) || !screen.getAllDisplays().some((x) => centerIn(b, x))) applyBounds(isMini() ? miniBounds(d) : fullBounds(d));
}

function displayMenu() {
  const pin = engine.state.ui && engine.state.ui.display;
  const pinned = pinnedDisplay();
  const items = [{
    label: '跟著目前位置（自動）', type: 'radio', checked: !pinned,
    click: () => pinTo('auto'),
  }];
  displaysSorted().forEach((d, i) => items.push({
    label: displayLabel(d, i), type: 'radio', checked: !!(pinned && pinned.id === d.id),
    click: () => pinTo(d),
  }));
  if (pin && pin !== 'auto' && !pinned) items.push({ label: '（固定的顯示器目前沒接上，暫時用主顯示器）', enabled: false });
  return items;
}

function createWindow() {
  const b = isMini() ? miniBounds() : fullBounds();
  win = new BrowserWindow({
    ...b,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: engine.config.window.alwaysOnTop !== false,
    skipTaskbar: false, backgroundColor: '#00000000',
    title: `${engine.config.npc.name}的任務櫃台`,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }, // 被其他視窗蓋住時動畫也不降速
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(APP_DIR, 'src', 'renderer', 'index.html'));
  win.on('moved', () => { if (!moving) rememberPosition(); });
  screen.on('display-added', ensureVisible);
  screen.on('display-removed', ensureVisible);
  screen.on('display-metrics-changed', ensureVisible);
}

function push(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function wrap(fn) {
  return async (_e, ...args) => {
    try { return { ok: true, ...(await fn(...args)) }; } catch (e) {
      console.error(e);
      return { ok: false, error: e.message, view: engine.view() };
    }
  };
}

function reloadPlan(reason) {
  engine.loadPlan();
  push('view:update', { view: engine.view(), reason });
}

function watchPlan() {
  clearInterval(watchTimer);
  let lastMtime = 0;
  try { lastMtime = fs.statSync(engine.planFile()).mtimeMs; } catch (_) { /* 沒檔案 */ }
  watchTimer = setInterval(() => {
    try {
      const m = fs.statSync(engine.planFile()).mtimeMs;
      if (m !== lastMtime) {
        lastMtime = m;
        if (!engine.selfWriteAt || Date.now() - engine.selfWriteAt > 3000) reloadPlan('計畫檔已更新，重新載入');
      }
    } catch (_) { /* 忽略 */ }
  }, 3000);
}

async function choosePlan() {
  const r = await dialog.showOpenDialog(win, {
    title: '選擇週計畫 Markdown', properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    defaultPath: path.dirname(engine.planFile()),
  });
  if (r.canceled || !r.filePaths[0]) return;
  const chosen = r.filePaths[0];
  const rel = path.relative(APP_DIR, chosen);
  engine.saveConfigPatch({ plan: { path: rel.startsWith('..') ? chosen : rel.replace(/\\/g, '/') } });
  reloadPlan('已切換計畫檔');
  watchPlan();
  const g = await engine.greet();
  push('npc:lines', g.lines);
}

// 行事曆匯入／匯出（Google／Outlook 的 .ics）
async function importIcs() {
  const r = await dialog.showOpenDialog(win, {
    title: '選擇行事曆檔（Google／Outlook 匯出的 .ics）', properties: ['openFile'],
    filters: [{ name: 'iCalendar', extensions: ['ics', 'ical', 'ifb', 'icalendar'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { canceled: true, view: engine.view() };
  const text = fs.readFileSync(r.filePaths[0], 'utf8');
  const res = await engine.importICS(text);
  return { ...res, reason: `📥 ${res.label}${res.skipped ? `（${res.skipped} 個已存在）` : ''}` };
}
async function exportIcs() {
  const out = engine.exportICS();
  const safe = out.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '週計畫';
  const r = await dialog.showSaveDialog(win, {
    title: '匯出成行事曆檔', defaultPath: path.join(app.getPath('documents'), `${safe}.ics`),
    filters: [{ name: 'iCalendar', extensions: ['ics'] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true, view: engine.view() };
  fs.writeFileSync(r.filePath, out.text, 'utf8');
  shell.showItemInFolder(r.filePath);
  return { count: out.count, path: r.filePath, view: engine.view(), reason: `📤 已匯出 ${out.count} 個事件 → ${path.basename(r.filePath)}，到 Google／Outlook 選「匯入」就能用` };
}
// 右鍵選單走這裡：結果推給畫面（IPC 走 wrap()，由畫面自己處理）
const menuSafe = (fn) => async () => {
  try {
    const res = await fn();
    if (!res || res.canceled) return;
    push('view:update', { view: res.view, reason: res.reason });
    if (res.lines && res.lines.length) push('npc:lines', res.lines);
  } catch (e) { console.error(e); push('view:update', { view: engine.view(), reason: `⚠ ${e.message}` }); }
};

function showMenu() {
  const npcName = engine.config.npc.name;
  const mini = isMini();
  const menu = Menu.buildFromTemplate([
    { label: mini ? '🔼 展開' : '🐾 縮小化（變回貓咪）', click: () => (mini ? setMini(false) : push('ui:shrink')) }, // 縮小走前端，先播變身動畫
    { label: '🖥 固定在顯示器', submenu: displayMenu() },
    { type: 'separator' },
    { label: '📜 任務板', click: () => { if (mini) setMini(false); push('ui:open', 'board'); } },
    { label: '📅 今日行程', click: () => { if (mini) setMini(false); push('ui:open', 'daily'); } },
    { label: '📝 下班回報', click: () => { if (mini) setMini(false); push('ui:open', 'report'); } },
    engine.state.focus
      ? { label: `🍅 結束專注（還剩 ${engine.focusInfo().leftMin} 分鐘）`, click: stopFocus }
      : { label: `🍅 專注 ${engine.focusCfg().minutes} 分鐘`, click: () => { if (mini) setMini(false); push('ui:focus'); } },
    { label: engine.fortuneToday() ? `🔮 今日運勢：${engine.fortuneToday().rank}` : '🔮 抽今日運勢', click: () => { if (mini) setMini(false); push('ui:fortune'); } },
    { label: `✨ 占卜魔法（${engine.divCfg().cost} 金幣）…`, click: () => { if (mini) setMini(false); push('ui:open', 'divine'); } },
    { type: 'separator' },
    { label: '選擇週計畫檔…', click: choosePlan },
    { label: '📥 匯入行事曆（.ics）到本週…', click: menuSafe(importIcs) },
    { label: '📤 匯出本週成行事曆（.ics）…', click: menuSafe(exportIcs) },
    { label: '重新載入計畫檔', click: () => reloadPlan('已重新載入') },
    { label: '開啟計畫檔', click: () => shell.openPath(engine.planFile()) },
    { label: '開啟設定檔 config.json', click: () => shell.openPath(path.join(APP_DIR, 'config.json')) },
    { label: '開啟角色設定檔（艾琳的故事）', click: () => shell.openPath(engine.lore.file) },
    { label: '重新讀取設定', click: async () => { engine.loadConfig(); await engine.npc.checkStatus(); push('view:update', { view: engine.view(), reason: '設定已重新讀取' }); } },
    { type: 'separator' },
    { label: `🤖 AI 對話（${engine.config.llm.model}）`, type: 'checkbox', checked: !!engine.config.llm.enabled, click: (m) => setAI(m.checked) },
    { label: `　${aiStatusLabel()}`, enabled: false },
    { label: '　立刻重新連線', enabled: !!engine.config.llm.enabled, click: async () => { engine.npc.backoffUntil = 0; const st = await engine.npc.checkStatus(); push('view:update', { view: engine.view(), reason: st.online ? `🟢 AI 已連線（${engine.config.llm.model}）` : `⚪ ${st.message}` }); } },
    { label: `🧠 聰明${npcName}（向量搜尋）`, type: 'checkbox', checked: engine.lore.smartOn(), click: (m) => menuSafe(() => setSmart(m.checked))() },
    { label: `　${engine.lore.statusText()}`, enabled: false },
    { label: '開啟角色圖片資料夾', click: () => shell.openPath(CHAR_DIR) },
    { type: 'separator' },
    { label: '置頂顯示', type: 'checkbox', checked: win.isAlwaysOnTop(), click: (m) => { win.setAlwaysOnTop(m.checked); engine.saveConfigPatch({ window: { alwaysOnTop: m.checked } }); } },
    { label: '縮到工作列', click: () => win.minimize() },
    { label: `離開（${npcName}會想你的）`, click: () => app.quit() },
  ]);
  menu.popup({ window: win });
}

function aiStatusLabel() {
  const st = engine.npc.status || {};
  if (!engine.config.llm.enabled) return '狀態：已關閉，使用內建台詞';
  return st.online ? `狀態：🟢 已連線` : `狀態：⚪ ${st.message || '尚未檢查'}`;
}

// 手動開關 AI：寫回 config.json，立刻檢查連線
// 🧠 聰明艾琳：角色設定的向量搜尋開關
async function setSmart(on) {
  const name = engine.config.npc.name;
  if (on) push('view:update', { view: engine.view(), reason: `🧠 聰明${name}準備中…` });
  const r = await engine.setSmart(on);
  const plain = r.text.replace(/^狀態：\s*/, '').replace(/^[🟢⚪⏳⚠]\uFE0F?\s*/u, '');
  const reason = !on ? `🧠 聰明${name}：關（只用關鍵字）`
    : r.status === 'ready' ? `🧠 聰明${name}：開（${plain}）`
    : `🧠 聰明${name}已開啟，但${plain}${r.status === 'no-ollama' ? '；Ollama 開了之後會自動接上' : ''}`;
  return { ...r, reason };
}

async function setAI(on) {
  engine.saveConfigPatch({ llm: { enabled: !!on } });
  const st = await engine.npc.setEnabled(on);
  push('view:update', { view: engine.view(), reason: on ? (st.online ? `🟢 AI 對話已開啟（${engine.config.llm.model}）` : `AI 已開啟，但${st.message}`) : '⚪ AI 對話已關閉，改用內建台詞' });
}

// 自動重連：離線時每 20 秒探一次，連線中每 2 分鐘確認一次；狀態翻轉時提示
let healthTimer = null;
function scheduleHealth() {
  clearInterval(healthTimer);
  let n = 0;
  healthTimer = setInterval(async () => {
    n++;
    // 聰明艾琳開著但還沒就緒（Ollama 沒開、剛裝好向量模型）：每分鐘（沒模型時每 3 分鐘）再試一次
    const lst = engine.lore.embedStatus;
    if (engine.lore.smartOn() && ((['no-ollama', 'error'].includes(lst) && n % 3 === 0) || (lst === 'no-model' && n % 9 === 0))) {
      engine.lore.prepareEmbeddings().then((r) => { if (r === 'ready') push('view:update', { view: engine.view(), reason: `🧠 聰明${engine.config.npc.name}準備好了，換個說法問也聽得懂` }); });
    }
    if (!engine.config.llm.enabled) return;
    const online = !!engine.npc.status.online;
    if (online && n % 6 !== 0) return; // 連線中：每 2 分鐘確認一次就好
    const st = await engine.npc.checkStatus();
    if (st.changed) push('view:update', { view: engine.view(), reason: st.online ? `🟢 AI 已重新連線（${engine.config.llm.model}）` : `⚪ AI 斷線，改用內建台詞（${st.message}）` });
  }, 20000);
}

// 🍅 專注：準時結束；結束時把貓咪叫醒（展開），再放獎勵特效
function scheduleFocus(minDelay = 0) {
  clearTimeout(focusTimer);
  const f = engine.state.focus;
  if (!f) return;
  focusTimer = setTimeout(finishFocus, Math.max(minDelay, f.endAt - Date.now() + 300));
}
function finishFocus() {
  const r = engine.completeFocus();
  if (!r) { scheduleFocus(1000); return; } // 時鐘誤差，還沒到
  push('view:update', { view: r.view });
  push('npc:lines', r.lines);
  if (isMini()) setMini(false);
  setTimeout(() => push('fx:reward', r.reward), 1400);
}
function stopFocus() {
  clearTimeout(focusTimer);
  const r = engine.cancelFocus();
  push('view:update', { view: r.view });
  push('npc:lines', r.lines);
  if (isMini()) setMini(false);
}

function scheduleIdle() {
  clearInterval(idleTimer);
  const min = Number(engine.config.window.idleChatterMinutes || 0);
  if (!min) return;
  idleTimer = setInterval(async () => {
    if (engine.state.focus) return; // 專注中不主動搭話
    const t = engine.todayInfo();
    if (!t.current) return; // 只在排定時段內主動搭話
    const r = await engine.daily();
    push('npc:lines', r.lines.map((l) => ({ ...l, ambient: true })));
  }, min * 60000);
}

app.whenReady().then(async () => {
  engine = new Engine({ appDir: APP_DIR });

  ipcMain.handle('view:get', wrap(async () => ({ view: engine.view(), character: characterImages(), mini: isMini() })));
  ipcMain.on('win:mini', (_e, on) => setMini(on));
  ipcMain.handle('npc:greet', wrap(() => engine.greet()));
  ipcMain.handle('npc:daily', wrap(() => engine.daily()));
  ipcMain.handle('npc:poke', wrap(() => engine.poke()));
  ipcMain.handle('npc:chat', wrap((text) => engine.chat(String(text).slice(0, 500))));
  ipcMain.handle('npc:confirm', wrap((id, keep) => engine.confirmProposal(id, Array.isArray(keep) ? keep.map(Number) : null)));
  ipcMain.handle('npc:cancel', wrap(() => engine.cancelProposal()));
  ipcMain.handle('npc:status', wrap(async () => ({ status: await engine.npc.checkStatus() })));
  ipcMain.handle('quest:objective', wrap((qid, idx, done) => engine.setObjective(qid, idx, done)));
  ipcMain.handle('quest:submit', wrap((qid, report) => engine.submit(qid, report)));
  ipcMain.handle('quest:active', wrap((qid) => engine.setActive(qid)));
  ipcMain.handle('daily:toggle', wrap((rowId, done) => engine.toggleDaily(rowId, done)));
  ipcMain.handle('daily:branch', wrap((date, which) => engine.chooseBranch(date, which)));
  ipcMain.handle('daily:report', wrap((fields) => engine.dailyReport(fields)));
  ipcMain.handle('plan:addQuest', wrap((f) => engine.addQuest(f || {})));
  ipcMain.handle('plan:editQuest', wrap((id, f) => engine.editQuest(id, f || {})));
  ipcMain.handle('plan:deleteQuest', wrap((id) => engine.deleteQuest(id)));
  ipcMain.handle('plan:addObjective', wrap((id, text) => engine.addObjective(id, text)));
  ipcMain.handle('plan:deleteObjective', wrap((id, i) => engine.deleteObjective(id, Number(i))));
  ipcMain.handle('plan:addRow', wrap((date, f) => engine.addScheduleRow(date, f || {})));
  ipcMain.handle('plan:deleteRow', wrap((rowId) => engine.deleteScheduleRow(rowId)));
  ipcMain.handle('plan:addReminder', wrap((f) => engine.addReminder(f || {})));
  ipcMain.handle('plan:deleteReminder', wrap((id) => engine.deleteReminder(id)));
  ipcMain.handle('ics:import', wrap(() => importIcs()));
  ipcMain.handle('smart:set', wrap((on) => setSmart(!!on)));
  ipcMain.handle('focus:start', wrap((min) => { const r = engine.startFocus(min); scheduleFocus(); return r; }));
  ipcMain.handle('focus:cancel', wrap(() => { clearTimeout(focusTimer); return engine.cancelFocus(); }));
  ipcMain.handle('focus:peek', wrap(() => engine.focusPeek()));
  ipcMain.handle('fortune:draw', wrap(() => engine.drawFortune()));
  ipcMain.handle('divine:info', wrap(() => ({ info: engine.divineInfo() })));
  ipcMain.handle('divine:check', wrap((q) => engine.divineCheck(q)));
  ipcMain.handle('divine:cast', wrap((opts) => engine.divineCast(opts || {})));
  ipcMain.handle('divine:read', wrap((id) => engine.divineRead(id)));
  ipcMain.handle('ics:export', wrap(() => exportIcs()));
  ipcMain.on('win:ignore', (_e, ignore) => { if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true }); });
  ipcMain.on('win:move', (_e, { dx, dy }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.on('win:menu', showMenu);
  ipcMain.on('ai:toggle', () => setAI(!engine.config.llm.enabled));
  ipcMain.on('win:dragEnd', onDragEnd);

  createWindow();
  watchPlan();
  engine.npc.checkStatus().then((st) => { push('view:update', { view: engine.view() }); if (st.online) engine.npc.warmUp(); });
  scheduleHealth();

  // 提醒對齊整分鐘（12:00 就在 12:00 說，不會晚 59 秒）；啟動後先跑一次，補上寬限時間內的提醒
  const runTick = async () => { const lines = await engine.tick(); if (lines.length) push('npc:lines', lines); };
  setTimeout(runTick, 4000);
  setTimeout(() => { runTick(); tickTimer = setInterval(runTick, 60000); }, 60000 - (Date.now() % 60000) + 500);
  scheduleIdle();
  scheduleFocus(4000); // 上次關程式時還在專注：時間到了就補結算（等畫面載好）

  // 開發測試用：QUEST_NPC_TEST=腳本路徑
  if (process.env.QUEST_NPC_TEST) require(path.resolve(process.env.QUEST_NPC_TEST))({ win, engine, app });
});

app.on('second-instance', () => { if (win) { win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { clearInterval(tickTimer); clearInterval(idleTimer); clearInterval(watchTimer); clearInterval(healthTimer); });
