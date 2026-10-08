// 安裝.bat／打包.bat 在 npm ci 之前先跑：決定 Electron（約 110 MB）和打包工具要從哪裡下載
//   1. 已經下載過（在 Electron 的快取裡）→ 用同一個來源，不用再下載
//   2. 沒有 → GitHub 官方和 npmmirror 鏡像站各試下載 1 MB（最多 8 秒），挑快的；差不多快就用官方
//   3. 兩邊都連不上 → 照預設（官方），印出可能的原因
// 結束碼：0＝GitHub 官方、10＝鏡像站（bat 用 `if errorlevel 10` 判斷）。這支程式自己出錯也是 0，等於照舊
// 想固定來源：先 set ERIN_DOWNLOAD=github 或 set ERIN_DOWNLOAD=mirror 再執行 bat
// 鏡像站下載的檔案一樣安全：electron 套件裡附了官方的檢查碼（checksums.json），打包工具也有，內容不一樣會直接失敗
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const GITHUB = 'https://github.com/electron/electron/releases/download/';
const MIRROR = 'https://npmmirror.com/mirrors/electron/';
const SAMPLE = 1024 * 1024; // 試下載 1 MB
const TIMEOUT = 8000;
const EXIT = { github: 0, mirror: 10 };

function electronVersion(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const e = (lock.packages || {})['node_modules/electron'];
  if (!e || !e.version) throw new Error('package-lock.json 裡沒有 electron');
  return e.version;
}
function zipName(version, platform, arch) { return `electron-v${version}-${platform}-${arch}.zip`; }
function urls(version, platform, arch) {
  const file = zipName(version, platform, arch);
  return { github: `${GITHUB}v${version}/${file}`, mirror: `${MIRROR}v${version}/${file}`, file };
}
// 跟 @electron/get 的 Cache.getCacheDirectory 一樣：網址拿掉檔名後做 sha256
function cacheKey(u) {
  const x = new URL(u);
  return crypto.createHash('sha256').update(`${x.protocol}//${x.host}${path.posix.dirname(x.pathname)}`).digest('hex');
}
function cacheRoot(env, platform) {
  if (env.electron_config_cache) return env.electron_config_cache;
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron', 'Cache');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'electron');
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'electron');
}
function cached(u, file, root) { return fs.existsSync(path.join(root, cacheKey(u), file)); }

// 試下載前 1 MB（跟著轉址走），回傳 { ok, bytes, ms, mbps, error }
function probe(u, { timeout = TIMEOUT, sample = SAMPLE } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let done = false, req = null, bytes = 0;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); if (req) req.destroy(); const ms = Math.max(1, Date.now() - t0); resolve({ ...r, bytes, ms, mbps: bytes / 1048576 / (ms / 1000) }); };
    const timer = setTimeout(() => finish(bytes >= 64 * 1024 ? { ok: true } : { ok: false, error: '逾時' }), timeout);
    const get = (target, hops) => {
      const mod = target.startsWith('http:') ? require('http') : require('https');
      req = mod.get(target, { headers: { Range: `bytes=0-${sample - 1}`, 'User-Agent': 'erin-desk-installer' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) { res.resume(); get(new URL(res.headers.location, target).href, hops + 1); return; }
        if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); finish({ ok: false, error: `HTTP ${res.statusCode}` }); return; }
        res.on('data', (c) => { bytes += c.length; if (bytes >= sample) finish({ ok: true }); });
        res.on('end', () => finish(bytes > 0 ? { ok: true } : { ok: false, error: '沒有內容' }));
        res.on('error', (e) => finish({ ok: false, error: e.code || e.message }));
      });
      req.on('error', (e) => finish({ ok: false, error: e.code || e.message }));
    };
    try { get(u, 0); } catch (e) { finish({ ok: false, error: e.message }); }
  });
}
// 兩邊都通：鏡像站要快 1.5 倍以上才用（差不多快就用官方）
function decide(gh, mi) {
  if (gh.ok && mi.ok) return mi.mbps > gh.mbps * 1.5 ? 'mirror' : 'github';
  if (mi.ok) return 'mirror';
  return 'github';
}
const fmt = (r) => (r.ok ? `${r.mbps.toFixed(r.mbps < 1 ? 2 : 1)} MB/s` : `連不上（${r.error}）`);
const NAME = { github: 'GitHub 官方', mirror: 'npmmirror 鏡像站' };

async function main({ root = path.join(__dirname, '..'), env = process.env, platform = process.platform, arch = process.arch, log = console.log, probeFn = probe } = {}) {
  const force = String(env.ERIN_DOWNLOAD || '').trim().toLowerCase();
  if (force === 'github' || force === 'mirror') { log(`下載來源：${NAME[force]}（ERIN_DOWNLOAD 指定）`); return force; }
  const u = urls(electronVersion(root), platform, arch);
  const croot = cacheRoot(env, platform);
  for (const k of ['github', 'mirror']) if (cached(u[k], u.file, croot)) { log(`下載來源：${NAME[k]}（Electron 已經下載過了，不用再下載）`); return k; }
  log('測試下載速度（最多 8 秒）…');
  const [gh, mi] = await Promise.all([probeFn(u.github), probeFn(u.mirror)]);
  const pick = decide(gh, mi);
  log(`  GitHub 官方：${fmt(gh)}　npmmirror 鏡像站：${fmt(mi)}`);
  if (!gh.ok && !mi.ok) {
    if (env.HTTPS_PROXY || env.https_proxy) log('  有設 proxy（HTTPS_PROXY）：這裡測速不經過 proxy 所以測不到，照預設從 GitHub 下載（會經過 proxy）');
    else log('  兩邊都連不上：先照預設從 GitHub 下載。公司網路如果要設 proxy，請看 README「常見問題」的「安裝卡住或失敗」');
  }
  log(`下載來源：${NAME[pick]}`);
  return pick;
}

module.exports = { urls, zipName, cacheKey, cacheRoot, cached, probe, decide, main, electronVersion, EXIT, GITHUB, MIRROR };

if (require.main === module) {
  main().then((k) => process.exit(EXIT[k] || 0), (e) => { console.log(`（測不到下載速度：${e.message}，照預設從 GitHub 下載）`); process.exit(0); });
}
