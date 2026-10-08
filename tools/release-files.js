// 打包.bat 最後跑：列出這一版要上傳到 GitHub Release 的檔案，並檢查自動更新要用的 latest.yml 對得上
//   自動更新（electron-updater）會讀 Release 裡的 latest.yml → 版本、安裝程式檔名、sha512；
//   blockmap 讓朋友只下載有變的部分。三個都要上傳，標籤要叫 v＋版本（例如 v0.1.2）
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function files(version) {
  return [
    { name: `Erin-Setup-${version}.exe`, why: '安裝程式（朋友下載這個）', must: true },
    { name: `Erin-Setup-${version}.exe.blockmap`, why: '自動更新用：只下載有變的部分', must: true },
    { name: 'latest.yml', why: '自動更新用：版本和檢查碼', must: true },
    { name: `Erin-${version}-portable.zip`, why: '免安裝版（選用）', must: false },
  ];
}
// latest.yml 很簡單，不用 yaml 套件：version、path、sha512
function readLatest(text) {
  const get = (k) => { const m = String(text).match(new RegExp(`^${k}:\\s*['"]?([^'"\\r\\n]+)['"]?\\s*$`, 'm')); return m ? m[1].trim() : null; };
  return { version: get('version'), path: get('path'), sha512: get('sha512') };
}
const sha512 = (file) => crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');

function check(dir, version) {
  const list = files(version).map((f) => ({ ...f, ok: fs.existsSync(path.join(dir, f.name)) }));
  const problems = list.filter((f) => f.must && !f.ok).map((f) => `少了 ${f.name}`);
  const yml = path.join(dir, 'latest.yml');
  if (fs.existsSync(yml)) {
    const L = readLatest(fs.readFileSync(yml, 'utf8'));
    if (L.version !== version) problems.push(`latest.yml 的版本是 ${L.version}，跟 package.json 的 ${version} 不一樣（是不是舊的檔案？）`);
    const exe = path.join(dir, `Erin-Setup-${version}.exe`);
    if (L.path && L.path !== `Erin-Setup-${version}.exe`) problems.push(`latest.yml 指向 ${L.path}，不是這一版的安裝程式`);
    else if (fs.existsSync(exe) && L.sha512 && sha512(exe) !== L.sha512) problems.push('latest.yml 的檢查碼跟安裝程式對不上（安裝程式被改過？請重新打包）');
  }
  // 打出來的程式裡要有自動更新：resources\app-update.yml＋app.asar 裡的 electron-updater
  const res = path.join(dir, 'win-unpacked', 'resources');
  if (fs.existsSync(res)) {
    if (!fs.existsSync(path.join(res, 'app-update.yml'))) problems.push('程式裡沒有 app-update.yml（package.json 的 build.publish 要設 github）：朋友那邊不會自動更新');
    if (!asarHas(path.join(res, 'app.asar'), ['node_modules', 'electron-updater'])) problems.push('程式裡沒有 electron-updater：先雙擊 安裝.bat 再打包，不然朋友那邊不會自動更新');
  }
  return { list, problems };
}
// app.asar 開頭是一段 JSON 目錄：{ files: { node_modules: { files: { … } } } }
function asarHas(file, parts) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const len = head.readUInt32LE(12);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 16);
    fs.closeSync(fd);
    let node = JSON.parse(buf.toString('utf8'));
    for (const p of parts) { node = node && node.files && node.files[p]; if (!node) return false; }
    return true;
  } catch (_) { return false; }
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const { list, problems } = check(path.join(root, 'dist'), version);
  console.log('');
  console.log(`要上傳到 GitHub Release 的檔案（標籤請用 v${version}）：`);
  for (const f of list) console.log(`  ${f.ok ? '✔' : f.must ? '✘' : '－'} ${f.name.padEnd(34)} ${f.why}`);
  console.log('Release 的說明文字，艾琳會在更新卡片的「更新了什麼」裡給朋友看。');
  if (problems.length) { console.log(''); for (const p of problems) console.log(`⚠ ${p}`); process.exit(1); }
}

module.exports = { files, readLatest, check, asarHas };
