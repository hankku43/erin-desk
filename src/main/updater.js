// 🔄 自動更新：朋友不用自己去找新版
//   安裝版（NSIS 裝在 %LOCALAPPDATA%\Programs）：electron-updater 從 GitHub Releases 讀 latest.yml，
//     背景下載（只下載有變的部分，用 blockmap），下次關掉艾琳時自動換上；也可以按「現在更新」立刻重新啟動
//   免安裝版（zip）：electron-updater 沒辦法換掉解壓縮的資料夾 → 只問 GitHub 最新版本，提醒＋打開下載頁
//   從原始碼執行（開發版）：不檢查（用 git pull）
//   每一步都可以注入（app、loadUpdater、fetchImpl、計時器…），測試不用真的連網
'use strict';

const fs = require('fs');
const path = require('path');

const OWNER = 'hankku43', REPO = 'erin-desk';
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const API_LATEST = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const FIRST_DELAY = 45 * 1000; // 開啟 45 秒後第一次檢查（不跟開機時的打招呼、模型載入搶）
const EVERY = 6 * 60 * 60 * 1000; // 之後每 6 小時（常常整天開著）

// '0.1.10' > '0.1.9'；前面的 v 不算；看不懂的版本一律不算新
const parseVer = (v) => { const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/); return m ? m.slice(1).map(Number) : null; };
function isNewer(remote, local) {
  const a = parseVer(remote), b = parseVer(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
// 安裝版旁邊會有「Uninstall 艾琳的任務櫃台.exe」；zip 解壓縮的沒有
function isInstalled(execPath, readdir = fs.readdirSync) {
  try { return readdir(path.dirname(execPath)).some((f) => /^Uninstall .+\.exe$/i.test(f)); } catch (_) { return false; }
}
function modeOf({ isPackaged, platform, installed, hasUpdater }) {
  if (!isPackaged) return 'dev';
  if (platform === 'win32' && installed && hasUpdater) return 'auto';
  return 'portable';
}
// Release 說明（GitHub 給 HTML 或 Markdown）→ 幾行純文字
function notesText(raw, { maxLines = 8 } = {}) {
  let s = Array.isArray(raw) ? raw.map((x) => (x && x.note) || '').join('\n') : String(raw || '');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d|div|ul|ol)>/gi, '\n').replace(/<li[^>]*>/gi, '\n- ').replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return s.split(/\r?\n/)
    .map((l) => l.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*+]\s+/, '・').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim())
    .filter(Boolean).slice(0, maxLines);
}
function friendly(e) {
  const m = String((e && (e.message || e.code)) || e || '');
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|net::ERR_/i.test(m)) return '連不到 GitHub（網路斷了，或被公司網路擋住）';
  if (/\b404\b/.test(m)) return '找不到更新資訊（Release 裡要有 latest.yml）';
  if (/\b(403|429)\b|rate limit/i.test(m)) return 'GitHub 暫時不讓查（太頻繁），晚一點會再試';
  return m.split('\n')[0].slice(0, 120) || '不知道的錯誤';
}
// 艾琳的話（口吻：叫「冒險者」、自稱「艾琳」）
function line(kind, { v, call = '冒險者', self = '艾琳' }) {
  if (kind === 'ready') return { text: `${call}～公會寄來新版本 ${v} 了！${self}已經先收好了，下次關掉${self}的時候會自動換上；想現在就換的話，按旁邊卡片的「現在更新」。`, emotion: 'cheer' };
  if (kind === 'portable') return { text: `${call}，公會出了新版本 ${v}！免安裝版要自己下載新的，按旁邊卡片的「打開下載頁」就好，資料都會留著。`, emotion: 'surprised' };
  if (kind === 'updated') return { text: `換上新版本 ${v} 了！${call}如果發現哪裡怪怪的，記得跟${self}說喔。`, emotion: 'happy' };
  return null;
}

function createUpdater({
  app, platform = process.platform, execPath = process.execPath, readdir = fs.readdirSync,
  loadUpdater = () => require('electron-updater').autoUpdater, fetchImpl = fetch,
  onStatus = () => {}, onSay = () => {}, log = () => {},
  isAuto = () => true, names = () => ({}), dismissed = () => null,
  setTimeoutImpl = setTimeout, setIntervalImpl = setInterval, now = Date.now,
} = {}) {
  const installed = isInstalled(execPath, readdir);
  let au = null;
  if (app.isPackaged && platform === 'win32' && installed) {
    try { au = loadUpdater(); } catch (e) { log(`electron-updater 載入失敗：${e.message}`); }
  }
  const mode = modeOf({ isPackaged: app.isPackaged, platform, installed, hasUpdater: !!au });
  const st = { mode, current: app.getVersion(), status: 'idle', version: null, notes: [], percent: 0, error: null, url: RELEASES_PAGE, checkedAt: null };
  let lastEmit = 0;
  const emit = (force = true) => {
    const t = now();
    if (!force && t - lastEmit < 1000) return; // 下載進度最多 1 次／秒
    lastEmit = t;
    onStatus({ ...st, notes: [...st.notes] });
  };
  const said = new Set();
  const announce = (kind) => {
    const key = `${kind}:${st.version}`;
    if (said.has(key) || dismissed() === st.version) return;
    said.add(key);
    onSay([line(kind, { v: st.version, ...names() })]);
  };
  const fail = (e) => { st.status = 'error'; st.error = friendly(e); st.checkedAt = now(); log(`更新失敗：${(e && (e.stack || e.message)) || e}`); emit(); };

  if (au) {
    au.autoDownload = true; // 有新版就在背景下載
    au.autoInstallOnAppQuit = true; // 下次關掉時安裝
    au.allowPrerelease = false;
    au.logger = { info: (m) => log(String(m)), warn: (m) => log(`warn ${m}`), error: (m) => log(`error ${m}`), debug: () => {} };
    au.on('checking-for-update', () => { st.status = 'checking'; emit(); });
    au.on('update-available', (info) => { Object.assign(st, { status: 'downloading', version: info.version, notes: notesText(info.releaseNotes), percent: 0, error: null }); emit(); });
    au.on('update-not-available', () => { Object.assign(st, { status: 'latest', error: null, checkedAt: now() }); emit(); });
    au.on('download-progress', (p) => { st.percent = Math.floor((p && p.percent) || 0); emit(false); });
    au.on('update-downloaded', (info) => {
      Object.assign(st, { status: 'ready', version: info.version, percent: 100, error: null, checkedAt: now() });
      if (info.releaseNotes) st.notes = notesText(info.releaseNotes);
      emit(); announce('ready');
    });
    au.on('error', (e) => { if (st.status !== 'ready') fail(e); else log(`更新（已下載好）之後的錯誤：${e && e.message}`); });
  }

  async function check() {
    if (mode === 'dev') return { ...st };
    if (['checking', 'downloading', 'ready'].includes(st.status)) return { ...st }; // 正在忙或已經下載好：不重複
    if (mode === 'auto') {
      try { await au.checkForUpdates(); } catch (e) { if (st.status !== 'error') fail(e); }
      return { ...st };
    }
    st.status = 'checking'; emit();
    try {
      const r = await fetchImpl(API_LATEST, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'erin-desk' } });
      if (!r.ok) throw new Error(`GitHub 回應 ${r.status}`);
      const j = await r.json();
      if (isNewer(j.tag_name, st.current)) {
        Object.assign(st, { status: 'available', version: String(j.tag_name).replace(/^v/i, ''), notes: notesText(j.body), url: j.html_url || RELEASES_PAGE, error: null, checkedAt: now() });
        emit(); announce('portable');
      } else { Object.assign(st, { status: 'latest', error: null, checkedAt: now() }); emit(); }
    } catch (e) { fail(e); }
    return { ...st };
  }
  // 現在更新：關掉艾琳 → 不跳視窗安裝 → 自動重新打開
  function install() {
    if (mode !== 'auto' || st.status !== 'ready') return { installing: false };
    setTimeoutImpl(() => au.quitAndInstall(true, true), 300);
    return { installing: true };
  }
  function start() {
    if (mode === 'dev') return false;
    const auto = () => { if (isAuto()) check(); };
    setTimeoutImpl(auto, FIRST_DELAY);
    setIntervalImpl(auto, EVERY);
    return true;
  }
  return { mode, check, install, start, status: () => ({ ...st, notes: [...st.notes] }) };
}

module.exports = { OWNER, REPO, RELEASES_PAGE, API_LATEST, FIRST_DELAY, EVERY, parseVer, isNewer, isInstalled, modeOf, notesText, friendly, line, createUpdater };
