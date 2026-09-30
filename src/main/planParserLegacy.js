// 舊版週報格式的解析器（只給 tools/convert_plan.js 轉檔用）
// 支援格式：參考 plans/_template.md 與 plans/week_sample.md
'use strict';

const TIER_BY_TYPE = { '必達': 'main', '主攻': 'major', '附帶': 'side' };

function unescapeMd(s) {
  return String(s || '')
    .replace(/\\([_*|`#\[\]()~>-])/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .trim();
}

function splitRow(line) {
  // 以未跳脫的 | 切欄位
  const cells = [];
  let cur = '';
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim());
}

// 從 lines[start] 開始讀一張表；回傳 {header, rows:[{cells, line}], end}
function readTable(lines, start) {
  let i = start;
  while (i < lines.length && !lines[i].trim().startsWith('|')) {
    if (/^#{1,6}\s/.test(lines[i])) return null;
    i++;
  }
  if (i >= lines.length) return null;
  const header = splitRow(lines[i]).map(unescapeMd);
  i++;
  if (i < lines.length && isSeparatorRow(lines[i])) i++;
  const rows = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    rows.push({ cells: splitRow(lines[i]), line: i });
    i++;
  }
  return { header, rows, end: i };
}

function toISO(year, m, d) {
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseMonthDay(text, year) {
  const m = String(text || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return null;
  return toISO(year, +m[1], +m[2]);
}

function detectYear(lines) {
  for (const l of lines.slice(0, 8)) {
    const m = l.match(/\b(20\d{2})\b/);
    if (m) return +m[1];
  }
  return new Date().getFullYear();
}

function parsePlan(content, sourcePath = '') {
  const text = String(content).replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const year = detectYear(lines);
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  const title = titleLine ? unescapeMd(titleLine.replace(/^#\s+/, '')) : '未命名計畫';

  const plan = {
    title, year, sourcePath,
    quests: [], days: [], decisions: [], progressLog: [], overview: [],
    weekStart: null, weekEnd: null,
  };

  // 1) 總覽表：表頭含「項目」與「定位」
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    const t = readTable(lines, i);
    if (!t) continue;
    const h = t.header.join('|');
    if (/項目/.test(h) && /定位/.test(h)) {
      const col = (name) => t.header.findIndex((x) => x.includes(name));
      const cNum = t.header.findIndex((x) => x === '#' || x === '編號');
      const cItem = col('項目'), cType = col('定位'), cDue = col('完成'), cWhy = col('理由');
      for (const r of t.rows) {
        const c = r.cells.map(unescapeMd);
        plan.overview.push({
          num: cNum >= 0 ? c[cNum] : String(plan.overview.length + 1),
          item: c[cItem] || '', type: c[cType] || '主攻',
          deadline: parseMonthDay(c[cDue], year), deadlineLabel: c[cDue] || '',
          reason: cWhy >= 0 ? c[cWhy] : '',
        });
      }
      break;
    }
    i = t.end;
  }

  // 2) 依章節掃描
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) { section = h2[1]; continue; }

    // 每日時間表
    const h3 = line.match(/^###\s+(.+)/);
    if (h3 && /時間表|每日/.test(section)) {
      const label = unescapeMd(h3[1]);
      const [dayPart, theme = ''] = label.split(/[｜|]/);
      const date = parseMonthDay(dayPart, year);
      const t = readTable(lines, i + 1);
      const day = { date, label: dayPart.trim(), theme: theme.trim(), columns: [], rows: [], branch: false };
      if (t) {
        day.columns = t.header;
        day.branch = t.header.some((x) => /已到|未到|分支/.test(x));
        t.rows.forEach((r, idx) => {
          const c = r.cells.map(unescapeMd);
          day.rows.push({ id: `${date}-${idx}`, slot: c[0], a: c[1] || '', b: c[2] || '' });
        });
        i = t.end - 1;
      }
      plan.days.push(day);
      continue;
    }

    // 決策點
    if (/決策|風險/.test(section)) {
      const m = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*(?:→|->)\s*(.+)$/);
      if (m) {
        const head = unescapeMd(m[1]);
        const md = head.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
        const tm = head.match(/(\d{1,2}):(\d{2})/);
        if (md) {
          const date = toISO(year, +md[1], +md[2]);
          const hh = tm ? tm[1].padStart(2, '0') : '09';
          const mm = tm ? tm[2] : '00';
          const cond = head.replace(/^.*?\d{1,2}:\d{2}\s*/, '').replace(/^\d{1,2}\/\d{1,2}[^\s]*\s*/, '');
          plan.decisions.push({
            id: `d-${date}-${hh}${mm}`, at: `${date}T${hh}:${mm}:00`,
            label: head, condition: cond.trim(), action: unescapeMd(m[2]),
          });
        }
      }
      continue;
    }

    // 任務清單
    if (/任務清單|驗收/.test(section)) {
      const qh = line.match(/^\*\*(.+?)\*\*\s*$/);
      if (qh) {
        const raw = unescapeMd(qh[1]);
        const mm = raw.match(/^(\d+)\s*[｜|]\s*(.+)$/);
        const num = mm ? mm[1] : null;
        const qtitle = mm ? mm[2].trim() : raw;
        const ov = num ? plan.overview.find((o) => o.num === num) : null;
        const type = ov ? ov.type : (/附帶|支線|其他/.test(raw) ? '附帶' : '主攻');
        const quest = {
          id: num ? `q${num}` : `s${plan.quests.filter((x) => !x.num).length + 1}`,
          num, title: num ? qtitle : `${qtitle}任務`, fullTitle: ov ? ov.item : qtitle,
          type, tier: TIER_BY_TYPE[type] || 'major',
          deadline: ov ? ov.deadline : null, deadlineLabel: ov ? ov.deadlineLabel : '',
          reason: ov ? ov.reason : '', objectives: [], headerLine: i,
        };
        let j = i + 1;
        while (j < lines.length && !/^\*\*.+\*\*\s*$/.test(lines[j]) && !/^#{1,6}\s/.test(lines[j])) {
          const cb = lines[j].match(/^(\s*[-*]\s+\[)([ xX])(\]\s+)(.+)$/);
          if (cb) {
            quest.objectives.push({
              id: `${quest.id}-o${quest.objectives.length}`,
              text: unescapeMd(cb[4]), raw: cb[4], done: cb[2] !== ' ', line: j,
            });
          }
          j++;
        }
        plan.quests.push(quest);
        i = j - 1;
      }
      continue;
    }

    // 進度紀錄
    if (/進度紀錄|進度記錄|日誌/.test(section) && line.trim().startsWith('|')) {
      const t = readTable(lines, i);
      if (t) {
        for (const r of t.rows) {
          const c = r.cells.map(unescapeMd);
          plan.progressLog.push({
            date: parseMonthDay(c[0], year), label: c[0],
            done: c[1] || '', blocker: c[2] || '', next: c[3] || '', line: r.line,
          });
        }
        i = t.end - 1;
      }
    }
  }

  // 週起訖
  const dates = [...plan.days.map((d) => d.date), ...plan.progressLog.map((p) => p.date)].filter(Boolean).sort();
  plan.weekStart = dates[0] || null;
  plan.weekEnd = dates[dates.length - 1] || null;
  // 沒有截止日的任務 → 週末最後一天
  for (const q of plan.quests) {
    if (!q.deadline) { q.deadline = plan.weekEnd; q.deadlineLabel = q.deadlineLabel || '本週內'; }
  }
  return plan;
}

// ---- 回寫 ----

// 切換某任務某目標的勾選狀態；以文字比對確認行號正確
function setObjective(content, questId, objectiveIndex, done) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const plan = parsePlan(content);
  const q = plan.quests.find((x) => x.id === questId);
  if (!q) throw new Error(`找不到任務 ${questId}`);
  const o = q.objectives[objectiveIndex];
  if (!o) throw new Error(`找不到目標 ${questId}#${objectiveIndex}`);
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  lines[o.line] = lines[o.line].replace(/^(\s*[-*]\s+\[)[ xX](\])/, `$1${done ? 'x' : ' '}$2`);
  return lines.join(eol);
}

function cellText(s) {
  return String(s || '').replace(/\r?\n/g, '；').replace(/\|/g, '／').trim();
}

// 寫入某日進度紀錄（日期 ISO），欄位：done / blocker / next
function setProgress(content, dateISO, { done, blocker, next }) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const plan = parsePlan(content);
  const row = plan.progressLog.find((p) => p.date === dateISO);
  if (!row) throw new Error(`進度紀錄表沒有 ${dateISO} 這一列`);
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const cells = splitRow(lines[row.line]);
  while (cells.length < 4) cells.push('');
  if (done !== undefined) cells[1] = cellText(done);
  if (blocker !== undefined) cells[2] = cellText(blocker);
  if (next !== undefined) cells[3] = cellText(next);
  lines[row.line] = `| ${cells.join(' | ')} |`;
  return lines.join(eol);
}

module.exports = { parsePlan, setObjective, setProgress, unescapeMd };
