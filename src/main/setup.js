// 新手引導與健康檢查用的小工具：偵測 Ollama、依記憶體推薦模型、下載模型（有進度）、找到沒開的 Ollama
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const MODELS = {
  'qwen3:4b': { size: '2.5GB', label: '標準（比較聰明）', minRamGB: 15 },
  'qwen3:1.7b': { size: '1.4GB', label: '輕量（比較快、比較省記憶體）', minRamGB: 7 },
};
const EMBED = { name: 'qwen3-embedding:0.6b', size: '0.6GB' };
const OLLAMA_DOWNLOAD = 'https://ollama.com/download';
// Ollama 0.9.0（2025/5）起才能關掉 qwen3 的「思考」（think: false）；更舊的版本會回得很慢、常常回不好，新模型也可能下載不了
const MIN_OLLAMA = '0.9.0';

// 版本比較：'0.6.2' < '0.9.0'；看不懂的版本（或開發版 0.0.0）當作不知道，不算太舊
const parseVer = (v) => { const m = String(v || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/); return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null; };
function versionLess(a, b) {
  const pa = parseVer(a), pb = parseVer(b);
  if (!pa || !pb || pa.every((x) => x === 0)) return false;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i];
  return false;
}
// 舊版 Ollama 下載新模型時的錯誤（412：requires a newer version of Ollama）→ 看得懂的中文
function friendlyPullError(msg) {
  const s = String(msg || '');
  if (/newer version|\b412\b/i.test(s)) return `Ollama 版本太舊，這個模型要新版 Ollama 才能下載。請先到 ${OLLAMA_DOWNLOAD} 下載新版安裝（已經下載的模型會留著）`;
  return s;
}

const ramGB = (bytes = os.totalmem()) => Math.round((bytes / 1024 ** 3) * 10) / 10;

// 16GB 以上用 4b；8GB 用 1.7b；再少就建議先不用 AI（內建台詞照樣能玩）
function recommend(gb = ramGB()) {
  if (gb >= MODELS['qwen3:4b'].minRamGB) return { model: 'qwen3:4b', why: `你的電腦有 ${Math.round(gb)}GB 記憶體，可以用標準版` };
  if (gb >= MODELS['qwen3:1.7b'].minRamGB) return { model: 'qwen3:1.7b', why: `你的電腦有 ${Math.round(gb)}GB 記憶體，用輕量版比較順` };
  return { model: null, why: `你的電腦只有 ${Math.round(gb)}GB 記憶體，AI 可能會很慢，建議先用內建台詞` };
}

// 模型名稱比對：qwen3:4b 也算 qwen3:4b-q4_K_M、沒寫 tag 的算 :latest
function hasModel(names, model) {
  const want = model.includes(':') ? model : `${model}:latest`;
  return (names || []).some((n) => n === want || n === model || n.startsWith(`${want}-`));
}

async function fetchJSON(url, { timeout = 3000, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// 目前的狀態：Ollama 有沒有開、裝了哪些模型、記憶體、推薦哪個
async function probe({ baseUrl = 'http://127.0.0.1:11434', fetchImpl = fetch, totalmem, platform = process.platform } = {}) {
  const gb = ramGB(totalmem);
  const rec = recommend(gb);
  let ollama = 'missing', models = [], version = null;
  try {
    const j = await fetchJSON(`${baseUrl}/api/tags`, { fetchImpl });
    ollama = 'running';
    models = (j.models || []).map((m) => m.name || m.model).filter(Boolean);
    try { const v = await fetchJSON(`${baseUrl}/api/version`, { fetchImpl }); version = typeof v.version === 'string' ? v.version : null; } catch (_) { /* 問不到版本就算了 */ }
  } catch (_) { /* 沒開或沒裝 */ }
  if (ollama === 'missing' && findOllamaApp()) ollama = 'stopped'; // 裝了但沒開
  return {
    ollama, models, ramGB: gb, recommend: rec.model, why: rec.why,
    version, minVersion: MIN_OLLAMA, outdated: !!version && versionLess(version, MIN_OLLAMA),
    choices: Object.entries(MODELS).map(([name, m]) => ({ name, ...m, installed: hasModel(models, name) })),
    embed: { ...EMBED, installed: hasModel(models, EMBED.name) },
    downloadUrl: OLLAMA_DOWNLOAD,
    canInstall: platform === 'win32', // Windows：艾琳可以幫忙下載安裝（ollamaInstall.js）
  };
}

// 下載模型：Ollama 的 /api/pull 會一行一行回報進度（每一層各自有 total／completed）
async function pull({ baseUrl = 'http://127.0.0.1:11434', model, onProgress = () => {}, signal, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${baseUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }), headers: { 'Content-Type': 'application/json' }, signal });
  if (!res.ok || !res.body) {
    let text = ''; try { text = await res.text(); } catch (_) { /* 沒有內容 */ }
    throw new Error(friendlyPullError(`${res.status} ${text}`.trim()) || `Ollama 回應 ${res.status}`);
  }
  const layers = new Map();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', last = null;
  const report = (status) => {
    let total = 0, done = 0;
    for (const l of layers.values()) { total += l.total || 0; done += Math.min(l.completed || 0, l.total || 0); }
    onProgress({ status, total, completed: done, percent: total ? Math.floor((done / total) * 100) : 0 });
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let j; try { j = JSON.parse(line); } catch (_) { continue; }
      if (j.error) throw new Error(friendlyPullError(j.error));
      if (j.digest && j.total) layers.set(j.digest, { total: j.total, completed: j.completed || 0 });
      last = j.status || last;
      report(last);
    }
  }
  if (last !== 'success') throw new Error('下載沒有完成，請再試一次');
  onProgress({ status: 'success', percent: 100 });
  return true;
}

// Windows：Ollama 裝了但沒開的話，幫忙打開（它會待在右下角系統匣）
function findOllamaApp(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return null;
  const cands = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama app.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Ollama', 'ollama app.exe'),
  ].filter(Boolean);
  return cands.find((f) => { try { return fs.existsSync(f); } catch (_) { return false; } }) || null;
}

module.exports = { MODELS, EMBED, OLLAMA_DOWNLOAD, MIN_OLLAMA, versionLess, friendlyPullError, ramGB, recommend, hasModel, probe, pull, findOllamaApp };
