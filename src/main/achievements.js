// 🏅 成就徽章牆＋🔥 每日連續上工（純函式）
// 成就：達成條件送一次金幣，永久留在徽章牆；hidden 的在達成前顯示「？？？」
// 連續上工：一天第一次完成事情（目標、交付、行程、回報、專注）就「上工打卡」；週末和計畫裡沒排的平日不算斷
'use strict';

const ACH = [
  // 委託與目標
  { id: 'obj1', icon: '☑', name: '第一步', desc: '完成第一個目標', gold: 10, test: (c) => c.objectives >= 1 },
  { id: 'obj100', icon: '🎯', name: '目標獵人', desc: '完成 100 個目標', gold: 120, test: (c) => c.objectives >= 100, goal: (c) => [c.objectives, 100] },
  { id: 'ontime1', icon: '⏱', name: '準時交件', desc: '第一次準時交付委託', gold: 20, test: (c) => c.onTime >= 1 },
  { id: 'quest10', icon: '📜', name: '熟練的冒險者', desc: '交付 10 個委託', gold: 50, test: (c) => c.quests >= 10, goal: (c) => [c.quests, 10] },
  { id: 'quest50', icon: '🛡', name: '公會的常客', desc: '交付 50 個委託', gold: 150, test: (c) => c.quests >= 50, goal: (c) => [c.quests, 50] },
  { id: 'quest100', icon: '👑', name: '委託大師', desc: '交付 100 個委託', gold: 300, test: (c) => c.quests >= 100, goal: (c) => [c.quests, 100] },
  { id: 'ontime5', icon: '⚡', name: '分秒必爭', desc: '連續 5 次準時交付', gold: 80, test: (c) => c.onTimeStreak >= 5, goal: (c) => [c.onTimeStreak, 5] },
  // 專注與回報
  { id: 'focus10', icon: '🍅', name: '專注新手', desc: '完成 10 顆番茄', gold: 30, test: (c) => c.focus >= 10, goal: (c) => [c.focus, 10] },
  { id: 'focus50', icon: '🔥', name: '專注達人', desc: '完成 50 顆番茄', gold: 100, test: (c) => c.focus >= 50, goal: (c) => [c.focus, 50] },
  { id: 'focus100', icon: '⏳', name: '時間魔法師', desc: '完成 100 顆番茄', gold: 200, test: (c) => c.focus >= 100, goal: (c) => [c.focus, 100] },
  { id: 'report5', icon: '📝', name: '勤快的回報', desc: '下班回報 5 天', gold: 30, test: (c) => c.reports >= 5, goal: (c) => [c.reports, 5] },
  { id: 'report30', icon: '📖', name: '日誌守護者', desc: '下班回報 30 天', gold: 120, test: (c) => c.reports >= 30, goal: (c) => [c.reports, 30] },
  { id: 'journal4', icon: '🗓', name: '一個月的冒險', desc: '冒險日誌累積 4 週', gold: 60, test: (c) => c.weeks >= 4, goal: (c) => [c.weeks, 4] },
  // 等級與連續上工
  { id: 'lv5', icon: '⬆', name: '銀牌在望', desc: '升到 Lv.5', gold: 50, test: (c) => c.level >= 5, goal: (c) => [c.level, 5] },
  { id: 'lv10', icon: '🌟', name: '公會之光', desc: '升到 Lv.10', gold: 150, test: (c) => c.level >= 10, goal: (c) => [c.level, 10] },
  { id: 'streak7', icon: '🔥', name: '一週全勤', desc: '連續上工 7 天', gold: 50, test: (c) => c.streakBest >= 7, goal: (c) => [c.streakBest, 7] },
  { id: 'streak30', icon: '🏔', name: '風雨無阻', desc: '連續上工 30 天', gold: 200, test: (c) => c.streakBest >= 30, goal: (c) => [c.streakBest, 30] },
  // 運勢、占卜
  { id: 'daikichi', icon: '🔮', name: '好運到', desc: '抽到一次大吉', gold: 20, test: (c) => c.daikichi >= 1 },
  { id: 'divine10', icon: '✨', name: '星環常客', desc: '占卜 10 次', gold: 30, test: (c) => c.divinations >= 10, goal: (c) => [c.divinations, 10] },
  // 雜貨舖
  { id: 'gift1', icon: '🎁', name: '一點心意', desc: '第一次送艾琳禮物', gold: 10, test: (c) => c.gifts >= 1 },
  { id: 'giftall', icon: '💝', name: '送禮專家', desc: '每一種禮物都送過一次（黃瓜不算）', gold: 100, test: (c) => c.giftKinds >= c.giftKindsTotal, goal: (c) => [c.giftKinds, c.giftKindsTotal] },
  { id: 'cucumber', icon: '🥒', name: '惡作劇', desc: '送了艾琳一根黃瓜', gold: 5, hidden: true, test: (c) => c.cucumber >= 1 },
  { id: 'decor1', icon: '🎐', name: '布置櫃台', desc: '買了第一個吊飾或擺設', gold: 10, test: (c) => c.ornaments >= 1 },
  { id: 'theme1', icon: '🎨', name: '換個心情', desc: '換過一次主題配色', gold: 10, test: (c) => c.themed >= 1 },
  // 星座卡
  { id: 'cards10', icon: '🌌', name: '星座收藏家', desc: '收集 10 張星座卡', gold: 50, test: (c) => c.cards >= 10, goal: (c) => [c.cards, 10] },
  { id: 'cards1star', icon: '⭐', name: '夜空的一角', desc: '收集全部 ★ 的星座卡', gold: 80, test: (c) => c.cards1 >= c.cards1Total, goal: (c) => [c.cards1, c.cards1Total] },
  { id: 'ssr', icon: '☄', name: '流星許願', desc: '抽到第一張 ★★★★', gold: 50, test: (c) => c.ssr >= 1 },
  { id: 'cardsall', icon: '🌠', name: '整片星空', desc: '收集全部星座卡', gold: 500, test: (c) => c.cards >= c.cardsTotal, goal: (c) => [c.cards, c.cardsTotal] },
  // 艾琳
  { id: 'notes10', icon: '📒', name: '被記住的人', desc: '艾琳的小本子記了 10 件你的事', gold: 30, test: (c) => c.notes >= 10, goal: (c) => [c.notes, 10] },
  { id: 'friend', icon: '🐾', name: '公會的好朋友', desc: '跟艾琳變得很熟', gold: 50, hidden: true, test: (c) => c.stage >= 3 },
  { id: 'dearest', icon: '💫', name: '最重要的冒險者', desc: '艾琳心裡那顆描了兩次金邊的星', gold: 100, hidden: true, test: (c) => c.stage >= 5 },
];
const BY = Object.fromEntries(ACH.map((a) => [a.id, a]));

// 新達成的成就（記進 got，回傳清單）
function check(got, ctx, now = Date.now()) {
  const out = [];
  for (const a of ACH) {
    if (got[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(ctx); } catch (_) { ok = false; }
    if (ok) { got[a.id] = { at: now }; out.push(a); }
  }
  return out;
}
function view(got, ctx) {
  return ACH.map((a) => {
    const g = got[a.id];
    const secret = a.hidden && !g;
    let progress = null;
    if (!g && a.goal) { try { const [n, of] = a.goal(ctx); progress = { n: Math.min(n || 0, of), of }; } catch (_) { /* 算不出來就不顯示 */ } }
    return { id: a.id, icon: secret ? '？' : a.icon, name: secret ? '？？？' : a.name, desc: secret ? '還沒有人知道的成就' : a.desc, gold: a.gold, got: !!g, at: g ? g.at : null, hidden: !!a.hidden, progress };
  });
}

// ---------- 🔥 連續上工 ----------
const STREAK = {
  restDays: [0, 6], // 週日、週六不算斷
  base: 2, perDay: 1, cap: 8, // 打卡金幣：2 + min(連續天數, 8)
  milestones: { 3: 10, 7: 30, 14: 60, 30: 150, 60: 250, 100: 400 },
};
const DAY = 86400000;
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function blankStreak() { return { cur: 0, best: 0, last: '', days: 0 }; }
// 這一天要不要上工：週末不用；計畫檔有排那一週、平日卻沒排（放假）也不用
function isRest(iso, { restDays = STREAK.restDays, plan = null } = {}) {
  const d = new Date(`${iso}T00:00:00`);
  if (restDays.includes(d.getDay())) return true;
  if (plan && plan.days && plan.days.length && plan.weekStart && plan.weekEnd && iso >= plan.weekStart && iso <= plan.weekEnd) return !plan.days.some((x) => x.date === iso);
  return false;
}
// 今天上工打卡：回傳 null（今天打過了）或 { cur, gold, milestone, kept }
function checkIn(st, today, opts = {}) {
  if (st.last === today) return null;
  const cfg = { ...STREAK, ...opts };
  let kept = false;
  if (st.last && st.last < today) {
    kept = true;
    for (let t = new Date(`${st.last}T00:00:00`).getTime() + DAY; ; t += DAY) {
      const iso = isoOf(new Date(t));
      if (iso >= today) break;
      if (!isRest(iso, cfg)) { kept = false; break; }
    }
  }
  st.cur = kept ? st.cur + 1 : 1;
  st.best = Math.max(st.best || 0, st.cur);
  st.last = today;
  st.days = (st.days || 0) + 1;
  const milestone = cfg.milestones[st.cur] || 0;
  return { cur: st.cur, gold: cfg.base + Math.min(st.cur, cfg.cap) * cfg.perDay, milestone, kept };
}
// 畫面上的天數：上次打卡之後如果已經錯過了該上工的日子，就顯示 0（還沒打卡的今天不算錯過）
function current(st, today, opts = {}) {
  if (!st.last) return 0;
  if (st.last === today) return st.cur;
  for (let t = new Date(`${st.last}T00:00:00`).getTime() + DAY; ; t += DAY) {
    const iso = isoOf(new Date(t));
    if (iso >= today) return st.cur;
    if (!isRest(iso, { ...STREAK, ...opts })) return 0;
  }
}

module.exports = { ACH, BY, check, view, STREAK, blankStreak, isRest, checkIn, current };
