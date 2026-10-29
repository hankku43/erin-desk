// 🔒 讓 Ollama 只在這台電腦工作：關掉雲端（雲端模型＋網路搜尋）、關掉自動下載更新、不讓別的裝置／網頁連進來
//   雲端：~/.ollama/server.json 的 disable_ollama_cloud（跟 Ollama 設定頁的「Cloud」開關同一個；環境變數 OLLAMA_NO_CLOUD 也算）
//   自動更新、對外開放：Ollama 桌面版的設定資料庫（Windows %LOCALAPPDATA%\Ollama\db.sqlite、macOS ~/Library/Application Support/Ollama/db.sqlite）
//     settings 表只有一列（id = 1）：auto_update_enabled（設定頁「Auto-download updates」）、expose（「Expose Ollama to the network」）、browser（允許網頁連進來）
//   Ollama 每次檢查更新都重新讀資料庫，所以自動更新改了馬上生效；雲端和對外開放是 Ollama 啟動時讀的，要重開 Ollama
//   注意：關掉自動下載後，Ollama 還是會每小時問 ollama.com 有沒有新版（只是不下載）；要完全不連網只能用防火牆
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const KEYS = ['cloud', 'autoUpdate', 'expose']; // want[key] === true ＝ 要關掉它
const LABEL = { cloud: '雲端模型和網路搜尋', autoUpdate: '自動下載更新', expose: '讓別的裝置、網頁連進來' };
const DEFAULT_WANT = { cloud: true, autoUpdate: true, expose: true };

function paths({ home = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const db = platform === 'win32' ? (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Ollama', 'db.sqlite') : null)
    : platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'Ollama', 'db.sqlite') : null;
  return { serverJson: path.join(home, '.ollama', 'server.json'), db };
}
// 跟 Go 的 strconv.ParseBool 一樣
const envTrue = (v) => /^(1|t|true)$/i.test(String(v || '').trim());

function loadSqlite() {
  try { return require('node:sqlite'); } catch (_) { return null; } // Electron 44（Node 24）有；舊的 Node 沒有就當作改不了
}
function readJson(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (_) { return null; }
}
function openDb(file, sqlite) {
  if (!file || !sqlite || !fs.existsSync(file)) return null;
  const db = new sqlite.DatabaseSync(file);
  try { db.exec('PRAGMA busy_timeout = 5000'); } catch (_) { /* 略 */ }
  return db;
}
function columns(db) {
  try { return new Set(db.prepare('PRAGMA table_info(settings)').all().map((r) => r.name)); } catch (_) { return new Set(); }
}

// 現在的狀態：{ cloudOff, cloudBy: 'config'|'env'|'both'|null, db: 'ok'|'missing'|'old'|'nosqlite'|'error', autoUpdate, expose, browser }
function read(opts = {}) {
  const { env = process.env, sqlite = loadSqlite() } = opts;
  const p = opts.paths || paths(opts);
  const j = readJson(p.serverJson) || {};
  const byFile = j.disable_ollama_cloud === true, byEnv = envTrue(env.OLLAMA_NO_CLOUD);
  const out = { cloudOff: byFile || byEnv, cloudBy: byFile && byEnv ? 'both' : byFile ? 'config' : byEnv ? 'env' : null, db: 'missing', autoUpdate: null, expose: null, browser: null };
  if (!p.db || !fs.existsSync(p.db)) return out;
  if (!sqlite) { out.db = 'nosqlite'; return out; }
  let db = null;
  try {
    db = openDb(p.db, sqlite);
    const cols = columns(db);
    if (!cols.has('auto_update_enabled')) out.db = 'old'; // 沒有這個開關的舊版 Ollama
    else out.db = 'ok';
    const pick = ['auto_update_enabled', 'expose', 'browser'].filter((c) => cols.has(c));
    if (pick.length) {
      const row = db.prepare(`SELECT ${pick.join(', ')} FROM settings WHERE id = 1`).get() || {};
      if ('auto_update_enabled' in row) out.autoUpdate = !!row.auto_update_enabled;
      if ('expose' in row) out.expose = !!row.expose;
      if ('browser' in row) out.browser = !!row.browser;
    }
  } catch (e) { out.db = 'error'; out.error = e.message; } finally { try { if (db) db.close(); } catch (_) { /* 略 */ } }
  return out;
}

// 照 want 關掉；回 { changed: [key…], needRestart, skipped: [{key, why}], state }
//   只「關」不「開」：want[key] 不是 true 的就不碰（冒險者自己在 Ollama 設定頁開的，艾琳不改回去）
function apply(want = DEFAULT_WANT, opts = {}) {
  const { sqlite = loadSqlite() } = opts;
  const p = opts.paths || paths(opts);
  const before = read({ ...opts, paths: p, sqlite });
  const changed = [], skipped = [];
  let needRestart = false;
  if (want.cloud && !before.cloudOff) {
    try {
      const j = readJson(p.serverJson) || {}; // 壞掉的檔案：跟 Ollama 一樣重寫一份
      j.disable_ollama_cloud = true;
      fs.mkdirSync(path.dirname(p.serverJson), { recursive: true });
      fs.writeFileSync(p.serverJson, `${JSON.stringify(j, null, 2)}\n`);
      changed.push('cloud'); needRestart = true;
    } catch (e) { skipped.push({ key: 'cloud', why: e.message }); }
  }
  const dbWant = [];
  if (want.autoUpdate && before.autoUpdate !== false) dbWant.push('autoUpdate');
  if (want.expose && (before.expose !== false || before.browser === true)) dbWant.push('expose');
  if (dbWant.length) {
    if (before.db !== 'ok' && before.db !== 'old') {
      const why = { missing: p.db ? 'Ollama 桌面版還沒開過（或沒有裝）' : '這個系統的 Ollama 沒有設定頁', nosqlite: '這版程式讀不了 Ollama 的設定', error: before.error || '讀不了 Ollama 的設定' }[before.db];
      for (const k of dbWant) skipped.push({ key: k, why });
    } else {
      let db = null;
      try {
        db = openDb(p.db, sqlite);
        const cols = columns(db);
        const sets = [];
        if (dbWant.includes('autoUpdate')) { if (cols.has('auto_update_enabled')) { sets.push('auto_update_enabled = 0'); changed.push('autoUpdate'); } else skipped.push({ key: 'autoUpdate', why: '這版 Ollama 沒有自動更新的開關' }); }
        if (dbWant.includes('expose')) {
          const s2 = ['expose', 'browser'].filter((c) => cols.has(c)).map((c) => `${c} = 0`);
          if (s2.length) { sets.push(...s2); changed.push('expose'); if (before.expose || before.browser) needRestart = true; } else skipped.push({ key: 'expose', why: '這版 Ollama 沒有這個設定' });
        }
        if (sets.length) db.prepare(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`).run();
      } catch (e) {
        for (const k of dbWant) if (!skipped.some((s) => s.key === k)) skipped.push({ key: k, why: e.message });
        for (const k of dbWant) { const i = changed.indexOf(k); if (i >= 0) changed.splice(i, 1); }
      } finally { try { if (db) db.close(); } catch (_) { /* 略 */ } }
    }
  }
  return { changed, needRestart, skipped, state: read({ ...opts, paths: p, sqlite }) };
}

// 跟 want 比：哪些還開著（null＝不知道，例如還沒開過 Ollama）
function pending(want, st) {
  if (!want || !st) return [];
  const out = [];
  if (want.cloud && !st.cloudOff) out.push('cloud');
  if (want.autoUpdate && st.autoUpdate === true) out.push('autoUpdate');
  if (want.expose && (st.expose === true || st.browser === true)) out.push('expose');
  return out;
}
const summary = (keys) => keys.map((k) => LABEL[k]).join('、');

module.exports = { KEYS, LABEL, DEFAULT_WANT, paths, envTrue, read, apply, pending, summary };
