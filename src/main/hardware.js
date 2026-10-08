// 🖥 看看電腦有沒有能跑 AI 的顯示卡（新手教學推薦模型用；一次開機只問一次，結果記著）
// NVIDIA：nvidia-smi；問不到的話，Windows 再看登錄檔（WMI 的 AdapterRAM 最多只到 4GB，不能用）
// Apple Silicon：記憶體和顯示卡共用，大約 2/3 可以給 AI
'use strict';

const os = require('os');
const { execFile } = require('child_process');

const round1 = (x) => Math.round(x * 10) / 10;

// 執行指令、拿到輸出；失敗、逾時、沒有這個指令都回 null（不丟錯）
const runCmd = (cmd, args, timeout = 4000) => new Promise((resolve) => {
  try {
    execFile(cmd, args, { timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 1 << 20 }, (err, stdout) => resolve(err ? null : String(stdout || '')));
  } catch (_) { resolve(null); }
});

const vendorOf = (name) => (/nvidia|geforce|quadro|tesla|\brtx\b|\bgtx\b/i.test(name) ? 'nvidia'
  : /\bamd\b|radeon/i.test(name) ? 'amd'
    : /intel|\barc\b|iris|uhd/i.test(name) ? 'intel' : 'other');

// 「NVIDIA GeForce RTX 4060, 8188」（MiB）一行一張
function parseNvidiaSmi(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.+?),\s*(\d+(?:\.\d+)?)\s*$/);
    return m ? { name: m[1].trim(), vendor: 'nvidia', vramGB: round1(Number(m[2]) / 1024) } : null;
  }).filter(Boolean);
}

// 登錄檔查到的「名稱|位元組」一行一張；同一張卡可能出現兩次（不同的設定檔），合併掉
function parseRegistry(text) {
  const seen = new Set();
  const out = [];
  for (const l of String(text || '').split(/\r?\n/)) {
    const [name, bytes] = l.split('|').map((x) => (x || '').trim());
    if (!name) continue;
    const vramGB = round1((Number(bytes) || 0) / 1024 ** 3);
    const key = `${name}|${vramGB}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, vendor: vendorOf(name), vramGB });
  }
  return out;
}

// Ollama 用得到的顯示卡：NVIDIA（2GB 以上）、AMD RX 6800 以上／7000、9000 系列；Intel 和內顯先當作沒有（用處理器算）
function usable(g) {
  if (!g || !(g.vramGB >= 2)) return false;
  if (g.vendor === 'nvidia' || g.vendor === 'apple') return true;
  if (g.vendor === 'amd') return /RX\s*(6[89]\d0|7\d{3}|9\d{3})/i.test(g.name) || /Radeon\s+(PRO\s+)?W[67]\d{3}/i.test(g.name);
  return false;
}

const PS_GPU = "$ErrorActionPreference='SilentlyContinue'; Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' | ForEach-Object { $m = $_.'HardwareInformation.qwMemorySize'; if (-not $m) { $m = $_.'HardwareInformation.MemorySize' }; if ($m -is [byte[]]) { $m = [BitConverter]::ToUInt32($m, 0) }; [string]$_.DriverDesc + '|' + [string]$m }";

let cached = null;
// 回傳 { ramGB, gpu: { name, vendor, vramGB, unified? } | null, gpus: [所有找到的卡] }
async function detect({ platform = process.platform, arch = process.arch, totalmem = os.totalmem(), run = runCmd, fresh = false } = {}) {
  if (cached && !fresh) return cached;
  const ramGB = round1(totalmem / 1024 ** 3);
  let gpus = [];
  if (platform === 'darwin') {
    if (arch === 'arm64') gpus = [{ name: 'Apple Silicon', vendor: 'apple', vramGB: round1(ramGB * 0.66), unified: true }];
  } else {
    gpus = parseNvidiaSmi(await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']));
    if (!gpus.length && platform === 'win32') {
      gpus = parseRegistry(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PS_GPU, 'utf16le').toString('base64')], 8000));
    }
  }
  const gpu = gpus.filter(usable).sort((a, b) => b.vramGB - a.vramGB)[0] || null;
  cached = { ramGB, gpu, gpus };
  return cached;
}

module.exports = { detect, parseNvidiaSmi, parseRegistry, usable, vendorOf };
