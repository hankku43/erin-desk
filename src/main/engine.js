// 引擎：串起計畫檔、存檔、遊戲邏輯與 NPC（不依賴 Electron，可單獨測試）
'use strict';

const fs = require('fs');
const path = require('path');
const PlanNew = require('./planParser');
const PlanLegacy = require('./planParserLegacy');
// 讀檔時自動判斷：新的寬鬆格式優先；讀不到任務再試舊的表格版週報（還能用，但建議轉檔）
function parseAny(text, file) {
  // 舊格式的特徵：「## 任務清單…」段落＋「**1｜任務名**」這種粗體編號
  const looksLegacy = /^##\s*任務清單/m.test(text) && /^\*\*\d+\s*[｜|].+\*\*\s*$/m.test(text);
  if (looksLegacy) {
    const lp = PlanLegacy.parsePlan(text, file);
    if (lp.quests.length) return { plan: lp, legacy: true };
  }
  return { plan: PlanNew.parsePlan(text, file), legacy: false };
}
const G = require('./game');
const { NPC } = require('./npc');
const I = require('./intent');
const { Lore } = require('./lore');
const ICS = require('./ics');

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

// 🔮 今日運勢：沒有「凶」，最差也是末吉；tier 給畫面配色用
const FORTUNE_RANKS = [
  { name: '大吉', w: 12, xp: 10, gold: 12, tier: 5 },
  { name: '中吉', w: 23, xp: 8, gold: 8, tier: 4 },
  { name: '小吉', w: 25, xp: 6, gold: 6, tier: 3 },
  { name: '吉', w: 25, xp: 5, gold: 5, tier: 2 },
  { name: '末吉', w: 15, xp: 3, gold: 3, tier: 1 },
];
const FORTUNE_ADVICE = [
  '適合先做最小的那一項，星星會一顆一顆亮起來',
  '適合把拖最久的那件事收尾',
  '適合開口問人，答案比想像中近',
  '適合整理桌面和檔案，找東西會變快',
  '適合準時吃午餐、睡個午覺',
  '適合下班前寫下明天的第一步',
  '適合一次只做一件事，其他的先記進小本子',
  '適合多喝水，精神會比較好',
  '適合回一封拖了很久的信',
  '適合把大任務切成三小塊',
  '適合早一點開始，鐘樓會站在你這邊',
  '適合對自己說一聲辛苦了',
];
const FORTUNE_ITEMS = ['溫奶茶', '魚形麵包', '紅緞帶', '蠟封章', '小銀鈴', '藍色小花', '鐘樓的鐘聲', '傳信鴿', '打氣抽屜的糖', '梟長的羽毛', '舊書攤的信封', '霜月村的初雪']

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a[k] || {}, v) : v;
  }
  return out;
}

function parseSlot(slot, dateISO) {
  const m = String(slot || '').match(/(\d{1,2}):(\d{2})\s*[–\-~～至]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mk = (h, mi) => new Date(`${dateISO}T${h.padStart(2, '0')}:${mi}:00`);
  return { start: mk(m[1], m[2]), end: mk(m[3], m[4]) };
}

class Engine {
  constructor({ appDir, dataDir, now } = {}) {
    this.appDir = appDir;
    this.dataDir = dataDir || path.join(appDir, 'data');
    this.nowFn = now || (() => new Date());
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.savePath = path.join(this.dataDir, 'save.json');
    this.loadConfig();
    this.loadLore();
    this.npc = new NPC(this.config);
    this.npc.setLogFile(path.join(this.dataDir, 'llm.log')); // 每次呼叫 AI 的耗時，AI 常回不出來時看這裡
    this.loadState();
    this.backedUp = false;
    this.loadPlan();
  }

  now() { return this.nowFn(); }

  loadConfig() {
    const defaults = {
      plan: { path: 'plans/week_sample.md', writeBack: true },
      npc: { name: '艾琳', role: '公會櫃台接待員', personality: '開朗溫柔', callName: '冒險者', selfName: '', catchphrases: [] }, // selfName 空白＝用 name 自稱
      llm: { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:4b', noThinkPrefix: '/no_think\n' },
      rewards: G.DEFAULT_REWARDS,
      window: { alwaysOnTop: true, idleChatterMinutes: 45 },
      lore: { path: 'lore/艾琳.md', topK: 3, embeddings: 'auto', embedModel: 'qwen3-embedding:0.6b' },
      focus: { minutes: 25, rest: 5, xp: 15, gold: 3 }, // 🍅 專注模式
      reminders: {
        weekdaysOnly: true, graceMinutes: 15,
        items: [
          { time: '12:00', event: 'lunch' },
          { time: '13:00', event: 'afternoon' },
          { time: '16:50', event: 'wrapup' },
        ],
      },
    };
    const p = path.join(this.appDir, 'config.json');
    const example = path.join(this.appDir, 'config.example.json');
    if (!fs.existsSync(p) && fs.existsSync(example)) fs.copyFileSync(example, p); // 第一次啟動：從範例建立自己的設定檔
    let user = {};
    try { user = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
      if (fs.existsSync(p)) this.configError = `config.json 格式錯誤：${e.message}`;
    }
    this.config = deepMerge(defaults, user);
    if (this.lore) this.loadLore();
    if (this.npc) this.npc.setConfig(this.config);
  }

  // 角色設定檔：核心段落進系統提示，其餘依對話檢索
  loadLore() {
    const c = this.config.lore || {};
    const file = path.isAbsolute(c.path || '') ? c.path : path.join(this.appDir, c.path || 'lore/艾琳.md');
    this.lore = new Lore({ file, dataDir: this.dataDir, llm: this.config.llm, embeddings: c.embeddings, embedModel: c.embedModel, log: (m) => console.log(m) });
    this.config.npc = { ...this.config.npc, core: this.lore.core, loreName: this.lore.name };
    // 「聰明艾琳」開著就在背景算向量，不擋啟動；跟 AI 對話開關無關（只要 Ollama 有開）
    if (this.lore.smartOn()) this.lore.prepareEmbeddings();
  }

  // 「聰明艾琳」（角色設定的向量搜尋）開關：寫進 config.json 的 lore.embeddings
  async setSmart(on) {
    this.saveConfigPatch({ lore: { embeddings: !!on } }); // 會重新讀設定、重建 lore，開著就開始算向量
    let status = 'off';
    if (on) status = await this.lore.prepareEmbeddings();
    else this.lore.disableSmart();
    const key = !on ? 'smart_off' : status === 'ready' ? 'smart_on' : 'smart_missing';
    const line = this.npc.template(key, { model: this.lore.embedModel });
    return { on: !!on, status, text: this.lore.statusText(), lines: [{ ...line, event: key }], view: this.view() };
  }

  saveConfigPatch(patch) {
    const p = path.join(this.appDir, 'config.json');
    let user = {};
    try { user = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { /* 新檔 */ }
    fs.writeFileSync(p, JSON.stringify(deepMerge(user, patch), null, 2), 'utf8');
    this.loadConfig();
  }

  loadState() {
    try { this.state = JSON.parse(fs.readFileSync(this.savePath, 'utf8')); } catch (_) { this.state = G.newState(); }
    this.state = deepMerge(G.newState(), this.state);
  }

  saveState() {
    const tmp = this.savePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.savePath);
  }

  planFile() {
    const p = this.config.plan.path;
    return path.isAbsolute(p) ? p : path.join(this.appDir, p);
  }

  loadPlan() {
    this.planError = null;
    try {
      this.planText = fs.readFileSync(this.planFile(), 'utf8');
      const r = parseAny(this.planText, this.planFile());
      this.plan = r.plan; this.legacy = r.legacy; this.P = r.legacy ? PlanLegacy : PlanNew;
      if (!this.plan.quests.length) this.planError = '計畫檔裡沒有任務：加一個「## 任務名 ⭐」和幾行「- [ ] 目標」就可以了';
      else if (this.legacy) this.planError = '這是舊格式的計畫檔，還能用；要改成新格式請執行 node tools/convert_plan.js';
    } catch (e) {
      this.plan = { title: '（沒有計畫檔）', quests: [], days: [], decisions: [], progressLog: [], overview: [] }; this.P = PlanNew; this.legacy = false;
      this.planError = `讀不到計畫檔：${this.planFile()}`;
    }
    this.ps = G.planState(this.state, this.plan.title);
    this.migrateIds();
    G.ensureActive(this.plan, this.ps, this.now());
    this.saveState();
  }

  // 舊存檔的任務 id 是位置（q1、q1-o0），新格式改成標題雜湊；照順序把狀態搬過去
  migrateIds() {
    if (this.legacy) return;
    const ps = this.ps;
    this.plan.quests.forEach((q, i) => {
      const oldId = `q${i + 1}`;
      if (ps.submitted[oldId] && !ps.submitted[q.id]) { ps.submitted[q.id] = ps.submitted[oldId]; delete ps.submitted[oldId]; }
      if (ps.activeQuestId === oldId) ps.activeQuestId = q.id;
      q.objectives.forEach((o, j) => {
        const oldO = `${oldId}-o${j}`;
        if (ps.awardedObjectives[oldO] && !ps.awardedObjectives[o.id]) { ps.awardedObjectives[o.id] = true; delete ps.awardedObjectives[oldO]; }
      });
    });
  }

  // 編輯計畫檔用：舊格式不支援
  requireEditable() {
    if (this.legacy) throw new Error('舊格式的計畫檔不能在程式裡編輯，請先用 tools/convert_plan.js 轉成新格式');
    if (!this.planText) throw new Error('沒有計畫檔');
  }

  // 任務改名會換 id：把狀態搬到新 id
  moveQuestState(oldId, newId) {
    if (!newId || oldId === newId) return;
    const ps = this.ps;
    if (ps.submitted[oldId]) { ps.submitted[newId] = ps.submitted[oldId]; delete ps.submitted[oldId]; }
    if (ps.activeQuestId === oldId) ps.activeQuestId = newId;
    for (const k of Object.keys(ps.awardedObjectives)) {
      if (k.startsWith(oldId + '-')) { ps.awardedObjectives[newId + k.slice(oldId.length)] = ps.awardedObjectives[k]; delete ps.awardedObjectives[k]; }
    }
  }

  // ---- 程式內新增／編輯／刪除 ----
  async addQuest(fields) {
    this.requireEditable();
    const title = String(fields.title || '').trim();
    if (!title) throw new Error('任務要有名稱');
    if (this.plan.quests.some((q) => q.title === title)) throw new Error('已經有同名的任務了');
    this.writePlan(this.P.addQuest(this.planText, { ...fields, title, objectives: (fields.objectives || []).map((o) => String(o).trim()).filter(Boolean) }));
    const q = this.plan.quests.find((x) => x.title === title);
    if (!this.ps.activeQuestId) G.ensureActive(this.plan, this.ps, this.now());
    this.saveState();
    const qv = q && G.questView(this.plan, this.ps, this.now()).find((x) => x.id === q.id);
    const lines = qv ? [await this.say('registered', { questView: qv, eventDetail: `冒險者自己登記了新委託「${q.title}」（${qv.tierName}，${qv.deadlineLabel || '沒有截止日'}）` })] : [];
    return { lines, questId: q && q.id, view: this.view() };
  }

  async editQuest(questId, fields) {
    this.requireEditable();
    const before = this.plan.quests.find((q) => q.id === questId);
    if (!before) throw new Error('找不到任務');
    this.writePlan(this.P.editQuest(this.planText, questId, fields));
    const after = fields.title ? this.plan.quests.find((q) => q.title === String(fields.title).trim()) : this.plan.quests.find((q) => q.id === questId);
    if (after) this.moveQuestState(questId, after.id);
    G.ensureActive(this.plan, this.ps, this.now());
    this.saveState();
    return { lines: [], questId: after && after.id, view: this.view() };
  }

  async deleteQuest(questId) {
    this.requireEditable();
    const q = this.plan.quests.find((x) => x.id === questId);
    if (!q) throw new Error('找不到任務');
    this.writePlan(this.P.deleteQuest(this.planText, questId));
    delete this.ps.submitted[questId];
    if (this.ps.activeQuestId === questId) this.ps.activeQuestId = null;
    G.ensureActive(this.plan, this.ps, this.now());
    this.saveState();
    return { lines: [], view: this.view() };
  }

  async addObjective(questId, text) {
    this.requireEditable();
    if (!String(text || '').trim()) throw new Error('目標要有內容');
    this.writePlan(this.P.addObjective(this.planText, questId, text));
    this.saveState();
    return { lines: [], view: this.view() };
  }

  async deleteObjective(questId, index) {
    this.requireEditable();
    this.writePlan(this.P.deleteObjective(this.planText, questId, index));
    if (!this.plan.quests.some((q) => q.id === questId)) { delete this.ps.submitted[questId]; if (this.ps.activeQuestId === questId) this.ps.activeQuestId = null; }
    G.ensureActive(this.plan, this.ps, this.now());
    this.saveState();
    return { lines: [], view: this.view() };
  }

  async addScheduleRow(dateISO, fields) {
    this.requireEditable();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !/^\d{2}:\d{2}$/.test(fields.start || '')) throw new Error('日期或時間格式不對');
    if (!String(fields.text || '').trim()) throw new Error('時段要有內容');
    this.writePlan(this.P.addScheduleRow(this.planText, dateISO, fields));
    return { lines: [], view: this.view() };
  }

  async deleteScheduleRow(rowId) {
    this.requireEditable();
    const row = this.plan.days.flatMap((d) => d.rows).find((r) => r.id === rowId);
    if (!row) throw new Error('找不到那一格');
    this.writePlan(this.P.removeLine(this.planText, row.line));
    delete this.ps.dailyDone[rowId];
    this.saveState();
    return { lines: [], view: this.view() };
  }

  async addReminder(fields) {
    this.requireEditable();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(fields.at || '')) throw new Error('提醒時間格式不對');
    if (!String(fields.text || '').trim()) throw new Error('提醒要有內容');
    this.writePlan(this.P.addReminder(this.planText, fields));
    const t = `${+fields.at.slice(5, 7)}/${+fields.at.slice(8, 10)} ${fields.at.slice(11, 16)}`;
    return { lines: [await this.say('reminder_set', { label: `${t} ${fields.text}`, eventDetail: `冒險者設了提醒：${t} ${fields.text}${fields.action ? `，到時要${fields.action}` : ''}` })], view: this.view() };
  }

  async deleteReminder(id) {
    this.requireEditable();
    const d = this.plan.decisions.find((x) => x.id === id);
    if (!d || d.line === undefined) throw new Error('找不到提醒');
    this.writePlan(this.P.removeLine(this.planText, d.line));
    return { lines: [], view: this.view() };
  }

  // ---- 行事曆（.ics）匯入／匯出 ----
  // 匯入範圍：計畫那一週（週一到週日），計畫沒寫日期就用現在這一週
  importRange() {
    const base = this.plan.weekStart ? new Date(this.plan.weekStart + 'T00:00:00') : this.now();
    const mon = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    let end = ICS.isoDate(sun);
    if (this.plan.weekEnd && this.plan.weekEnd > end) end = this.plan.weekEnd;
    return [ICS.isoDate(mon), end];
  }

  // 有時間的事件 → 那一天的時段；全天事件 → 那一天標題的主題；同一個事件不會重複匯入
  async importICS(text, { rangeStart, rangeEnd } = {}) {
    this.requireEditable();
    const cal = ICS.parseICS(text);
    if (!cal.events.length) throw new Error('這個檔案裡沒有行事曆事件（要 .ics 格式）');
    const [rs, re] = rangeStart && rangeEnd ? [rangeStart, rangeEnd] : this.importRange();
    const events = ICS.expandAll(cal.events, rs, re);
    const seen = this.ps.icsImported || (this.ps.icsImported = {});
    let content = this.planText;
    const added = [], themed = [];
    let skipped = 0;
    for (const ev of events) {
      if (ev.allDay) {
        for (let d = new Date(ev.start); d < ev.end; d.setDate(d.getDate() + 1)) {
          const date = ICS.isoDate(d);
          if (date < rs || date > re) continue;
          const key = `${ev.uid || ev.summary}|${date}`;
          const day = this.P.parsePlan(content).days.find((x) => x.date === date);
          const cur = day ? day.theme : '';
          if (seen[key] || cur.split(/[、，,／/]/).map((x) => x.trim()).includes(ev.summary)) { seen[key] = true; skipped++; continue; }
          content = this.P.setDayTheme(content, date, cur ? `${cur}、${ev.summary}` : ev.summary);
          seen[key] = true; themed.push(`${date} ${ev.summary}`);
        }
        continue;
      }
      const key = `${ev.uid || ev.summary}|${ev.date}T${ev.startHM}`;
      const sameDay = ICS.isoDate(ev.end) === ev.date && ev.endHM > ev.startHM;
      const label = ev.location ? `${ev.summary}（${ev.location}）` : ev.summary;
      const day = this.P.parsePlan(content).days.find((x) => x.date === ev.date);
      const dup = day && day.rows.some((r) => r.start === ev.startHM && (r.a === label || r.a === ev.summary));
      if (seen[key] || dup) { seen[key] = true; skipped++; continue; }
      content = this.P.addScheduleRow(content, ev.date, { start: ev.startHM, end: sameDay ? ev.endHM : '', text: label, output: '' });
      seen[key] = true; added.push(`${ev.date} ${ev.startHM} ${ev.summary}`);
    }
    if (content !== this.planText) this.writePlan(content);
    this.saveState();
    const parts = [added.length ? `${added.length} 格行程` : '', themed.length ? `${themed.length} 天主題` : ''].filter(Boolean).join('、');
    const label = parts ? `加了 ${parts}` : (skipped ? '都已經在計畫裡了，沒有新的' : `${rs}～${re} 這段沒有事件`);
    const lines = [await this.say('imported', { label, eventDetail: `冒險者從行事曆匯入：${label}${skipped ? `（${skipped} 個已存在略過）` : ''}，範圍 ${rs}～${re}` })];
    return { added, themed, skipped, total: events.length, range: [rs, re], calendar: cal.name, label, lines, view: this.view() };
  }

  // 時段 → 事件；提醒 → 15 分鐘事件＋鬧鐘；有截止日的任務 → 全天事件
  exportICS() {
    if (!this.planText) throw new Error('沒有計畫檔');
    const items = [];
    const uid = (s) => `${this.P.shortHash ? this.P.shortHash(`${this.plan.title}|${s}`) : Buffer.from(s).toString('base64').slice(0, 12)}@erin-desk`;
    const plus = (dateISO, hm, min) => { const d = new Date(`${dateISO}T${hm}:00`); return new Date(d.getTime() + min * 60000); };
    for (const d of this.plan.days) {
      for (const r of d.rows) {
        items.push({ uid: uid(`row|${d.date}|${r.start}|${r.a}`), summary: (this.ps.dailyDone[r.id] !== undefined ? this.ps.dailyDone[r.id] : r.done) ? `✅ ${r.a}` : r.a, description: r.b ? `產出：${r.b}` : '', start: `${d.date}T${r.start}:00`, end: r.end ? `${d.date}T${r.end}:00` : plus(d.date, r.start, 30) });
      }
    }
    for (const dec of this.plan.decisions) {
      items.push({ uid: uid(`rem|${dec.at}|${dec.condition}`), summary: `⏰ ${dec.condition}`, description: dec.action ? `應對：${dec.action}` : '', start: dec.at, end: plus(dec.date, dec.time, 15), alarmMinutes: 0 });
    }
    const tierMark = { main: '⭐', major: '🔧', side: '🌿' };
    for (const q of this.plan.quests) {
      if (!q.deadline || q.deadlineLabel === '本週內') continue;
      const next = new Date(q.deadline + 'T00:00:00'); next.setDate(next.getDate() + 1);
      const objs = q.objectives.map((o) => `${o.done ? '☑' : '☐'} ${o.text}`).join('\n');
      items.push({ uid: uid(`due|${q.deadline}|${q.title}`), summary: `${tierMark[q.tier] || ''} 截止：${q.title}`, description: [q.reason, objs].filter(Boolean).join('\n'), allDay: true, start: q.deadline, end: ICS.isoDate(next) });
    }
    return { text: ICS.buildICS(items, { name: this.plan.title }), count: items.length, title: this.plan.title };
  }

  writePlan(newText) {
    if (!this.config.plan.writeBack) { this.planText = newText; this.plan = this.P.parsePlan(newText, this.planFile()); return; }
    if (!this.backedUp) {
      const dir = path.join(this.dataDir, 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = this.now().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(this.planFile(), path.join(dir, `${path.basename(this.planFile(), '.md')}.${stamp}.md`));
      this.backedUp = true;
    }
    this.selfWriteAt = Date.now();
    fs.writeFileSync(this.planFile(), newText, 'utf8');
    this.planText = newText;
    this.plan = this.P.parsePlan(newText, this.planFile());
  }

  // ---- 檢視 ----
  todayInfo() {
    const now = this.now();
    const today = G.todayISO(now);
    const day = this.plan.days.find((d) => d.date === today) || null;
    if (!day) return { date: today, label: `${now.getMonth() + 1}/${now.getDate()}（${WEEKDAY[now.getDay()]}）`, rows: [], theme: '', branch: false };
    let current = null, upcoming = null;
    const rows = day.rows.map((r) => {
      const t = parseSlot(r.slot, day.date);
      const isCur = t && now >= t.start && now < t.end;
      const fileDone = r.done === true; // 檔案裡寫成 - [x] 的時段
      const row = { ...r, done: this.ps.dailyDone[r.id] !== undefined ? !!this.ps.dailyDone[r.id] : fileDone, current: !!isCur, past: !!(t && now >= t.end) };
      if (isCur) current = row;
      if (!upcoming && t && now < t.start) upcoming = row;
      return row;
    });
    return { ...day, rows, current, upcoming, chosenBranch: this.ps.branch[day.date] || null };
  }

  view() {
    const lv = G.levelInfo(this.state.player.xp, this.config.rewards.levelStep);
    const quests = G.questView(this.plan, this.ps, this.now());
    const today = G.todayISO(this.now());
    const progress = this.plan.progressLog.find((p) => p.date === today) || null;
    return {
      now: this.now().toISOString(),
      player: { ...this.state.player, ...lv },
      planTitle: this.plan.title, planPath: this.planFile(), planError: this.planError || this.configError || null,
      quests, active: quests.find((q) => q.active) || null,
      today: this.todayInfo(), progressToday: progress,
      decisions: this.plan.decisions.map((d) => ({ ...d, shown: !!this.ps.decisionsShown[d.id] })),
      history: this.state.history.slice(0, 20),
      npc: { name: this.config.npc.name, status: this.npc.status, enabled: !!this.config.llm.enabled, model: this.config.llm.model },
      writeBack: this.config.plan.writeBack,
      fx: this.config.window.transformFx !== false,
      editable: !this.legacy && !!this.planText,
      smart: { on: this.lore.smartOn(), status: this.lore.embedStatus },
      focus: this.focusInfo(),
      fortune: this.fortuneToday(),
    };
  }

  facts(extra = {}) {
    const now = this.now();
    const lv = G.levelInfo(this.state.player.xp, this.config.rewards.levelStep);
    const q = extra.questView || G.questView(this.plan, this.ps, now).find((x) => x.active);
    const t = this.todayInfo();
    const slotRow = t.current || null;
    const branch = t.chosenBranch;
    const f = {
      now: `${now.getMonth() + 1}/${now.getDate()}（${WEEKDAY[now.getDay()]}）${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      level: lv.level, title: lv.title, xpInLevel: lv.xpInLevel, xpForNext: lv.xpForNext,
      goldTotal: this.state.player.gold, streak: this.state.player.onTimeStreak,
      theme: t.theme || '',
      memory: this.state.memory.slice(0, 3).map((m) => m.note),
    };
    if (q) {
      Object.assign(f, {
        quest: q.title, tierName: q.tierName, reason: q.reason,
        progress: `${q.doneCount}/${q.total}`, left: q.total - q.doneCount,
        remaining: q.objectives.filter((o) => !o.done).map((o) => o.text).slice(0, 4),
        due: q.daysLeft === null ? '沒有截止日' : q.daysLeft > 1 ? `還有 ${q.daysLeft} 天截止（${q.deadlineLabel}）`
          : q.daysLeft === 1 ? `明天截止（${q.deadlineLabel}）` : q.daysLeft === 0 ? '今天截止' : `已逾期 ${-q.daysLeft} 天`,
      });
    }
    if (slotRow) {
      f.slot = slotRow.slot;
      f.block = t.branch ? (branch === 'b' ? slotRow.b : branch === 'a' ? slotRow.a : `${slotRow.a}／或 ${slotRow.b}`) : slotRow.a;
      f.output = t.branch ? '' : slotRow.b;
    }
    return { ...f, ...extra, questView: undefined };
  }

  async say(event, extra = {}, opts = {}) {
    const line = await this.npc.say(event, this.facts(extra), opts);
    return { ...line, event };
  }

  // ---- 動作 ----
  dayGreet(now = this.now()) {
    const h = now.getHours();
    return h < 11 ? '早安' : h < 14 ? '午安' : h < 18 ? '下午好' : '晚上好';
  }

  // 今天第一次見面用的一句話：日期、主題、委託數
  todayLine() {
    const now = this.now();
    const t = this.todayInfo();
    const open = G.questView(this.plan, this.ps, now).filter((q) => q.status !== 'done').length;
    const parts = [`今天是${t.label || `${now.getMonth() + 1}/${now.getDate()}`}`];
    if (t.theme) parts.push(`主題是「${t.theme}」`);
    if (open) parts.push(`還有 ${open} 個委託等著你`);
    return parts.join('，') + '。';
  }

  async greet() {
    const lines = [];
    const now = this.now();
    const today = G.todayISO(now);
    const overdue = G.questView(this.plan, this.ps, now).filter((q) => q.overdue);
    if (this.state.lastGreetDate !== today) {
      // 今天第一次啟動：早安問候
      this.state.lastGreetDate = today;
      this.saveState();
      lines.push(await this.say('morning', { dayGreet: this.dayGreet(now), todayLine: this.todayLine(), eventDetail: `今天第一次見面，${this.todayLine()}` }));
    } else {
      lines.push(await this.say('greet'));
    }
    if (overdue.length) lines.push(await this.say('overdue', { questView: overdue[0], eventDetail: `逾期任務：${overdue.map((q) => q.title).join('、')}` }));
    return { lines, view: this.view() };
  }

  // 點一下角色：符合個性的小反應。短時間內連戳會越來越無奈，戳五下會喵
  async poke() {
    const now = Date.now();
    this.pokeTimes = (this.pokeTimes || []).filter((t) => now - t < 12000);
    this.pokeTimes.push(now);
    const pokeCount = this.pokeTimes.length;
    const event = pokeCount >= 5 ? 'poke_meow' : pokeCount >= 3 ? 'poke_annoyed' : 'poke';
    // 從角色設定裡隨機抽一條當靈感，AI 的閒聊才不會每次都一樣
    const e = this.lore.entries.length ? this.lore.entries[Math.floor(Math.random() * this.lore.entries.length)] : null;
    const inspiration = e ? `${e.title}：${e.text.split(/[。！？\n]/)[0]}。` : '';
    const recent = (this.state.recentQuips || []);
    const line = await this.say(event, { pokeCount, inspiration, recent, eventDetail: `冒險者戳了你（12 秒內第 ${pokeCount} 次）` });
    if (line.tpl) { this.state.recentQuips = [line.tpl, ...recent].slice(0, 10); this.saveState(); }
    delete line.tpl;
    return { lines: [line], view: this.view() };
  }

  async setObjective(questId, index, done) {
    this.writePlan(this.P.setObjective(this.planText, questId, index, done));
    const q = this.plan.quests.find((x) => x.id === questId);
    const reward = G.onObjective(this.state, this.ps, questId, q.objectives[index], done, this.config.rewards);
    this.saveState();
    const lines = [];
    if (done) {
      const qv = G.questView(this.plan, this.ps, this.now()).find((x) => x.id === questId);
      lines.push(await this.say('objective', { questView: qv, eventDetail: `完成目標「${q.objectives[index].text}」` }));
      if (reward && reward.levelUp) lines.push(await this.say('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }));
    }
    return { reward, lines, view: this.view() };
  }

  async submit(questId, report = '') {
    const r = G.submitQuest(this.state, this.ps, this.plan, questId, report, this.now(), this.config.rewards);
    this.saveState();
    const lines = [];
    lines.push(await this.say('submit', {
      questView: r.quest, xp: r.xp, gold: r.gold, report,
      bonus: r.onTime ? '準時加成！' : '',
      eventDetail: `交付「${r.quest.title}」，獲得 ${r.xp} XP、${r.gold} 金幣${r.onTime ? '（含準時加成 20%）' : '（已逾期，無加成）'}`,
    }));
    if (r.levelUp) lines.push(await this.say('levelup', { level: r.levelUp.level, title: r.levelUp.title, eventDetail: `升到 Lv.${r.levelUp.level}，新稱號「${r.levelUp.title}」` }));
    if (r.next) {
      lines.push(await this.say('assign', { questView: G.questView(this.plan, this.ps, this.now()).find((x) => x.id === r.next.id), eventDetail: `指派新任務「${r.next.title}」` }));
    } else {
      lines.push(await this.say('all_clear'));
    }
    return { reward: r, lines, view: this.view() };
  }

  // ---- 🍅 專注模式：艾琳變回貓咪陪你，時間到叫你休息並給星屑 ----
  focusCfg() { return { minutes: 25, rest: 5, xp: 15, gold: 3, ...(this.config.focus || {}) }; }
  focusInfo() {
    const f = this.state.focus;
    const today = G.todayISO(this.now());
    const count = this.state.focusStats && this.state.focusStats.date === today ? this.state.focusStats.count : 0;
    if (!f) return { active: false, todayCount: count, minutes: this.focusCfg().minutes };
    const left = Math.max(0, f.endAt - this.now().getTime());
    return { active: true, startAt: f.startAt, endAt: f.endAt, minutes: f.minutes, leftMin: Math.ceil(left / 60000), todayCount: count };
  }
  focusLine(key, extra = {}) {
    const c = this.focusCfg();
    return { ...this.npc.template(key, { minutes: c.minutes, rest: c.rest, xp: c.xp, ...extra }), event: key };
  }
  startFocus(minutes) {
    if (this.state.focus) throw new Error('已經在專注中了');
    const min = Number(minutes) > 0 ? Number(minutes) : this.focusCfg().minutes;
    const start = this.now().getTime();
    this.state.focus = { startAt: start, endAt: start + Math.round(min * 60000), minutes: min };
    this.saveState();
    return { lines: [this.focusLine('focus_start', { minutes: Math.round(min) })], focus: this.focusInfo(), view: this.view() };
  }
  focusPeek() {
    const f = this.focusInfo();
    if (!f.active) return { lines: [], focus: f, view: this.view() };
    return { lines: [this.focusLine('focus_peek', { left: f.leftMin })], focus: f, view: this.view() };
  }
  cancelFocus() {
    const f = this.state.focus;
    if (!f) return { lines: [], focus: this.focusInfo(), view: this.view() };
    const done = Math.max(0, Math.floor((this.now().getTime() - f.startAt) / 60000));
    this.state.focus = null;
    this.saveState();
    return { lines: [this.focusLine('focus_cancel', { done })], focus: this.focusInfo(), view: this.view() };
  }
  // 時間到才算數（主程式的計時器會準時呼叫；太早呼叫就什麼都不做）
  completeFocus() {
    const f = this.state.focus;
    if (!f || this.now().getTime() < f.endAt - 1000) return null;
    const c = this.focusCfg();
    const today = G.todayISO(this.now());
    const stats = this.state.focusStats && this.state.focusStats.date === today ? this.state.focusStats : { date: today, count: 0 };
    stats.count += 1;
    this.state.focusStats = stats;
    this.state.focus = null;
    const reward = G.grant(this.state, { xp: c.xp, gold: c.gold }, `完成專注 ${Math.round(f.minutes)} 分鐘（今天第 ${stats.count} 顆🍅）`, this.config.rewards);
    this.saveState();
    const lines = [this.focusLine('focus_done', { minutes: Math.round(f.minutes), count: stats.count })];
    if (reward.levelUp) lines.push({ ...this.npc.template('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }), event: 'levelup' });
    return { reward, lines, focus: this.focusInfo(), view: this.view() };
  }

  // ---- 🔮 今日運勢：每天第一次抽有一點獎勵，之後再點就是再看一次 ----
  fortuneToday() {
    const f = this.state.fortune;
    return f && f.date === G.todayISO(this.now()) ? f : null;
  }
  drawFortune() {
    const today = G.todayISO(this.now());
    const had = this.fortuneToday();
    if (had) return { again: true, fortune: had, lines: [{ ...this.npc.template('fortune_again', had), event: 'fortune' }], view: this.view() };
    const rnd = this.rand || Math.random;
    const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
    let r = rnd() * FORTUNE_RANKS.reduce((n, x) => n + x.w, 0);
    const rank = FORTUNE_RANKS.find((x) => (r -= x.w) < 0) || FORTUNE_RANKS[FORTUNE_RANKS.length - 1];
    const fortune = { date: today, rank: rank.name, advice: pick(FORTUNE_ADVICE), item: pick(FORTUNE_ITEMS), xp: rank.xp, gold: rank.gold, tier: rank.tier };
    this.state.fortune = fortune;
    const reward = G.grant(this.state, { xp: rank.xp, gold: rank.gold }, `今日運勢：${rank.name}`, this.config.rewards);
    this.saveState();
    const lines = [{ ...this.npc.template('fortune', fortune), event: 'fortune' }];
    if (reward.levelUp) lines.push({ ...this.npc.template('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }), event: 'levelup' });
    return { again: false, fortune, reward, lines, view: this.view() };
  }

  async setActive(questId) {
    this.ps.activeQuestId = questId;
    this.saveState();
    const qv = G.questView(this.plan, this.ps, this.now()).find((x) => x.id === questId);
    return { lines: [await this.say('assign', { questView: qv, eventDetail: `冒險者自己選了任務「${qv.title}」` })], view: this.view() };
  }

  async toggleDaily(rowId, done) {
    const t = this.todayInfo();
    const row = [...this.plan.days.flatMap((d) => d.rows)].find((r) => r.id === rowId);
    const label = row ? (t.branch && this.ps.branch[t.date] === 'b' ? row.b : row.a) : rowId;
    const reward = G.onDailyRow(this.state, this.ps, rowId, label, done, this.config.rewards);
    this.saveState();
    // 新格式：時段勾選也寫回檔案（- [x] 09:00–10:30 …）
    if (!this.legacy && row && row.line !== undefined && this.P.setScheduleDone) {
      try { this.writePlan(this.P.setScheduleDone(this.planText, row.line, done)); } catch (_) { /* 寫不進去就只存在遊戲裡 */ }
    }
    return { reward, lines: [], view: this.view() };
  }

  async chooseBranch(dateISO, which) {
    this.ps.branch[dateISO] = which;
    this.saveState();
    const day = this.plan.days.find((d) => d.date === dateISO);
    const name = day ? day.columns[which === 'a' ? 1 : 2] : which;
    G.remember(this.state, `${dateISO} 選擇路線「${name}」`);
    return { lines: [await this.say('daily', { eventDetail: `冒險者選擇了「${name}」路線` })], view: this.view() };
  }

  async daily() {
    return { lines: [await this.say('daily')], view: this.view() };
  }

  async dailyReport(fields) {
    const date = G.todayISO(this.now());
    let writeError = null;
    try { this.writePlan(this.P.setProgress(this.planText, date, fields)); } catch (e) { writeError = e.message; }
    const reward = G.onDailyReport(this.state, this.ps, date, fields, this.config.rewards);
    this.saveState();
    const report = [fields.done, fields.blocker && `卡點：${fields.blocker}`, fields.next && `明天：${fields.next}`].filter(Boolean).join('；');
    const lines = [await this.say('daily_report', { report })];
    if (reward && reward.levelUp) lines.push(await this.say('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }));
    return { reward, lines, writeError, view: this.view() };
  }

  async chat(text) {
    const now = this.now();
    const cat = I.buildCatalog(this.plan, this.ps, this.todayInfo(), now);
    const hits = await this.lore.retrieve(text, (this.config.lore || {}).topK || 3); // 跟這句話相關的角色設定
    // 對話紀錄只給 AI 看「同一個當前任務、30 分鐘內」的：換了任務之後，舊對話裡的任務名會讓小模型講錯
    const quest = this.ps.activeQuestId || null;
    const at = this.now().getTime();
    const recent = this.state.chat.filter((h) => h.quest === quest && h.at && at - h.at < 30 * 60000);
    this.state.chat.push({ role: 'user', content: text, quest, at });
    const line = await this.say('chat', {}, {
      userText: text,
      history: recent, // npc 會再濾掉備援台詞那幾輪，取最後 6 句
      extraSystem: I.ACTION_RULES,
      extraProps: I.ACTION_SCHEMA,
      extraUser: [I.catalogText(cat), this.lore.contextText(hits)].filter(Boolean).join('\n\n'),
      maxTokens: 320,
    });
    // AI 給的動作；AI 離線時改用關鍵字解析
    const raw = line.source === 'llm' ? ((line.data && line.data.actions) || []) : I.ruleParse(text, cat);
    const items = I.validate(raw, cat);
    let proposal = null;
    if (items.length) {
      proposal = { id: `p${Date.now()}`, items, text };
      this.pendingProposal = proposal;
      if (line.source !== 'llm') {
        line.text = items.length === 1 ? `要幫你${items[0].label}嗎？` : `${this.npc.names().self}整理了 ${items.length} 項變更，確認一下喔～`;
        line.emotion = 'thinking';
      }
    } else if (line.source !== 'llm') {
      const noop = I.explainNoop(text, cat);
      const lore = hits.find((h) => h.strong && h.entry.reply); // 離線：關鍵字直接命中的設定，用預寫台詞回
      if (noop) { line.text = noop; line.emotion = 'happy'; }
      else if (lore) { line.text = lore.entry.reply; line.emotion = lore.entry.emotion || 'normal'; line.source = 'lore'; }
      else if (/(完|好了|搞定|取消|交付|提交|勾)/.test(text)) {
        line.text = `嗯……${this.npc.names().self}找不到你說的是哪一項。可以說得更具體一點，或直接到任務板勾選喔。`;
        line.emotion = 'thinking';
      }
    }
    delete line.data;
    this.state.chat.push({ role: 'assistant', content: JSON.stringify({ line: line.text, emotion: line.emotion }), source: line.source, quest, at: this.now().getTime() }); // source=template 的不會再給模型看
    this.state.chat = this.state.chat.slice(-20);
    this.saveState();
    return { lines: [line], proposal, view: this.view() };
  }

  cancelProposal() {
    this.pendingProposal = null;
    return { lines: [{ text: '好，那就先不動。', emotion: 'normal', source: 'template', event: 'chat' }], view: this.view() };
  }

  // 套用聊天提案；keep = 玩家勾選要執行的項目索引
  async confirmProposal(id, keep) {
    const p = this.pendingProposal;
    if (!p || p.id !== id) throw new Error('這個提案已經過期了，請再說一次');
    this.pendingProposal = null;
    const items = p.items.filter((_, i) => !keep || keep.includes(i));
    const total = { xp: 0, gold: 0, levelUp: null };
    const add = (r) => { if (!r) return; total.xp += r.xp; total.gold += r.gold; if (r.levelUp) total.levelUp = r.levelUp; };
    const done = [], failed = [];
    let submitted = null, writeError = null;
    let text = this.planText;
    // 先把勾選一次寫進檔案
    for (const it of items.filter((x) => x.type === 'check' || x.type === 'uncheck')) {
      try { text = this.P.setObjective(text, it.questId, it.index, it.type === 'check'); } catch (e) { failed.push(`${it.label}（${e.message}）`); }
    }
    if (text !== this.planText) this.writePlan(text);
    for (const it of items) {
      try {
        if (it.type === 'check' || it.type === 'uncheck') {
          const q = this.plan.quests.find((x) => x.id === it.questId);
          add(G.onObjective(this.state, this.ps, it.questId, q.objectives[it.index], it.type === 'check', this.config.rewards));
        } else if (it.type === 'activate') {
          this.ps.activeQuestId = it.questId;
        } else if (it.type === 'daily_done' || it.type === 'daily_undo') {
          add(G.onDailyRow(this.state, this.ps, it.rowId, it.label, it.type === 'daily_done', this.config.rewards));
        } else if (it.type === 'report') {
          try { this.writePlan(this.P.setProgress(this.planText, G.todayISO(this.now()), it.fields)); } catch (e) { writeError = e.message; }
          add(G.onDailyReport(this.state, this.ps, G.todayISO(this.now()), it.fields, this.config.rewards));
        } else if (it.type === 'submit') {
          const r = G.submitQuest(this.state, this.ps, this.plan, it.questId, it.report || p.text, this.now(), this.config.rewards);
          add(r); submitted = r;
        }
        done.push(it.label);
      } catch (e) { failed.push(`${it.label}（${e.message}）`); }
    }
    this.saveState();
    const lines = [];
    if (submitted) {
      lines.push(await this.say('submit', {
        questView: submitted.quest, xp: submitted.xp, gold: submitted.gold, report: it0(items, 'submit').report || p.text,
        bonus: submitted.onTime ? '準時加成！' : '',
        eventDetail: `透過聊天交付「${submitted.quest.title}」，這次總共獲得 ${total.xp} XP`,
      }));
    } else if (done.length) {
      const qv = G.questView(this.plan, this.ps, this.now()).find((x) => x.active);
      lines.push(await this.say('objective', { questView: qv, eventDetail: `照冒險者說的更新了進度：${done.join('、')}` }));
    }
    if (failed.length) lines.push({ text: `有幾項沒辦法處理：${failed.join('、')}`, emotion: 'worried', source: 'template', event: 'chat' });
    if (total.levelUp) lines.push(await this.say('levelup', { level: total.levelUp.level, title: total.levelUp.title, eventDetail: `升到 Lv.${total.levelUp.level}，新稱號「${total.levelUp.title}」` }));
    if (submitted) {
      if (submitted.next) lines.push(await this.say('assign', { questView: G.questView(this.plan, this.ps, this.now()).find((x) => x.id === submitted.next.id), eventDetail: `指派新任務「${submitted.next.title}」` }));
      else lines.push(await this.say('all_clear'));
    } else if (items.some((x) => x.type === 'activate')) {
      G.ensureActive(this.plan, this.ps, this.now());
    }
    return { reward: total.xp ? total : null, lines, writeError, view: this.view() };
  }

  // 每分鐘呼叫：作息提醒（午休／上班／下班）＋決策點提醒
  async tick() {
    const now = this.now();
    const out = [];
    const cfg = this.config.reminders || {};
    const today = G.todayISO(now);
    const weekday = now.getDay() >= 1 && now.getDay() <= 5;
    if (Array.isArray(cfg.items) && (!cfg.weekdaysOnly || weekday)) {
      this.state.reminded = { [today]: (this.state.reminded || {})[today] || {} }; // 只留今天的紀錄
      const fired = this.state.reminded[today];
      const grace = (Number(cfg.graceMinutes) || 15) * 60000;
      for (const r of cfg.items) {
        const m = String(r.time || '').match(/^(\d{1,2}):(\d{2})$/);
        if (!m) continue;
        const key = `${r.time}|${r.event || 'custom'}`;
        if (fired[key]) continue;
        const at = new Date(`${today}T${m[1].padStart(2, '0')}:${m[2]}:00`);
        if (now < at) continue;
        fired[key] = true; // 過了寬限時間也標記，避免晚上啟動時把一整天的提醒全部倒出來
        if (now - at > grace) continue;
        const event = ['lunch', 'afternoon', 'wrapup', 'custom'].includes(r.event) ? r.event : 'custom';
        const label = r.label || { lunch: '午休時間，去吃飯、睡個午覺', afternoon: '午休結束，回到工作', wrapup: '準備下班，交今天的日報' }[event] || '';
        const extra = { label, eventDetail: `${r.time} 的提醒：${label}` };
        if (event === 'afternoon') { // 下午第一件事：現在這格，沒有的話就是接下來那格
          const t = this.todayInfo(); const row = t.current || t.upcoming;
          if (row) { const b = t.branch ? (t.chosenBranch === 'b' ? row.b : row.a) : row.a; extra.block = b; extra.eventDetail += `；下午第一件事是 ${row.slot} ${b}`; }
        }
        out.push(await this.say(event, extra));
      }
    }
    for (const d of this.plan.decisions) {
      if (this.ps.decisionsShown[d.id]) continue;
      const at = new Date(d.at);
      if (now >= at && now - at < 12 * 3600 * 1000) {
        this.ps.decisionsShown[d.id] = true;
        out.push(await this.say('reminder', { label: d.label, action: d.action, eventDetail: `決策點「${d.label}」到了，計畫的應對：${d.action}` }));
      }
    }
    if (out.length) this.saveState();
    return out;
  }
}

function it0(items, type) { return items.find((x) => x.type === type) || {}; }

module.exports = { Engine };
