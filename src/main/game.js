// 遊戲邏輯：經驗值、等級、派任務、獎勵（純邏輯，不碰檔案）
'use strict';

const TIER_RANK = { main: 0, major: 1, side: 2 };
const TIER_NAME = { main: '主線', major: '重要支線', side: '支線' };
const TITLES = ['見習冒險者', '新手冒險者', '銅牌冒險者', '銅牌精英', '銀牌冒險者', '銀牌精英', '金牌冒險者', '金牌精英', '白金冒險者', '秘銀冒險者', '精金冒險者', '公會之星', '傳說冒險者'];

const DEFAULT_REWARDS = {
  objective: { xp: 20, gold: 5 },
  quest: { main: { xp: 100, gold: 50 }, major: { xp: 80, gold: 40 }, side: { xp: 40, gold: 20 } },
  onTimeBonus: 0.2,
  dailyRow: { xp: 10, gold: 2 },
  dailyReport: { xp: 30, gold: 10 },
  levelStep: 120, // 升到 n+1 級需要累積 levelStep * n*(n+1)/2
};

function newState() {
  return {
    version: 1,
    player: { xp: 0, gold: 0, questsDone: 0, onTimeStreak: 0 },
    plans: {},
    history: [],
    memory: [],
    chat: [],
  };
}

function planState(state, planKey) {
  if (!state.plans[planKey]) {
    state.plans[planKey] = {
      submitted: {}, awardedObjectives: {}, dailyDone: {}, dailyReported: {},
      decisionsShown: {}, activeQuestId: null, branch: {},
    };
  }
  return state.plans[planKey];
}

function levelInfo(xp, step = DEFAULT_REWARDS.levelStep) {
  let level = 1;
  while (xp >= step * (level * (level + 1)) / 2) level++;
  const floor = step * ((level - 1) * level) / 2;
  const ceil = step * (level * (level + 1)) / 2;
  return {
    level, title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    xpInLevel: xp - floor, xpForNext: ceil - floor, xp,
  };
}

function todayISO(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00'), b = new Date(toISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// 產生任務的顯示用狀態
function questView(plan, ps, now = new Date()) {
  const today = todayISO(now);
  return plan.quests.map((q) => {
    const doneCount = q.objectives.filter((o) => o.done).length;
    const total = q.objectives.length;
    const submitted = ps.submitted[q.id] || null;
    const daysLeft = q.deadline ? daysBetween(today, q.deadline) : null;
    let status = 'available';
    if (submitted) status = 'done';
    else if (total > 0 && doneCount === total) status = 'ready';
    return {
      ...q, tierName: TIER_NAME[q.tier], doneCount, total, submitted, status,
      daysLeft, overdue: !submitted && daysLeft !== null && daysLeft < 0,
      active: ps.activeQuestId === q.id,
    };
  });
}

function sortForAssign(views) {
  return [...views].sort((a, b) =>
    (TIER_RANK[a.tier] - TIER_RANK[b.tier]) ||
    String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')) ||
    (Number(a.num || 99) - Number(b.num || 99)));
}

function pickNextQuest(plan, ps, now) {
  const open = questView(plan, ps, now).filter((q) => q.status !== 'done');
  return sortForAssign(open)[0] || null;
}

// 確保有當前任務；回傳 {quest, changed}
function ensureActive(plan, ps, now) {
  const views = questView(plan, ps, now);
  const cur = views.find((q) => q.id === ps.activeQuestId && q.status !== 'done');
  if (cur) return { quest: cur, changed: false };
  const next = pickNextQuest(plan, ps, now);
  ps.activeQuestId = next ? next.id : null;
  return { quest: next, changed: !!next };
}

function grant(state, reward, reason, rewards = DEFAULT_REWARDS) {
  const before = levelInfo(state.player.xp, rewards.levelStep);
  state.player.xp += reward.xp;
  state.player.gold += reward.gold;
  const after = levelInfo(state.player.xp, rewards.levelStep);
  state.history.unshift({ at: new Date().toISOString(), reason, xp: reward.xp, gold: reward.gold });
  state.history = state.history.slice(0, 300);
  return { ...reward, reason, levelUp: after.level > before.level ? after : null, level: after };
}

// 勾選目標：第一次完成才給獎勵
function onObjective(state, ps, questId, objective, done, rewards = DEFAULT_REWARDS) {
  if (!done || ps.awardedObjectives[objective.id]) return null;
  ps.awardedObjectives[objective.id] = true;
  return grant(state, rewards.objective, `完成目標：${objective.text}`, rewards);
}

function submitQuest(state, ps, plan, questId, report = '', now = new Date(), rewards = DEFAULT_REWARDS) {
  const v = questView(plan, ps, now).find((q) => q.id === questId);
  if (!v) throw new Error('找不到任務');
  if (v.status === 'done') throw new Error('這個任務已經交過了');
  if (v.status !== 'ready') throw new Error(`還有 ${v.total - v.doneCount} 個目標沒完成`);
  const base = rewards.quest[v.tier] || rewards.quest.major;
  const onTime = v.daysLeft === null || v.daysLeft >= 0;
  const mult = onTime ? 1 + rewards.onTimeBonus : 1;
  const reward = { xp: Math.round(base.xp * mult), gold: Math.round(base.gold * mult) };
  ps.submitted[questId] = { at: now.toISOString(), onTime, report, ...reward };
  state.player.questsDone += 1;
  state.player.onTimeStreak = onTime ? state.player.onTimeStreak + 1 : 0;
  const g = grant(state, reward, `交付任務：${v.title}${onTime ? '（準時）' : ''}`, rewards);
  if (report) remember(state, `交付「${v.title}」時回報：${report}`);
  if (ps.activeQuestId === questId) ps.activeQuestId = null;
  const next = ensureActive(plan, ps, now).quest;
  return { ...g, onTime, quest: v, next };
}

function onDailyRow(state, ps, rowId, label, done, rewards = DEFAULT_REWARDS) {
  if (done) {
    if (ps.dailyDone[rowId]) return null;
    ps.dailyDone[rowId] = true;
    return grant(state, rewards.dailyRow, `完成行程：${label}`, rewards);
  }
  // 取消勾選只改狀態，不收回經驗
  ps.dailyDone[rowId] = false;
  return null;
}

function onDailyReport(state, ps, dateISO, fields, rewards = DEFAULT_REWARDS) {
  const first = !ps.dailyReported[dateISO];
  ps.dailyReported[dateISO] = true;
  const summary = [fields.done && `完成：${fields.done}`, fields.blocker && `卡點：${fields.blocker}`, fields.next && `明日：${fields.next}`].filter(Boolean).join('；');
  if (summary) remember(state, `${dateISO} 日報 ${summary}`);
  return first ? grant(state, rewards.dailyReport, `${dateISO} 下班回報`, rewards) : null;
}

function remember(state, note) {
  state.memory.unshift({ at: new Date().toISOString(), note });
  state.memory = state.memory.slice(0, 30);
}

module.exports = {
  DEFAULT_REWARDS, TIER_NAME, newState, planState, levelInfo, todayISO, daysBetween,
  questView, pickNextQuest, ensureActive, onObjective, submitQuest, onDailyRow, onDailyReport, remember, grant,
};
