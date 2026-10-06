// 📖 冒險日誌＋工作週報（純函式，不碰檔案）
// 每份週計畫算一週：任務、目標、每天的下班回報（計畫檔）＋經驗值、金幣、專注、運勢（存檔的 history）
// 週報草稿依「專案」分類（計畫檔的 #專案 或分組標題；沒有的歸在「其他」），每類列 Done／On-progress／Pending
'use strict';

const G = require('./game');
const { sim } = require('./memory');

const DAY = 86400000;
const DEFAULTS = {
  enabled: true,
  keep: 60, // 最多留幾週
  labels: { done: 'Done', progress: 'On-progress', pending: 'Pending', other: '其他', none: '（無）' },
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const md = (s) => { const [, m, d] = String(s).split('-').map(Number); return `${m}/${d}`; };
const dayStart = (s) => new Date(`${s}T00:00:00`).getTime();
const plain = (s) => String(s || '').replace(/`/g, '').trim(); // 週報是要貼到信件／文件的，拿掉 Markdown 的反引號
// 計畫名稱裡的日期範圍拿掉（日誌標題已經有週次）：「本週工作計畫 9/28–10/2｜秋季新品上市」→「本週工作計畫｜秋季新品上市」
const shortTitle = (t) => String(t || '').replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*[–\-~～]\s*\d{1,2}\s*\/\s*\d{1,2}\s*/, ' ').replace(/\s+([｜|])/g, '$1').replace(/^[\s｜|]+|[\s｜|]+$/g, '').trim();

// 這份計畫是哪一週：計畫檔自己的起訖；沒有日期就用今天所在的週一～週五
function weekRange(plan, now = new Date()) {
  let start = plan.weekStart, end = plan.weekEnd;
  if (!start) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mon = new Date(d.getTime() - ((d.getDay() + 6) % 7) * DAY);
    start = iso(mon); end = iso(new Date(mon.getTime() + 4 * DAY));
  }
  if (!end || end < start) end = start;
  // 最後一個工作天：時間表的最後一天，沒有就用週的最後一天（週五回報後交日誌）
  const days = (plan.days || []).map((d) => d.date).filter(Boolean).sort();
  const lastDay = days.length ? days[days.length - 1] : end;
  return { start, end, lastDay, label: start === end ? md(start) : `${md(start)}–${md(end)}` };
}
const keyOf = (plan, range) => `${range.start}|${plan.title || ''}`;
// 算進這週的時間：週一 0:00 到最後一天之後兩天（週末加班也算）
const inWeek = (at, range) => { const t = new Date(at).getTime(); return t >= dayStart(range.start) && t < dayStart(range.end) + 3 * DAY; };

function questStatus(q, sub) {
  const done = q.objectives.filter((o) => o.done).length;
  if (sub || (q.objectives.length && done === q.objectives.length)) return 'done';
  return done ? 'progress' : 'pending';
}

// 一週的快照（存進存檔：換下一週的計畫檔之後還翻得到）
function snapshot({ plan, ps, state, rewards = G.DEFAULT_REWARDS, now = new Date() }) {
  const range = weekRange(plan, now);
  const quests = plan.quests.map((q) => {
    const sub = ps.submitted[q.id] || null;
    return {
      id: q.id, title: q.title, project: q.project || null, tier: q.tier, deadline: q.deadline || null,
      status: questStatus(q, sub), submitted: sub ? { at: sub.at, onTime: !!sub.onTime } : null,
      objectives: q.objectives.map((o) => ({ text: o.text, done: !!o.done, implicit: !!o.implicit })),
    };
  });
  const rows = plan.days.flatMap((d) => d.rows);
  const daily = (plan.progressLog || []).filter((p) => p.date >= range.start && p.date <= iso(new Date(dayStart(range.end) + 2 * DAY)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ date: p.date, done: p.done || '', blocker: p.blocker || '', next: p.next || '' }));
  // history 是新的在前；這週的經驗值、金幣、專注、運勢、占卜
  const hist = (state.history || []).filter((h) => inWeek(h.at, range));
  const after = (state.history || []).filter((h) => new Date(h.at).getTime() >= dayStart(range.end) + 3 * DAY);
  const xp = hist.reduce((n, h) => n + (h.xp || 0), 0);
  const xpEnd = (state.player.xp || 0) - after.reduce((n, h) => n + (h.xp || 0), 0);
  const step = (rewards && rewards.levelStep) || G.DEFAULT_REWARDS.levelStep;
  const focus = hist.filter((h) => /^完成專注/.test(h.reason));
  const sum = (arr, f) => arr.reduce((n, x) => n + f(x), 0);
  const subs = quests.filter((q) => q.submitted);
  const stats = {
    xp, gold: sum(hist, (h) => Math.max(0, h.gold || 0)), spent: sum(hist, (h) => Math.max(0, -(h.gold || 0))),
    quests: subs.length, questsTotal: quests.length, questsDone: quests.filter((q) => q.status === 'done').length,
    onTime: subs.filter((q) => q.submitted.onTime).length, late: subs.filter((q) => !q.submitted.onTime).length,
    objectives: sum(quests, (q) => q.objectives.filter((o) => o.done).length), objectivesTotal: sum(quests, (q) => q.objectives.length),
    rows: rows.filter((r) => ps.dailyDone[r.id] || r.done).length, rowsTotal: rows.length,
    reports: daily.filter((d) => d.done || d.blocker || d.next).length, days: Math.max(plan.days.length, 1),
    focus: focus.length, focusMin: sum(focus, (h) => Number((h.reason.match(/(\d+)\s*分鐘/) || [])[1] || 0)),
    fortunes: hist.filter((h) => /^今日運勢/.test(h.reason)).map((h) => h.reason.replace(/^今日運勢[:：]\s*/, '')).reverse(),
    divinations: hist.filter((h) => /^占卜魔法/.test(h.reason)).length,
    levelStart: G.levelInfo(Math.max(0, xpEnd - xp), step).level, levelEnd: G.levelInfo(Math.max(0, xpEnd), step).level,
  };
  stats.titleEnd = G.levelInfo(Math.max(0, xpEnd), step).title;
  return { key: keyOf(plan, range), title: plan.title, name: shortTitle(plan.title) || plan.title, ...range, quests, daily, stats, at: now.getTime() };
}

// ---------- 本週稱號與徽章（照順序，第一個是稱號） ----------
const BADGES = [
  ['perfect', '👑', '完美的一週', (s) => s.questsTotal >= 2 && s.questsDone === s.questsTotal && s.late === 0, (s) => `${s.questsTotal} 個委託全部準時完成`],
  ['allclear', '🏆', '委託全制霸', (s) => s.questsTotal >= 2 && s.questsDone === s.questsTotal, (s) => `${s.questsTotal} 個委託全部完成`],
  ['ontime', '⏱', '準時之星', (s) => s.quests >= 2 && s.late === 0, (s) => `交付的 ${s.quests} 個委託都準時`],
  ['levelup', '⬆', '突破極限', (s) => s.levelEnd > s.levelStart, (s) => `升到 Lv.${s.levelEnd}`],
  ['focus', '🍅', '專注大師', (s) => s.focus >= 8, (s) => `專注了 ${s.focus} 顆番茄（${s.focusMin} 分鐘）`],
  ['reporter', '📝', '勤勞的記錄員', (s) => s.reports >= Math.max(3, s.days), (s) => `${s.reports} 天都有下班回報`],
  ['grinder', '⚔', '勇往直前', (s) => s.objectives >= 10, (s) => `完成了 ${s.objectives} 個目標`],
  ['steady', '🌱', '穩紮穩打', (s) => s.objectives >= 1 || s.quests >= 1, (s) => `完成了 ${s.objectives} 個目標`],
  ['rest', '☕', '養精蓄銳', () => true, () => '這週先好好休息'],
];
function badges(stats) {
  const got = BADGES.filter(([, , , ok]) => ok(stats)).map(([id, icon, name, , why]) => ({ id, icon, name, why: why(stats) }));
  // 有更好的就不顯示「穩紮穩打」「養精蓄銳」；完美的一週已經包含委託全制霸、準時之星
  let out = got.length > 1 ? got.filter((b) => b.id !== 'rest' && (b.id !== 'steady' || got.length === 2)) : got;
  if (out.some((b) => b.id === 'perfect')) out = out.filter((b) => b.id !== 'allclear' && b.id !== 'ontime');
  if (out.some((b) => b.id === 'allclear')) out = out.filter((b) => b.id !== 'ontime');
  return out.slice(0, 4);
}

// 簽名：評語寫好之後，數字又變了（又完成目標、補交）→ 畫面提示可以請艾琳重寫
const statSig = (s) => [s.quests, s.questsDone, s.objectives, s.rows, s.reports, s.focus, s.levelEnd].join(',');

// ---------- 工作週報草稿 ----------
// 依專案分類；每類列 [Done] [On-progress] [Pending]。
// 一個任務只做了一部分：做完的目標列在 Done、還沒做的列在 On-progress；完全還沒開始的在 Pending。
// 最後一天下班回報的「卡點」：認得出是哪個任務的就掛在那個任務底下，認不出的放進「其他」的 Pending
function splitBlockers(text) { return String(text || '').split(/[；;、\n]|，(?=.{4,})/).map((s) => s.trim()).filter((s) => s.length >= 2); }
function matchQuest(text, quests) {
  let best = null, bs = 0;
  for (const q of quests) {
    const s = Math.max(sim(text, q.title), ...q.objectives.map((o) => sim(text, o.text)));
    if (s > bs) { bs = s; best = q; }
  }
  return bs >= 0.25 ? best : null;
}
function reportGroups(snap) {
  const order = [];
  const groups = new Map();
  const grp = (name) => { if (!groups.has(name)) { groups.set(name, { name, done: [], progress: [], pending: [] }); order.push(name); } return groups.get(name); };
  const OTHER = '\u0000other';
  for (const q of snap.quests) grp(q.project || OTHER);
  const last = [...snap.daily].reverse().find((d) => d.blocker);
  const blockers = new Map(); // 任務 id → [卡點]
  const loose = [];
  for (const b of splitBlockers(last && last.blocker)) {
    const q = matchQuest(b, snap.quests.filter((x) => x.status !== 'done'));
    if (q) blockers.set(q.id, [...(blockers.get(q.id) || []), b]); else loose.push(b);
  }
  for (const q of snap.quests) {
    const g = grp(q.project || OTHER);
    const single = q.objectives.length <= 1 && (!q.objectives.length || q.objectives[0].implicit || q.objectives[0].text === q.title);
    const sub = (arr) => (single ? [] : arr.map((o) => plain(o.text)));
    const doneObjs = q.objectives.filter((o) => o.done), left = q.objectives.filter((o) => !o.done);
    const bl = (blockers.get(q.id) || []).map((b) => `卡點：${b}`);
    const title = plain(q.title);
    if (q.status === 'done') g.done.push({ title, items: sub(q.objectives) });
    else if (q.status === 'progress') {
      g.done.push({ title, items: sub(doneObjs) });
      g.progress.push({ title, items: [...sub(left), ...bl] });
    } else (bl.length ? g.progress : g.pending).push({ title, items: [...sub(left), ...bl] });
  }
  if (loose.length) grp(OTHER).pending.push(...loose.map((b) => ({ title: `卡點：${b}`, items: [] })));
  // 「其他」放最後
  return [...order.filter((n) => n !== OTHER), ...(groups.has(OTHER) ? [OTHER] : [])].map((n) => ({ ...groups.get(n), name: n === OTHER ? null : n }));
}
function reportText(snap, labels = DEFAULTS.labels) {
  const L = { ...DEFAULTS.labels, ...(labels || {}) };
  const out = [];
  for (const g of reportGroups(snap)) {
    if (out.length) out.push('');
    out.push(`[${g.name || L.other}]`);
    for (const [k, lab] of [['done', L.done], ['progress', L.progress], ['pending', L.pending]]) {
      out.push(`[${lab}]`);
      if (!g[k].length) out.push(`- ${L.none}`);
      for (const it of g[k]) { out.push(`- ${it.title}`); for (const x of it.items) out.push(`  - ${x}`); }
    }
  }
  return out.join('\n');
}

// 給 AI 看的這週摘要（寫評語用）
function weekFacts(snap) {
  const s = snap.stats;
  const parts = [`${snap.label}`, `交付委託 ${s.quests}/${s.questsTotal}（準時 ${s.onTime}${s.late ? `、晚交 ${s.late}` : ''}）`, `完成目標 ${s.objectives}/${s.objectivesTotal}`];
  if (s.rowsTotal) parts.push(`行程 ${s.rows}/${s.rowsTotal} 格`);
  parts.push(`下班回報 ${s.reports} 天`, `經驗值 +${s.xp}、金幣 +${s.gold}`);
  if (s.focus) parts.push(`專注 ${s.focus} 顆番茄（${s.focusMin} 分鐘）`);
  if (s.levelEnd > s.levelStart) parts.push(`升到 Lv.${s.levelEnd}「${s.titleEnd}」`);
  const done = snap.quests.filter((q) => q.status === 'done').map((q) => q.title);
  const left = snap.quests.filter((q) => q.status !== 'done').map((q) => `${q.title}（${q.objectives.filter((o) => o.done).length}/${q.objectives.length}）`);
  if (done.length) parts.push(`完成的委託：${done.slice(0, 5).join('、')}`);
  if (left.length) parts.push(`還沒完成：${left.slice(0, 4).join('、')}`);
  const bl = [...snap.daily].reverse().find((d) => d.blocker);
  if (bl) parts.push(`最近的卡點：${bl.blocker}`);
  return parts.join('；');
}

// 匯出成 Markdown（冒險日誌＋週報草稿）
function toMarkdown(week, { labels, npcName = '艾琳' } = {}) {
  const s = week.stats;
  const b = week.badges || badges(s);
  const L = [`# 冒險日誌 ${week.label}｜${week.name || week.title}`, ''];
  if (b.length) L.push(`> 本週稱號：${b[0].icon} ${b[0].name}（${b[0].why}）${b.length > 1 ? `　徽章：${b.slice(1).map((x) => `${x.icon} ${x.name}`).join('、')}` : ''}`, '');
  if (week.comment) L.push(`## ${npcName}的評語`, '', week.comment, '');
  L.push('## 本週數據', '', '| 項目 | 數字 |', '|---|---|',
    `| 交付委託 | ${s.quests}/${s.questsTotal}（準時 ${s.onTime}） |`, `| 完成目標 | ${s.objectives}/${s.objectivesTotal} |`,
    ...(s.rowsTotal ? [`| 完成行程 | ${s.rows}/${s.rowsTotal} 格 |`] : []), `| 下班回報 | ${s.reports} 天 |`,
    `| 經驗值／金幣 | +${s.xp} XP／+${s.gold}${s.spent ? `（花了 ${s.spent}）` : ''} |`, `| 專注 | ${s.focus} 顆（${s.focusMin} 分鐘） |`,
    `| 等級 | Lv.${s.levelStart}${s.levelEnd > s.levelStart ? ` → Lv.${s.levelEnd}` : ''} |`, '');
  if (week.daily.length) {
    L.push('## 每天的回報', '');
    for (const d of week.daily) L.push(`- ${md(d.date)}｜完成：${d.done}｜卡點：${d.blocker}｜明日：${d.next}`);
    L.push('');
  }
  L.push('## 工作週報', '', reportText(week, labels), '');
  return L.join('\n');
}

// 存檔裡的日誌：用 key 合併（評語留著），超過上限丟最舊的
function store(state, snap, keep = DEFAULTS.keep) {
  const j = state.journal || (state.journal = { weeks: {} });
  const old = j.weeks[snap.key] || {};
  j.weeks[snap.key] = { ...old, ...snap, badges: badges(snap.stats), sig: statSig(snap.stats) };
  const keys = Object.keys(j.weeks).sort((a, b) => (j.weeks[a].start || '').localeCompare(j.weeks[b].start || '') || j.weeks[a].at - j.weeks[b].at);
  while (keys.length > keep) delete j.weeks[keys.shift()];
  return j.weeks[snap.key];
}
function list(state) {
  const w = (state.journal && state.journal.weeks) || {};
  return Object.values(w).sort((a, b) => (b.start || '').localeCompare(a.start || '') || b.at - a.at)
    .map((x) => ({ key: x.key, label: x.label, title: x.title, name: x.name || x.title, start: x.start, badge: x.badges && x.badges[0] }));
}
const projects = (state) => [...new Set(Object.values((state.journal && state.journal.weeks) || {}).flatMap((w) => w.quests.map((q) => q.project).filter(Boolean)))];

module.exports = { shortTitle, DEFAULTS, BADGES, weekRange, snapshot, badges, statSig, reportGroups, reportText, weekFacts, toMarkdown, store, list, projects, splitBlockers, md };
