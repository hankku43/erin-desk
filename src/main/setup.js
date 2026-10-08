// 新手引導與健康檢查用的小工具：偵測 Ollama、依記憶體和顯示卡推薦模型、下載模型（有進度）、找到沒開的 Ollama
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const HW = require('./hardware');

// 模型階梯（由小到大）：gpu＝整個放進顯示卡大約要幾 GB（含對話用的記憶）；cpu＝沒有顯示卡時，記憶體要多少才「很快／順／會慢」
// moe：每次只動一小部分（30b 只動 3B），放不下顯示卡、分一些給記憶體也還算順；experimental：不會自動推薦
// 記憶體門檻抓寬一點：16GB 的電腦常常只回報 15.x GB、32GB 回報 31.x
const LADDER = [
  { name: 'qwen3:1.7b', size: '1.4GB', gb: 1.4, title: '輕量', desc: '最快、最省記憶體，聊天比較簡單', gpu: 2.5, cpu: { great: 7, slow: 3.5 } },
  { name: 'qwen3:4b', size: '2.5GB', gb: 2.5, title: '標準', desc: '聰明又不挑電腦，大部分人用這個', gpu: 4, cpu: { ok: 15, slow: 7 } },
  { name: 'qwen3:8b', size: '5.2GB', gb: 5.2, title: '進階', desc: '比較懂前後文、說話更自然', gpu: 6.5, cpu: { slow: 15 } },
  { name: 'qwen3:14b', size: '9.3GB', gb: 9.3, title: '高階', desc: '記得更多細節、更會接話', gpu: 11, cpu: {} },
  { name: 'qwen3:30b-instruct', size: '19GB', gb: 19, title: '旗艦', desc: '大模型但每次只動一小部分，記憶體夠大就跑得動', gpu: 21, moe: true, cpu: { ok: 30 } },
  { name: 'qwen3.6:35b-a3b', size: '24GB', gb: 24, title: '實驗', desc: '最新一代，還沒在這裡測試過，說話方式可能不太一樣', gpu: 27, moe: true, cpu: { ok: 45 }, experimental: true },
];
const LADDER_BY = Object.fromEntries(LADDER.map((m) => [m.name, m]));
// 舊的寫法（health.js 等等用）：{ 名稱: { size, label, title, desc } }
const MODELS = Object.fromEntries(LADDER.map((m) => [m.name, { size: m.size, label: `${m.title}（${m.desc}）`, title: m.title, desc: m.desc }]));
const SPEEDS = ['no', 'slow', 'ok', 'great'];
const SPEED_TEXT = { great: '很快', ok: '順', slow: '會等比較久', no: '跑不太動' };
const WHERE_TEXT = { gpu: '整個放進顯示卡', mix: '顯示卡＋記憶體一起跑', cpu: '用處理器跑' };
const rankOf = (s) => SPEEDS.indexOf(s);
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

// 這台電腦跑這個模型大概多快：{ speed: great|ok|slow|no, where: gpu|mix|cpu }
function fit(m, hw = {}) {
  const ram = hw.ramGB || 0, g = hw.gpu, vram = g ? g.vramGB || 0 : 0;
  const c = m.cpu || {};
  const cpu = { speed: ram >= c.great ? 'great' : ram >= c.ok ? 'ok' : ram >= c.slow ? 'slow' : 'no', where: 'cpu' };
  if (!g) return cpu;
  if (vram >= m.gpu) return { speed: 'great', where: 'gpu' };
  if (g.unified) return { speed: vram >= m.gpu * 0.85 ? 'slow' : 'no', where: 'gpu' }; // Apple：放不下就很難跑
  let mix = 'no';
  if (m.moe) { if (vram >= 6) mix = ram + vram >= m.gb + 10 ? 'ok' : ram >= 15 && ram + vram >= m.gb + 6 ? 'slow' : 'no'; } else if (ram >= 7) {
    const r = vram / m.gpu;
    mix = r >= 0.85 ? 'ok' : r >= 0.55 && ram >= 15 ? 'slow' : 'no';
  }
  return mix !== 'no' && rankOf(mix) >= rankOf(cpu.speed) ? { speed: mix, where: 'mix' } : cpu; // 一樣快的話，有顯示卡幫忙比較好
}

const gbText = (x) => `${Math.round(x)}GB`;
// 給人看的硬體摘要：「NVIDIA GeForce RTX 4060（8GB）・32GB 記憶體」
function hwText(hw) {
  const g = hw.gpu;
  if (g && g.unified) return `${g.name}・${gbText(hw.ramGB)} 共用記憶體`;
  return `${g ? `${g.name}（${gbText(g.vramGB)}）・` : ''}${gbText(hw.ramGB)} 記憶體`;
}

// 推薦：不算實驗版、速度至少「順」的裡面最聰明的那個
// 上一階：比推薦大、至少「順」的下一個（沒有的話，「會等比較久」的也可以，畫面會提醒）
// 下一階：比推薦小、速度不比推薦慢的最大那個
// 傳數字＝只看記憶體（沒有顯示卡）
function recommend(hw = { ramGB: ramGB(), gpu: null }) {
  if (typeof hw === 'number') hw = { ramGB: hw, gpu: null };
  const fits = LADDER.map((m) => ({ m, ...fit(m, hw) }));
  let ri = -1;
  fits.forEach((f, i) => { if (!f.m.experimental && rankOf(f.speed) >= rankOf('ok')) ri = i; });
  const rec = ri >= 0 ? fits[ri] : null;
  let up = null;
  for (const min of ['ok', 'slow']) {
    up = fits.slice(ri + 1).find((f) => rankOf(f.speed) >= rankOf(min));
    if (up) break;
  }
  const down = rec ? fits.slice(0, ri).reverse().find((f) => rankOf(f.speed) >= rankOf(rec.speed)) : null;
  const ram = gbText(hw.ramGB || 0);
  const odd = !hw.gpu && (hw.gpus || []).length ? `（顯示卡 ${hw.gpus[0].name.replace(/\((R|TM)\)/gi, '')} 目前 AI 用不到，先用處理器算）` : '';
  let why;
  if (!rec) why = `你的電腦只有 ${ram} 記憶體${hw.gpu ? '、顯示卡也比較小' : ''}，AI 可能會很慢，建議先用內建台詞`;
  else if (rec.where === 'gpu') why = `你的電腦有 ${hwText(hw)}，${rec.m.title}版可以整個放進顯示卡，回得很快`;
  else if (rec.where === 'mix') why = `你的電腦有 ${hwText(hw)}，${rec.m.title}版一部分放顯示卡、一部分放記憶體，速度還算順`;
  else why = `你的電腦有 ${ram} 記憶體${hw.gpu ? `和 ${hw.gpu.name}` : odd || '、沒有偵測到能跑 AI 的顯示卡'}，${rec.m.title}版用處理器跑${rec.speed === 'great' ? '就很快' : '也還算順'}`;
  return { model: rec ? rec.m.name : null, up: up ? up.m.name : null, down: down ? down.m.name : null, why, hwText: hwText(hw), fits };
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

// 給畫面的模型清單：階梯上每一個（速度、推薦／上一階／下一階、下載了沒）＋電腦裡已經有、不在階梯上的（語意模型除外）
function buildChoices(rec, models = []) {
  const tier = (name) => (name === rec.model ? 'rec' : name === rec.up ? 'up' : name === rec.down ? 'down' : null);
  const ladder = rec.fits.map(({ m, speed, where }) => ({
    name: m.name, size: m.size, title: m.title, desc: m.desc, label: MODELS[m.name].label, experimental: !!m.experimental,
    speed, where, speedText: SPEED_TEXT[speed], whereText: WHERE_TEXT[where], tier: tier(m.name), installed: hasModel(models, m.name),
  }));
  const others = models.filter((n) => !LADDER.some((m) => hasModel([n], m.name)) && !/embed/i.test(n))
    .map((n) => ({ name: n, title: '其他', desc: '電腦裡已經有的模型', size: '', speed: null, tier: null, installed: true, other: true }));
  return [...ladder, ...others];
}

// 目前的狀態：Ollama 有沒有開、裝了哪些模型、硬體、推薦哪個（gpu：測試時傳 null＝沒有顯示卡；沒傳就去偵測）
async function probe({ baseUrl = 'http://127.0.0.1:11434', fetchImpl = fetch, totalmem, platform = process.platform, gpu, gpus } = {}) {
  const gb = ramGB(totalmem);
  const hw = gpu === undefined ? { ...(await HW.detect({ platform, totalmem })), ramGB: gb } : { ramGB: gb, gpu, gpus: gpus || [] };
  const rec = recommend(hw);
  let ollama = 'missing', models = [], version = null;
  try {
    const j = await fetchJSON(`${baseUrl}/api/tags`, { fetchImpl });
    ollama = 'running';
    models = (j.models || []).map((m) => m.name || m.model).filter(Boolean);
    try { const v = await fetchJSON(`${baseUrl}/api/version`, { fetchImpl }); version = typeof v.version === 'string' ? v.version : null; } catch (_) { /* 問不到版本就算了 */ }
  } catch (_) { /* 沒開或沒裝 */ }
  if (ollama === 'missing' && findOllamaApp()) ollama = 'stopped'; // 裝了但沒開
  const choices = buildChoices(rec, models);
  return {
    ollama, models, ramGB: gb, recommend: rec.model, up: rec.up, down: rec.down, why: rec.why,
    hw: { ramGB: gb, gpu: hw.gpu || null, text: rec.hwText },
    version, minVersion: MIN_OLLAMA, outdated: !!version && versionLess(version, MIN_OLLAMA),
    choices,
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

module.exports = { MODELS, LADDER, LADDER_BY, SPEED_TEXT, WHERE_TEXT, fit, hwText, buildChoices, EMBED, OLLAMA_DOWNLOAD, MIN_OLLAMA, versionLess, friendlyPullError, ramGB, recommend, hasModel, probe, pull, findOllamaApp };
