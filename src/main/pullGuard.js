// 🛡 下載模型的防呆（新手教學、健康檢查共用）
//   1. 下載前先檢查（幾秒鐘）：
//      - 連得到 Ollama 的模型網站嗎？順便拿到這個模型有哪些檔案、多大
//      - 硬碟空間夠嗎？（已經下載好、下載到一半的部分不重複算）
//      - 連得到模型檔案放的 Cloudflare 儲存空間嗎？（Ollama 下載大檔案都從這裡拿，公司網路最常擋這個）
//      連線方式盡量學 Ollama：直接連線，或是用 HTTPS_PROXY 環境變數（Ollama 不會用 Windows 的 proxy 設定）
//      不通的話再用 Windows 的 proxy 設定試一次：通了＝要幫 Ollama 設 proxy
//   2. 下載中網路斷掉：等一下自動再下載（Ollama 會保留已經下載的部分，接著下載），連續幾次都沒有進度才放棄
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('./setup');

const REGISTRY = 'https://registry.ollama.ai';
const GiB = 1024 ** 3;
const MARGIN = 1 * GiB; // 下載完還要留一點空間給系統
const TIMEOUT = 12000; // 每個連線測試最多等幾毫秒
const MANIFEST_ACCEPT = 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.ollama.manifest.list.v2+json';

// 'qwen3:30b-instruct' → { repo: 'library/qwen3', tag: '30b-instruct' }
// 別的網站的模型（hf.co/…、自己架的）、用 @sha256 指定的不檢查（回 null）
function parseName(model) {
  let s = String(model || '').trim().replace(/^https?:\/\//, '');
  if (!s || s.includes('@')) return null;
  s = s.replace(/^registry\.ollama\.ai\//i, '');
  const parts = s.split('/');
  if (parts.length > 2 || (parts.length === 2 && /[.:]/.test(parts[0]))) return null;
  const last = parts.pop();
  const i = last.indexOf(':');
  const name = i >= 0 ? last.slice(0, i) : last;
  const tag = i >= 0 ? last.slice(i + 1) : 'latest';
  if (!name || !tag) return null;
  return { repo: `${parts[0] || 'library'}/${name}`, tag };
}

// Ollama 放模型的資料夾（跟 Ollama 一樣：OLLAMA_MODELS 或 使用者資料夾\.ollama\models）
const modelsDir = (env = process.env, home = os.homedir()) => env.OLLAMA_MODELS || path.join(home, '.ollama', 'models');

// 這個檔案已經有多少在硬碟上：整個下載好了、或是下載到一半（Ollama 把每一段的進度寫在 sha256-…-partial-N）
function haveBytes(blobsDir, digest, size, fsx = fs) {
  const name = String(digest).replace(':', '-');
  try { if (fsx.existsSync(path.join(blobsDir, name))) return size; } catch (_) { /* 看不到 */ }
  let got = 0;
  try {
    for (const f of fsx.readdirSync(blobsDir)) {
      if (!f.startsWith(`${name}-partial-`)) continue;
      try { got += Math.max(0, Number(JSON.parse(fsx.readFileSync(path.join(blobsDir, f), 'utf8')).Completed) || 0); } catch (_) { /* 壞掉的就不算 */ }
    }
  } catch (_) { /* 還沒有資料夾 */ }
  return Math.min(got, size);
}

// 資料夾所在的磁碟還剩多少（資料夾還不存在就往上找）；看不到就回 null（不檢查）
function freeBytes(dir, fsx = fs) {
  let d = path.resolve(dir);
  for (let i = 0; i < 30; i++) {
    try {
      if (fsx.existsSync(d)) { const st = fsx.statfsSync(d); return Number(st.bavail) * Number(st.bsize); }
    } catch (_) { return null; }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
const gb = (n) => (n / GiB).toFixed(1);
const driveName = (dir, platform = process.platform) => {
  if (platform === 'win32') { const m = String(dir).match(/^([A-Za-z]):/); if (m) return `${m[1].toUpperCase()} 槽`; }
  return '這個磁碟';
};

// HTTPS_PROXY 環境變數（Ollama 用的那個）→ 'http://host:port'（帳號密碼拿掉）；沒有就 null
function envProxy(env = process.env) {
  const v = env.HTTPS_PROXY || env.https_proxy;
  if (!v) return null;
  try { const u = new URL(/:\/\//.test(v) ? v : `http://${v}`); return `${u.protocol}//${u.host}`; } catch (_) { return null; }
}
// Windows proxy 設定（Electron 的 resolveProxy 回 'PROXY host:port; DIRECT' 或 'DIRECT'）→ 'host:port'
function systemProxy(resolved) {
  const m = String(resolved || '').match(/(?:PROXY|HTTPS)\s+([^;\s]+)/i);
  return m ? m[1] : null;
}

// 有時間限制的 fetch（外面取消也會停）
async function timed(fetchImpl, url, opts = {}, ms = TIMEOUT, signal) {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  const t = setTimeout(stop, ms);
  if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
  try { return await fetchImpl(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', stop); }
}
const netErr = (e, signal) => (signal && signal.aborted ? e : Object.assign(new Error(e.name === 'AbortError' ? '逾時（12 秒沒有回應）' : (e.cause && (e.cause.code || e.cause.message)) || e.message), { net: true }));

// 拿模型的檔案清單：[{ digest, size }]（manifest list 就拿第一個）；HTTP 錯誤回 { status }
async function fetchLayers(fetchImpl, n, signal) {
  const get = async (ref) => {
    let res;
    try { res = await timed(fetchImpl, `${REGISTRY}/v2/${n.repo}/manifests/${ref}`, { headers: { Accept: MANIFEST_ACCEPT } }, TIMEOUT, signal); } catch (e) { throw netErr(e, signal); }
    if (!res.ok) return { status: res.status };
    try { return { json: await res.json() }; } catch (_) { return { status: 'json' }; }
  };
  let r = await get(n.tag);
  if (!r.json) return r;
  let m = r.json;
  if (!Array.isArray(m.layers) && Array.isArray(m.manifests) && m.manifests.length) {
    const child = m.manifests[0];
    if (Array.isArray(child.layers)) m = child;
    else if (child.digest) { r = await get(child.digest); if (!r.json) return r; m = r.json; }
  }
  const layers = [m.config, ...(m.layers || [])].filter((l) => l && /^sha256:[0-9a-f]{64}$/.test(l.digest) && Number(l.size) >= 0).map((l) => ({ digest: l.digest, size: Number(l.size) }));
  return layers.length ? { layers } : { status: 'empty' };
}

// 抓最小的那個檔案的前 1KB：registry 會轉到 Cloudflare 儲存空間（跟 Ollama 下載大檔案走同一條路）
async function probeStorage(fetchImpl, n, layer, signal) {
  let res;
  try { res = await timed(fetchImpl, `${REGISTRY}/v2/${n.repo}/blobs/${layer.digest}`, { headers: { Range: 'bytes=0-1023' } }, TIMEOUT, signal); } catch (e) { throw netErr(e, signal); }
  let host = ''; try { host = new URL(res.url).host; } catch (_) { /* 沒有網址 */ }
  try { await res.arrayBuffer(); } catch (e) { throw netErr(e, signal); }
  return { status: res.status, host };
}

// 下載前檢查 → { ok, code: 'network'|'disk'|null, message, brief, where, proxy, need, free, notes: [...] }
//   ok:true 也可能是「沒辦法檢查」（notes 裡有原因）：沒把握就不擋
async function preflight({ model, signal, ollamaFetch, systemFetch, resolveProxy, env = process.env, home = os.homedir(), platform = process.platform, fsx = fs } = {}) {
  const notes = [];
  const done = (o) => ({ ok: true, code: null, ...o, notes });
  const n = parseName(model);
  if (!n) { notes.push('不是 Ollama 官方的模型名稱，不檢查'); return done({}); }
  if (!ollamaFetch) { notes.push('沒有連線工具，不檢查'); return done({}); }
  const px = envProxy(env);
  notes.push(px ? `Ollama 會走 HTTPS_PROXY（${px}）` : 'Ollama 直接連線（沒有 HTTPS_PROXY）');
  // 連不上的時候：用 Windows 的 proxy 設定試同一個網址，通了就是「Ollama 沒走 proxy」
  const viaSystem = async (url, opts) => {
    if (px || !systemFetch || !resolveProxy) return null;
    let sp = null; try { sp = systemProxy(await resolveProxy(url)); } catch (_) { /* 問不到 */ }
    if (!sp) return null;
    try { const r = await timed(systemFetch, url, opts, TIMEOUT, signal); await r.arrayBuffer().catch(() => {}); notes.push(`走 Windows 的 proxy（${sp}）就通`); return sp; } catch (e) { if (signal && signal.aborted) throw e; notes.push(`走 Windows 的 proxy（${sp}）也不通：${netErr(e).message}`); return null; }
  };
  const failNet = async (where, err, url, opts) => {
    notes.push(`${where === 'registry' ? '模型網站' : '下載伺服器'}連不上：${err.message}`);
    const proxy = await viaSystem(url, opts);
    if (proxy) {
      const how = platform === 'win32'
        ? `設定方法：在 Windows 搜尋「編輯您帳戶的環境變數」→ 新增，變數名稱 HTTPS_PROXY、值 http://${proxy} → 確定；再從右下角的 Ollama 圖示按 Quit，重新打開 Ollama，回來按「再試一次」。`
        : `請把環境變數 HTTPS_PROXY 設成 http://${proxy}，重新打開 Ollama 後再按「再試一次」。`;
      return { ok: false, code: 'network', where, proxy, brief: 'Ollama 沒有走 proxy', message: `這台電腦上網要經過 proxy（${proxy}），但 Ollama 沒有用到，所以模型下載不了。${how}`, notes };
    }
    const message = (where === 'registry'
      ? '這台電腦連不上 Ollama 的模型網站（ollama.com），現在下載一定會失敗。請確認網路有通；如果是公司或學校的網路，可能要請管理網路的人開放 ollama.com 和 *.r2.cloudflarestorage.com。'
      : '這台電腦連不上模型的下載伺服器（Cloudflare），直接下載多半會失敗。常見原因是公司或學校的網路擋住了。建議換個網路（例如家裡或手機熱點）再下載，或請管理網路的人開放 *.r2.cloudflarestorage.com；也可以按「仍然下載」試試看。')
      + (px ? `（Ollama 目前會經過 HTTPS_PROXY 設定的 proxy：${px}，也請確認這個 proxy 能用）` : '');
    return { ok: false, code: 'network', where, brief: '連不上下載伺服器', message, notes };
  };
  // 1. 模型網站：拿檔案清單
  let info;
  const mfUrl = `${REGISTRY}/v2/${n.repo}/manifests/${n.tag}`;
  try { info = await fetchLayers(ollamaFetch, n, signal); } catch (e) {
    if (signal && signal.aborted) throw e;
    if (!e.net) { notes.push(`模型網站：${e.message}`); return done({}); }
    return failNet('registry', e, mfUrl, { headers: { Accept: MANIFEST_ACCEPT } });
  }
  if (!info.layers) { notes.push(`模型網站回 ${info.status}，不檢查`); return done({}); }
  // 2. 硬碟空間
  const dir = modelsDir(env, home);
  const total = info.layers.reduce((a, l) => a + l.size, 0);
  const need = info.layers.reduce((a, l) => a + (l.size - haveBytes(path.join(dir, 'blobs'), l.digest, l.size, fsx)), 0);
  const free = freeBytes(dir, fsx);
  notes.push(`模型 ${gb(total)} GB，還要下載 ${gb(need)} GB，${driveName(dir, platform)}剩 ${free == null ? '？' : gb(free)} GB`);
  if (free != null && need > 0 && free < need + MARGIN) {
    return { ok: false, code: 'disk', need, free, brief: '硬碟空間不夠', message: `硬碟空間不夠：這個模型還要下載約 ${gb(need)} GB，${driveName(dir, platform)}只剩 ${gb(free)} GB（建議再多留 1 GB）。清出空間後再按「再試一次」。`, notes };
  }
  if (need === 0) { notes.push('檔案都已經在電腦裡了'); return done({ need, free }); }
  // 3. 下載伺服器（Cloudflare）
  const small = [...info.layers].sort((a, b) => a.size - b.size)[0];
  const blobUrl = `${REGISTRY}/v2/${n.repo}/blobs/${small.digest}`;
  try {
    const r = await probeStorage(ollamaFetch, n, small, signal);
    notes.push(`下載伺服器${r.host ? ` ${r.host}` : ''} 回 ${r.status}`); // Electron 的 fetch 不一定給最後的網址
  } catch (e) {
    if (signal && signal.aborted) throw e;
    if (!e.net) { notes.push(`下載伺服器：${e.message}`); return done({ need, free }); }
    return failNet('storage', e, blobUrl, { headers: { Range: 'bytes=0-1023' } });
  }
  return done({ need, free });
}

// 寫進 data/setup.log 的一行
const summary = (r) => `${r.ok ? '通過' : `擋下（${r.brief}）`}；${(r.notes || []).join('；')}`;

// 網路斷掉自動接著下載：run(onProgress) 是一次 SETUP.pull
//   等待秒數照 WAIT_STEPS（最後一個一直用）；連續 maxStill 次重試都沒有進度、或總共重試 maxRetries 次就放棄
const WAIT_STEPS = [10, 30, 60];
const RETRY_KINDS = new Set(['network', 'incomplete']);
const sleep1 = (signal) => new Promise((r) => { const t = setTimeout(r, 1000); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
async function pullWithRetry({ run, onProgress = () => {}, signal, waits = WAIT_STEPS, maxStill = 2, maxRetries = 8, sleep = sleep1, log = () => {} }) {
  let best = 0, pct = 0, total = 0, still = 0, tries = 0;
  for (;;) {
    let gained = false;
    const before = best;
    try {
      return await run((p) => {
        if (p.completed > best) { best = p.completed; if (best > before + 1048576) gained = true; } // 多下載了 1MB 以上才算有進度
        if (p.total > total) total = p.total;
        if (p.status !== 'success') pct = Math.max(pct, p.percent || 0); // 重新接上時一開始會少算還沒列出的檔案：百分比不倒退
        onProgress(p.status === 'success' ? p : { ...p, percent: pct, completed: best, total });
      });
    } catch (e) {
      if (signal && signal.aborted) throw e;
      const kind = e.kind || S.classifyPullError(e.raw || e.message).kind;
      log(`第 ${tries + 1} 次失敗（${kind}${gained ? '，有進度' : ''}）：${S.techDetail(e.raw || e.message)}`);
      if (!RETRY_KINDS.has(kind)) throw e;
      still = gained ? 0 : still + 1;
      if (still > maxStill || tries >= maxRetries) {
        if (tries) e.message = `試了 ${tries + 1} 次都沒辦法下載完。${e.message}`;
        e.retried = tries;
        throw e;
      }
      const wait = waits[Math.min(tries, waits.length - 1)];
      tries++;
      const reason = e.where === 'registry' ? '連不上模型網站' : '網路斷了一下';
      for (let s = wait; s > 0; s--) {
        onProgress({ status: 'retrying', retryIn: s, attempt: tries, reason, percent: pct, completed: best, total });
        await sleep(signal);
        if (signal && signal.aborted) throw Object.assign(new Error('已取消'), { kind: 'canceled' });
      }
      onProgress({ status: 'resuming', attempt: tries, percent: pct, completed: best, total });
    }
  }
}

module.exports = { REGISTRY, GiB, MARGIN, WAIT_STEPS, parseName, modelsDir, haveBytes, freeBytes, gb, driveName, envProxy, systemProxy, fetchLayers, probeStorage, preflight, summary, pullWithRetry };
