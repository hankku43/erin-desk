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
const MH = require('./meihua');
const A = require('./affection');
const T = require('./tutorial');
const M = require('./memory');
const J = require('./journal');
const S = require('./shop');
const C = require('./cards');
const AC = require('./achievements');

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
  // appDir：程式本身的檔案（打包後是唯讀的）；userDir：設定、計畫、存檔（開發時兩個是同一個資料夾）
  constructor({ appDir, userDir, dataDir, now } = {}) {
    this.appDir = appDir;
    this.userDir = userDir || appDir;
    this.dataDir = dataDir || path.join(this.userDir, 'data');
    this.nowFn = now || (() => new Date());
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.savePath = path.join(this.dataDir, 'save.json');
    this.loadConfig();
    this.loadLore();
    this.npc = new NPC(this.config);
    this.npc.setLogFile(path.join(this.dataDir, 'llm.log')); // 每次呼叫 AI 的耗時，AI 常回不出來時看這裡
    this.loadState();
    this.backedUp = false;
    this.affPending = []; // 好感度事件（冷戰開始…），settle() 時變成台詞
    this.tutPending = []; // 新手任務完成的台詞
    // 動作後的話可以「先做事、話晚點說」：main.js 會打開 deferSpeech，測試時照舊等 AI 說完
    this.deferSpeech = false; this.onSpeech = null; this.speechQueue = []; this.speechBusy = false; this.speechSeq = 0; this.viewRev = 0;
    this.lastTouch = this.now().getTime(); // 冒險者最後一次碰艾琳的視窗（主動聊天看這個決定要不要開口）
    // 新手引導：第一次用的人才需要；已經在用的存檔直接當作完成
    if (!this.state.onboarding) { this.state.onboarding = { done: !this.isFreshUser() }; this.saveState(); }
    this.loadPlan();
  }

  now() { return this.nowFn(); }

  loadConfig() {
    const defaults = {
      plan: { path: 'plans/week_sample.md', writeBack: true },
      npc: { name: '艾琳', role: '公會櫃台接待員', personality: '開朗溫柔', callName: '冒險者', selfName: '', catchphrases: [] }, // selfName 空白＝用 name 自稱
      llm: { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:4b', noThinkPrefix: '/no_think\n' },
      rewards: G.DEFAULT_REWARDS,
      window: { alwaysOnTop: true, idleChatterMinutes: 30 },
      lore: { path: 'lore/艾琳.md', topK: 3, embeddings: 'auto', embedModel: 'qwen3-embedding:0.6b' },
      focus: { minutes: 25, rest: 5, xp: 15, gold: 3 }, // 🍅 專注模式
      divination: { cost: 10, repeatHours: 24 }, // ✨ 占卜魔法：每次花費的金幣、一事不二占的時間
      notebook: { enabled: true }, // 📒 艾琳的小本子（其他欄位見 memory.js DEFAULTS）
      journal: { enabled: true }, // 📖 冒險日誌＋週報（labels、keep 見 journal.js DEFAULTS）
      achievements: { enabled: true }, // 🏅 成就徽章牆
      streak: { enabled: true }, // 🔥 連續上工（restDays、base、cap、milestones 見 achievements.js STREAK）
      reminders: {
        weekdaysOnly: true, graceMinutes: 15,
        items: [
          { time: '12:00', event: 'lunch' },
          { time: '13:00', event: 'afternoon' },
          { time: '16:50', event: 'wrapup' },
        ],
      },
    };
    const p = this.configFile();
    const example = path.join(this.appDir, 'config.example.json');
    if (!fs.existsSync(p) && fs.existsSync(example)) fs.writeFileSync(p, fs.readFileSync(example)); // 第一次啟動：從範例建立自己的設定檔（打包後範例在 asar 裡，用讀寫代替複製）
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
    const file = this.resolveFile(c.path || 'lore/艾琳.md');
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

  configFile() { return path.join(this.userDir, 'config.json'); }
  // 相對路徑：先找使用者資料夾，沒有的話用程式內建的（例如打包後還沒複製出來的範例）
  resolveFile(p) {
    if (path.isAbsolute(p)) return p;
    const mine = path.join(this.userDir, p);
    if (fs.existsSync(mine) || this.userDir === this.appDir) return mine;
    const builtIn = path.join(this.appDir, p);
    return fs.existsSync(builtIn) ? builtIn : mine;
  }

  saveConfigPatch(patch) {
    const p = this.configFile();
    let user = {};
    try { user = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { /* 新檔 */ }
    fs.writeFileSync(p, JSON.stringify(deepMerge(user, patch), null, 2), 'utf8');
    this.loadConfig();
  }

  loadState() {
    try { this.state = JSON.parse(fs.readFileSync(this.savePath, 'utf8')); } catch (_) { this.state = G.newState(); }
    this.state = deepMerge(G.newState(), this.state);
    // 成就用的累計次數：舊存檔第一次打開時，從還留著的紀錄補算（之後每次給獎勵都會記）
    if (!this.state.stats) this.state.stats = this.bootstrapStats();
    if (!this.state.shop) this.state.shop = S.blank();
    if (!this.state.collection) this.state.collection = C.blank();
    if (!this.state.achievements) this.state.achievements = {};
    if (!this.state.streak) this.state.streak = AC.blankStreak();
  }
  bootstrapStats() {
    const st = this.state;
    const plans = Object.values(st.plans || {});
    const sum = (f) => plans.reduce((n, p) => n + f(p), 0);
    const hist = (re) => (st.history || []).filter((h) => re.test(h.reason || '')).length;
    return {
      objectives: sum((p) => Object.keys(p.awardedObjectives || {}).length),
      quests: (st.player && st.player.questsDone) || 0,
      onTime: sum((p) => Object.values(p.submitted || {}).filter((x) => x.onTime).length),
      rows: sum((p) => Object.values(p.dailyDone || {}).filter(Boolean).length),
      reports: sum((p) => Object.keys(p.dailyReported || {}).length),
      focus: hist(/^完成專注/), fortunes: hist(/^今日運勢/), daikichi: hist(/^今日運勢：大吉/), divinations: hist(/^占卜魔法/),
    };
  }

  saveState() {
    this.syncJournal(); // 📖 這週的日誌跟著存（換下一週的計畫檔之後還翻得到）
    const tmp = this.savePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.savePath);
  }

  planFile() { return this.resolveFile(this.config.plan.path); }

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
    const lines = qv ? [await this.act('registered', { questView: qv, eventDetail: `冒險者自己登記了新委託「${q.title}」（${qv.tierName}，${qv.deadlineLabel || '沒有截止日'}）` })] : [];
    return this.settle({ lines, questId: q && q.id, view: this.view() });
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
    return this.settle({ lines: [await this.act('reminder_set', { label: `${t} ${fields.text}`, eventDetail: `冒險者設了提醒：${t} ${fields.text}${fields.action ? `，到時要${fields.action}` : ''}` })], view: this.view() });
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
    const lines = [await this.act('imported', { label, eventDetail: `冒險者從行事曆匯入：${label}${skipped ? `（${skipped} 個已存在略過）` : ''}，範圍 ${rs}～${re}` })];
    return this.settle({ added, themed, skipped, total: events.length, range: [rs, re], calendar: cal.name, label, lines, view: this.view() });
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
      rev: ++this.viewRev, // 畫面用：比較新舊，舊的回應不會蓋掉新的
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
      idleAnim: this.config.window.idleAnim !== false, // 待機小動作
      hud: this.config.window.hud !== false, // 左下角的狀態欄（等級、當前任務）；關掉就只剩艾琳
      editable: !this.legacy && !!this.planText,
      smart: { on: this.lore.smartOn(), status: this.lore.embedStatus },
      focus: this.focusInfo(),
      divination: this.divineInfo(),
      fortune: this.fortuneToday(),
      affection: { cold: this.isCold(), fond: this.affOn() && this.affStage() >= 4 }, // 好感度本身不給畫面看；fond＝很熟了（待機會冒 ♡）
      onboarding: { needed: !(this.state.onboarding && this.state.onboarding.done) },
      tutorial: this.tutorialInfo(),
      schedule: this.scheduleInfo(),
      llm: { enabled: !!this.config.llm.enabled, model: this.config.llm.model },
      notebook: { count: this.nb().items.length, enabled: this.nbCfg().enabled !== false },
      projects: J.projects(this.state), // 以前用過的專案（新任務表單的選項）
      decor: { ...this.state.shop.equip }, // 🛒 主題配色、櫃台吊飾／擺設
      streak: this.streakOn() ? AC.current(this.state.streak, G.todayISO(this.now()), this.streakOpts()) : 0,
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
    this.npc.relation = this.relationInfo();
    const line = await this.npc.say(event, this.facts(extra), opts);
    return { ...line, event };
  }

  // 動作（勾目標、交付、換任務…）之後的一句話：
  // deferSpeech 時先排隊、動作立刻完成（畫面不用等 AI），說完再用 onSpeech 推給畫面；
  // opts.coalesce：同一類的話還沒開始說就被新的取代（連勾三個目標只說最新的那句）
  async act(event, extra = {}, opts = {}) {
    if (!this.deferSpeech) return this.say(event, extra, opts);
    const { coalesce, ...rest } = opts;
    const job = { event, facts: this.facts(extra), opts: rest, relation: this.relationInfo(), coalesce: coalesce || null };
    if (job.coalesce) for (const j of this.speechQueue) if (j.coalesce === job.coalesce) j.dropped = true;
    this.speechQueue.push(job);
    this.speechSeq += 1;
    this.pumpSpeech();
    return null;
  }
  async pumpSpeech() {
    if (this.speechBusy) return;
    this.speechBusy = true;
    try {
      while (this.speechQueue.length) {
        const job = this.speechQueue.shift();
        if (job.dropped) continue;
        this.npc.relation = job.relation;
        let line;
        try { line = await this.npc.say(job.event, job.facts, job.opts); } catch (_) { line = this.npc.template(job.event, job.facts); }
        line = { ...line, event: job.event, deferred: true };
        delete line.tpl;
        try { if (this.onSpeech) this.onSpeech([line]); } catch (_) { /* 畫面關了就算了 */ }
      }
    } finally { this.speechBusy = false; }
  }
  // 等排隊的話全部說完（測試用）
  async speechIdle() { while (this.speechBusy || this.speechQueue.length) await new Promise((r) => setTimeout(r, 5)); }

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
      this.affect(this.affCfg().gain.greet, '今天第一次見面');
      this.saveState();
      lines.push(await this.say('morning', { dayGreet: this.dayGreet(now), todayLine: this.todayLine(), eventDetail: `今天第一次見面，${this.todayLine()}` }));
    } else {
      lines.push(await this.say('greet'));
    }
    if (overdue.length) lines.push(await this.say('overdue', { questView: overdue[0], eventDetail: `逾期任務：${overdue.map((q) => q.title).join('、')}` }));
    lines.push(...await this.noteDateLines()); // 📒 今天是小本子上的重要日子
    return this.settle({ lines, view: this.view() });
  }

  // 點一下角色：符合個性的小反應。短時間內連戳會越來越無奈，戳五下會喵
  async poke() {
    const now = Date.now();
    this.pokeTimes = (this.pokeTimes || []).filter((t) => now - t < 12000);
    this.pokeTimes.push(now);
    const pokeCount = this.pokeTimes.length;
    const event = pokeCount >= 5 ? 'poke_meow' : pokeCount >= 3 ? 'poke_annoyed' : 'poke';
    // 冷戰中：不理你（不問 AI、也不再扣）
    if (this.isCold()) return { lines: [{ ...this.affTpl('poke_cold'), event: 'poke' }], view: this.view() };
    const stage = this.affStage();
    // 從角色設定裡隨機抽一條當靈感，AI 的閒聊才不會每次都一樣（還沒解鎖的不抽）
    const pool = this.lore.entries.filter((x) => (x.minStage || 0) <= stage);
    const e = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    const inspiration = e ? `${e.title}：${e.text.split(/[。！？\n]/)[0]}。` : '';
    const recent = (this.state.recentQuips || []);
    // 偶爾害羞；戳太多下偶爾露出鄙視的眼神（越熟越包容）
    const chance = this.emotionChance();
    const disdainChance = this.affOn() ? A.pick(this.affCfg().pokeDisdain, stage) : chance;
    const mood = event === 'poke' ? (this.rnd() < chance * 0.4 ? 'shy' : null) : event === 'poke_annoyed' ? (this.rnd() < disdainChance ? 'disdain' : null) : null;
    const line = await this.say(event, { pokeCount, inspiration, recent, eventDetail: `冒險者戳了你（12 秒內第 ${pokeCount} 次）` }, { mood });
    if (line.tpl) { this.state.recentQuips = [line.tpl, ...recent].slice(0, 10); this.saveState(); }
    delete line.tpl;
    const loss = this.affCfg().loss;
    if (event === 'poke_annoyed') this.affect(-loss.poke_annoyed, '一直戳艾琳');
    if (event === 'poke_meow') { this.affect(-loss.poke_meow, '一直戳艾琳'); this.offense('poke'); }
    return this.settle({ lines: [line], view: this.view() });
  }

  async setObjective(questId, index, done) {
    this.writePlan(this.P.setObjective(this.planText, questId, index, done));
    const q = this.plan.quests.find((x) => x.id === questId);
    const reward = G.onObjective(this.state, this.ps, questId, q.objectives[index], done, this.config.rewards, this.now());
    this.saveState();
    const lines = [];
    if (done) {
      const qv = G.questView(this.plan, this.ps, this.now()).find((x) => x.id === questId);
      lines.push(await this.act('objective', { questView: qv, eventDetail: `完成目標「${q.objectives[index].text}」` }, { coalesce: 'objective' }));
      if (reward && reward.levelUp) lines.push(await this.act('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }));
    }
    if (reward) this.affect(this.affCfg().gain.objective, '完成目標'); // 第一次完成才有（跟星屑一樣）
    if (reward) this.workDone = true; // 🔥 今天上工了
    if (done) this.tutorialMark('objective');
    return this.settle({ reward, lines, view: this.view() });
  }

  async submit(questId, report = '') {
    const r = G.submitQuest(this.state, this.ps, this.plan, questId, report, this.now(), this.config.rewards);
    this.affect(this.affCfg().gain.submit + (r.onTime ? this.affCfg().gain.onTime : 0), r.onTime ? '準時交付任務' : '交付任務');
    this.tutorialMark('submit');
    this.workDone = true;
    this.saveState();
    const lines = [];
    lines.push(await this.act('submit', {
      questView: r.quest, xp: r.xp, gold: r.gold, report,
      bonus: r.onTime ? '準時加成！' : '',
      eventDetail: `交付「${r.quest.title}」，獲得 ${r.xp} XP、${r.gold} 金幣${r.onTime ? '（含準時加成 20%）' : '（已逾期，無加成）'}`,
    }));
    if (r.levelUp) lines.push(await this.act('levelup', { level: r.levelUp.level, title: r.levelUp.title, eventDetail: `升到 Lv.${r.levelUp.level}，新稱號「${r.levelUp.title}」` }));
    if (r.next) {
      lines.push(await this.act('assign', { questView: G.questView(this.plan, this.ps, this.now()).find((x) => x.id === r.next.id), eventDetail: `指派新任務「${r.next.title}」` }));
    } else {
      lines.push(await this.act('all_clear'));
    }
    return this.settle({ reward: r, lines, view: this.view() });
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
    this.tutorialMark('focus');
    this.saveState();
    return this.settle({ lines: [this.focusLine('focus_start', { minutes: Math.round(min) })], focus: this.focusInfo(), view: this.view() });
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
    const reward = G.grant(this.state, { xp: c.xp, gold: c.gold }, `完成專注 ${Math.round(f.minutes)} 分鐘（今天第 ${stats.count} 顆🍅）`, this.config.rewards, this.now());
    if (f.minutes >= 10) this.affect(this.affCfg().gain.focus, '完成專注');
    this.workDone = true;
    this.saveState();
    const lines = [this.focusLine('focus_done', { minutes: Math.round(f.minutes), count: stats.count })];
    if (reward.levelUp) lines.push({ ...this.npc.template('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }), event: 'levelup' });
    return this.settle({ reward, lines, focus: this.focusInfo(), view: this.view() });
  }

  // ---- 🔮 今日運勢：每天第一次抽有一點獎勵，之後再點就是再看一次 ----
  // ---- ✨ 占卜魔法（艾琳的「星環占」＝梅花易數）----
  divCfg() { return { cost: 10, repeatHours: 24, ...(this.config.divination || {}) }; }
  rnd() { return (this.rand || Math.random)(); }
  // 聊到稱讚／感情／秘密（或戳她）時，這次真的害羞的機率 0～1：
  // config 的 lore.emotionChance 有填就固定用它，沒填就看好感階段（越熟越容易害羞）
  emotionChance() {
    const raw = (this.config.lore || {}).emotionChance;
    const c = Number(raw);
    if (raw !== undefined && raw !== null && raw !== '' && Number.isFinite(c)) return Math.min(1, Math.max(0, c));
    return this.affOn() ? A.pick(this.affCfg().shyChance, this.affStage()) : 0.5;
  }

  // ---- 💗 隱藏好感度：畫面上沒有數字，只會從艾琳的態度感覺出來 ----
  affCfg() { return A.config(this.config.affection || {}); }
  affOn() { return this.affCfg().enabled !== false; }
  aff() {
    const today = G.todayISO(this.now());
    let a = this.state.affection;
    if (!a) a = this.state.affection = { points: 0, stage: 1, maxStage: 1, day: today, gainedToday: 0, kindToday: 0, apologyDay: null, coldUntil: 0, offenses: [], spam: [], log: [] };
    if (a.day !== today) { a.day = today; a.gainedToday = 0; a.kindToday = 0; a.topicToday = 0; }
    return a;
  }
  affStage() { if (!this.affOn()) return 99; const a = this.aff(); return A.stageOf(a.points, a.stage, this.affCfg().thresholds); }
  isCold() { return this.affOn() && this.aff().coldUntil > this.now().getTime(); }
  // 加減好感：加分有每日上限（道歉這種「挽回」不算），扣分沒有；最低 0
  affect(delta, reason, { uncapped = false } = {}) {
    if (!this.affOn() || !delta) return 0;
    const a = this.aff();
    if (delta > 0 && !uncapped) { delta = Math.min(delta, Math.max(0, this.affCfg().dailyCap - a.gainedToday)); a.gainedToday += delta; }
    if (!delta) return 0;
    const before = a.points;
    a.points = Math.max(0, a.points + delta);
    a.log = [{ at: this.now().toISOString(), delta: a.points - before, reason }, ...(a.log || [])].slice(0, 60);
    this.saveState();
    return a.points - before;
  }
  // 記一次失禮：10 分鐘內三次（或騷擾兩次）就冷戰
  offense(kind) {
    const a = this.aff();
    const at = this.now().getTime();
    a.offenses = [...(a.offenses || []), { at, kind }].filter((o) => at - o.at < 24 * 3600000).slice(-30);
    const recent = a.offenses.filter((o) => at - o.at < 10 * 60000);
    if (!this.isCold() && (recent.length >= 3 || recent.filter((o) => o.kind === 'harass').length >= 2)) {
      a.coldUntil = at + this.affCfg().coldMinutes * 60000;
      this.affPending.push('cold_start');
    }
  }
  relationInfo() {
    if (!this.affOn()) return null;
    const st = A.stageInfo(this.affStage());
    return { stage: st.n, name: st.name, desc: st.desc, cold: this.isCold() };
  }
  affTpl(key, extra = {}) { const l = { ...this.npc.template(key, extra), event: 'affection' }; delete l.tpl; return l; }
  // 每個動作結束前呼叫：露出鄙視的臉要多扣；升降階、冷戰開始的台詞接在後面
  settle(res) {
    if (!res) return res;
    const lines = (res.lines || []).filter(Boolean); // act() 排隊時回傳 null
    const extra = this.tutPending.splice(0);
    if (this.affOn()) {
      for (const l of lines) if (l && l.emotion === 'disdain') this.affect(-this.affCfg().loss.disdain, '露出鄙視的眼神');
      const a = this.aff();
      extra.push(...this.affPending.splice(0).map((k) => this.affTpl(k)));
      const st = A.stageOf(a.points, a.stage, this.affCfg().thresholds);
      if (st > a.stage) {
        extra.push(this.affTpl(`stageup_${st}`));
        if (st > (a.maxStage || 1)) { G.grant(this.state, { xp: 0, gold: 10 * st }, '艾琳的心意', this.config.rewards, this.now()); a.maxStage = st; }
      } else if (st < a.stage) extra.push(this.affTpl('stagedown'));
      a.stage = st;
    }
    // 🔥 今天第一次完成事情：上工打卡（金幣），到了 3、7、14…天另外有獎勵
    if (this.workDone) {
      this.workDone = false;
      const ck = this.streakOn() ? AC.checkIn(this.state.streak, G.todayISO(this.now()), this.streakOpts()) : null;
      if (ck) {
        G.grant(this.state, { xp: 0, gold: ck.gold }, `連續上工第 ${ck.cur} 天`, this.config.rewards, this.now());
        if (ck.milestone) {
          G.grant(this.state, { xp: 0, gold: ck.milestone }, `連續上工 ${ck.cur} 天達成`, this.config.rewards, this.now());
          extra.push(this.lineOf('streak_milestone', { days: ck.cur, gold: ck.milestone }, 'streak'));
        }
        res.streak = ck;
      }
    }
    // 🏅 新達成的成就：每個送一次金幣
    const got = (this.config.achievements || {}).enabled === false ? [] : AC.check(this.state.achievements, this.achCtx(), this.now().getTime());
    if (got.length) {
      for (const a of got) G.grant(this.state, { xp: 0, gold: a.gold }, `成就：${a.name}`, this.config.rewards, this.now());
      const gold = got.reduce((n, a) => n + a.gold, 0);
      extra.push(got.length === 1 ? this.lineOf('achievement', { name: got[0].name, gold }, 'achievement')
        : this.lineOf('achievement_many', { count: got.length, names: got.map((a) => a.name).slice(0, 3).join('」「') + (got.length > 3 ? '」…「' : ''), gold }, 'achievement'));
      res.achievements = got.map((a) => ({ id: a.id, icon: a.icon, name: a.name, gold: a.gold }));
    }
    this.saveState();
    res.lines = [...lines, ...extra];
    if (res.view) res.view = this.view();
    return res;
  }

  // ---- 🎓 新手引導與新手任務 ----
  isFreshUser() { return !(this.state.history || []).length && !(this.state.player && this.state.player.xp) && !(this.state.chat || []).length; }
  tutorialInfo() {
    const t = this.state.tutorial;
    if (!t || !t.active) return null;
    const items = T.TUTORIAL.map((i) => ({ ...i, label: i.label.replace('艾琳', this.config.npc.name), done: !!(t.done || {})[i.key] }));
    return { items, count: items.filter((i) => i.done).length, total: items.length, finished: !!t.finished };
  }
  startTutorial() { this.state.tutorial = { active: true, done: {}, finished: false, startedAt: this.now().toISOString() }; this.saveState(); }
  hideTutorial() { if (this.state.tutorial) { this.state.tutorial.active = false; this.saveState(); } return { view: this.view() }; }
  // 完成一個新手任務：小獎勵＋一句話（在 settle() 時接到台詞後面）
  tutorialMark(key) {
    const t = this.state.tutorial;
    if (!t || !t.active || t.finished) return false;
    t.done = t.done || {};
    if (t.done[key]) return false;
    const item = T.TUTORIAL.find((i) => i.key === key);
    if (!item) return false;
    t.done[key] = this.now().toISOString();
    const label = item.label.replace('艾琳', this.config.npc.name);
    G.grant(this.state, T.STEP_REWARD, `新手任務：${label}`, this.config.rewards, this.now());
    const n = Object.keys(t.done).length, total = T.TUTORIAL.length;
    const tpl = (k, f) => { const l = { ...this.npc.template(k, f), event: 'tutorial' }; delete l.tpl; return l; };
    this.tutPending.push(tpl('tutorial_step', { label, n, total }));
    if (n >= total) {
      t.finished = true;
      G.grant(this.state, T.GRADUATE_REWARD, '新手村畢業', this.config.rewards, this.now());
      this.tutPending.push(tpl('tutorial_done', {}));
    }
    this.saveState();
    return true;
  }
  async finishOnboarding() {
    this.state.onboarding = { done: true, at: this.now().toISOString() };
    if (!this.state.tutorial) this.startTutorial();
    this.saveState();
    const g = await this.greet();
    const intro = { ...this.npc.template('tutorial_start', {}), event: 'tutorial' }; delete intro.tpl;
    return this.settle({ lines: [...g.lines, intro], view: this.view() });
  }
  restartOnboarding() { this.state.onboarding = { done: false }; this.saveState(); return { view: this.view() }; }
  // 這週一～週五，例如「我的一週 10/5–10/9」
  defaultPlanTitle() {
    const d = new Date(this.now()); const wd = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - wd + 1);
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    return `我的一週 ${mon.getMonth() + 1}/${mon.getDate()}–${fri.getMonth() + 1}/${fri.getDate()}`;
  }
  // 新手引導建立第一份計畫：放在使用者資料夾的 plans/，不會蓋掉已經有的檔案
  async createPlan({ title, quest } = {}) {
    const t = String(title || '').trim() || this.defaultPlanTitle();
    const dir = path.join(this.userDir, 'plans');
    fs.mkdirSync(dir, { recursive: true });
    const base = t.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 40) || '我的一週';
    let file = path.join(dir, `${base}.md`);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i}).md`);
    let text = `# ${t}\n`;
    if (quest && String(quest.title || '').trim()) {
      text = PlanNew.addQuest(text, { ...quest, title: String(quest.title).trim(), objectives: (quest.objectives || []).map((o) => String(o).trim()).filter(Boolean) });
    }
    fs.writeFileSync(file, text.replace(/\n*$/, '\n'), 'utf8');
    this.usePlanFile(file);
    return { file, view: this.view() };
  }
  // 範例計畫：複製一份到使用者資料夾再用（不動程式內建的範例）
  useSamplePlan() {
    const src = path.join(this.appDir, 'plans', 'week_sample.md');
    const dir = path.join(this.userDir, 'plans');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, '範例：秋季新品上市.md');
    if (!fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(src));
    this.usePlanFile(file);
    return { file, view: this.view() };
  }
  usePlanFile(file) {
    const rel = path.relative(this.userDir, file);
    this.saveConfigPatch({ plan: { path: rel.startsWith('..') || path.isAbsolute(rel) ? file : rel.replace(/\\/g, '/') } });
    this.backedUp = false;
    this.loadPlan();
  }
  // 作息：午休、下午開工、下班前提醒；只在平日；主動搭話的間隔（0＝不主動）
  saveSchedule({ lunch, back, wrap, weekdaysOnly = true, idle } = {}) {
    const ok = (x) => /^\d{1,2}:\d{2}$/.test(String(x || ''));
    const items = [];
    if (ok(lunch)) items.push({ time: lunch, event: 'lunch' });
    if (ok(back)) items.push({ time: back, event: 'afternoon' });
    if (ok(wrap)) items.push({ time: wrap, event: 'wrapup' });
    const patch = { reminders: { weekdaysOnly: !!weekdaysOnly, items } };
    if (idle !== undefined && idle !== null && idle !== '' && Number.isFinite(Number(idle))) patch.window = { idleChatterMinutes: Math.max(0, Number(idle)) };
    this.saveConfigPatch(patch);
    return { view: this.view() };
  }
  setModel(model) {
    this.saveConfigPatch({ llm: model ? { model, enabled: true } : { enabled: false } });
    return { view: this.view() };
  }
  scheduleInfo() {
    const r = this.config.reminders || {};
    const at = (ev) => ((r.items || []).find((i) => i.event === ev) || {}).time || '';
    return { lunch: at('lunch'), back: at('afternoon'), wrap: at('wrapup'), weekdaysOnly: r.weekdaysOnly !== false, idle: Number((this.config.window || {}).idleChatterMinutes || 0) };
  }
  divineInfo() {
    const L = MH.lunarInfo(this.now());
    const recent = (this.state.divinations || []).slice(0, 5).map((d) => ({ id: d.id, at: d.at, question: d.question, ben: d.result.ben.name, tag: d.result.verdict.tag, level: d.result.verdict.level }));
    return { cost: this.divCfg().cost, repeatHours: this.divCfg().repeatHours, gold: this.state.player.gold, timeAvailable: !!L, timeText: L ? L.text : '', recent };
  }
  // 「同一件事」：去掉標點與「請問／嗎」之後一樣、互相包含，或兩字詞重疊夠多
  normQuestion(q) {
    return String(q || '').toLowerCase().replace(/[\s，。、；：！？!?,.;:()（）「」『』【】\[\]"'～~…\-]/g, '').replace(/^(請問|我想問|想問|幫我|可以|能不能|想知道)+/, '').replace(/(嗎|呢|啊|呀|嘛|吧)+$/, '');
  }
  sameQuestion(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
    const bg = (s) => { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };
    const A = bg(a), B = bg(b);
    if (!A.size || !B.size) return false;
    let n = 0; for (const x of A) if (B.has(x)) n++;
    return n / (A.size + B.size - n) >= 0.6;
  }
  divineFacts(rec) {
    const r = rec.result;
    // 過程和結果是同一卦時不要講兩次
    const flow = r.hu.name === r.bian.name ? `過程和結果都是「${r.hu.name}」（${r.hu.meaning}）` : `過程像「${r.hu.name}」（${r.hu.meaning}），最後走向「${r.bian.name}」（${r.bian.meaning}）`;
    return { question: rec.question, ben: r.ben.name, benMeaning: r.ben.meaning, hu: r.hu.name, huMeaning: r.hu.meaning, bian: r.bian.name, bianMeaning: r.bian.meaning, flow, relation: r.relation, verdictTag: r.verdict.tag, verdictText: r.verdict.text, advice: r.advice, cost: this.divCfg().cost };
  }
  divineCheck(question) {
    const q = String(question || '').trim();
    if (!q) throw new Error('先寫下想問的事');
    const c = this.divCfg(), now = this.now().getTime(), norm = this.normQuestion(q);
    const prev = (this.state.divinations || []).find((d) => now - d.at < c.repeatHours * 3600000 && this.sameQuestion(d.norm, norm));
    if (prev) return { repeat: true, record: prev, lines: [{ ...this.npc.template('divine_repeat', this.divineFacts(prev)), event: 'divine' }] };
    if (this.state.player.gold < c.cost) return { poor: true, lines: [{ ...this.npc.template('divine_poor', { cost: c.cost, gold: this.state.player.gold }), event: 'divine' }] };
    return { ok: true };
  }
  // 起卦：先檢查一事不二占、金幣，再扣錢存紀錄；解讀另外呼叫 divineRead（畫面可以先放施法動畫）
  divineCast({ question, method, a, b } = {}) {
    const q = String(question || '').trim().slice(0, 80);
    if (!q) throw new Error('先寫下想問的事');
    const c = this.divCfg();
    const now = this.now().getTime();
    const norm = this.normQuestion(q);
    const list = this.state.divinations || (this.state.divinations = []);
    const prev = list.find((d) => now - d.at < c.repeatHours * 3600000 && this.sameQuestion(d.norm, norm));
    if (prev) return { repeat: true, record: prev, lines: [{ ...this.npc.template('divine_repeat', this.divineFacts(prev)), event: 'divine' }], view: this.view() };
    if (this.state.player.gold < c.cost) return { poor: true, lines: [{ ...this.npc.template('divine_poor', { cost: c.cost, gold: this.state.player.gold }), event: 'divine' }], view: this.view() };
    const r = method === 'time' ? MH.castByTime(this.now()) : MH.castByNumbers(a, b, this.now(), method === 'circle' ? 'circle' : 'numbers');
    G.grant(this.state, { xp: 0, gold: -c.cost }, `占卜魔法：${r.ben.name}`, this.config.rewards, this.now());
    const record = { id: `dv${now}`, at: now, question: q, norm, method: r.method, result: r, reading: null };
    list.unshift(record);
    this.state.divinations = list.slice(0, 30);
    this.saveState();
    return { record, cost: c.cost, view: this.view() };
  }
  async divineRead(id) {
    const rec = (this.state.divinations || []).find((d) => d.id === id);
    if (!rec) throw new Error('找不到這一卦');
    if (rec.reading) return { lines: [{ text: rec.reading.text, emotion: rec.reading.emotion, event: 'divine' }], record: rec, view: this.view() };
    const f = this.divineFacts(rec);
    const line = await this.say('divine', { ...f, eventDetail: `冒險者花了 ${f.cost} 金幣請你用星環占占卜：「${rec.question}」` }, {
      extraUser: MH.describe(rec.result, rec.question),
      extraSystem: '這次是占卜解讀，規則 2 例外：可以說 2～4 句、不超過 160 字。',
      maxTokens: 320, maxChars: 170,
    });
    rec.reading = { text: line.text, emotion: line.emotion, source: line.source };
    this.saveState();
    return { lines: [line], record: rec, view: this.view() };
  }

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
    const reward = G.grant(this.state, { xp: rank.xp, gold: rank.gold }, `今日運勢：${rank.name}`, this.config.rewards, this.now());
    this.saveState();
    const lines = [{ ...this.npc.template('fortune', fortune), event: 'fortune' }];
    if (reward.levelUp) lines.push({ ...this.npc.template('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }), event: 'levelup' });
    this.tutorialMark('fortune');
    return this.settle({ again: false, fortune, reward, lines, view: this.view() });
  }

  async setActive(questId) {
    this.ps.activeQuestId = questId;
    this.saveState();
    const qv = G.questView(this.plan, this.ps, this.now()).find((x) => x.id === questId);
    return this.settle({ lines: [await this.act('assign', { questView: qv, eventDetail: `冒險者自己選了任務「${qv.title}」` }, { coalesce: 'assign' })], view: this.view() });
  }

  async toggleDaily(rowId, done) {
    const t = this.todayInfo();
    const row = [...this.plan.days.flatMap((d) => d.rows)].find((r) => r.id === rowId);
    const label = row ? (t.branch && this.ps.branch[t.date] === 'b' ? row.b : row.a) : rowId;
    const reward = G.onDailyRow(this.state, this.ps, rowId, label, done, this.config.rewards, this.now());
    if (reward) this.workDone = true;
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
    return this.settle({ lines: [await this.act('daily', { eventDetail: `冒險者選擇了「${name}」路線` }, { coalesce: 'branch' })], view: this.view() });
  }

  async daily() {
    return { lines: [await this.say('daily')], view: this.view() };
  }

  // ---------- 主動聊天 ----------
  // 冒險者碰了視窗（點、打字、拖）：畫面每 20 秒最多回報一次
  touch() { this.lastTouch = this.now().getTime(); }
  proState() { return this.state.proactive || (this.state.proactive = { lastAt: 0, recent: [], lastTitle: '', topic: null, slot: '' }); }
  // 現在該不該主動開口、說什麼：null（不說）／'daily'（這格時段的行程，每格一次）／'topic'（開個話題）
  // idleSec：整台電腦多久沒動（不在電腦前就不說）；locked：螢幕鎖住了
  proactiveDue({ idleSec = 0, locked = false } = {}) {
    const base = Number((this.config.window || {}).idleChatterMinutes || 0);
    if (!base || locked || idleSec > 180) return null;
    if (this.state.focus || !(this.state.onboarding && this.state.onboarding.done) || this.isCold()) return null;
    const now = this.now().getTime();
    const p = this.proState();
    if (this.nbCfg().enabled !== false && M.dueDates(this.nb(), this.now()).length && now - (p.lastAt || 0) > 60000) return 'note'; // 📒 重要的日子：當天一定說（不用等間隔）
    const stage = this.affOn() ? this.affStage() : 1;
    const gap = base * A.pick(this.affCfg().chatty || [1], stage) * 60000; // 越熟越常來
    const lastAt = (p.lastAt || 0) > now ? 0 : (p.lastAt || 0); // 時鐘被調回去過
    const since = Math.max(lastAt, this.lastTouch || 0);
    if (now - since < gap) return null;
    if (lastAt > (this.lastTouch || 0) && now - lastAt < gap * 3) return null; // 上一句還沒人理：先別一直說
    const t = this.todayInfo();
    if (t.current && p.slot !== `${t.date}|${t.current.id || t.current.slot}`) return 'daily';
    return 'topic';
  }
  async proactive(opts = {}) {
    const kind = this.proactiveDue(opts);
    if (!kind) return null;
    const p = this.proState();
    const now = this.now().getTime();
    let res = null;
    if (kind === 'daily') {
      const t = this.todayInfo();
      p.slot = `${t.date}|${t.current.id || t.current.slot}`;
      res = await this.daily();
    } else if (kind === 'note') res = { lines: await this.noteDateLines(), view: this.view() };
    else res = await this.topic();
    if (!res || !res.lines || !res.lines.length) return null;
    p.lastAt = now;
    this.saveState();
    return { ...res, kind, lines: res.lines.map((l) => ({ ...l, ambient: true })) };
  }
  // 開一個話題：從角色設定的「話題：」裡挑（還沒解鎖的不挑；越熟越常挑私人的、最近聊過的先不挑）
  async topic() {
    if (this.isCold()) return null;
    const stage = this.affStage();
    // 📒 小本子上有「最近的事」還沒問後續：多半先關心那件事（第 1 階只記、不追問）
    const ncfg = this.nbCfg();
    const fu = ncfg.enabled !== false && (this.affOn() ? stage : 2) >= ncfg.followStage ? M.dueFollowUp(this.nb(), this.now(), ncfg) : null;
    if (fu && this.rnd() < 0.7) return this.followUp(fu);
    const pool = this.lore.topicPool(stage);
    if (!pool.length) return null;
    const p = this.proState();
    const recent = p.recent || [];
    let cand = pool.filter((x) => !recent.includes(x.key) && x.entry.title !== p.lastTitle);
    if (!cand.length) cand = pool.filter((x) => x.entry.title !== p.lastTitle);
    if (!cand.length) cand = pool;
    const w = (x) => (x.stage === stage ? 6 : x.stage === stage - 1 ? 3 : 1);
    let roll = this.rnd() * cand.reduce((n, x) => n + w(x), 0);
    let t = cand[cand.length - 1];
    for (const x of cand) { roll -= w(x); if (roll < 0) { t = x; break; } }
    const mood = t.entry.emotion === 'shy' && this.rnd() < this.emotionChance() ? 'shy' : null;
    const info = t.entry.text.replace(/\n+/g, ' ');
    const line = await this.say('topic', {
      quest: '', reason: '', remaining: [], slot: '', block: '', output: '', theme: '', memory: [], // 聊天就聊天，不提任務
      topic: `「${t.entry.title}」。開場可以參考（用自己的話說，不要照抄）：${t.text}`,
      topicInfo: info.length > 220 ? `${info.slice(0, 220)}…` : info,
      opener: t.text,
    }, { mood, maxTokens: 220 });
    if (line.source !== 'llm') { line.text = t.text; line.emotion = mood ? 'shy' : (t.entry.emotion || 'normal'); line.source = 'lore'; }
    delete line.repeated; delete line.data; delete line.tpl;
    const now = this.now().getTime();
    p.recent = [...recent, t.key].slice(-Math.min(8, Math.max(1, Math.floor(pool.length / 2))));
    p.lastTitle = t.entry.title;
    p.topic = { key: t.key, title: t.entry.title, text: line.text, at: now, replied: false };
    // 放進聊天紀錄：冒險者回話時，AI 才知道剛剛在聊什麼
    this.state.chat.push({ role: 'assistant', content: JSON.stringify({ line: line.text, emotion: line.emotion }), source: line.source, quest: this.ps.activeQuestId || null, at: now, topic: t.entry.title });
    this.state.chat = this.state.chat.slice(-20);
    this.saveState();
    return { lines: [{ ...line, event: 'topic', topic: t.entry.title }], view: this.view() };
  }

  async dailyReport(fields) {
    const date = G.todayISO(this.now());
    let writeError = null;
    try { this.writePlan(this.P.setProgress(this.planText, date, fields)); } catch (e) { writeError = e.message; }
    const reward = G.onDailyReport(this.state, this.ps, date, fields, this.config.rewards, this.now());
    if (reward) this.affect(this.affCfg().gain.report, '下班回報');
    this.workDone = true;
    this.saveState();
    const report = [fields.done, fields.blocker && `卡點：${fields.blocker}`, fields.next && `明天：${fields.next}`].filter(Boolean).join('；');
    const lines = [await this.act('daily_report', { report })];
    if (reward && reward.levelUp) lines.push(await this.act('levelup', { level: reward.levelUp.level, title: reward.levelUp.title }));
    const wk = await this.weekEndHandOver(date);
    if (wk) lines.push(wk.line);
    return this.settle({ reward, lines, writeError, journal: wk ? wk.key : null, view: this.view() });
  }

  async chat(text) {
    const now = this.now();
    const at = now.getTime();
    const today = G.todayISO(now);
    const cat = I.buildCatalog(this.plan, this.ps, this.todayInfo(), now);
    const quest = this.ps.activeQuestId || null;
    const aOn = this.affOn();
    const acfg = this.affCfg();
    const { self, call } = this.npc.names();
    // 洗版（亂打鍵盤、同一句第三次、一分鐘丟一堆）：不問 AI 直接回，10 分鐘內第三次開始扣好感
    if (aOn) {
      const a = this.aff();
      const said = this.state.chat.filter((h) => h.role === 'user' && h.at).map((h) => ({ text: h.content, at: h.at }));
      if (A.spamCheck(text, [...said, ...(a.spam || [])], at)) {
        a.spam = [...(a.spam || []), { text, at }].filter((x) => at - x.at < 10 * 60000).slice(-20);
        const mad = a.spam.length >= 3;
        if (mad) { this.affect(-acfg.loss.spam, '洗版'); this.offense('spam'); }
        this.saveState();
        return this.settle({ lines: [{ ...this.affTpl(mad ? 'spam_mad' : 'spam'), event: 'chat' }], proposal: null, view: this.view() });
      }
    }
    const stage = this.affStage();
    const hits = await this.lore.retrieve(text, (this.config.lore || {}).topK || 3, { stage }); // 跟這句話相關的角色設定（還沒解鎖的不算）
    // 是不是在回她剛剛主動開的話題（20 分鐘內、中間沒有聊別的）
    const tp = this.proState().topic;
    const lastSaid = [...this.state.chat].reverse().find((h) => h.role === 'assistant');
    const replyTopic = !!(tp && !tp.replied && at - tp.at < 20 * 60000 && lastSaid && lastSaid.topic === tp.title);
    if (replyTopic) {
      tp.replied = true;
      const e = this.lore.entries.find((x) => x.title === tp.title);
      if (e && !hits.some((h) => h.entry === e)) hits.push({ entry: e, score: 0, strong: false }); // 那個話題的設定也給 AI 看
    }
    // 對話紀錄只給 AI 看「同一個當前任務、30 分鐘內」的：換了任務之後，舊對話裡的任務名會讓小模型講錯
    const recent = this.state.chat.filter((h) => h.quest === quest && h.at && at - h.at < 30 * 60000);
    this.state.chat.push({ role: 'user', content: text, quest, at });
    this.tutorialMark('chat');
    const workItems = I.ruleParse(text, cat);
    // 好感：先用關鍵字看這句話（騷擾／失禮／道歉／稱讚／說自己很痛苦），AI 開著時再請它判斷一次
    const kw = aOn ? A.classify(text, acfg.words) : null;
    const offenseKw = kw === 'rude' || kw === 'harass' ? kw : null;
    const a = aOn ? this.aff() : null;
    const recentOffense = aOn && (a.offenses || []).some((o) => at - o.at < 24 * 3600000);
    const canApologize = aOn && (this.isCold() || recentOffense) && a.apologyDay !== today;
    const apologizing = kw === 'apology' && canApologize;
    const relationQ = aOn && A.RELATION.test(text);
    const extra = [I.ACTION_RULES];
    if (aOn) extra.push(A.attitudeRules(call, self));
    if (apologizing) extra.push(`【道歉】${call}在為剛才的失禮道歉：接受道歉，可以小小抱怨一句，最後原諒他。`);
    if (relationQ) extra.push(`【關係問題】${call}在問你們現在是什麼關係：照【關係】的親近程度，用角色口吻回答一兩句。`);
    if (kw === 'care') extra.push(`${call}現在很痛苦：先溫柔地關心他，建議他找信任的人或專業的人聊聊，這句不要提任務。`);
    if (replyTopic && tp.noteId) extra.push(`【話題】剛才是你主動關心${call}之前說的「${tp.note}」（你說：「${tp.text}」），他現在在回你近況：先具體回應他說的內容，開心就替他高興、不順就安慰他；不要把話題轉回任務。`);
    else if (replyTopic) extra.push(`【話題】剛才是你主動找${call}聊「${tp.title}」（你說：「${tp.text}」），他現在在回你：先具體回應他說的內容，可以再分享一點你自己的事或接著問一句；不要把話題轉回任務。`);
    // 📒 小本子：跟這句話有關的筆記給 AI 看；AI 也可以在 notes 裡記下新的
    const nbOn = this.nbCfg().enabled !== false;
    const nbCtx = nbOn ? M.contextText(M.relevant(this.nb(), text, now), now, call, self) : '';
    if (nbOn) extra.push(M.RULES(call));
    // 這次的情緒：失禮→鄙視；冷戰→冷淡；命中標了害羞的設定（稱讚、秘密、感情）→ 依好感階段擲骰
    // 同一句話在回報進度時不害羞（那時要好好確認）
    let mood = null;
    if (offenseKw) mood = 'disdain';
    else if (!apologizing && this.isCold()) mood = 'cold';
    else if (!apologizing && kw !== 'care' && !workItems.length) {
      const strong0 = hits.find((h) => h.strong);
      if (((strong0 && strong0.entry.emotion === 'shy') || (relationQ && stage >= 4)) && this.rnd() < this.emotionChance()) mood = 'shy';
    }
    const line = await this.say('chat', {}, {
      mood,
      userText: text,
      history: recent, // npc 會再濾掉備援台詞那幾輪，取最後 4 句
      extraSystem: extra.join('\n'),
      extraProps: { ...I.ACTION_SCHEMA, ...(aOn ? { attitude: { type: 'string', enum: A.ATTITUDES } } : {}), ...(nbOn ? M.SCHEMA : {}) },
      extraUser: [I.catalogText(cat), this.lore.contextText(hits), nbCtx].filter(Boolean).join('\n\n'),
      maxTokens: 320,
    });
    if (line.source === 'llm') line.text = I.decodeKeys(line.text, cat); // 台詞裡的 q4-0 換回名字
    const llmAtt = line.source === 'llm' && line.data ? line.data.attitude : null;
    const aiNotes = line.source === 'llm' && line.data ? line.data.notes : null;
    // 📒 記下冒險者說的自己的事（罵人、說自己很痛苦的那句不記）
    const noted = offenseKw || kw === 'care' ? [] : this.noteFrom(text, aiNotes);
    // AI 給的動作；AI 離線時改用關鍵字解析。被騷擾、罵的那句不處理進度
    const raw = offenseKw ? [] : line.source === 'llm' ? ((line.data && line.data.actions) || []) : workItems;
    const items = I.validate(raw, cat);
    const strong = hits.find((h) => h.strong);
    let proposal = null;
    if (items.length) {
      proposal = { id: `p${Date.now()}`, items, text };
      this.pendingProposal = proposal;
      if (line.source !== 'llm') {
        line.text = items.length === 1 ? `要幫你${items[0].label}嗎？` : `${self}整理了 ${items.length} 項變更，確認一下喔～`;
        line.emotion = 'thinking';
      }
    } else if (line.source !== 'llm') {
      const noop = I.explainNoop(text, cat);
      const lore = hits.find((h) => h.strong && h.entry.reply); // 離線：關鍵字直接命中的設定，用預寫台詞回
      const tpl = (k, f = {}) => { const t = this.affTpl(k, f); line.text = t.text; line.emotion = t.emotion; line.source = 'template'; };
      if (offenseKw) tpl(offenseKw === 'harass' ? 'offense_harass' : 'offense_rude');
      else if (apologizing) tpl('apology_accept');
      else if (this.isCold()) tpl('cold_chat');
      else if (relationQ) tpl(`relation_${Math.min(5, stage)}`);
      else if (noop) { line.text = noop; line.emotion = 'happy'; }
      else if (noted.some((x) => x.kind === 'date' || x.kind === 'work')) tpl('note_taken', { note: M.label(noted.find((x) => x.kind === 'date' || x.kind === 'work')) }); // 「我的生日」「最近在忙…」：先說記下了，不要接成艾琳自己的生日、閒聊開場
      else if (lore) { line.text = lore.entry.reply; line.emotion = lore.entry.emotion || 'normal'; line.source = 'lore'; }
      else if (replyTopic) tpl('topic_reply');
      else if (noted.length) tpl('note_taken', { note: M.label(noted[0]) }); // 離線也看得出她有在聽
      else if (/(完|好了|搞定|取消|交付|提交|勾)/.test(text)) {
        line.text = `嗯……${self}找不到你說的是哪一項。可以說得更具體一點，或直接到任務板勾選喔。`;
        line.emotion = 'thinking';
      }
    }
    // 模型整句都在重複前幾句（小模型的老毛病）：這個話題有預寫的台詞就改用它
    if (line.repeated && !items.length && !mood && strong && strong.entry.reply) { line.text = strong.entry.reply; line.emotion = strong.entry.emotion || 'normal'; line.source = 'lore'; }
    delete line.repeated;
    delete line.data;
    // 💗 好感：失禮／騷擾扣分（AI 判斷的要再過一次關）；道歉、稱讚加分
    if (aOn) {
      const att = offenseKw || (kw === 'care' ? 'ok' : A.guardAttitude(llmAtt, text, { hasWork: items.length > 0 || workItems.length > 0 }));
      if (att === 'rude' || att === 'harass') {
        line.emotion = 'disdain';
        this.affect(-acfg.loss[att], att === 'harass' ? '騷擾' : '失禮');
        this.offense(att);
      } else {
        if (line.emotion === 'disdain') line.emotion = 'thinking'; // 沒有失禮就不擺臉色
        if (apologizing || (att === 'apology' && canApologize)) {
          this.affect(acfg.gain.apology, '道歉', { uncapped: true }); a.apologyDay = today; a.coldUntil = 0;
        } else if ((kw === 'kind' || att === 'kind') && (a.kindToday || 0) < 3 && !this.isCold()) {
          a.kindToday = (a.kindToday || 0) + 1; this.affect(acfg.gain.kind, '稱讚艾琳');
        }
        if (replyTopic && !this.isCold() && (a.topicToday || 0) < (acfg.topicReplies ?? 3)) { a.topicToday = (a.topicToday || 0) + 1; this.affect(acfg.gain.topic, '陪艾琳聊天'); }
      }
    }
    this.state.chat.push({ role: 'assistant', content: JSON.stringify({ line: line.text, emotion: line.emotion }), source: line.source, quest, at: this.now().getTime() }); // source=template 的不會再給模型看
    this.state.chat = this.state.chat.slice(-20);
    this.saveState();
    return this.settle({ lines: [line], proposal, noted: noted.map(M.label), view: this.view() });
  }

  // ---- 📒 艾琳的小本子：記住冒險者親口說的自己的事 ----
  nbCfg() { return { ...M.DEFAULTS, ...(this.config.notebook || {}) }; }
  nb() { return this.state.notebook || (this.state.notebook = M.blank()); }
  noteFrom(text, aiNotes) {
    if (this.nbCfg().enabled === false) return [];
    const now = this.now();
    const found = [...M.extractRules(text, now), ...M.guardAI(aiNotes, text, now)];
    if (!found.length) return [];
    const { added, updated } = M.add(this.nb(), found, now, { max: this.nbCfg().max });
    return [...added, ...updated];
  }
  notebookView() {
    const stage = this.affOn() ? this.affStage() : 1;
    return { ...M.view(this.nb(), this.now()), enabled: this.nbCfg().enabled !== false, sketch: stage >= 5 ? 2 : stage >= 3 ? 1 : 0 };
  }
  nbLine(key, f = {}) { const l = { ...this.npc.template(key, f), event: 'notebook' }; delete l.tpl; return l; }
  // 打開小本子（被偷看）：熟了之後比較害羞
  peekNotebook(quiet = false) {
    const close = (this.affOn() ? this.affStage() : 1) >= 3;
    return { notebook: this.notebookView(), lines: quiet ? [] : [this.nbLine(close ? 'notebook_peek_close' : 'notebook_peek')], view: this.view() };
  }
  forgetNote(id) {
    if (!M.forget(this.nb(), id)) throw new Error('這一則已經不在小本子上了');
    this.saveState();
    return { notebook: this.notebookView(), lines: [this.nbLine('notebook_forget')], view: this.view() };
  }
  clearNotebook() {
    this.state.notebook = M.blank();
    this.saveState();
    return { notebook: this.notebookView(), lines: [this.nbLine('notebook_clear')], view: this.view() };
  }
  setNotebook(on) {
    this.saveConfigPatch({ notebook: { enabled: !!on } });
    return { notebook: this.notebookView(), lines: [this.nbLine(on ? 'notebook_on' : 'notebook_off')], view: this.view() };
  }
  // 主動關心小本子上「最近的事」（或工作上在忙的事）的後續
  async followUp(item) {
    const now = this.now(); const at = now.getTime();
    const { call } = this.npc.names();
    const ago = M.agoText(item.updatedAt, now);
    const key = item.kind === 'work' ? 'followup_work' : item.mood === 'good' ? 'followup_good' : 'followup';
    const t = this.npc.template(key, { note: item.text, ago });
    const what = item.kind === 'work' ? `${call}${ago}說最近${item.text}` : `${call}${ago}說過「${item.text}」`;
    const line = await this.say('note', {
      quest: '', reason: '', remaining: [], slot: '', block: '', output: '', theme: '', memory: [],
      topic: `關心後續：${what}。問他後來怎麼樣了（${item.mood === 'good' ? '替他開心' : '溫柔關心'}），1～2 句、用問句結尾。`,
      opener: t.text,
    }, { maxTokens: 200 });
    if (line.source !== 'llm') { line.text = t.text; line.emotion = t.emotion; }
    line.source = line.source === 'llm' ? 'llm' : 'note';
    delete line.repeated; delete line.data; delete line.tpl;
    item.followed = at;
    const p = this.proState();
    p.lastTitle = '小本子';
    p.topic = { key: `note:${item.id}`, title: '小本子', noteId: item.id, note: item.text, text: line.text, at, replied: false };
    this.state.chat.push({ role: 'assistant', content: JSON.stringify({ line: line.text, emotion: line.emotion }), source: line.source, quest: this.ps.activeQuestId || null, at, topic: '小本子' });
    this.state.chat = this.state.chat.slice(-20);
    this.saveState();
    return { lines: [{ ...line, event: 'topic', topic: '小本子' }], view: this.view() };
  }
  // 今天是小本子上的重要日子（或明天就是那件事）：每件一天說一次；冒險者生日送一份金幣（一年一次）
  async noteDateLines() {
    const now = this.now();
    if (this.nbCfg().enabled === false || this.isCold()) return [];
    const due = M.dueDates(this.nb(), now);
    if (!due.length) return [];
    const today = M.iso(now); const year = now.getFullYear();
    const { call } = this.npc.names();
    const lines = [];
    for (const { item, when } of due.slice(0, 2)) {
      if (when === 'eve') item.eveOn = today; else item.saidOn = today;
      let key; const f = { note: item.text }; let about;
      if (when === 'eve') { key = 'date_eve'; about = `明天就是${call}的「${item.text}」，提醒他準備、早點休息`; }
      else if (item.self) {
        const gold = this.nbCfg().birthdayGold;
        if (item.giftYear !== year && gold > 0) {
          G.grant(this.state, { xp: 0, gold }, '艾琳的生日禮物', this.config.rewards, this.now());
          item.giftYear = year; f.gold = gold; key = 'date_birthday';
          about = `今天是${call}的生日！祝他生日快樂，送他 ${gold} 金幣當禮物（一定要提到）`;
        } else { key = 'date_birthday_again'; about = `今天是${call}的生日，祝他生日快樂`; }
      } else if (item.yearly) { key = 'date_yearly'; about = `今天是${call}的「${item.text}」，提醒他別忘了`; }
      else { key = 'date_today'; about = `今天就是${call}的「${item.text}」，替他加油打氣`; }
      const t = this.npc.template(key, f);
      const line = await this.say('note', { quest: '', reason: '', remaining: [], slot: '', block: '', output: '', theme: '', memory: [], topic: `${about}。1～2 句。`, opener: t.text }, { maxTokens: 200 });
      if (line.source !== 'llm') { line.text = t.text; line.emotion = t.emotion; line.source = 'note'; }
      delete line.repeated; delete line.data; delete line.tpl;
      lines.push({ ...line, event: 'note' });
    }
    this.saveState();
    return lines;
  }

  // ---- 🔥 連續上工、🏅 成就 ----
  streakOn() { return (this.config.streak || {}).enabled !== false; }
  streakOpts() { const c = { ...(this.config.streak || {}) }; delete c.enabled; return { ...c, plan: this.plan }; }
  lineOf(key, f, event) { const l = { ...this.npc.template(key, f), event }; delete l.tpl; return l; }
  // 成就要看的數字
  achCtx() {
    const s = this.state.stats || {};
    const col = this.state.collection;
    const sh = this.state.shop;
    const owned = (r) => C.CARDS.filter((c) => (!r || c.r === r) && col.cards[c.id]).length;
    const realGifts = S.GIFTS.filter((g) => !g.joke);
    return {
      objectives: s.objectives || 0, quests: s.quests || 0, onTime: s.onTime || 0, onTimeStreak: this.state.player.onTimeStreak || 0,
      focus: s.focus || 0, reports: s.reports || 0, daikichi: s.daikichi || 0, divinations: s.divinations || 0,
      level: G.levelInfo(this.state.player.xp, this.config.rewards.levelStep).level, streakBest: this.state.streak.best || 0,
      gifts: Object.values(sh.gifts).reduce((n, x) => n + x, 0), giftKinds: realGifts.filter((g) => sh.gifts[g.id]).length, giftKindsTotal: realGifts.length,
      cucumber: sh.gifts.cucumber || 0, ornaments: S.ORNAMENTS.filter((o) => sh.owned[o.id]).length, themed: s.themed || 0,
      cards: owned(0), cardsTotal: C.CARDS.length, cards1: owned(1), cards1Total: C.CARDS.filter((c) => c.r === 1).length, ssr: owned(4),
      notes: this.nb().items.length, weeks: Object.keys((this.state.journal && this.state.journal.weeks) || {}).length,
      stage: this.affOn() ? this.affStage() : 0,
    };
  }
  collectionView() {
    return { achievements: AC.view(this.state.achievements, this.achCtx()), cards: C.view(this.state.collection), streak: { cur: this.view().streak, best: this.state.streak.best || 0, days: this.state.streak.days || 0 } };
  }

  // ---- 🛒 雲朵雜貨舖（兔族雙胞胎棉棉、朵朵顧店）----
  shopView(twins) {
    const gold = this.state.player.gold;
    return { gold, keepers: S.KEEPERS, catalog: S.catalog(this.state.shop, gold), cards: C.view(this.state.collection), twins: twins || null, seals: this.state.shop.seals };
  }
  shopOpen() {
    const sh = this.state.shop;
    sh.visits = (sh.visits || 0) + 1;
    this.saveState();
    return { shop: this.shopView(S.twinsLine(sh.visits > 3 && this.rnd() < 0.5 ? 'helloBack' : 'hello', () => this.rnd())), view: this.view() };
  }
  // 花錢：不夠就回「差一點點」（不算錯誤，雙胞胎會說話）
  spend(price, reason) {
    if (this.state.player.gold < price) return false;
    G.grant(this.state, { xp: 0, gold: -price }, `雜貨舖：${reason}`, this.config.rewards, this.now());
    return true;
  }
  poor() { return { poor: true, shop: this.shopView(S.twinsLine('poor', () => this.rnd())), lines: [], view: this.view() }; }
  // 買禮物送艾琳：一天第一份加好感（照她喜歡的程度）；黃瓜是惡作劇
  async buyGift(id) {
    const g = S.GIFT[id];
    if (!g) throw new Error('沒有這個商品');
    if (!this.spend(g.price, `買了${g.name}送給${this.config.npc.name}`)) return this.poor();
    const sh = this.state.shop;
    const today = G.todayISO(this.now());
    if (sh.giftDay !== today) { sh.giftDay = today; sh.giftsToday = 0; }
    const first = (sh.gifts[id] || 0) === 0;
    sh.gifts[id] = (sh.gifts[id] || 0) + 1;
    sh.giftsToday += 1;
    if (id === 'seal') sh.seals = (sh.seals || 27) + 1;
    const again = sh.giftsToday > 1 && !g.joke && id !== 'seal'; // 蠟封章每次都要說收藏變幾個
    if (sh.giftsToday === 1 && g.like > 0) this.affect(g.like, `收到禮物：${g.name}`, { uncapped: true });
    const stage = this.affOn() ? this.affStage() : 3;
    const key = g.joke ? 'gift_cucumber' : again ? 'gift_again' : `gift_${id}_${S.giftTier(stage)}`;
    const t = this.npc.template(key, { gift: g.name, seals: sh.seals });
    const line = await this.say('gift', {
      quest: '', reason: '', remaining: [], slot: '', block: '', output: '', theme: '', memory: [],
      gift: `${g.name}（${g.desc}）${first ? '，這是第一次收到' : ''}${again ? '，今天已經收過一份了' : ''}${id === 'seal' ? `，收藏變成第 ${sh.seals} 個` : ''}`, opener: t.text,
    }, { maxTokens: 180 });
    if (line.source !== 'llm') { line.text = t.text; line.emotion = t.emotion; line.source = 'template'; }
    delete line.repeated; delete line.data; delete line.tpl;
    this.saveState();
    return this.settle({ gift: id, lines: [{ ...line, event: 'gift' }], shop: this.shopView(S.twinsLine(g.joke ? 'giftJoke' : 'gift', () => this.rnd())), view: this.view() });
  }
  // 買裝飾（主題配色、吊飾、擺設）：永久擁有，買了直接換上
  buyDecor(id) {
    const item = S.THEME[id] || S.ORN[id];
    if (!item) throw new Error('沒有這個商品');
    const sh = this.state.shop;
    if (sh.owned[id]) return { shop: this.shopView(S.twinsLine('owned', () => this.rnd())), lines: [], view: this.view() };
    if (!this.spend(item.price, item.name)) return this.poor();
    sh.owned[id] = true;
    const r = this.equip(S.THEME[id] ? 'theme' : item.slot, id);
    r.shop = this.shopView(S.twinsLine(S.THEME[id] ? 'buyTheme' : 'buyDecor', () => this.rnd()));
    return r;
  }
  // 換上／拿下（id 給 null＝拿下；主題拿下＝換回預設）
  equip(slot, id) {
    const sh = this.state.shop;
    if (!['theme', 'hang', 'desk'].includes(slot)) throw new Error('沒有這個位置');
    if (slot === 'theme' && !id) id = 'navy';
    if (id) {
      const item = slot === 'theme' ? S.THEME[id] : S.ORN[id];
      if (!item || (slot !== 'theme' && item.slot !== slot)) throw new Error('放不上去');
      if (!sh.owned[id]) throw new Error('還沒買這個');
    }
    const changed = sh.equip[slot] !== id;
    sh.equip[slot] = id || null;
    const lines = [];
    if (changed && id) {
      if (slot === 'theme') { if (id !== 'navy') this.state.stats.themed = (this.state.stats.themed || 0) + 1; lines.push(this.lineOf('theme_on', { item: S.THEME[id].name }, 'decor')); }
      else lines.push(this.lineOf('decor_on', { item: S.ORN[id].name }, 'decor'));
    }
    this.saveState();
    return this.settle({ lines, shop: this.shopView(), view: this.view() });
  }
  // 抽星座卡：一張 30、十張 270（最後一張保底 ★★★）
  drawCards(n) {
    n = Number(n) >= 10 ? 10 : 1;
    const price = n === 10 ? C.PRICE.ten : C.PRICE.one;
    if (!this.spend(price, `星座卡 ×${n}`)) return this.poor();
    const results = C.draw(this.state.collection, n, () => this.rnd(), this.now().getTime());
    const best = Math.max(...results.map((x) => x.card.r));
    const lines = [];
    if (best >= 3) { const top = results.find((x) => x.card.r === best).card; lines.push(this.lineOf('card_best', { card: top.name }, 'card')); }
    this.saveState();
    const tw = best === 4 ? 'drawBest' : best === 3 ? 'drawGood' : results.some((x) => !x.isNew) ? 'dup' : 'draw';
    return this.settle({ draw: results.map((x) => ({ id: x.card.id, name: x.card.name, r: x.card.r, n: x.card.n, isNew: x.isNew, dust: x.dust })), lines, shop: this.shopView(S.twinsLine(tw, () => this.rnd())), view: this.view() });
  }
  exchangeCard(id) {
    const r = C.exchange(this.state.collection, id, this.now().getTime());
    this.saveState();
    return this.settle({ card: { id: r.card.id, name: r.card.name, r: r.card.r }, lines: [], shop: this.shopView(S.twinsLine('exchange', () => this.rnd())), view: this.view() });
  }
  collectionOpen() { return this.settle({ collection: this.collectionView(), lines: [], view: this.view() }); }

  // 狀態欄（左下角的等級、經驗值、當前任務）開關；存在設定裡，下次打開還是一樣
  setHud(on) { this.saveConfigPatch({ window: { hud: !!on } }); return { view: this.view() }; }

  // ---- 📖 冒險日誌＋週報 ----
  jCfg() { const c = { ...J.DEFAULTS, ...(this.config.journal || {}) }; c.labels = { ...J.DEFAULTS.labels, ...((this.config.journal || {}).labels || {}) }; return c; }
  weeks() { return (this.state.journal || (this.state.journal = { weeks: {} })).weeks; }
  syncJournal() {
    if (!this.plan || !this.ps || !this.plan.quests || !this.plan.quests.length || this.jCfg().enabled === false) return null;
    try { return J.store(this.state, J.snapshot({ plan: this.plan, ps: this.ps, state: this.state, rewards: this.config.rewards, now: this.now() }), this.jCfg().keep); } catch (_) { return null; } // 日誌壞掉不能害存檔失敗
  }
  currentWeekKey() { const w = this.syncJournal(); return w ? w.key : (J.list(this.state)[0] || {}).key || null; }
  journalView(key) {
    const cur = this.currentWeekKey();
    const list = J.list(this.state);
    const k = key && this.weeks()[key] ? key : cur || (list[0] && list[0].key);
    const w = k ? this.weeks()[k] : null;
    if (!w) return { week: null, list, current: cur };
    const i = list.findIndex((x) => x.key === k);
    return {
      week: { ...w, stale: !!w.comment && w.commentSig !== w.sig, report: J.reportText(w, this.jCfg().labels), groups: J.reportGroups(w) },
      list, current: cur, prev: (list[i + 1] || {}).key || null, next: (list[i - 1] || {}).key || null, labels: this.jCfg().labels,
    };
  }
  // 打開日誌（選單）：她說一句；quiet＝換頁、重畫時不說
  journalOpen(key, quiet = false) {
    const l = { ...this.npc.template('journal_open', {}), event: 'journal' }; delete l.tpl;
    return { journal: this.journalView(key), lines: quiet ? [] : [l], view: this.view() };
  }
  // 艾琳寫這週的評語：AI 開著用 AI，沒開就照稱號挑內建句子拼起來
  async journalComment(key, force = false) {
    this.syncJournal();
    const w = this.weeks()[key || this.currentWeekKey()];
    if (!w) throw new Error('這週還沒有日誌');
    if (w.comment && !force && w.commentSig === w.sig) return { journal: this.journalView(w.key), view: this.view() };
    const s = w.stats;
    const left = w.quests.filter((q) => q.status !== 'done').map((q) => q.title);
    const f = { ...s, left: left.slice(0, 2).join('」「') };
    const parts = [this.npc.template(`journal_${(w.badges[0] || { id: 'rest' }).id}`, f).text];
    if (w.badges[1]) parts.push(this.npc.template(`journal_${w.badges[1].id}`, f).text);
    parts.push(this.npc.template(left.length ? 'journal_left' : 'journal_end', f).text);
    const fallback = parts.join('');
    const line = await this.say('journal', {
      quest: '', reason: '', remaining: [], slot: '', block: '', output: '', theme: '', memory: [],
      week: `${J.weekFacts(w)}；本週稱號：${w.badges.map((b) => `${b.name}（${b.why}）`).join('、')}`,
    }, { maxTokens: 360, maxChars: 220 });
    const ai = line.source === 'llm' && line.text && line.text.length >= 20;
    Object.assign(w, { comment: ai ? line.text : fallback, commentSource: ai ? 'llm' : 'template', commentSig: w.sig, commentAt: this.now().getTime() });
    this.saveState();
    return { journal: this.journalView(w.key), view: this.view() };
  }
  // 匯出：data/週報/ 底下一週一個 Markdown（data/ 不進 git，也不會跟計畫檔混在一起）
  journalExport(key) {
    const w = this.weeks()[key || this.currentWeekKey()];
    if (!w) throw new Error('這週還沒有日誌');
    const dir = path.join(this.dataDir, '週報');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `冒險日誌 ${w.start}.md`);
    fs.writeFileSync(file, J.toMarkdown(w, { labels: this.jCfg().labels, npcName: this.config.npc.name }), 'utf8');
    return { path: file, view: this.view() };
  }
  // 這週最後一天的下班回報：把日誌交給冒險者（一週一次）
  async weekEndHandOver(date) {
    if (this.jCfg().enabled === false || !this.plan.quests.length) return null;
    const range = J.weekRange(this.plan, this.now());
    if (date !== range.lastDay) return null;
    const w = this.syncJournal();
    if (!w || w.presentedAt) return null;
    w.presentedAt = this.now().getTime();
    this.saveState();
    const line = await this.act('journal_ready', { week: J.weekFacts(w), eventDetail: `這週的冒險日誌整理好了，本週稱號「${w.badges[0] ? w.badges[0].name : ''}」` });
    return { key: w.key, line };
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
    let submitted = null, writeError = null, reported = false;
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
          const r0 = G.onObjective(this.state, this.ps, it.questId, q.objectives[it.index], it.type === 'check', this.config.rewards, this.now());
          if (r0) this.affect(this.affCfg().gain.objective, '完成目標');
          add(r0);
        } else if (it.type === 'activate') {
          this.ps.activeQuestId = it.questId;
        } else if (it.type === 'daily_done' || it.type === 'daily_undo') {
          add(G.onDailyRow(this.state, this.ps, it.rowId, it.label, it.type === 'daily_done', this.config.rewards, this.now()));
        } else if (it.type === 'report') {
          try { this.writePlan(this.P.setProgress(this.planText, G.todayISO(this.now()), it.fields)); } catch (e) { writeError = e.message; }
          const r1 = G.onDailyReport(this.state, this.ps, G.todayISO(this.now()), it.fields, this.config.rewards, this.now());
          if (r1) this.affect(this.affCfg().gain.report, '下班回報');
          add(r1); reported = true;
        } else if (it.type === 'submit') {
          const r = G.submitQuest(this.state, this.ps, this.plan, it.questId, it.report || p.text, this.now(), this.config.rewards);
          add(r); submitted = r;
          this.affect(this.affCfg().gain.submit + (r.onTime ? this.affCfg().gain.onTime : 0), r.onTime ? '準時交付任務' : '交付任務');
        }
        done.push(it.label);
      } catch (e) { failed.push(`${it.label}（${e.message}）`); }
    }
    if (done.length) { this.tutorialMark('progress'); this.workDone = true; }
    if (submitted) this.tutorialMark('submit');
    this.saveState();
    const lines = [];
    if (submitted) {
      lines.push(await this.act('submit', {
        questView: submitted.quest, xp: submitted.xp, gold: submitted.gold, report: it0(items, 'submit').report || p.text,
        bonus: submitted.onTime ? '準時加成！' : '',
        eventDetail: `透過聊天交付「${submitted.quest.title}」，這次總共獲得 ${total.xp} XP`,
      }));
    } else if (done.length) {
      const qv = G.questView(this.plan, this.ps, this.now()).find((x) => x.active);
      lines.push(await this.act('objective', { questView: qv, eventDetail: `照冒險者說的更新了進度：${done.join('、')}` }, { coalesce: 'objective' }));
    }
    if (failed.length) lines.push({ text: `有幾項沒辦法處理：${failed.join('、')}`, emotion: 'worried', source: 'template', event: 'chat' });
    if (total.levelUp) lines.push(await this.act('levelup', { level: total.levelUp.level, title: total.levelUp.title, eventDetail: `升到 Lv.${total.levelUp.level}，新稱號「${total.levelUp.title}」` }));
    if (submitted) {
      if (submitted.next) lines.push(await this.act('assign', { questView: G.questView(this.plan, this.ps, this.now()).find((x) => x.id === submitted.next.id), eventDetail: `指派新任務「${submitted.next.title}」` }));
      else lines.push(await this.act('all_clear'));
    } else if (items.some((x) => x.type === 'activate')) {
      G.ensureActive(this.plan, this.ps, this.now());
    }
    const wk = reported ? await this.weekEndHandOver(G.todayISO(this.now())) : null; // 聊天裡回報的最後一天也交日誌
    if (wk) lines.push(wk.line);
    return this.settle({ reward: total.xp ? total : null, lines, writeError, journal: wk ? wk.key : null, view: this.view() });
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
