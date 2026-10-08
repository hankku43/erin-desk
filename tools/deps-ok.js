// 打包.bat 先跑：node_modules 裡的套件跟 package-lock.json 一樣嗎？不一樣（例如新加了 electron-updater）就要先重新安裝，
// 不然打出來的安裝檔會少東西（少了 electron-updater，朋友那邊就不會自動更新）
// 結束碼：0＝都一樣、1＝要重新安裝
'use strict';
const fs = require('fs');
const path = require('path');

function missing(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const out = [];
  for (const [key, info] of Object.entries(lock.packages || {})) {
    if (!key.startsWith('node_modules/') || info.optional || info.link) continue; // 選用的（別的平台才要）不算
    let have = null;
    try { have = JSON.parse(fs.readFileSync(path.join(root, key, 'package.json'), 'utf8')).version; } catch (_) { /* 沒裝 */ }
    if (have !== info.version) out.push({ name: key.replace(/^.*node_modules\//, ''), top: key.split('node_modules/').length === 2, want: info.version, have });
  }
  return out;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  let bad;
  try { bad = missing(root); } catch (e) { console.log(`（看不懂 package-lock.json：${e.message}，重新安裝一次）`); process.exit(1); }
  if (!bad.length) { console.log('套件都裝好了'); process.exit(0); }
  const top = bad.filter((b) => b.top).slice(0, 3).map((b) => (b.have ? `${b.name} ${b.have} → ${b.want}` : `${b.name}（還沒裝）`));
  console.log(`有 ${bad.length} 個套件跟 package-lock.json 不一樣${top.length ? `，例如：${top.join('、')}` : ''}，先重新安裝…`);
  process.exit(1);
}

module.exports = { missing };
