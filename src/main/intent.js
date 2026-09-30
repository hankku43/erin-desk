// 聊天改進度：可操作項目清單、AI 提案驗證、離線時的關鍵字解析
'use strict';

const G = require('./game');

const ACTION_TYPES = ['check', 'uncheck', 'submit', 'activate', 'daily_done', 'daily_undo', 'report'];

// 給 AI 的 JSON schema（附加在 line / emotion 之後）
const ACTION_SCHEMA = {
  actions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES },
        target: { type: 'string' },
        report: { type: 'string' },
        done: { type: 'string' },
        blocker: { type: 'string' },
        next: { type: 'string' },
      },
      required: ['type'],
    },
  },
};

const ACTION_RULES = [
  '【改進度規則】冒險者可能在聊天中回報進度。只有在冒險者「明確」表示以下事情時，才在 actions 放入動作：',
  '- 某個目標做完了 → {"type":"check","target":"目標代號"}（例如 q1-0）',
  '- 某個目標其實還沒做完、勾錯了 → {"type":"uncheck","target":"目標代號"}',
  '- 要交付整個任務 → {"type":"submit","target":"任務代號","report":"回報內容"}（例如 q1）',
  '- 想改做另一個任務 → {"type":"activate","target":"任務代號"}',
  '- 今日行程某一格做完／取消 → {"type":"daily_done"或"daily_undo","target":"行程代號"}（例如 d0）',
  '- 下班回報 → {"type":"report","done":"實際完成","blocker":"卡點","next":"明日調整"}',
  '代號只能使用【可操作項目】裡列出的；不確定是哪一項就不要放動作，改在 line 裡問清楚。',
  '只是聊天、詢問建議時，actions 用空陣列 []。',
  '有放動作時，line 要用角色口吻確認你要做的事，例如「要艾琳幫你把『週報寄出』勾起來嗎？」。',
  'line 裡不要出現代號（q1、q1-0、d0），要說任務或目標的名字。',
].join('\n');

// 模型偶爾會在台詞裡講代號（「要檢查 q4-0 嗎？」），換回任務／目標／行程的名字
function decodeKeys(text, cat) {
  const name = (k) => {
    const o = cat.objectives.find((x) => x.key === k); if (o) return o.text;
    const q = cat.quests.find((x) => x.key === k); if (q) return q.title;
    const d = cat.daily.find((x) => x.key === k); if (d) return d.label;
    return null;
  };
  return String(text || '').replace(/[ \t]*[「『]?(?<![A-Za-z0-9_])([qd]\d+(?:-\d+)?)(?![A-Za-z0-9_])[」』]?[ \t]*/g, (m, k) => { const n = name(k); return n ? `「${n}」` : m; });
}

function clean(s) {
  return String(s || '').toLowerCase().replace(/`/g, '').replace(/[\s，。、；：！？!?,.;:()（）「」『』【】\[\]"'～~+＋&*#=<>|｜]/g, '');
}

// 目前可操作的項目
function buildCatalog(plan, ps, todayInfo, now) {
  const views = G.questView(plan, ps, now);
  const objectives = [], quests = [], daily = [];
  for (const q of views) {
    const key = `q${quests.length + 1}`; // 給 AI 看的短代號（真正的 id 是標題雜湊）
    quests.push({ key, id: q.id, title: q.title, status: q.status, active: q.active, total: q.total, doneCount: q.doneCount });
    q.objectives.forEach((o, i) => objectives.push({ key: `${key}-${i}`, questId: q.id, index: i, text: o.text, done: o.done, questTitle: q.title, questDone: q.status === 'done' }));
  }
  (todayInfo.rows || []).forEach((r, i) => {
    const label = todayInfo.branch ? (todayInfo.chosenBranch === 'b' ? r.b : todayInfo.chosenBranch === 'a' ? r.a : `${r.a}／${r.b}`) : r.a;
    daily.push({ key: `d${i}`, rowId: r.id, slot: r.slot, label, done: r.done });
  });
  return { objectives, quests, daily, hasReportRow: true };
}

function catalogText(cat) {
  const L = ['【可操作項目】'];
  for (const q of cat.quests) {
    const st = q.status === 'done' ? '已交付' : q.status === 'ready' ? '目標全完成，可交付' : q.active ? '當前任務' : '未完成';
    L.push(`任務 ${q.key}：${q.title}（${st}，${q.doneCount}/${q.total}）`);
    if (q.status === 'done') continue;
    for (const o of cat.objectives.filter((x) => x.questId === q.id)) L.push(`  ${o.key} [${o.done ? 'x' : ' '}] ${o.text}`);
  }
  if (cat.daily.length) {
    L.push('今日行程：');
    for (const d of cat.daily) L.push(`  ${d.key} [${d.done ? 'x' : ' '}] ${d.slot} ${d.label}`);
  }
  return L.join('\n');
}

// 驗證 AI 或關鍵字解析出的動作 → 可以顯示給玩家確認的提案
function validate(actions, cat) {
  const items = [];
  const seen = new Set();
  // 模擬狀態：同一個提案中先勾完再交付
  const done = new Map(cat.objectives.map((o) => [o.key, o.done]));
  const findObj = (t) => cat.objectives.find((o) => o.key === String(t || '').trim()) || fuzzyObjective(t, cat);
  const findQuest = (t) => {
    const k = String(t || '').trim().replace(/-\d+$/, '');
    return cat.quests.find((q) => q.key === k || q.id === k) || cat.quests.find((q) => clean(t) && clean(q.title).includes(clean(t)));
  };
  for (const a of actions || []) {
    if (!a || !ACTION_TYPES.includes(a.type)) continue;
    let item = null;
    if (a.type === 'check' || a.type === 'uncheck') {
      const o = findObj(a.target);
      if (!o || o.questDone) continue;
      const want = a.type === 'check';
      if (done.get(o.key) === want) continue; // 已經是這個狀態
      done.set(o.key, want);
      item = { type: a.type, key: o.key, questId: o.questId, index: o.index, label: `${want ? '勾選' : '取消勾選'}「${o.text}」` };
    } else if (a.type === 'submit') {
      const q = findQuest(a.target);
      if (!q || q.status === 'done') continue;
      const allDone = cat.objectives.filter((o) => o.questId === q.id).every((o) => done.get(o.key));
      if (!allDone) {
        // 玩家說要交付：一起把剩下的目標勾起來
        for (const o of cat.objectives.filter((x) => x.questId === q.id && !done.get(x.key))) {
          done.set(o.key, true);
          if (!seen.has(`check:${o.key}`)) { seen.add(`check:${o.key}`); items.push({ type: 'check', key: o.key, questId: o.questId, index: o.index, label: `勾選「${o.text}」` }); }
        }
      }
      item = { type: 'submit', key: q.key, questId: q.id, report: String(a.report || '').slice(0, 300), label: `交付任務「${q.title}」` };
    } else if (a.type === 'activate') {
      const q = findQuest(a.target);
      if (!q || q.status === 'done' || q.active) continue;
      item = { type: 'activate', key: q.key, questId: q.id, label: `把「${q.title}」設為當前任務` };
    } else if (a.type === 'daily_done' || a.type === 'daily_undo') {
      const d = cat.daily.find((x) => x.key === String(a.target || '').trim()) || cat.daily.find((x) => clean(a.target) && clean(x.label).includes(clean(a.target)));
      const want = a.type === 'daily_done';
      if (!d || d.done === want) continue;
      item = { type: a.type, key: d.key, rowId: d.rowId, label: `${want ? '完成' : '取消完成'}今日行程 ${d.slot}「${d.label}」` };
    } else if (a.type === 'report') {
      const f = { done: String(a.done || '').slice(0, 300), blocker: String(a.blocker || '').slice(0, 300), next: String(a.next || '').slice(0, 300) };
      if (!f.done && !f.blocker && !f.next) continue;
      item = { type: 'report', key: 'report', fields: f, label: `寫下班回報：${[f.done && `完成 ${f.done}`, f.blocker && `卡點 ${f.blocker}`, f.next && `明日 ${f.next}`].filter(Boolean).join('／')}` };
    }
    const sig = `${item.type}:${item.key}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    items.push(item);
  }
  // 交付放最後
  return [...items.filter((i) => i.type !== 'submit'), ...items.filter((i) => i.type === 'submit')];
}

// ---- 離線（沒有 AI）時的關鍵字解析 ----
function bigrams(s) {
  const t = clean(s);
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function tokens(s) { return (String(s).toLowerCase().match(/[a-z0-9][a-z0-9_\-./]*[a-z0-9]|[a-z0-9]/g) || []).filter((x) => x.length >= 2); }

function score(msg, text) {
  const mb = bigrams(msg), tb = bigrams(text);
  if (!tb.size) return 0;
  let hit = 0;
  for (const b of tb) if (mb.has(b)) hit++;
  let s = hit / Math.max(1, Math.min(tb.size, mb.size, 8));
  const mt = new Set(tokens(msg));
  for (const tk of tokens(text)) if (mt.has(tk)) s += 0.35;
  return s;
}

function fuzzyObjective(text, cat, { onlyOpen, boostQuest } = {}) {
  if (!text) return null;
  let best = null, bs = 0;
  for (const o of cat.objectives) {
    if (o.questDone || (onlyOpen === true && o.done) || (onlyOpen === false && !o.done)) continue;
    const s = score(text, o.text) + (boostQuest && o.questId === boostQuest ? 0.3 : 0);
    if (s > bs) { bs = s; best = o; }
  }
  return bs >= 0.34 ? best : null;
}

const RE_UNDO = /(取消|還沒|沒做完|沒完成|改回|勾錯|誤勾|撤回|不算)/;
const RE_SUBMIT = /(交付|提交|交任務|結案|驗收)/;
const RE_DONE = /(完|好了|做好|存好|修好|搞定|送出|寄出|寄了|送了|拿到|通過|定稿|結束|交了|done|ok)/i;
const RE_SWITCH = /(先做|改做|切換到|換成|換到|先處理)/;
const RE_ALL = /(全部|都|整個)/;

function ruleParse(msg, cat) {
  const actions = [];
  const questHit = cat.quests
    .filter((q) => q.status !== 'done')
    .map((q) => ({ q, s: score(msg, q.title) }))
    .sort((a, b) => b.s - a.s)[0];
  const quest = questHit && questHit.s >= 0.5 ? questHit.q : null;

  if (RE_SWITCH.test(msg) && quest) return [{ type: 'activate', target: quest.key }];
  if (RE_SUBMIT.test(msg)) {
    const q = quest || cat.quests.find((x) => x.active);
    if (q) return [{ type: 'submit', target: q.key, report: msg }];
  }
  const undo = RE_UNDO.test(msg);
  if (!undo && !RE_DONE.test(msg)) return [];
  if (quest && RE_ALL.test(msg)) {
    return cat.objectives.filter((o) => o.questId === quest.id && o.done === undo).map((o) => ({ type: undo ? 'uncheck' : 'check', target: o.key }));
  }
  // 依句子切段，每段找最像的目標
  const boostQuest = quest ? quest.id : null;
  for (const part of msg.split(/[，,。；;、\n]|還有|然後|另外/)) {
    if (clean(part).length < 2) continue;
    const o = fuzzyObjective(part, cat, { onlyOpen: !undo, boostQuest });
    if (o) actions.push({ type: undo ? 'uncheck' : 'check', target: o.key });
  }
  if (!actions.length) {
    const o = fuzzyObjective(msg, cat, { onlyOpen: !undo, boostQuest });
    if (o) actions.push({ type: undo ? 'uncheck' : 'check', target: o.key });
  }
  return actions;
}

// 找不到可做的動作時，看看是不是「本來就已經是那個狀態」
function explainNoop(msg, cat) {
  const undo = RE_UNDO.test(msg);
  if (!undo && !RE_DONE.test(msg)) return null;
  const o = fuzzyObjective(msg, cat, {});
  if (!o) return null;
  if (undo && !o.done) return `「${o.text}」本來就還沒勾喔，不用改～`;
  if (!undo && o.done) return `「${o.text}」之前就勾好了喔！`;
  return null;
}

module.exports = { ACTION_SCHEMA, ACTION_RULES, buildCatalog, catalogText, validate, ruleParse, explainNoop, decodeKeys };
