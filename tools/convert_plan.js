#!/usr/bin/env node
// 把舊版週報格式（總覽表＋任務清單＋時間表表格＋決策點＋進度紀錄表）轉成新的寬鬆格式
// 用法：node tools/convert_plan.js 舊檔.md [新檔.md]   （不給新檔名就印到畫面）
'use strict';
const fs = require('fs');
const path = require('path');
const legacy = require('../src/main/planParserLegacy');

function convert(md) {
  const p = legacy.parsePlan(md);
  const out = [];
  out.push(`# ${p.title}`, '');
  const tierTok = { main: ' ⭐', major: ' 🔧', side: ' 🌿' };
  for (const q of p.quests) {
    const due = q.deadlineLabel && q.deadlineLabel !== '本週內' ? ` 📅 ${q.deadlineLabel.replace(/（.*）/, '').trim()}` : '';
    out.push(`## ${q.title}${tierTok[q.tier] || ''}${due}`);
    if (q.reason) out.push(`> ${q.reason}`);
    for (const o of q.objectives) out.push(`- [${o.done ? 'x' : ' '}] ${o.text}`);
    out.push('');
  }
  for (const d of p.days) {
    const [, m, dd] = d.date.split('-').map(Number);
    out.push(`## ${d.label.replace(/\s*\d{1,2}\/\d{1,2}\s*$/, '')} ${m}/${dd}${d.theme ? `｜${d.theme}` : ''}`);
    for (const r of d.rows) {
      const slot = r.slot.replace(/\s/g, '');
      if (d.branch) {
        // 分支日（資料已到／未到）：兩條路線都寫出來，讓人自己刪一條
        out.push(`- ${slot} ${r.a}${r.b && r.b !== r.a && r.b !== '同左' ? `（若${d.columns[2]}：${r.b}）` : ''}`);
      } else {
        out.push(`- ${slot} ${r.a}${r.b ? ` → ${r.b}` : ''}`);
      }
    }
    // 這一天的決策點
    for (const dec of p.decisions.filter((x) => x.at.startsWith(d.date))) {
      out.push(`- ⏰ ${dec.at.slice(11, 16)} ${dec.condition}${dec.action ? ` → ${dec.action}` : ''}`);
    }
    out.push('');
  }
  // 不在任何一天的決策點
  for (const dec of p.decisions.filter((x) => !p.days.some((d) => x.at.startsWith(d.date)))) {
    const [, m, dd] = dec.at.slice(0, 10).split('-').map(Number);
    out.push(`⏰ ${m}/${dd} ${dec.at.slice(11, 16)} ${dec.condition}${dec.action ? ` → ${dec.action}` : ''}`);
  }
  const logs = p.progressLog.filter((r) => r.done || r.blocker || r.next);
  if (logs.length) {
    out.push('', '## 進度紀錄', '');
    for (const r of logs) {
      const [, m, dd] = r.date.split('-').map(Number);
      out.push(`- ${m}/${dd}｜完成：${r.done}｜卡點：${r.blocker}｜明日：${r.next}`);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  if (!src) { console.error('用法：node tools/convert_plan.js 舊檔.md [新檔.md]'); process.exit(1); }
  const result = convert(fs.readFileSync(src, 'utf8'));
  if (dst) { fs.writeFileSync(dst, result, 'utf8'); console.log(`已轉換 → ${path.resolve(dst)}`); }
  else process.stdout.write(result);
}

module.exports = { convert };
