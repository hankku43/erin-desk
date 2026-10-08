// 🤖 幫朋友裝 Ollama（Windows）：下載官方安裝程式 → 確認是 Ollama 官方簽章 → 不跳視窗安裝 → 等它在背景啟動
//   Ollama 的安裝程式是 Inno Setup：不需要系統管理員權限、裝在 %LOCALAPPDATA%\Programs\Ollama，
//   /VERYSILENT 也會在裝完後自動啟動（ollama.iss 的 [Run] 沒有 skipifsilent）。舊版會被直接蓋過、模型會留著，所以「更新」也用同一條路
//   每一步都可以注入（fetchImpl、verifyImpl、spawnImpl、versionImpl…），測試不用真的下載
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const SETUP_URL = 'https://ollama.com/download/OllamaSetup.exe';
const SIGNER = /\bOllama\b/i; // 憑證是「Ollama Inc.」
const SILENT_ARGS = ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'];
const PHASES = ['download', 'verify', 'install', 'start'];
const PHASE_TEXT = { download: '下載 Ollama 安裝程式', verify: '確認是 Ollama 官方的檔案', install: '安裝中（不會跳出視窗）', start: '等 Ollama 啟動' };

const supported = (platform = process.platform) => platform === 'win32';

function fail(code, message) { const e = new Error(message); e.code = code; return e; }
const abortErr = () => fail('canceled', '已取消');
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal && signal.aborted) { reject(abortErr()); return; }
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortErr()); }, { once: true });
});

// PowerShell 的單引號字串：裡面的 ' 要寫成 ''
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const signatureCommand = (file) => `$s = Get-AuthenticodeSignature -LiteralPath ${psQuote(file)}; Write-Output ("{0}|{1}" -f $s.Status, $s.SignerCertificate.Subject)`;
// 「Valid|CN=Ollama Inc., O=Ollama Inc., …」→ { ok, status, subject }
function parseSignature(out) {
  const line = String(out || '').trim().split(/\r?\n/).pop() || '';
  const i = line.indexOf('|');
  const status = (i >= 0 ? line.slice(0, i) : line).trim();
  const subject = i >= 0 ? line.slice(i + 1).trim() : '';
  return { ok: status === 'Valid' && SIGNER.test(subject), status, subject };
}
function verifyWindows(file, { execFileImpl = execFile } = {}) {
  return new Promise((resolve) => {
    execFileImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', signatureCommand(file)], { windowsHide: true, timeout: 60000 }, (err, stdout) => {
      if (err) resolve({ ok: false, status: 'Error', subject: '', error: err.message });
      else resolve(parseSignature(stdout));
    });
  });
}

// 下載到 暫存\erin-ollama\OllamaSetup.exe（先寫 .part，完整了才改名）
async function download({ url = SETUP_URL, dir, fetchImpl = fetch, signal, onProgress = () => {} }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'OllamaSetup.exe');
  const part = `${file}.part`;
  let res;
  try { res = await fetchImpl(url, { signal, redirect: 'follow', headers: { 'User-Agent': 'erin-desk' } }); } catch (e) {
    if (signal && signal.aborted) throw abortErr();
    throw fail('download', `連不到 Ollama 官網（${e.cause && e.cause.code ? e.cause.code : e.message}）`);
  }
  if (!res.ok || !res.body) throw fail('download', `Ollama 官網回應 ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(part);
  let received = 0, lastPct = -1;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal && signal.aborted) throw abortErr();
      received += value.length;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      const percent = total ? Math.floor((received / total) * 100) : 0;
      if (percent !== lastPct) { lastPct = percent; onProgress({ phase: 'download', received, total, percent }); }
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
  } catch (e) {
    out.destroy();
    try { fs.unlinkSync(part); } catch (_) { /* 沒有就算了 */ }
    if (signal && signal.aborted) throw abortErr();
    throw e.code ? e : fail('download', `下載中斷（${e.message}）`);
  }
  if (total && received !== total) { try { fs.unlinkSync(part); } catch (_) { /* 略 */ } throw fail('download', `下載不完整（${received}／${total} bytes），請再試一次`); }
  if (received < 1024 * 1024) { try { fs.unlinkSync(part); } catch (_) { /* 略 */ } throw fail('download', '下載到的檔案太小，不像安裝程式'); }
  try { fs.unlinkSync(file); } catch (_) { /* 沒有舊的 */ }
  fs.renameSync(part, file);
  return { file, size: received };
}

// 執行安裝程式，等它結束（Inno Setup：0＝成功）
// 安裝開始後就不能取消（避免裝一半）
function runInstaller(file, { spawnImpl = spawn, timeout = 15 * 60000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(file, SILENT_ARGS, { windowsHide: true, stdio: 'ignore' }); } catch (e) { reject(fail('install', `安裝程式打不開（${e.message}）`)); return; }
    const t = setTimeout(() => reject(fail('install', '安裝太久沒有結束，請改用官網的安裝程式')), timeout);
    child.on('error', (e) => { clearTimeout(t); reject(fail('install', `安裝程式打不開（${e.code || e.message}）`)); });
    child.on('exit', (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(fail('install', `安裝沒有成功（代碼 ${code}）。可能是防毒軟體擋住了，或是硬碟空間不夠（Ollama 需要約 4GB）`));
    });
  });
}

// Ollama 有沒有回應：/api/version → '0.12.3'；沒回應 → null
async function ollamaVersion(baseUrl, { fetchImpl = fetch, timeout = 2500 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetchImpl(`${baseUrl}/api/version`, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.version === 'string' ? j.version : '';
  } catch (_) { return null; } finally { clearTimeout(t); }
}

// 等 Ollama 啟動；過了 kickAfter 還沒回應就自己打開一次 ollama app.exe
async function waitForOllama({ baseUrl, versionImpl, findApp, launch, signal, timeout = 120000, kickAfter = 20000, every = 1500, now = Date.now }) {
  const t0 = now();
  let kicked = false;
  for (;;) {
    const v = await versionImpl(baseUrl);
    if (v !== null) return v;
    if (signal && signal.aborted) throw abortErr();
    const waited = now() - t0;
    if (!kicked && waited >= kickAfter) { kicked = true; const exe = findApp(); if (exe) launch(exe); }
    if (waited >= timeout) throw fail('start', '裝好了，但 Ollama 一直沒有啟動。請從開始選單打開「Ollama」，再按「再檢查一次」');
    await sleep(every, signal);
  }
}

// 下載前先問大小（HEAD，跟著轉址）：bytes 或 null；同一次執行只問一次
let sizeCache;
async function installerSize({ url = SETUP_URL, fetchImpl = fetch, timeout = 4000 } = {}) {
  if (sizeCache !== undefined) return sizeCache;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'erin-desk' } });
    const n = Number(r.headers.get('content-length')) || 0;
    sizeCache = r.ok && n > 1024 * 1024 ? n : null;
  } catch (_) { sizeCache = null; } finally { clearTimeout(t); } // 問不到也記住，不要每次檢查都等 4 秒
  return sizeCache;
}
const gb = (bytes) => (bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : '');

// 整個流程。onProgress({ phase, percent?, received?, total?, text })
async function install({
  baseUrl = 'http://127.0.0.1:11434', signal, onProgress = () => {}, platform = process.platform,
  dir = path.join(os.tmpdir(), 'erin-ollama'), url = SETUP_URL, fetchImpl = fetch,
  verifyImpl = verifyWindows, spawnImpl = spawn, versionImpl = (u) => ollamaVersion(u, { fetchImpl }),
  findApp = () => null, launch = (exe) => { try { spawn(exe, [], { detached: true, stdio: 'ignore' }).unref(); } catch (_) { /* 略 */ } },
  waitOpts = {},
} = {}) {
  if (!supported(platform)) throw fail('unsupported', '只有 Windows 版可以自動安裝，請到 Ollama 官網下載');
  const step = (phase, extra = {}) => onProgress({ phase, text: PHASE_TEXT[phase], ...extra });
  step('download', { percent: 0 });
  const { file, size } = await download({ url, dir, fetchImpl, signal, onProgress: (p) => step('download', p) });
  if (signal && signal.aborted) throw abortErr();
  step('verify');
  const sig = await verifyImpl(file);
  if (!sig.ok) {
    try { fs.unlinkSync(file); } catch (_) { /* 略 */ }
    throw fail('signature', `下載到的檔案不是 Ollama 官方簽章（${sig.status || '無法確認'}${sig.subject ? `：${sig.subject}` : ''}），為了安全沒有安裝`);
  }
  if (signal && signal.aborted) throw abortErr();
  step('install');
  await runInstaller(file, { spawnImpl });
  try { fs.unlinkSync(file); } catch (_) { /* 留著也沒關係 */ }
  step('start');
  const version = await waitForOllama({ baseUrl, versionImpl, findApp, launch, signal, ...waitOpts });
  return { version, size };
}

module.exports = { installerSize, gb, SETUP_URL, SILENT_ARGS, PHASES, PHASE_TEXT, supported, psQuote, signatureCommand, parseSignature, verifyWindows, download, runInstaller, ollamaVersion, waitForOllama, install };
