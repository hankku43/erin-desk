// Electron 主程式：透明置頂的桌面 NPC 視窗
'use strict';

const { app, BrowserWindow, ipcMain, Menu, screen, dialog, shell, powerMonitor, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Engine } = require('./engine');
const { EMOTIONS, fillEmotionImages } = require('./npc');
const SETUP = require('./setup');
const { buildHealth, parseLog } = require('./health');

const APP_DIR = path.join(__dirname, '..', '..'); // 程式本身（打包後在 app.asar 裡，唯讀）
// 你的資料（設定、週計畫、存檔、角色設定、自己的角色圖）：
// 開發時就是程式資料夾；打包給朋友用時放在「文件\艾琳的任務櫃台」，更新程式也不會不見
let USER_DIR = APP_DIR;
const charDirs = () => [...new Set([path.join(USER_DIR, 'assets', 'character'), path.join(APP_DIR, 'assets', 'character')])];
const userCharDir = () => path.join(USER_DIR, 'assets', 'character');
const WIN_W = 610, WIN_H = 800; // 加寬：狀態面板和角色並排、不重疊

let win, engine, tickTimer, idleTimer, watchTimer, focusTimer;
let moving = false; // 程式自己調整視窗大小時，不記錄位置

// 🧪 測試模式（測試新手教學.bat 會加 --erin-test）：每次用全新的暫存資料夾，看朋友第一次打開的樣子。
// 路徑由程式自己決定（純英文），不經過 .bat 的中文字，才不會被命令列的編碼弄壞
const TEST_MODE = process.argv.includes('--erin-test');
if (TEST_MODE) {
  const home = path.join(require('os').tmpdir(), 'erin-onboarding-test');
  try { fs.rmSync(home, { recursive: true, force: true }); } catch (_) { /* 清不掉就沿用 */ }
  process.env.QUEST_NPC_HOME = home;
}
// 另外指定資料夾時，連 Electron 自己的資料也分開，才能跟平常的艾琳同時開著
if (process.env.QUEST_NPC_HOME) app.setPath('userData', path.join(path.resolve(process.env.QUEST_NPC_HOME), '.electron'));
if (!app.requestSingleInstanceLock()) app.quit();

// 沒接住的錯誤寫進 data/crash.log，朋友回報問題時可以把這個檔案傳過來
function logCrash(kind, e) {
  try {
    const dir = path.join(USER_DIR, 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'crash.log'), `${new Date().toISOString()}\t${kind}\t${(e && e.stack) || e}\n`);
  } catch (_) { /* 連記錄都寫不進去就算了 */ }
  console.error(kind, e);
}
process.on('uncaughtException', (e) => logCrash('uncaught', e));
process.on('unhandledRejection', (e) => logCrash('unhandled', e));

const MINI_SIZE = 140;

function findImage(base) {
  for (const dir of charDirs()) { // 自己放的圖優先，沒有就用內建的
    for (const ext of ['png', 'webp', 'gif', 'apng', 'svg']) {
      const f = path.join(dir, `${base}.${ext}`);
      if (fs.existsSync(f)) return 'file:///' + f.replace(/\\/g, '/');
    }
  }
  return null;
}

// 打包版第一次啟動：建立使用者資料夾，放一份可以自己改的範本與角色設定
function prepareUserDir() {
  if (USER_DIR === APP_DIR) return;
  for (const d of ['plans', 'lore', 'data', path.join('assets', 'character')]) fs.mkdirSync(path.join(USER_DIR, d), { recursive: true });
  const copy = (from, to) => fs.writeFileSync(to, fs.readFileSync(from)); // 來源在 app.asar 裡，用讀寫代替複製
  const copyOnce = (rel) => { const to = path.join(USER_DIR, rel); if (!fs.existsSync(to)) copy(path.join(APP_DIR, rel), to); };
  copyOnce(path.join('plans', '_template.md'));
  copyOnce(path.join('plans', 'week_sample.md')); // 預設的計畫檔（新手教學裡可以換掉）
  // 角色設定：沒改過的話，程式更新時一起換成新版；改過就保留你的
  // 打包後角色設定放在 resources/lore（中文檔名放進 app.asar 在某些環境讀不到）
  const rel = path.join('lore', '艾琳.md');
  const packed = app.isPackaged ? path.join(process.resourcesPath, rel) : null;
  const src = packed && fs.existsSync(packed) ? packed : path.join(APP_DIR, rel), dst = path.join(USER_DIR, rel), mark = `${dst}.builtin`;
  const hash = (f) => { try { return crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex'); } catch (_) { return null; } };
  const builtin = hash(src), mine = hash(dst), last = fs.existsSync(mark) ? fs.readFileSync(mark, 'utf8').trim() : null;
  if (!mine || (mine === last && builtin !== last)) { copy(src, dst); fs.writeFileSync(mark, builtin || ''); }
  else if (!last) fs.writeFileSync(mark, mine === builtin ? builtin : '');
}

function uiImage(base) {
  for (const ext of ['png', 'webp', 'svg']) {
    const f = path.join(APP_DIR, 'assets', 'ui', `${base}.${ext}`);
    if (fs.existsSync(f)) return 'file:///' + f.replace(/\\/g, '/');
  }
  return null;
}

const POSES = ['blink', 'sleep', 'tea', 'write', 'stretch', 'wave'];
function characterImages() {
  const own = {};
  for (const emo of EMOTIONS) own[emo] = findImage(emo);
  const found = fillEmotionImages(own); // 沒有圖的表情借相近的圖
  const fallback = found.normal;
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
    // 待機動作圖（選填）：有放就換那張圖演，沒有就只用表情和頭上的泡泡
    poses: Object.fromEntries(POSES.map((p) => [p, findImage(p)]).filter(([, v]) => v)),
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
  if (!on && isMini() && engine.tutorialMark('mini')) { // 🎓 新手任務：變貓咪再叫醒
    setTimeout(() => { const r = engine.settle({ lines: [] }); if (r.lines.length) push('npc:lines', r.lines); push('view:update', { view: engine.view() }); }, 2600);
  }
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
    title: `${engine.config.npc.name}的任務櫃台${TEST_MODE ? '（測試）' : ''}`,
    icon: path.join(APP_DIR, 'build', 'icon.png'), // 工作列上的小貓圖示
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }, // 被其他視窗蓋住時動畫也不降速
  });
  win.on('page-title-updated', (e) => e.preventDefault()); // 工作列顯示「艾琳的任務櫃台」，不要被網頁的 <title> 蓋掉
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
    const seq = engine.speechSeq;
    try { const r = await fn(...args); return { ok: true, ...r, speechQueued: engine.speechSeq - seq }; } catch (e) {
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

async function choosePlan({ greet = true } = {}) {
  const r = await dialog.showOpenDialog(win, {
    title: '選擇週計畫 Markdown', properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    defaultPath: path.dirname(engine.planFile()),
  });
  if (r.canceled || !r.filePaths[0]) return { canceled: true, view: engine.view() };
  engine.usePlanFile(r.filePaths[0]);
  reloadPlan('已切換計畫檔');
  watchPlan();
  if (greet) { const g = await engine.greet(); push('npc:lines', g.lines); }
  return { chosen: r.filePaths[0], view: engine.view() };
}

// ---- 🎓 新手引導：偵測 Ollama、下載模型（進度推給畫面）、打開 Ollama ----
const pulls = new Map(); // model → AbortController
function startPull(model) {
  if (pulls.has(model)) return { started: false, already: true };
  const ctl = new AbortController();
  pulls.set(model, ctl);
  const send = (p) => push('setup:progress', { model, ...p });
  send({ status: 'starting', percent: 0 });
  SETUP.pull({ baseUrl: engine.config.llm.baseUrl, model, signal: ctl.signal, onProgress: send })
    .then(async () => {
      send({ status: 'success', percent: 100, done: true });
      if (model === engine.config.llm.model) { const st = await engine.npc.checkStatus(); if (st.online) engine.npc.warmUp(); }
      if (model === engine.lore.embedModel && engine.lore.smartOn()) engine.lore.prepareEmbeddings();
      push('view:update', { view: engine.view() });
    })
    .catch((e) => send({ status: 'error', error: ctl.signal.aborted ? '已取消' : e.message, done: true }))
    .finally(() => pulls.delete(model));
  return { started: true };
}
function openOllama() {
  const exe = SETUP.findOllamaApp();
  if (exe) { try { spawn(exe, [], { detached: true, stdio: 'ignore' }).unref(); return { opened: 'app' }; } catch (_) { /* 改開下載頁 */ } }
  shell.openExternal(SETUP.OLLAMA_DOWNLOAD);
  return { opened: 'download' };
}

// ---- 🩺 健康檢查 ----
async function healthCheck() {
  const probe = await SETUP.probe({ baseUrl: engine.config.llm.baseUrl });
  const planFile = engine.planFile();
  let saveOK = true;
  try { const f = path.join(engine.dataDir, '.write-test'); fs.writeFileSync(f, 'ok'); fs.unlinkSync(f); } catch (_) { saveOK = false; }
  let log = [];
  try { log = parseLog(fs.readFileSync(path.join(engine.dataDir, 'llm.log'), 'utf8')); } catch (_) { /* 還沒有紀錄 */ }
  const items = buildHealth({
    name: engine.config.npc.name,
    configError: engine.configError,
    plan: { file: planFile, exists: fs.existsSync(planFile), quests: engine.plan.quests.length, legacy: engine.legacy },
    llm: { enabled: !!engine.config.llm.enabled, model: engine.config.llm.model },
    probe, ramGB: probe.ramGB, log,
    smart: { on: engine.lore.smartOn(), status: engine.lore.embedStatus, explicit: (engine.config.lore || {}).embeddings === true },
    charOK: !!findImage('normal'), saveOK, userDir: USER_DIR,
  });
  return { items, probe, view: engine.view() };
}
async function healthFix(action) {
  const a = String(action || '');
  if (a === 'resetConfig') {
    const f = engine.configFile();
    if (fs.existsSync(f)) fs.copyFileSync(f, f.replace(/\.json$/, `.broken-${Date.now()}.json`));
    fs.writeFileSync(f, fs.readFileSync(path.join(APP_DIR, 'config.example.json')));
    engine.configError = null; engine.loadConfig(); engine.loadPlan(); watchPlan();
    return { reason: '⚙ 設定檔已還原成預設（舊的另存一份在旁邊）' };
  }
  if (a === 'openConfig') { shell.openPath(engine.configFile()); return {}; }
  if (a === 'openFolder') { shell.openPath(USER_DIR); return {}; }
  if (a === 'openChar') { fs.mkdirSync(userCharDir(), { recursive: true }); shell.openPath(userCharDir()); return {}; }
  if (a === 'choosePlan') return choosePlan({ greet: false });
  if (a === 'updateOllama') { shell.openExternal(SETUP.OLLAMA_DOWNLOAD); return { reason: '已打開 Ollama 下載頁：安裝新版會直接蓋過舊版，已經下載的模型會留著。裝好後回來按「再檢查一次」' }; }
  if (a === 'openOllama') return { ...openOllama(), reason: SETUP.findOllamaApp() ? '正在打開 Ollama…' : '已打開 Ollama 下載頁，裝好後回來按「再檢查一次」' };
  if (a === 'enableAI') { await setAI(true); return {}; }
  if (a === 'disableAI') { await setAI(false); return {}; }
  if (a === 'reconnect') { engine.npc.backoffUntil = 0; await engine.npc.checkStatus(); return {}; }
  if (a === 'smartOn') return setSmart(true);
  if (a === 'smartOff') return setSmart(false);
  if (a.startsWith('pull:')) return startPull(a.slice(5));
  if (a.startsWith('useModel:')) {
    const model = a.slice(9);
    engine.setModel(model);
    const pr = await SETUP.probe({ baseUrl: engine.config.llm.baseUrl });
    if (pr.ollama === 'running' && !SETUP.hasModel(pr.models, model)) startPull(model);
    else await engine.npc.checkStatus();
    return { reason: `🤖 改用 ${model}` };
  }
  throw new Error(`不認得的動作：${a}`);
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

// 右鍵選單：常用的放第一層，其他收進分組（避免一長串）
function menuTemplate() {
  const npcName = engine.config.npc.name;
  const mini = isMini();
  const open = (kind) => () => { if (mini) setMini(false); push('ui:open', kind); };
  const st = engine.npc.status || {};
  const aiTitle = !engine.config.llm.enabled ? '🤖 AI：關閉（內建台詞）' : st.online ? '🤖 AI：🟢 已連線' : '🤖 AI：⚪ 離線';
  const f = engine.fortuneToday();
  return [
    { label: mini ? '🔼 展開' : '🐾 縮小化（變回貓咪）', click: () => (mini ? setMini(false) : push('ui:shrink')) }, // 縮小走前端，先播變身動畫
    { type: 'separator' },
    { label: '📜 任務板', click: open('board') },
    { label: '📅 今日行程', click: open('daily') },
    { label: '📝 下班回報', click: open('report') },
    engine.state.focus
      ? { label: `🍅 結束專注（還剩 ${engine.focusInfo().leftMin} 分鐘）`, click: stopFocus }
      : { label: `🍅 專注 ${engine.focusCfg().minutes} 分鐘`, click: () => { if (mini) setMini(false); push('ui:focus'); } },
    { label: '✨ 更多玩法', submenu: [
      { label: f ? `🔮 今日運勢：${f.rank}` : '🔮 抽今日運勢', click: () => { if (mini) setMini(false); push('ui:fortune'); } },
      { label: `✨ 占卜魔法（${engine.divCfg().cost} 金幣）…`, click: open('divine') },
      { label: `📒 ${npcName}的小本子（偷看）`, click: open('notebook') },
      { label: '📖 冒險日誌・週報', click: open('journal') },
      { type: 'separator' },
      { label: '🛒 雲朵雜貨舖', click: open('shop') },
      { label: '🏅 成就', click: open('collection') },
    ] },
    { type: 'separator' },
    ...(engine.config.window.hud === false && !mini ? [{ label: '📊 顯示狀態欄', click: () => { const r = engine.setHud(true); push('view:update', { view: r.view }); } }] : []), // 狀態欄收起來時：第一層就找得到
    { label: '📂 週計畫', submenu: [
      { label: '選擇週計畫檔…', click: () => choosePlan() },
      { label: '開啟計畫檔', click: () => shell.openPath(engine.planFile()) },
      { label: '重新載入計畫檔', click: () => reloadPlan('已重新載入') },
      { type: 'separator' },
      { label: '📥 匯入行事曆（.ics）到本週…', click: menuSafe(importIcs) },
      { label: '📤 匯出本週成行事曆（.ics）…', click: menuSafe(exportIcs) },
    ] },
    { label: aiTitle, submenu: [
      { label: `AI 對話（${engine.config.llm.model}）`, type: 'checkbox', checked: !!engine.config.llm.enabled, click: (m) => setAI(m.checked) },
      { label: aiStatusLabel(), enabled: false },
      { label: '立刻重新連線', enabled: !!engine.config.llm.enabled, click: async () => { engine.npc.backoffUntil = 0; const s2 = await engine.npc.checkStatus(); push('view:update', { view: engine.view(), reason: s2.online ? `🟢 AI 已連線（${engine.config.llm.model}）` : `⚪ ${s2.message}` }); } },
      { type: 'separator' },
      { label: `🧠 聰明${npcName}（向量搜尋）`, type: 'checkbox', checked: engine.lore.smartOn(), click: (m) => menuSafe(() => setSmart(m.checked))() },
      { label: engine.lore.statusText(), enabled: false },
    ] },
    { label: '⚙ 設定與資料', submenu: [
      { label: '置頂顯示', type: 'checkbox', checked: win.isAlwaysOnTop(), click: (m) => { win.setAlwaysOnTop(m.checked); engine.saveConfigPatch({ window: { alwaysOnTop: m.checked } }); } },
      { label: '📊 狀態欄（等級、當前任務）', type: 'checkbox', checked: engine.config.window.hud !== false, click: (m) => { const r = engine.setHud(m.checked); push('view:update', { view: r.view }); } },
      { label: `✨ 待機小動作（${npcName}會自己動來動去）`, type: 'checkbox', checked: engine.config.window.idleAnim !== false, click: (m) => { engine.saveConfigPatch({ window: { idleAnim: m.checked } }); push('view:update', { view: engine.view() }); } },
      { label: '🐰 棉棉和朵朵來櫃台串門子（下午茶外送、道賀、許願單）', type: 'checkbox', checked: engine.twCfg().enabled !== false, click: (m) => { const r = engine.setTwins(m.checked); push('view:update', { view: r.view }); } },
      { label: `📒 讓${npcName}記小本子（記住你說過的事）`, type: 'checkbox', checked: engine.nbCfg().enabled !== false, click: (m) => { const r = engine.setNotebook(m.checked); push('npc:lines', r.lines); push('view:update', { view: r.view }); } },
      { label: '🖥 固定在顯示器', submenu: displayMenu() },
      { label: '縮到工作列', click: () => win.minimize() },
      { type: 'separator' },
      { label: '📁 打開我的資料夾', click: () => shell.openPath(USER_DIR) },
      { label: '開啟設定檔 config.json', click: () => shell.openPath(engine.configFile()) },
      { label: `開啟角色設定檔（${npcName}的故事）`, click: () => shell.openPath(engine.lore.file) },
      { label: '開啟角色圖片資料夾', click: () => { fs.mkdirSync(userCharDir(), { recursive: true }); shell.openPath(userCharDir()); } },
      { label: '重新讀取設定', click: async () => { engine.loadConfig(); await engine.npc.checkStatus(); push('view:update', { view: engine.view(), reason: '設定已重新讀取' }); } },
    ] },
    { label: '❓ 說明', submenu: [
      { label: '🩺 健康檢查（哪裡怪怪的？）', click: open('health') },
      { label: '🎓 新手教學（再看一次）', click: open('onboard') },
    ] },
    { type: 'separator' },
    { label: `離開（${npcName}會想你的）`, click: () => app.quit() },
  ];
}
function showMenu() {
  Menu.buildFromTemplate(menuTemplate()).popup({ window: win });
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

// 待機小動作需要知道：你在不在電腦前（離開就打瞌睡）、滑鼠在哪一邊（她會微微往那邊看）
let presenceTimer = null, cursorTimer = null, lastCursor = null;
function schedulePresence() {
  clearInterval(presenceTimer); clearInterval(cursorTimer);
  const sendPresence = () => {
    if (!win || win.isDestroyed()) return;
    let idleSec = 0, locked = false;
    try { idleSec = powerMonitor.getSystemIdleTime(); locked = powerMonitor.getSystemIdleState(60) === 'locked'; } catch (_) { /* 有些系統拿不到 */ }
    push('presence', { idleSec, locked });
  };
  presenceTimer = setInterval(sendPresence, 5000);
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible() || isMini() || engine.config.window.idleAnim === false) return;
    try {
      const c = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const dx = Math.round(c.x - (b.x + b.width - 150)); // 角色在視窗右下角
      const dy = Math.round(c.y - (b.y + b.height - 220));
      if (lastCursor && Math.abs(dx - lastCursor.dx) < 30 && Math.abs(dy - lastCursor.dy) < 30) return;
      lastCursor = { dx, dy };
      push('cursor', lastCursor);
    } catch (_) { /* 拿不到就算了 */ }
  }, 500);
}

// 主動找冒險者聊天：每分鐘看一次該不該開口（間隔、好感、有沒有在電腦前，都在 engine.proactiveDue 裡判斷）
let proactiveBusy = false;
async function runProactive() {
  if (proactiveBusy || !win || win.isDestroyed()) return;
  proactiveBusy = true;
  try {
    let idleSec = 0, locked = false;
    try { idleSec = powerMonitor.getSystemIdleTime(); locked = powerMonitor.getSystemIdleState(60) === 'locked'; } catch (_) { /* 有些系統拿不到 */ }
    const r = await engine.proactive({ idleSec, locked });
    if (r && r.lines.length) push('npc:lines', r.lines);
  } catch (e) { console.error(e); } finally { proactiveBusy = false; }
}
function scheduleIdle() {
  clearInterval(idleTimer);
  if (!Number(engine.config.window.idleChatterMinutes || 0)) return;
  idleTimer = setInterval(runProactive, 60000);
}

app.whenReady().then(async () => {
  if (process.env.QUEST_NPC_HOME) USER_DIR = path.resolve(process.env.QUEST_NPC_HOME);
  else if (app.isPackaged) USER_DIR = path.join(app.getPath('documents'), '艾琳的任務櫃台');
  try { prepareUserDir(); } catch (e) { console.error('建立使用者資料夾失敗', e); }
  engine = new Engine({ appDir: APP_DIR, userDir: USER_DIR });
  // 勾目標、交付這些動作先完成、畫面馬上更新；艾琳的話在背後想好再推過去（等 AI 的時候介面不會卡住）
  engine.deferSpeech = true;
  engine.onSpeech = (lines) => push('npc:lines', lines);

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
  ipcMain.handle('shop:open', wrap(() => engine.shopOpen()));
  ipcMain.handle('shop:gift', wrap((id) => engine.buyGift(String(id))));
  ipcMain.handle('shop:buy', wrap((id) => engine.buyDecor(String(id))));
  ipcMain.handle('shop:equip', wrap((slot, id) => engine.equip(String(slot), id ? String(id) : null)));
  ipcMain.handle('shop:draw', wrap((n, ticket) => engine.drawCards(Number(n), { ticket: !!ticket })));
  ipcMain.handle('shop:wish', wrap((id) => engine.wishToggle(String(id))));
  ipcMain.handle('twins:take', wrap(() => engine.twinsTake()));
  ipcMain.handle('shop:exchange', wrap((id) => engine.exchangeCard(String(id))));
  ipcMain.handle('collection:open', wrap(() => engine.collectionOpen()));
  ipcMain.handle('ui:setHud', wrap((on) => engine.setHud(!!on)));
  ipcMain.handle('journal:open', wrap((key, quiet) => engine.journalOpen(key ? String(key) : null, !!quiet)));
  ipcMain.handle('journal:comment', wrap((key, force) => engine.journalComment(key ? String(key) : null, !!force)));
  ipcMain.handle('journal:export', wrap((key) => { const r = engine.journalExport(key ? String(key) : null); shell.showItemInFolder(r.path); return r; }));
  ipcMain.handle('journal:copy', wrap((text) => { clipboard.writeText(String(text || '')); return {}; }));
  ipcMain.handle('notebook:peek', wrap((quiet) => engine.peekNotebook(!!quiet)));
  ipcMain.handle('notebook:forget', wrap((id) => engine.forgetNote(String(id))));
  ipcMain.handle('notebook:clear', wrap(() => engine.clearNotebook()));
  ipcMain.handle('notebook:set', wrap((on) => engine.setNotebook(!!on)));
  ipcMain.handle('ics:export', wrap(() => exportIcs()));
  // 🎓 新手引導
  ipcMain.handle('setup:probe', wrap(async () => ({ probe: await SETUP.probe({ baseUrl: engine.config.llm.baseUrl }) })));
  ipcMain.handle('setup:pull', wrap((model) => startPull(String(model))));
  ipcMain.handle('setup:cancelPull', wrap((model) => { const c = pulls.get(String(model)); if (c) c.abort(); return {}; }));
  ipcMain.handle('setup:openOllama', wrap(() => openOllama()));
  ipcMain.handle('setup:setModel', wrap(async (model) => { const r = engine.setModel(model || null); const st = await engine.npc.setEnabled(!!model); if (st && st.online) engine.npc.warmUp(); return { ...r, view: engine.view() }; }));
  ipcMain.handle('setup:createPlan', wrap(async (f) => { const r = await engine.createPlan(f || {}); watchPlan(); return r; }));
  ipcMain.handle('setup:samplePlan', wrap(() => { const r = engine.useSamplePlan(); watchPlan(); return r; }));
  ipcMain.handle('setup:choosePlan', wrap(() => choosePlan({ greet: false })));
  ipcMain.handle('setup:importIcs', wrap(async () => {
    if (!fs.existsSync(engine.planFile()) || engine.planError) { await engine.createPlan({}); watchPlan(); } // 還沒有計畫：先開一份空的這週再匯入
    return importIcs();
  }));
  ipcMain.handle('setup:schedule', wrap((f) => { const r = engine.saveSchedule(f || {}); scheduleIdle(); return r; }));
  ipcMain.handle('setup:finish', wrap(() => engine.finishOnboarding()));
  ipcMain.handle('setup:restart', wrap(() => engine.restartOnboarding()));
  ipcMain.handle('tutorial:hide', wrap(() => engine.hideTutorial()));
  // 🩺 健康檢查
  ipcMain.handle('health:check', wrap(() => healthCheck()));
  ipcMain.handle('health:fix', wrap(async (action) => { const r = await healthFix(action); return { ...r, view: engine.view() }; }));
  ipcMain.on('win:ignore', (_e, ignore) => { if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true }); });
  ipcMain.on('win:move', (_e, { dx, dy }) => {
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.on('win:menu', showMenu);
  ipcMain.on('ai:toggle', () => setAI(!engine.config.llm.enabled));
  ipcMain.on('npc:touch', () => engine.touch()); // 冒險者碰了視窗：主動聊天的計時重來
  ipcMain.on('win:dragEnd', onDragEnd);

  createWindow();
  watchPlan();
  engine.npc.checkStatus().then((st) => { push('view:update', { view: engine.view() }); if (st.online) engine.npc.warmUp(); });
  if (TEST_MODE) win.webContents.once('did-finish-load', () => setTimeout(() => push('view:update', { view: engine.view(), reason: `🧪 測試用的${engine.config.npc.name}：全新的資料夾，平常的存檔不受影響` }), 1200));
  scheduleHealth();

  // 提醒對齊整分鐘（12:00 就在 12:00 說，不會晚 59 秒）；啟動後先跑一次，補上寬限時間內的提醒
  const runTick = async () => {
    const lines = await engine.tick(); if (lines.length) push('npc:lines', lines);
    if (engine.twinsDirty) { engine.twinsDirty = false; push('view:update', { view: engine.view() }); } // 🐰 下午茶外送排好了：讓畫面知道
  };
  setTimeout(runTick, 4000);
  setTimeout(() => { runTick(); tickTimer = setInterval(runTick, 60000); }, 60000 - (Date.now() % 60000) + 500);
  scheduleIdle();
  schedulePresence();
  scheduleFocus(4000); // 上次關程式時還在專注：時間到了就補結算（等畫面載好）

  // 開發測試用：QUEST_NPC_TEST=腳本路徑
  if (process.env.QUEST_NPC_TEST) require(path.resolve(process.env.QUEST_NPC_TEST))({ win, engine, app, menuTemplate, runProactive });
});

app.on('second-instance', () => { if (win) { win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { clearInterval(tickTimer); clearInterval(idleTimer); clearInterval(watchTimer); clearInterval(healthTimer); clearInterval(presenceTimer); clearInterval(cursorTimer); });
