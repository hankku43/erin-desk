// 安裝.bat／打包.bat 一開始先跑：Node.js 版本夠不夠（照 package.json 的 engines.node）
// 故意寫成很舊的 JavaScript，太舊的 Node 也能跑完、印出看得懂的說明
var fs = require('fs');
var path = require('path');
var want = '22.12.0';
try {
  var pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  var m = /(\d+\.\d+\.\d+)/.exec((pkg.engines || {}).node || '');
  if (m) want = m[1];
} catch (e) { /* 讀不到就用預設 */ }
if (process.env.CHECK_NODE_WANT) want = process.env.CHECK_NODE_WANT; // 測試用
function parts(v) { return String(v).replace(/^v/, '').split('.').map(function (x) { return parseInt(x, 10) || 0; }); }
var have = parts(process.versions.node);
var need = parts(want);
var ok = true;
for (var i = 0; i < 3; i++) { if (have[i] !== need[i]) { ok = have[i] > need[i]; break; } }
if (ok) { console.log('Node.js ' + process.versions.node + ' OK'); process.exit(0); }
console.log('');
console.log('Node.js 版本太舊：你的是 ' + process.versions.node + '，需要 ' + want + ' 以上。');
console.log('請到 https://nodejs.org 下載「LTS」版安裝（會直接蓋過舊版），裝好後關掉這個視窗，再雙擊一次。');
process.exit(1);
