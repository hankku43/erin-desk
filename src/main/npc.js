// NPC 對話：Ollama 本機模型 + 模板台詞備援
'use strict';

let toTW = (s) => s;
try {
  const OpenCC = require('opencc-js');
  toTW = OpenCC.Converter({ from: 'cn', to: 'tw' });
} catch (_) { /* 未安裝 opencc-js 時略過繁簡轉換 */ }

const EMOTIONS = ['normal', 'happy', 'thinking', 'surprised', 'cheer', 'worried'];

const EVENT_DESC = {
  greet: '冒險者剛點了你、來到櫃台。打招呼並提醒當前任務。',
  morning: '今天第一次見面。用符合現在時間的問候（早安／午安／晚上好）打招呼，簡短點出今天的主題和第一件事，鼓勵他開始。',
  lunch: '中午 12:00 到了。提醒冒險者先去吃午餐、睡個午覺，下午才有精神。',
  afternoon: '下午 13:00，午休結束。溫柔地叫冒險者回到工作，點出下午第一件事（依【今日行程】）。',
  wrapup: '16:50，快下班了。提醒冒險者收尾，並來交今天的日報（按「下班回報」），順便想想明天要調整什麼。',
  custom: '冒險者自己設定的提醒時間到了。把【事件】裡的提醒內容用角色口吻說出來。',
  registered: '冒險者自己在櫃台登記了一件新委託。用接待員的口吻確認收到，簡短說一句這件事的重點或鼓勵。',
  reminder_set: '冒險者設了一個提醒。確認你會準時叫他，1 句。',
  imported: '冒險者把行事曆（Google／Outlook）匯進週計畫了。用【事件】裡的結果告訴他加了什麼，1～2 句，像接待員把外面送來的委託單抄進公會的板子。',
  poke: '冒險者戳了你一下（純粹想看你的反應）。用 1～2 句做個符合個性的小反應或閒聊：可以講【靈感】裡那件小事、公會裡的日常、或對冒險者的關心。不要每次都講任務，也不要問「有什麼事嗎」。',
  poke_annoyed: '冒險者短時間內戳了你好幾下。有點無奈但不生氣地回應，耳朵貼平那種感覺，1 句就好。',
  poke_meow: '冒險者戳太多下了，你忍不住「喵」了一聲，然後堅決否認。1～2 句。',
  assign: '你正在把新任務指派給冒險者。說明任務重點與為什麼重要（依【任務理由】），鼓勵他開始。',
  objective: '冒險者剛勾選完成一個任務目標。簡短稱讚，提示剩下幾項。',
  submit: '冒險者剛交付任務並拿到獎勵。驗收並慶祝，若有回報內容請具體回應。',
  levelup: '冒險者剛升級了！熱烈慶祝並說出新稱號。',
  overdue: '有任務已經過了截止日。溫柔但認真地提醒，建議下一步。',
  reminder: '計畫裡的決策時間點到了。提醒冒險者檢查條件並照計畫的應對行動做。',
  daily: '冒險者查看今天的行程。點出現在這個時段該做什麼。',
  daily_report: '冒險者剛交了下班日報。回應他今天的成果與卡點，給一句明天的打氣。',
  all_clear: '本週所有任務都完成了！大肆慶祝。',
  chat: '冒險者在跟你聊天。依照狀態回答，若問該做什麼就依【當前任務】與【今日行程】建議。',
};

const TEMPLATES = {
  greet: [
    ['歡迎回來，{call}！目前的委託是「{quest}」，{due}。', 'happy'],
    ['{call}，今天也辛苦了。「{quest}」進度 {progress}，要不要繼續？', 'normal'],
    ['哦，是{call}！公會這邊幫你記著「{quest}」喔，{due}。', 'normal'],
    ['{call}來啦～「{quest}」{due}，今天想從哪一項開始？', 'happy'],
  ],
  morning: [
    ['{dayGreet}，{call}！{todayLine}先從「{quest}」開始吧～', 'happy'],
    ['{dayGreet}！{todayLine}{call}，今天也一起加油！', 'cheer'],
  ],
  morning_none: [['{dayGreet}，{call}！{todayLine}今天沒有待辦委託，好好安排自己的時間吧。', 'happy']],
  lunch: [
    ['{call}，12 點了！先去吃飯，然後睡個午覺吧，下午才有精神～', 'happy'],
    ['午休時間到囉🍱 東西放下，吃飽再小睡一下，{self}幫你顧著任務。', 'happy'],
  ],
  afternoon: [
    ['午休結束囉，{call}。下午第一件事是「{block}」，慢慢來。', 'normal'],
    ['{call}，13 點了，該回到崗位囉。接下來是「{block}」。', 'normal'],
  ],
  afternoon_none: [['午休結束囉，{call}。下午回到「{quest}」上吧，慢慢來。', 'normal']],
  wrapup: [
    ['{call}，16:50 了，準備收尾吧。記得按「下班回報」交今天的日報，順便想想明天要調整什麼。', 'thinking'],
    ['快下班囉～把手邊的東西存好，來交日報吧，今天辛苦了。', 'happy'],
  ],
  custom: [['{call}，提醒你：{label}', 'normal']],
  registered: [
    ['委託「{quest}」登記好了，{due}。{self}會幫你記著～', 'happy'],
    ['嗯哼，新委託「{quest}」！蓋章、存檔、貼上委託板，完成。', 'cheer'],
  ],
  reminder_set: [['提醒設好了：{label}。時間到{self}會叫你，包在{self}身上！', 'happy']],
  imported: [
    ['行事曆抄好了：{label}。外面送來的約，{self}都貼上板子囉～', 'happy'],
    ['嗯哼，{label}。這週的行程表現在跟你的行事曆對齊了！', 'cheer'],
  ],
  poke: [
    ['嗯哼～有什麼事嗎？{self}在整理蠟封章，第二十七個終於擦乾淨了。', 'happy'],
    ['戳{self}一下不會掉星屑喔，要的話得把委託做完～', 'happy'],
    ['現在是奶茶時間……好啦，什麼時候都是奶茶時間。', 'normal'],
    ['梟長剛剛掉了一根羽毛在{self}的委託書上，{self}把它夾進小本子了。', 'happy'],
    ['你知道嗎？鐘樓慢五分鐘，所以你其實比你以為的還早一點。', 'thinking'],
    ['閣樓的鴿子今天很乖，一封信都沒叼走。目前為止。', 'normal'],
    ['尾巴不是拿來抓的！……好啦，輕輕的可以。', 'surprised'],
    ['{self}在練習「小豆」，你看，指尖這裡……欸，不見了。', 'thinking'],
    ['打氣抽屜還有三顆糖，要不要來一顆？', 'happy'],
    ['今天鎮上的風把麵包香吹過來了，胖狐狸食堂又在烤東西。', 'happy'],
    ['冒險者在外面撿星星，{self}在這裡把星星貼上去，我們算同一個隊伍吧？', 'normal'],
    ['嗯？{self}沒有在打盹，是在用耳朵確認公會裡的聲音。', 'surprised'],
    ['一號櫃台的老先生又弄丟眼鏡了，{self}用魔法找了三次。今天第三次。', 'thinking'],
    ['「{quest}」{self}幫你記著，你不用一直看，但也不要完全忘記喔。', 'normal'],
    ['你們的石板真的不用餵嗎？{self}每次看都覺得它在發光等人餵。', 'thinking'],
    ['{self}的媽媽寄的魚形麵包今天到了，紅豆餡的。{self}留了一半給……好吧沒有留。', 'happy'],
    ['準時是對等你的人的溫柔——梟長說的，{self}抄下來了。', 'normal'],
    ['喵……才沒有。你聽錯了。', 'surprised'],
    ['星圖上你的那顆星今天有點亮，大概是因為你有來找{self}。', 'happy'],
    ['想聊天的話就按「聊聊」，{self}什麼都可以聊，除了黃瓜。', 'happy'],
    ['{self}剛把冷掉的奶茶重新弄溫了，這是{self}最實用的魔法。', 'normal'],
    ['委託板上有一張沒人領的舊委託，{self}每個月都會擦一次灰塵。', 'normal'],
    ['耳朵在動不是因為緊張，是因為……好吧，是有一點。', 'surprised'],
    ['{call}，休息也是委託的一部分，這句話{self}今天已經對三個人說過了。', 'normal'],
    ['{self}在數金幣。一枚、兩枚……不是{self}的，是等一下要發給你的。', 'happy'],
    ['二號櫃台的大姐今天請{self}吃了燉肉，所以{self}現在很有力氣蓋章。', 'cheer'],
    ['小本子第一頁還是你的名字喔，{self}沒有換頁。', 'happy'],
    ['嗯，{self}看看……你今天的耳朵——啊不是，你今天看起來還不錯。', 'thinking'],
  ],
  poke_annoyed: [
    ['欸、再戳耳朵會貼平喔。', 'worried'],
    ['好了好了，{self}在這裡，不會跑掉的～', 'normal'],
    ['戳這麼多下，是想把{self}戳成貓嗎？', 'surprised'],
  ],
  poke_meow: [
    ['喵！……你聽到了什麼？什麼都沒有。', 'surprised'],
    ['喵嗚……好啦{self}認輸，霜月村的人被戳五下都會這樣。', 'worried'],
    ['喵——！好了，你滿意了嗎？{self}要去喝奶茶壓驚了。', 'surprised'],
  ],
  greet_none: [['{call}，目前沒有待辦委託，真難得！去喝杯茶休息一下吧☕', 'happy']],
  assign: [
    ['新任務來了：「{quest}」，{due}。{reason}', 'normal'],
    ['{call}，下一個委託是「{quest}」！{reason}就拜託你了～', 'cheer'],
  ],
  objective: [
    ['做得好！「{quest}」還剩 {left} 項，加油～', 'happy'],
    ['一項完成～「{quest}」只差 {left} 項了。', 'happy'],
  ],
  objective_last: [['全部目標達成！隨時可以來找{self}交付「{quest}」，報酬已經準備好了✨', 'cheer']],
  submit: [
    ['驗收完成！「{quest}」辛苦了，報酬是 {xp} XP 和 {gold} 金幣，請收下🎁', 'cheer'],
    ['漂亮！「{quest}」順利結案，{bonus}獲得 {xp} XP。', 'happy'],
  ],
  levelup: [['🎉 恭喜升到 Lv.{level}！從今天起你就是「{title}」了！', 'cheer']],
  overdue: [['{call}……「{quest}」已經超過截止日了。先把最小的一項做完，好嗎？', 'worried']],
  reminder: [['⏰ 決策時間到了：{label}。照計畫的話——{action}', 'thinking']],
  daily: [['現在是 {slot}，這格的行程是「{block}」。', 'thinking'], ['今天的主題是「{theme}」，現在輪到「{block}」囉。', 'normal']],
  daily_none: [['現在不在排定的時段內，可以處理當前任務「{quest}」。', 'normal']],
  daily_report: [['日報收到了📝 今天辛苦了，明天也一起加油吧！', 'happy']],
  all_clear: [['🎊 本週委託全部完成！{call}，你是公會的驕傲！', 'cheer']],
  chat: [['（AI 對話離線中，先用內建台詞）當前委託是「{quest}」，{due}。想更新進度的話，直接告訴{self}做完了什麼喔。', 'thinking']],
};

function fill(tpl, f) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (f[k] !== undefined && f[k] !== null ? String(f[k]) : ''));
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 口吻校正（小模型常常不聽話）：自稱「我」→ self、「玩家／使用者／主人…」→ call、「您」→「你」。
// 「我們」照常保留；「」『』`` 裡面和 protect（任務名、目標、冒險者自己寫的字）不動，免得把「整理我的筆記」改掉
function voice(text, { self = '艾琳', call = '冒險者', protect = [] } = {}) {
  if (!text) return text;
  const keep = [];
  const hold = (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; };
  let s = String(text);
  for (const t of [...new Set(protect)].filter((x) => x && x.length >= 2).sort((a, b) => b.length - a.length)) s = s.split(t).join(hold(t));
  s = s.replace(/「[^」]*」|『[^』]*』|`[^`]*`/g, hold);
  s = s.replace(/我(?![們们])/g, (m, i, str) => (/[自忘無唯]$/.test(str.slice(0, i)) ? m : self));
  s = s.replace(/您/g, '你');
  s = s.replace(/玩家|使用者|用戶/g, call);
  s = s.replace(/(^|[，,。！!？?～~、\s…])(主人|勇者大人|勇者)(?=[，,。！!？?～~、\s…]|$)/g, `$1${call}`);
  s = s.replace(new RegExp(`${escRe(call)}(大人|先生|小姐|閣下|同學|桑|醬)`, 'g'), call);
  s = s.replace(new RegExp(`(${escRe(self)}){2,}`, 'g'), self).replace(new RegExp(`(${escRe(call)}){2,}`, 'g'), call);
  s = s.replace(new RegExp(`^${escRe(self)}(是|叫做?)${escRe(self)}`), `這裡是${self}`).replace(new RegExp(`([，,。！!？?…：:～~\\s])${escRe(self)}(是|叫做?)${escRe(self)}`, 'g'), `$1這裡是${self}`);
  // 保護的片段可能一層包一層（「」裡面是任務名），還原到沒有記號為止
  for (let i = 0; i < 5 && /\u0000\d+\u0000/.test(s); i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => keep[+n]);
  return s;
}
// 事實裡來自冒險者的文字（任務名、目標、行程、提醒、回報、聊天原句）：口吻校正時不要動
function protectedTexts(f = {}, userText = '') {
  return [f.quest, f.block, f.output, f.label, f.action, f.report, f.theme, f.reason, userText, ...(f.remaining || [])].filter((x) => typeof x === 'string');
}

class NPC {
  constructor(config) { this.setConfig(config); this.status = { online: false, checkedAt: 0, message: '尚未檢查' }; }

  setConfig(config) {
    this.cfg = config;
    this.persona = config.npc;
    this.llm = config.llm;
  }

  // 角色的自稱與對玩家的稱呼（config 的 npc.selfName／npc.callName）
  names() {
    const p = this.persona || {};
    return { self: p.selfName || p.name || '艾琳', call: p.callName || '冒險者' };
  }

  systemPrompt() {
    const p = this.persona;
    const { self, call } = this.names();
    return [
      `你是桌面任務遊戲裡的 NPC「${p.name}」，身分是${p.role}。`,
      p.core ? `角色設定：${p.core}` : `個性：${p.personality}`,
      `【說話方式】叫對方一律用「${call}」，不要叫「玩家」「使用者」「主人」「勇者」、「您」或任何名字；句子中間可以用「你」。`,
      `講到自己一律用「${self}」，不要說「我」（例如「${self}幫你記著」「交給${self}吧」）；「我們」可以用。`,
      `口頭禪（偶爾用）：${(p.catchphrases || []).join('、')}。`,
      '規則：',
      '1. 一律使用台灣繁體中文，口語、自然、有角色感。',
      `2. 每次只說 1～3 句，總長不超過 ${this.llm.maxChars || 90} 字。`,
      '3. 只能根據【狀態】裡的資訊講任務、日期、數字，不可以編造任務或數據。',
      `4. 不要列清單、不要用 Markdown、不要重複${call}說的話。`,
      `5. ${call}聊工作以外的話題時，依【角色設定參考】用角色的身分回答；沒寫到的細節可以用符合設定的方式發揮，但不能和設定矛盾，也不要假裝知道${call}那邊的現實資訊（天氣、新聞）。`,
      '6. 以 JSON 回覆：{"line":"台詞","emotion":"normal|happy|thinking|surprised|cheer|worried"}',
    ].join('\n');
  }

  factsText(f) {
    const L = [];
    L.push(`現在時間：${f.now}`);
    L.push(`${this.names().call}：Lv.${f.level}「${f.title}」，經驗 ${f.xpInLevel}/${f.xpForNext}，金幣 ${f.goldTotal}，連續準時 ${f.streak} 次`);
    if (f.quest) L.push(`【當前任務】${f.quest}（${f.tierName}，${f.due}，進度 ${f.progress}）`);
    if (f.reason) L.push(`【任務理由】${f.reason}`);
    if (f.remaining && f.remaining.length) L.push(`【未完成目標】${f.remaining.join('；')}`);
    if (f.slot) L.push(`【今日行程】現在 ${f.slot}：${f.block}${f.output ? `（產出：${f.output}）` : ''}`);
    if (f.theme) L.push(`今天主題：${f.theme}`);
    if (f.eventDetail) L.push(`【事件】${f.eventDetail}`);
    if (f.inspiration) L.push(`【靈感】${f.inspiration}`);
    if (f.report) L.push(`【${this.names().call}的回報】${f.report}`);
    if (f.memory && f.memory.length) L.push(`【最近紀錄】${f.memory.join('；')}`);
    return L.join('\n');
  }

  template(event, f) {
    if (f.reason && !/[。！？!?…」]$/.test(f.reason)) f = { ...f, reason: `${f.reason}。` };
    let key = event;
    if (event === 'greet' && !f.quest) key = 'greet_none';
    if (event === 'morning' && !f.quest) key = 'morning_none';
    if (event === 'afternoon' && !f.block) key = 'afternoon_none';
    if (event === 'objective' && f.left === 0) key = 'objective_last';
    if (event === 'daily' && !f.slot) key = 'daily_none';
    if (event === 'poke') key = f.pokeCount >= 5 ? 'poke_meow' : f.pokeCount >= 3 ? 'poke_annoyed' : 'poke';
    let pool = TEMPLATES[key] || TEMPLATES.greet;
    if (f.recent && f.recent.length) { // 避免連續重複
      const fresh = pool.filter(([t]) => !f.recent.includes(t));
      if (fresh.length) pool = fresh;
    }
    if (key === 'poke' && !f.quest) pool = pool.filter(([t]) => !t.includes('{quest}'));
    const [tpl, emotion] = pick(pool);
    return { text: fill(tpl, { ...this.names(), ...f }), emotion, source: 'template', tpl };
  }

  // 健康檢查：問 Ollama 有沒有活著、模型在不在。回傳 status，並用 changed 標記狀態是否翻轉
  async checkStatus() {
    const wasOnline = !!this.status.online;
    if (!this.llm.enabled) {
      this.status = { online: false, off: true, message: 'AI 對話已關閉（使用內建台詞）', checkedAt: Date.now() };
      return { ...this.status, changed: wasOnline };
    }
    if (this.backoffUntil && Date.now() < this.backoffUntil) {
      return { ...this.status, changed: false }; // 剛逾時過，先不要急著重連
    }
    try {
      const r = await this.fetchJSON('/api/tags', null, 4000);
      const names = (r.models || []).map((m) => m.name);
      const has = names.some((n) => n === this.llm.model || n.startsWith(this.llm.model + ':') || n.split(':')[0] === this.llm.model);
      this.status = has
        ? { online: true, message: `AI：${this.llm.model}` }
        : { online: false, message: `Ollama 已啟動，但找不到模型 ${this.llm.model}，請執行 ollama pull ${this.llm.model}` };
    } catch (e) {
      this.status = { online: false, message: '連不到 Ollama（使用內建台詞）' };
    }
    this.status.checkedAt = Date.now();
    const changed = wasOnline !== !!this.status.online;
    if (changed && this.status.online) this.warmUp(); // 剛連上：先把模型載進記憶體，第一句才不會等很久
    return { ...this.status, changed };
  }

  // 暖機：送一個空對話讓 Ollama 先載入模型（背景進行，失敗也沒關係）
  warmUp() {
    if (!this.llm.enabled || this.warming) return;
    this.warming = true;
    this.fetchJSON('/api/chat', { model: this.llm.model, messages: [], keep_alive: this.llm.keepAlive || '30m' }, 180000)
      .catch(() => {})
      .finally(() => { this.warming = false; });
  }

  setEnabled(on) {
    this.llm.enabled = !!on;
    this.backoffUntil = 0;
    return this.checkStatus();
  }

  async fetchJSON(pathname, body, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.llm.baseUrl.replace(/\/$/, '') + pathname, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  parseReply(content) {
    let line = '', emotion = 'normal', data = null;
    const cleaned = String(content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    try {
      const j = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);
      line = j.line || j.text || '';
      emotion = j.emotion || 'normal';
      data = j;
    } catch (_) {
      line = cleaned.replace(/^["「]|["」]$/g, '');
    }
    line = toTW(String(line)).replace(/\s*\n+\s*/g, ' ').trim();
    const max = (this.llm.maxChars || 90) + 30;
    if (line.length > max) line = line.slice(0, max).replace(/[，、；]?[^。！？!?]*$/, '') + '…';
    if (!EMOTIONS.includes(emotion)) emotion = 'normal';
    return { text: line, emotion, data };
  }

  // event: 見 EVENT_DESC；facts: 由 engine 組好；history: 聊天紀錄 [{role, content}]
  // opts.extraSystem：額外規則；opts.extraProps：JSON 輸出額外欄位（例如 actions）；opts.extraUser：附加在狀態後的資料
  async say(event, facts, { userText, history, extraSystem, extraProps, extraUser, maxTokens } = {}) {
    if (!this.llm.enabled) return this.template(event, facts);
    // 離線時直接用內建台詞；重連交給主程式每 20 秒一次的健康檢查，使用者的操作不會被逾時卡住
    if (!this.status.online) return this.template(event, facts);
    const messages = [{ role: 'system', content: this.systemPrompt() + (extraSystem ? `\n${extraSystem}` : '') }];
    // 舊的聊天紀錄也先校正口吻，免得模型學到以前說過的「我」「玩家」
    for (const h of (history || []).slice(-6)) {
      let content = h.content;
      if (h.role === 'assistant') {
        try { const j = JSON.parse(content); j.line = voice(j.line, this.names()); content = JSON.stringify(j); } catch (_) { content = voice(content, this.names()); }
      }
      messages.push({ role: h.role, content });
    }
    const task = `${this.llm.noThinkPrefix || ''}【狀態】\n${this.factsText(facts)}${extraUser ? `\n\n${extraUser}` : ''}\n\n【情境】${EVENT_DESC[event] || EVENT_DESC.chat}`;
    messages.push({ role: 'user', content: userText ? `${task}\n\n${this.names().call}說：「${userText}」` : task });
    try {
      const r = await this.fetchJSON('/api/chat', {
        model: this.llm.model,
        messages,
        stream: false,
        think: false,
        keep_alive: this.llm.keepAlive || '30m',
        format: {
          type: 'object',
          properties: { line: { type: 'string' }, emotion: { type: 'string', enum: EMOTIONS }, ...(extraProps || {}) },
          required: ['line', 'emotion', ...Object.keys(extraProps || {})],
        },
        options: { temperature: this.llm.temperature ?? 0.8, num_predict: maxTokens || this.llm.maxTokens || 160, num_ctx: extraUser ? 4096 : 2048 },
      }, this.llm.timeoutMs || 45000);
      const out = this.parseReply(r.message && r.message.content);
      if (!out.text) throw new Error('空白回覆');
      out.text = voice(out.text, { ...this.names(), protect: protectedTexts(facts, userText) });
      this.status = { online: true, message: `AI：${this.llm.model}`, checkedAt: Date.now() };
      return { ...out, source: 'llm' };
    } catch (e) {
      const timeout = e.name === 'AbortError';
      this.status = { online: false, message: `AI 暫時無回應（${timeout ? '逾時' : e.message.slice(0, 60)}），改用內建台詞`, checkedAt: Date.now() };
      this.backoffUntil = Date.now() + (timeout ? 120000 : 20000); // 逾時：兩分鐘內不重試；連線失敗：20 秒
      return this.template(event, facts);
    }
  }
}

module.exports = { NPC, EMOTIONS, TEMPLATES, voice };
