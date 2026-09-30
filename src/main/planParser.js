// 週計畫 Markdown：寬鬆解析＋回寫
//
// 讀得懂的東西（每一項都可以省略）：
//   # 標題                      第一個 # 是計畫名稱（每週要不一樣）
//   ## 任務名 ⭐ 📅 10/6          一個 ## 就是一個任務；⭐必達／🔧主攻／🌿順手；日期是截止日
//   > 一句話                    任務下一行的引用 → 派任務時的台詞
//   - [ ] 目標                  任務底下的勾選清單 → 目標
//   - [ ] 單獨一行 🔽 📅 10/9     不在任務底下的勾選 → 自己就是一個任務（縮排的子項是它的目標）
//                               任務的目標寫完空一行，後面的勾選就算獨立任務
//   ## 待辦 / ## Tasks           沒有 ⭐🔧🌿 或日期的標題只是分組，底下每一行各算一個任務（## 順手 底下預設是附帶）
//   ## 週二 10/6｜主題           有星期或「日期｜」的標題 → 一天的時間表
//   - 09:00–10:30 做某事 → 產出   時間表的一格
//   - ⏰ 17:00 條件 → 應對       提醒（沒寫日期就用所在那一天的日期）
//   ## 進度紀錄                  程式自動維護，不用自己寫
// Obsidian Tasks 記號：📅 截止、⏫🔺 必達、🔼 主攻、🔽⏬ 順手、✅ 完成日（勾選時會自動加）
'use strict';

const path = require('path');

const TIER_NAME = { main: '必達', major: '主攻', side: '附帶' };
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

const RE_DATE_ISO = /(20\d{2})-(\d{1,2})-(\d{1,2})/;
const RE_DATE_MD = /(?<![\d:])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/;
const RE_WEEKDAY = /(週|星期|禮拜)\s*[一二三四五六日天]|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/i;
const RE_TIME_RANGE = /(\d{1,2}):(\d{2})\s*[–\-~～到至]\s*(\d{1,2}):(\d{2})/;
const RE_TIME_ONE = /^(\d{1,2}):(\d{2})\b/;
const RE_CHECK = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const RE_LIST = /^(\s*)[-*+]\s+(?!\[[ xX]\])(.*)$/;
const RE_REMINDER = /^(?:⏰|🔔|提醒[:：]?)\s*(?:(\d{1,2})\s*\/\s*(\d{1,2})\s+)?(\d{1,2}):(\d{2})\s*(.+?)(?:\s*(?:→|->|=>)\s*(.+))?$/;

// 第一個 regex 用來判斷類型（文字也算），第二個是會從標題裡拿掉的符號（文字保留，「附帶任務」還是叫附帶任務）
const TIER_TOKENS = [
  [/⭐|★|🔺|⏫|必達|主線/u, /⭐|★|🔺|⏫/gu, 'main'],
  [/🔧|🔼|主攻/u, /🔧|🔼/gu, 'major'],
  [/🌿|🔽|⏬|順手|附帶|支線/u, /🌿|🔽|⏬/gu, 'side'],
];

function pad(n) { return String(n).padStart(2, '0'); }
// 短雜湊：任務／目標的 id 用標題算，刪掉中間的任務不會讓後面的任務換 id（存檔才對得上）
function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}
function iso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function todayISO(now = new Date()) { return iso(now.getFullYear(), now.getMonth() + 1, now.getDate()); }

// 從一段文字抓日期（優先 ISO，再 M/D）；回傳 { iso, label, rest }
function takeDate(text, year) {
  let m = text.match(RE_DATE_ISO);
  if (m) return { iso: iso(+m[1], +m[2], +m[3]), label: `${+m[2]}/${+m[3]}`, rest: text.replace(m[0], ' ') };
  m = text.match(RE_DATE_MD);
  if (m) return { iso: iso(year, +m[1], +m[2]), label: `${+m[1]}/${+m[2]}`, rest: text.replace(m[0], ' ') };
  return { iso: null, label: '', rest: text };
}

function detectYear(lines) {
  for (const l of lines.slice(0, 10)) { const m = l.match(/\b(20\d{2})\b/); if (m) return +m[1]; }
  return new Date().getFullYear();
}

function cleanTitle(s) {
  return s.replace(/📅|✅|⏳|🛫|➕|🔁/gu, ' ').replace(/\s*[｜|：:]\s*$/, '').replace(/\s{2,}/g, ' ').replace(/^[\s｜|：:\-–—]+|[\s｜|：:\-–—]+$/g, '').trim();
}

// 解析任務標題／單行任務裡的記號
function parseQuestTokens(text, year, { bareDate = true } = {}) {
  let tier = 'major', explicitTier = false;
  let s = text;
  for (const [re, strip, t] of TIER_TOKENS) {
    if (re.test(s)) { tier = t; explicitTier = true; s = s.replace(strip, ' '); }
  }
  let deadline = null, deadlineLabel = '';
  // 📅 後面的日期一定是截止日；沒有 📅 的裸日期只在標題／任務行才算（目標裡的「8/8 小時」不是日期）
  const dm = s.match(/📅\s*((20\d{2})-(\d{1,2})-(\d{1,2})|(\d{1,2})\s*\/\s*(\d{1,2}))/u) || (bareDate ? s.match(/(?<![\d:])((20\d{2})-(\d{1,2})-(\d{1,2})|(\d{1,2})\s*\/\s*(\d{1,2}))(?![\d/])/) : null);
  if (dm) {
    const d = takeDate(dm[1], year);
    deadline = d.iso; deadlineLabel = d.label;
    s = s.replace(dm[0], ' ');
  }
  // Obsidian 的完成日／其他記號拿掉
  s = s.replace(/✅\s*20\d{2}-\d{1,2}-\d{1,2}/gu, ' ').replace(/(⏳|🛫|➕)\s*20\d{2}-\d{1,2}-\d{1,2}/gu, ' ').replace(/🔁[^\s]*/gu, ' ');
  return { title: cleanTitle(s), tier, explicitTier, deadline, deadlineLabel };
}

// 是不是「一天」的標題：有星期字樣，或「日期｜主題」，或只有日期
function parseDayHeading(text, year) {
  const d = takeDate(text, year);
  if (!d.iso) return null;
  const hasWeekday = RE_WEEKDAY.test(text);
  const rest = d.rest.replace(RE_WEEKDAY, ' ').trim();
  const startsWithSep = /^[｜|：:\-–—]/.test(rest);
  const remaining = cleanTitle(rest);
  if (!hasWeekday && !startsWithSep && remaining) return null; // 例如「10/1 試吃會」是任務不是日期
  const wd = WEEKDAY_ZH[new Date(d.iso + 'T00:00:00').getDay()];
  return { date: d.iso, label: `週${wd} ${d.label}`, theme: remaining };
}

function parseSlot(text) {
  let m = text.match(RE_TIME_RANGE);
  if (m) return { start: `${pad(m[1])}:${m[2]}`, end: `${pad(m[3])}:${m[4]}`, slot: `${pad(m[1])}:${m[2]}–${pad(m[3])}:${m[4]}`, rest: text.replace(m[0], '').trim() };
  m = text.match(RE_TIME_ONE);
  if (m) return { start: `${pad(m[1])}:${m[2]}`, end: null, slot: `${pad(m[1])}:${m[2]}`, rest: text.slice(m[0].length).trim() };
  return null;
}

function splitOutput(text) {
  const m = text.match(/^(.*?)\s*(?:→|->|=>)\s*(.+)$/);
  return m ? { text: m[1].trim(), output: m[2].trim() } : { text: text.trim(), output: '' };
}

// ---------------------------------------------------------------- 解析
function parsePlan(content, sourcePath = '') {
  const text = String(content).replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const year = detectYear(lines);
  const plan = {
    title: '', year, sourcePath, quests: [], days: [], decisions: [], progressLog: [],
    weekStart: null, weekEnd: null, sections: { progressLine: -1, firstDayLine: -1, lastQuestEnd: -1 },
  };

  let ctx = null;            // { kind: 'quest'|'day'|'progress'|'none', obj }
  let lastQuestLine = null;  // 單行任務用：記錄上一個頂層 checkbox 的縮排與物件
  let inCode = false;

  const usedIds = new Set();
  const newQuest = (info, line) => {
    let id = `q-${shortHash(info.title || '')}`;
    while (usedIds.has(id)) id += 'x'; // 同名任務
    usedIds.add(id);
    const q = {
      id, num: String(plan.quests.length + 1),
      title: info.title || '（未命名任務）', fullTitle: info.title, type: TIER_NAME[info.tier], tier: info.tier,
      deadline: info.deadline, deadlineLabel: info.deadlineLabel, reason: '', objectives: [], headerLine: line, endLine: line, noteLine: -1, inline: !!info.inline,
    };
    plan.quests.push(q);
    return q;
  };
  const addObjective = (q, text, done, line) => {
    const t = cleanTitle(parseQuestTokens(text, year, { bareDate: false }).title) || text.trim();
    let id = `${q.id}-${shortHash(t)}`;
    while (q.objectives.some((o) => o.id === id)) id += 'x';
    q.objectives.push({ id, text: t, raw: text, done, line, indent: (line >= 0 && lines[line].match(/^\s*/)[0].length) || 0 });
    q.endLine = line;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;

    const h1 = line.match(/^#\s+(.+)/);
    if (h1 && !plan.title) { plan.title = cleanTitle(h1[1]); ctx = { kind: 'none' }; continue; }

    const h = line.match(/^(#{2,4})\s+(.+)/);
    if (h) {
      const t = h[2].trim();
      lastQuestLine = null;
      if (/^進度紀錄|^進度記錄|^日誌/.test(t)) { ctx = { kind: 'progress' }; plan.sections.progressLine = i; continue; }
      const day = parseDayHeading(t, year);
      if (day) {
        const d = { ...day, columns: ['時段', '區塊', '產出'], rows: [], branch: false, headerLine: i };
        plan.days.push(d); ctx = { kind: 'day', obj: d };
        if (plan.sections.firstDayLine < 0) plan.sections.firstDayLine = i;
        continue;
      }
      const info = parseQuestTokens(t, year);
      // 有 ⭐🔧🌿 或日期的標題才是一個任務；純文字標題（例如「## 待辦」「## Tasks」）是分組，底下每一行各算一個任務
      const onlyGroupWord = /^(必達|主線|主攻|順手|附帶|支線|待辦|其他|任務|tasks?|todo)$/i.test(info.title);
      const isQuest = info.title && !onlyGroupWord && (info.explicitTier || info.deadline);
      if (isQuest) { const q = newQuest(info, i); ctx = { kind: 'quest', obj: q }; }
      else ctx = { kind: 'group', tier: info.explicitTier ? info.tier : 'major', name: onlyGroupWord ? '' : info.title };
      continue;
    }

    // 任務的台詞（標題下的引用）；分組標題底下直接接 > 的話，代表作者想把它當一個任務
    if (ctx && ctx.kind === 'group' && ctx.name && /^\s*>\s*/.test(line) && !ctx.used) {
      const q = newQuest({ title: ctx.name, tier: ctx.tier, deadline: null, deadlineLabel: '' }, i - 1);
      ctx = { kind: 'quest', obj: q };
    }
    if (ctx && ctx.kind === 'quest' && /^\s*>\s*/.test(line) && !ctx.obj.objectives.length && !ctx.obj.reason) {
      ctx.obj.reason = line.replace(/^\s*>\s*/, '').trim(); ctx.obj.noteLine = i; ctx.obj.endLine = i; continue;
    }

    // 提醒（任何地方都可以寫）
    const stripped = line.replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, '');
    const rm = stripped.match(RE_REMINDER);
    if (rm) {
      let date = ctx && ctx.kind === 'day' ? ctx.obj.date : null;
      if (rm[1]) date = iso(year, +rm[1], +rm[2]);
      if (date) {
        const hh = pad(rm[3]), mm = rm[4];
        const cond = rm[5].trim(), action = (rm[6] || '').trim();
        plan.decisions.push({ id: `d-${date}-${hh}${mm}-${plan.decisions.length}`, at: `${date}T${hh}:${mm}:00`, date, time: `${hh}:${mm}`, label: `${+date.slice(5, 7)}/${+date.slice(8, 10)} ${hh}:${mm} ${cond}`, condition: cond, action, line: i });
      }
      continue;
    }

    // 進度紀錄：- 10/6｜完成：…｜卡點：…｜明日：…  或舊表格 | 10/6 二 | … |
    if (ctx && ctx.kind === 'progress') {
      let m = line.match(/^\s*[-*+]\s+(.+)$/);
      if (m) {
        const parts = m[1].split(/[｜|]/).map((s) => s.trim());
        const d = takeDate(parts[0] || '', year);
        if (d.iso) {
          const get = (k) => (parts.find((p) => p.startsWith(k)) || '').replace(new RegExp(`^${k}[:：]?\\s*`), '');
          plan.progressLog.push({ date: d.iso, label: parts[0], done: get('完成'), blocker: get('卡點'), next: get('明日'), line: i });
        }
        continue;
      }
      if (line.trim().startsWith('|') && !/^\|?\s*-/.test(line.trim()) && !/日期/.test(line)) {
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
        const d = takeDate(cells[0] || '', year);
        if (d.iso) plan.progressLog.push({ date: d.iso, label: cells[0], done: cells[1] || '', blocker: cells[2] || '', next: cells[3] || '', line: i });
      }
      continue;
    }

    // 一天的時間表：- 09:00–10:30 做某事 → 產出（也接受 - [ ] 開頭）
    if (ctx && ctx.kind === 'day') {
      const cm = line.match(RE_CHECK); const lm = line.match(RE_LIST);
      const body = cm ? cm[3] : lm ? lm[2] : null;
      if (body !== null) {
        const slot = parseSlot(body);
        if (slot) {
          const { text: blk, output } = splitOutput(slot.rest);
          ctx.obj.rows.push({ id: `${ctx.obj.date}-${ctx.obj.rows.length}`, slot: slot.slot, start: slot.start, end: slot.end, a: blk, b: output, done: cm ? cm[2] !== ' ' : undefined, line: i });
          continue;
        }
      }
      continue;
    }

    // 勾選清單
    const cm = line.match(RE_CHECK);
    if (cm) {
      const indent = cm[1].length, done = cm[2] !== ' ', body = cm[3];
      if (ctx && ctx.kind === 'quest') { addObjective(ctx.obj, body, done, i); continue; }
      // 不在任務標題底下：頂層 → 單行任務；縮排 → 上一個單行任務的目標
      if (lastQuestLine && indent > lastQuestLine.indent) {
        const q = lastQuestLine.obj;
        if (q.implicit) { q.objectives = []; q.implicit = false; } // 有子項就不用隱含目標
        addObjective(q, body, done, i);
        continue;
      }
      const info = parseQuestTokens(body, year);
      if (!info.explicitTier && ctx && ctx.kind === 'group') info.tier = ctx.tier; // 「## 順手」底下的任務預設是附帶
      if (ctx && ctx.kind === 'group') ctx.used = true;
      const q = newQuest({ ...info, inline: true }, i);
      q.implicit = true; q.indent = indent;
      q.objectives.push({ id: `${q.id}-${shortHash(q.title)}`, text: q.title, raw: body, done, line: i, implicit: true, indent });
      lastQuestLine = { indent, obj: q };
      continue;
    }
    if (line.trim() === '') {
      // 任務的目標寫完後空一行，接下來的頂層勾選就是獨立任務（目標之前的空行不算）
      if (ctx && ctx.kind === 'quest' && ctx.obj.objectives.length) ctx = { kind: 'group', tier: 'major', name: '' };
      continue; // 空行不中斷單行任務的子項
    }
    lastQuestLine = null;
  }

  if (!plan.title) plan.title = sourcePath ? path.basename(sourcePath, path.extname(sourcePath)) : '未命名計畫';
  plan.sections.lastQuestEnd = Math.max(-1, ...plan.quests.map((q) => q.endLine));

  // 週起訖：標題的 10/5–10/9、各天日期、任務截止日
  const range = plan.title.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*[–\-~～]\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  const dates = [...plan.days.map((d) => d.date), ...plan.quests.map((q) => q.deadline).filter(Boolean)];
  if (range) dates.push(iso(year, +range[1], +range[2]), iso(year, +range[3], +range[4]));
  dates.sort();
  plan.weekStart = dates[0] || null; plan.weekEnd = dates[dates.length - 1] || null;
  for (const q of plan.quests) if (!q.deadline && plan.weekEnd) { q.deadline = plan.weekEnd; q.deadlineLabel = '本週內'; }
  for (const d of plan.days) d.rows.sort((a, b) => a.start.localeCompare(b.start));
  return plan;
}

// ---------------------------------------------------------------- 回寫
function eolOf(content) { return content.includes('\r\n') ? '\r\n' : '\n'; }
function splitLines(content) { return content.replace(/\r\n/g, '\n').split('\n'); }

// 勾選／取消目標：改 [ ]／[x]，並照 Obsidian 慣例加上 ✅ 完成日
function setObjective(content, questId, objectiveIndex, done, now = new Date()) {
  const eol = eolOf(content);
  const plan = parsePlan(content);
  const q = plan.quests.find((x) => x.id === questId);
  if (!q) throw new Error(`找不到任務 ${questId}`);
  const o = q.objectives[objectiveIndex];
  if (!o) throw new Error(`找不到目標 ${questId}#${objectiveIndex}`);
  const lines = splitLines(content);
  let l = lines[o.line].replace(/^(\s*[-*+]\s+\[)[ xX](\])/, `$1${done ? 'x' : ' '}$2`);
  l = l.replace(/\s*✅\s*20\d{2}-\d{1,2}-\d{1,2}/u, '');
  if (done) l = `${l.trimEnd()} ✅ ${todayISO(now)}`;
  lines[o.line] = l;
  return lines.join(eol);
}

function cellText(s) { return String(s || '').replace(/\r?\n/g, '；').replace(/[｜|]/g, '／').trim(); }

// 寫某天的進度紀錄；沒有這一段就自動在檔案最後建立。整段重排：標題、空行、依日期排序的各天
function setProgress(content, dateISO, { done, blocker, next }) {
  const eol = eolOf(content);
  let lines = splitLines(content);
  let plan = parsePlan(lines.join('\n'));
  if (plan.sections.progressLine < 0) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', '## 進度紀錄', '');
    plan = parsePlan(lines.join('\n'));
  }
  const entries = new Map(plan.progressLog.map((p) => [p.date, { done: p.done, blocker: p.blocker, next: p.next }]));
  const prev = entries.get(dateISO) || { done: '', blocker: '', next: '' };
  entries.set(dateISO, {
    done: cellText(done !== undefined ? done : prev.done),
    blocker: cellText(blocker !== undefined ? blocker : prev.blocker),
    next: cellText(next !== undefined ? next : prev.next),
  });
  const rows = [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, e]) => {
    const [, m, dd] = d.split('-').map(Number);
    return `- ${m}/${dd}｜完成：${e.done}｜卡點：${e.blocker}｜明日：${e.next}`;
  });
  // 這一段到下一個標題（或檔尾）為止，整段換掉
  const from = plan.sections.progressLine;
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++) if (/^#{1,6}\s/.test(lines[i])) { to = i; break; }
  const tail = lines.slice(to);
  lines = [...lines.slice(0, from), '## 進度紀錄', '', ...rows, ...(tail.length ? ['', ...tail] : [])];
  return lines.join(eol);
}

function questHeading(q) {
  // 一定要有記號：沒有記號又沒有日期的標題會被當成「分組」，底下每行都變成一個任務
  const tok = q.tier === 'main' ? ' ⭐' : q.tier === 'side' ? ' 🌿' : ' 🔧';
  const due = q.deadlineLabel ? ` 📅 ${q.deadlineLabel}` : '';
  return `## ${q.title}${tok}${due}`;
}

// 新增任務：放在最後一個任務後面（在每日時間表之前）
function addQuest(content, { title, tier = 'major', deadlineLabel = '', objectives = [], note = '' }) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const plan = parsePlan(lines.join('\n'));
  const block = [questHeading({ title: cleanTitle(title), tier, deadlineLabel }), ...(note ? [`> ${note.trim()}`] : []), ...objectives.map((o) => `- [ ] ${cleanTitle(o)}`).filter((o) => o !== '- [ ] ')];
  let at;
  if (plan.sections.lastQuestEnd >= 0) at = plan.sections.lastQuestEnd + 1;
  else if (plan.sections.firstDayLine >= 0) at = plan.sections.firstDayLine;
  else if (plan.sections.progressLine >= 0) at = plan.sections.progressLine;
  else at = lines.length;
  lines.splice(at, 0, '', ...block);
  return lines.join(eol).replace(/\n{3,}/g, '\n\n');
}

function dayHeading(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  return `## 週${WEEKDAY_ZH[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

// 找到某天的段落（沒有就建立），回傳 { lines, insertAt }（insertAt = 該段落最後一行的下一行）
function ensureDay(lines, dateISO) {
  const plan = parsePlan(lines.join('\n'));
  const day = plan.days.find((d) => d.date === dateISO);
  if (day) {
    let end = day.headerLine + 1;
    for (let i = day.headerLine + 1; i < lines.length; i++) {
      if (/^#{1,6}\s/.test(lines[i])) break;
      if (lines[i].trim()) end = i + 1;
    }
    return end;
  }
  // 依日期順序插在其他天之間；沒有任何一天就放在進度紀錄前（或檔尾）
  let at = plan.sections.progressLine >= 0 ? plan.sections.progressLine : lines.length;
  const later = plan.days.filter((d) => d.date > dateISO).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (later) at = later.headerLine;
  lines.splice(at, 0, dayHeading(dateISO), '', '');
  return at + 1;
}

// 新增時段：- 09:00–10:30 做某事 → 產出（照時間順序插進那一天）
function addScheduleRow(content, dateISO, { start, end, text, output = '' }) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  let at = ensureDay(lines, dateISO);
  const day = parsePlan(lines.join('\n')).days.find((d) => d.date === dateISO);
  const later = day && day.rows.filter((r) => r.start > start).sort((a, b) => a.line - b.line)[0];
  if (later) at = later.line;
  const row = `- ${start}${end ? `–${end}` : ''} ${cleanTitle(text)}${output ? ` → ${cleanTitle(output)}` : ''}`;
  lines.splice(at, 0, row);
  return lines.join(eol).replace(/\n{3,}/g, '\n\n');
}

// 改某一天標題的主題：## 週二 10/6｜主題（那一天不存在就建立；theme 給空字串就拿掉主題）
function setDayTheme(content, dateISO, theme) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  ensureDay(lines, dateISO);
  const day = parsePlan(lines.join('\n')).days.find((d) => d.date === dateISO);
  const m = lines[day.headerLine].match(/^(#{2,4}\s+)(.*)$/);
  const idx = m[2].search(/[｜|]/);
  const base = (idx >= 0 ? m[2].slice(0, idx) : m[2]).trim();
  const t = String(theme || '').trim().replace(/[｜|]/g, '／');
  lines[day.headerLine] = `${m[1]}${base}${t ? `｜${t}` : ''}`;
  return lines.join(eol).replace(/\n{3,}/g, '\n\n');
}

// 新增提醒：- ⏰ 17:00 條件 → 應對（放進那一天的段落）
function addReminder(content, { at, text, action = '' }) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const [dateISO, time] = at.split('T');
  const pos = ensureDay(lines, dateISO);
  lines.splice(pos, 0, `- ⏰ ${time.slice(0, 5)} ${cleanTitle(text)}${action ? ` → ${cleanTitle(action)}` : ''}`);
  return lines.join(eol).replace(/\n{3,}/g, '\n\n');
}

function inlineLine(q, { title, tier, deadlineLabel }, oldLine) {
  // 單行任務：保留 - [x] 與 ✅ 日期，換掉文字與記號
  const m = oldLine.match(/^(\s*[-*+]\s+\[[ xX]\]\s+)/);
  const doneTag = (oldLine.match(/\s*✅\s*20\d{2}-\d{1,2}-\d{1,2}/u) || [''])[0];
  const tok = tier === 'main' ? ' ⭐' : tier === 'side' ? ' 🌿' : '';
  const due = deadlineLabel ? ` 📅 ${deadlineLabel}` : '';
  return `${m ? m[1] : '- [ ] '}${cleanTitle(title)}${tok}${due}${doneTag}`;
}

// 編輯任務的名稱／類型／截止／台詞（目標不動）
function editQuest(content, questId, fields) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const plan = parsePlan(lines.join('\n'));
  const q = plan.quests.find((x) => x.id === questId);
  if (!q) throw new Error(`找不到任務 ${questId}`);
  const f = { title: q.title, tier: q.tier, deadlineLabel: q.deadlineLabel === '本週內' ? '' : q.deadlineLabel, note: q.reason, ...fields };
  if (q.inline) {
    lines[q.headerLine] = inlineLine(q, f, lines[q.headerLine]);
  } else {
    lines[q.headerLine] = questHeading({ title: f.title, tier: f.tier, deadlineLabel: f.deadlineLabel });
    if (q.noteLine >= 0) { if (f.note) lines[q.noteLine] = `> ${f.note.trim()}`; else lines.splice(q.noteLine, 1); }
    else if (f.note) lines.splice(q.headerLine + 1, 0, `> ${f.note.trim()}`);
  }
  return lines.join(eol);
}

// 刪除整個任務（標題、台詞、所有目標）
function deleteQuest(content, questId) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const plan = parsePlan(lines.join('\n'));
  const q = plan.quests.find((x) => x.id === questId);
  if (!q) throw new Error(`找不到任務 ${questId}`);
  const from = q.headerLine;
  let to = q.endLine;
  if (lines[to + 1] !== undefined && lines[to + 1].trim() === '' && (lines[from - 1] === undefined || lines[from - 1].trim() === '')) to++; // 連帶一個空行
  lines.splice(from, to - from + 1);
  return lines.join(eol);
}

// 幫任務加一個目標
function addObjectiveLine(content, questId, text) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const plan = parsePlan(lines.join('\n'));
  const q = plan.quests.find((x) => x.id === questId);
  if (!q) throw new Error(`找不到任務 ${questId}`);
  if (q.inline) { // 單行任務：子項縮排兩格，之後它自己那一行就變成任務名
    const last = q.implicit ? q.headerLine : q.endLine;
    lines.splice(last + 1, 0, `${' '.repeat((q.indent || 0) + 2)}- [ ] ${cleanTitle(text)}`);
  } else {
    lines.splice(q.endLine + 1, 0, `- [ ] ${cleanTitle(text)}`);
  }
  return lines.join(eol);
}

function deleteObjective(content, questId, index) {
  const plan = parsePlan(content);
  const q = plan.quests.find((x) => x.id === questId);
  if (!q) throw new Error(`找不到任務 ${questId}`);
  const o = q.objectives[index];
  if (!o) throw new Error('找不到目標');
  if (o.implicit) return deleteQuest(content, questId); // 單行任務的唯一目標就是它本身
  return removeLine(content, o.line);
}

// 時段做完了：那一行改成 - [x] 09:00–10:30 …（沒有勾選框的話會補上）
function setScheduleDone(content, lineNo, done) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const l = lines[lineNo];
  if (l === undefined) throw new Error('找不到那一格');
  const m = l.match(/^(\s*[-*+]\s+)(\[[ xX]\]\s+)?(.*)$/);
  if (!m) return content;
  lines[lineNo] = `${m[1]}[${done ? 'x' : ' '}] ${m[3]}`;
  return lines.join(eol);
}

// 移除某一行（刪任務目標／時段／提醒用）
function removeLine(content, lineNo) {
  const eol = eolOf(content);
  const lines = splitLines(content);
  lines.splice(lineNo, 1);
  return lines.join(eol);
}

module.exports = { parsePlan, setObjective, setProgress, addQuest, editQuest, deleteQuest, addObjective: addObjectiveLine, deleteObjective, addScheduleRow, setDayTheme, addReminder, setScheduleDone, removeLine, parseQuestTokens, parseDayHeading, shortHash, unescapeMd: cleanTitle };
