// 📒 艾琳的小本子：記住冒險者親口說過的「自己的事」，之後自然地提起
// 五類：喜歡與不喜歡、生活、最近的事（之後會追問）、重要的日子（當天會記得）、工作
// 寫入有兩條路：AI 開著時從回覆的 notes 欄位（要再檢查有沒有根據），以及不靠 AI 的句型規則（離線也能記）
// 純函式（沒有 I/O），engine 負責存檔；測試直接 require
'use strict';

const KINDS = {
  like: { label: '喜歡與不喜歡', icon: '🍰' },
  life: { label: '生活', icon: '🏠' },
  event: { label: '最近的事', icon: '🌧' },
  date: { label: '重要的日子', icon: '📅' },
  work: { label: '工作', icon: '📜' },
};
const KIND_KEYS = Object.keys(KINDS);
const DEFAULTS = {
  enabled: true,          // false：不再記新的（已經記的還在，可以偷看、劃掉）
  max: 80,                // 最多幾則，滿了先丟舊的
  followAfterHours: 18,   // 「最近的事」過多久之後追問
  followWithinDays: 10,   // 太久以前的就不追問了
  followWorkDays: 3,      // 工作上在忙的事，過幾天問一次進度
  followStage: 2,         // 好感第幾階開始會主動追問（第 1 階只記、不追問）
  birthdayGold: 20,       // 冒險者生日那天的禮物
};
const DAY = 86400000;

// ---------- 小工具 ----------
const ABOUT_ERIN = /你|妳|艾琳|Erin/i;
const VAGUE = /^(這|那|哪|什麼|甚麼|它|他們|她們|大家|一下|一點|東西)/;
const STOP = new Set('我的了是在有很超最好也都會要就跟和與喜歡愛討厭怕養叫一隻條個些這那吃喝看去做著過還又才再'.split(''));
const PEOPLE = '媽媽|媽|爸爸|爸|老婆|老公|太太|先生|女朋友|男朋友|女友|男友|弟弟|妹妹|哥哥|姊姊|姐姐|小孩|兒子|女兒|爺爺|奶奶|外婆|外公|阿嬤|阿公';
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mmdd = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function tidy(s) {
  return String(s || '')
    .replace(/[\s　]+/g, ' ').trim()
    .replace(/^[，、。！？!?～~…：:\s]+|[，、。！？!?～~…：:\s]+$/g, '')
    .replace(/(的話|的說|啦|喔|哦|耶|呢|嗎|啊|呀|欸|唷|哈+|嘿+|XD|xd)+$/g, '')
    .replace(/(是|在|要|有|就是)$/, '')
    .trim();
}
// 小本子是艾琳寫的：把冒險者的「我」換掉（我媽→媽媽、我的貓→貓），模型轉口吻時也不會把「我」改成「艾琳」
function depersonalize(s) {
  return tidy(String(s || '')
    .replace(new RegExp(`我(?:的)?(${PEOPLE})`, 'g'), (_, p) => (p.length === 1 ? p + p : p))
    .replace(/我們/g, '大家')
    .replace(/^我(?:的)?/, '')
    .replace(/我(?:的)?/g, ''));
}
function bigrams(s) {
  const t = String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (t.length < 2) return t ? [t] : [];
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}
function sim(a, b) {
  const A = new Set(bigrams(a)), B = new Set(bigrams(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
// AI 寫的筆記有沒有根據：筆記裡的「內容字」（扣掉喜歡、我、的這類）至少一半出現在冒險者這句話裡
function supported(note, said) {
  const chars = [...String(note || '')].filter((c) => /[\p{L}\p{N}]/u.test(c) && !STOP.has(c));
  if (!chars.length) return false;
  const hit = chars.filter((c) => String(said).toLowerCase().includes(c.toLowerCase())).length;
  return hit >= 1 && hit / chars.length >= 0.5;
}
// 「10/15」「10月15日」→ { m, d }
function parseMD(s) {
  const m = String(s || '').match(/(\d{1,2})\s*[\/\-月]\s*(\d{1,2})\s*[日號]?/);
  if (!m) return null;
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { m: mo, d, raw: m[0], index: m.index };
}
// 沒寫年份的一次性日子：最近的那一次（已經過了一個月以上就當明年）
function nextDateISO(mo, d, now) {
  let y = now.getFullYear();
  const cand = new Date(y, mo - 1, d);
  if (now - cand > 30 * DAY) y += 1;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
function normDate(v, now) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, yearly: false };
  m = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return { date: `${pad(m[1])}-${pad(m[2])}`, yearly: true };
  const md = parseMD(s);
  if (md) return { date: nextDateISO(md.m, md.d, now), yearly: false };
  return null;
}
const YEARLY = /生日|紀念日|週年|周年/;
// 「明天」「後天」「下週三」「這週五」→ 那天的日期
const WD = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
function relDate(s, now) {
  let m = String(s || '').match(/大後天|後天|明天/);
  if (m) { const d = new Date(now.getTime() + ({ 明天: 1, 後天: 2, 大後天: 3 }[m[0]]) * DAY); return { date: iso(d), raw: m[0], index: m.index }; }
  m = String(s || '').match(/(下|這|本)?(?:週|周|禮拜|星期)([一二三四五六日天])/);
  if (m) {
    const target = WD[m[2]]; const cur = now.getDay();
    let diff = (target - cur + 7) % 7;
    if (m[1] === '下') diff += diff === 0 ? 7 : (target === 0 || target > cur ? 7 : 0);
    else if (!m[1] && diff === 0) diff = 0;
    const d = new Date(now.getTime() + diff * DAY);
    return { date: iso(d), raw: m[0], index: m.index };
  }
  return null;
}

// ---------- 句型規則（不靠 AI；離線時也能記） ----------
const EVENT_WORDS = '發表|報告|簡報|考試|面試|口試|出國|旅行|出差|放假|休假|請假|搬家|上線|截止|deadline|婚禮|結婚|紀念日|演唱會|比賽|開會|會議|demo|看醫生|看牙醫|回診|健檢|聚餐|約會';
const BAD = /(好|很|超|有點|有夠|太|快)(趕|忙|累|煩|緊張|焦慮|難過|崩潰|頭痛|頭大|想哭)|焦頭爛額|感冒|生病|發燒|咳嗽|失眠|吵架|被罵|被兇|搞砸|加班|壓力好大|壓力很大|住院|受傷|不舒服/;
const GOOD = /升遷|加薪|錄取|考上|拿到offer|拿到 offer|中獎|要結婚|訂婚|生寶寶|當爸爸|當媽媽/i;
const WORK = /(?:最近|這週|這禮拜|這陣子|現在|目前|正在|在忙|負責)(?:都|也|還)?(?:在)?(?:忙|做|負責|準備|寫|趕)(?:著)?(.{2,16}?(?:專案|計畫|計劃|案子|報告|簡報|論文|系統|產品|活動|研究|提案|企劃|網站|APP|app))/;

function splitClauses(text) {
  const out = [];
  const re = /[^，。！？!?；;\n,～~]+[，。！？!?；;\n,～~]*/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push({ body: m[0].replace(/[，。！？!?；;\n,～~]+$/, '').trim(), end: m[0].slice(-1) });
  return out.filter((c) => c.body);
}
const isQuestion = (c) => /[？?]/.test(c.end) || /(嗎|呢|什麼|甚麼|哪|幾)$/.test(c.body) || /^(你|妳)/.test(c.body);

function extractRules(text, now = new Date()) {
  const out = [];
  const add = (n) => { if (n.text && n.text.length >= 2 && n.text.length <= 30) out.push({ source: 'rule', ...n }); };
  for (const c of splitClauses(text)) {
    const s = c.body;
    if (isQuestion(c)) continue;
    // 生日（自己的，或家人的）
    const bm = s.match(new RegExp(`(?:(我)(?:的)?)?(${PEOPLE})?(?:的)?生日(?:是|在)?`));
    const md = parseMD(s);
    if (bm && md && !ABOUT_ERIN.test(s)) {
      const who = bm[2];
      add({ kind: 'date', text: who ? `${who.length === 1 ? who + who : who}的生日` : '生日', date: `${pad(md.m)}-${pad(md.d)}`, yearly: true, self: !who });
      continue;
    }
    // 有日期的事：「10/15 要上台發表」「11月3號搬家」「明天要考試」「下週三口試」
    const rd = md ? null : relDate(s, now);
    if ((md || rd) && new RegExp(EVENT_WORDS, 'i').test(s) && !ABOUT_ERIN.test(s)) {
      const at = md || rd;
      const rest = tidy(depersonalize(s.slice(0, at.index) + ' ' + s.slice(at.index + at.raw.length)).replace(/^(那天|當天|的時候)?\s*(要|有|是|會|得|就要)?\s*/, ''));
      const yearly = !!md && YEARLY.test(rest);
      if (rest.length >= 2) add({ kind: 'date', text: rest.slice(0, 18), date: md ? (yearly ? `${pad(md.m)}-${pad(md.d)}` : nextDateISO(md.m, md.d, now)) : rd.date, yearly });
      continue;
    }
    // 喜歡／不喜歡（主詞是自己，或省略主詞）
    const before = (i) => s.slice(0, i);
    let m = s.match(/(不太喜歡|不怎麼喜歡|沒那麼喜歡|不喜歡|討厭|受不了|不敢吃|不敢喝|不吃|不喝|很怕|超怕|最怕|怕)(.{1,14})/);
    if (m && !ABOUT_ERIN.test(before(m.index)) && !/不怕/.test(s)) {
      const obj = tidy(m[2]);
      const verb = /喜歡$/.test(m[1]) ? '不喜歡' : m[1].replace(/^(很|超|最)/, '');
      if (obj.length >= 1 && !VAGUE.test(obj) && !ABOUT_ERIN.test(obj)) { add({ kind: 'like', text: `${verb}${obj}`.slice(0, 18) }); continue; }
    }
    m = s.match(/(?:很|超|最|蠻|滿|還蠻|比較|也|超級)?(喜歡|愛吃|愛喝|愛看|愛玩|愛聽|迷上|超愛|很愛|最愛)(.{1,14})/);
    if (m && !ABOUT_ERIN.test(before(m.index)) && !/[不沒]/.test(s.slice(Math.max(0, m.index - 4), m.index))) {
      const obj = tidy(m[2]);
      const verb = { 愛吃: '喜歡吃', 愛喝: '喜歡喝', 愛看: '喜歡看', 愛玩: '喜歡玩', 愛聽: '喜歡聽', 迷上: '迷上' }[m[1]] || '喜歡';
      if (obj.length >= 1 && !VAGUE.test(obj) && !ABOUT_ERIN.test(obj) && !/^(吃|喝|看|玩|聽)$/.test(obj)) { add({ kind: 'like', text: `${verb}${obj}`.slice(0, 18) }); continue; }
    }
    // 生活：寵物、家人的名字、興趣、週末都在做什麼
    m = s.match(/(?:家裡?有養|有養|養了|在養)(?:一|兩|二|三|幾)?(?:隻|條|頭|缸)?(.{1,12})/);
    if (m && !ABOUT_ERIN.test(before(m.index))) { add({ kind: 'life', text: `養了${tidy(m[1])}`.slice(0, 18) }); continue; }
    m = s.match(new RegExp(`我(?:的|家的?)?(貓|狗|兔子|倉鼠|鸚鵡|${PEOPLE})(?:叫做?|的名字是)(.{1,8})`));
    if (m) { const who = m[1].length === 1 && /媽|爸/.test(m[1]) ? m[1] + m[1] : m[1]; add({ kind: 'life', text: `${who}叫${tidy(m[2])}` }); continue; }
    m = s.match(/(?:我的)?興趣是(.{2,14})/);
    if (m) { add({ kind: 'life', text: `興趣是${tidy(m[1])}` }); continue; }
    m = s.match(/(?:週末|周末|假日|放假|下班後?)(?:都|常常|通常|會|喜歡)+(?:去|在)?(.{2,12})/);
    if (m && !ABOUT_ERIN.test(before(m.index)) && /我|^(週末|周末|假日|放假|下班)/.test(s)) { add({ kind: 'life', text: `${s.match(/週末|周末|假日|放假|下班後?/)[0]}常${tidy(m[1])}`.slice(0, 18) }); continue; }
    // 工作上在忙的事
    m = s.match(WORK);
    if (m && !ABOUT_ERIN.test(before(m.index))) { add({ kind: 'work', text: `在忙${tidy(m[1])}`.slice(0, 20) }); continue; }
    // 最近的事（煩惱、身體、大事）：之後會追問
    if ((BAD.test(s) || GOOD.test(s)) && !ABOUT_ERIN.test(s)) {
      const t = depersonalize(s).replace(/^(昨天|今天|剛剛|剛才)(晚上|早上|下午)?\s*/, '').slice(0, 24); // 之後追問時「昨天」已經不是昨天了
      const core = t.replace(/^(今天|昨天|最近|這週|這禮拜|好|很|超|有點)+/, '');
      if (core.length >= 3) add({ kind: 'event', text: t, mood: GOOD.test(s) ? 'good' : 'bad' });
    }
  }
  // 同一句話裡的好幾段心情（「簡報好趕，壓力好大」）合成一件事
  const ev = out.filter((n) => n.kind === 'event');
  if (ev.length > 1) {
    const merged = { ...ev[0], text: ev.map((n) => n.text).join('，').slice(0, 24), mood: ev.some((n) => n.mood === 'bad') ? 'bad' : 'good' };
    return [...out.filter((n) => n.kind !== 'event'), merged];
  }
  return out;
}

// ---------- AI 寫的筆記：再檢查一次 ----------
const RULES = (call) => [
  `【小本子】${call}在「這句話」裡親口說的、關於他自己的事，記進 notes（最多 2 則；沒有就給 []）：`,
  '- like：喜歡／不喜歡的東西　- life：寵物、家人、興趣、生活習慣　- event：最近發生的事、煩惱、身體狀況、好消息',
  '- date：重要的日子（date 填 MM-DD，只發生一次的填 YYYY-MM-DD）　- work：工作上正在忙的專案或事情',
  `text 寫 20 字內的短筆記，不要寫「${call}」或「我」，例如「喜歡無糖綠茶」「養了一隻柴犬叫豆豆」「這週簡報很趕」。`,
  '不要記：你自己說的話、你猜的事、任務進度回報（那是 actions 的工作）、只是在問問題。',
].join('\n');
const SCHEMA = {
  notes: {
    type: 'array',
    items: {
      type: 'object',
      properties: { kind: { type: 'string', enum: KIND_KEYS }, text: { type: 'string' }, date: { type: 'string' } },
      required: ['kind', 'text'],
    },
  },
};
const RELATIVE_DAY = /明天|後天|大後天|下週|下周|下禮拜|下星期|星期|禮拜|週[一二三四五六日天]|周[一二三四五六日天]|\d{1,2}\s*[\/月]\s*\d{1,2}/;

function guardAI(notes, said, now = new Date()) {
  const out = [];
  for (const n of Array.isArray(notes) ? notes : []) {
    if (!n || !KINDS[n.kind]) continue;
    let text = depersonalize(n.text).slice(0, 30);
    if (text.length < 2 || ABOUT_ERIN.test(text) || /冒險者/.test(text)) continue;
    if (!supported(text, said)) continue; // 冒險者沒說過的，不記
    const note = { kind: n.kind, text, source: 'ai' };
    if (n.kind === 'date') {
      const d = normDate(n.date, now);
      if (!d || !RELATIVE_DAY.test(said)) continue; // 日子要有根據（說了日期、或「下週三」這種）
      Object.assign(note, d);
      if (/生日/.test(text) && !new RegExp(PEOPLE).test(text)) { note.self = true; note.text = '生日'; note.date = note.date.slice(-5); note.yearly = true; }
      else if (YEARLY.test(text)) { note.date = note.date.slice(-5); note.yearly = true; }
    }
    if (n.kind === 'event') note.mood = GOOD.test(text) ? 'good' : 'bad';
    out.push(note);
    if (out.length >= 2) break;
  }
  return out;
}

// ---------- 小本子本身 ----------
function blank() { return { items: [], seq: 1 }; }
// 喜歡 vs 不喜歡同一樣東西：新的蓋掉舊的
const polarity = (t) => (/^(不喜歡|討厭|受不了|不敢|不吃|不喝|怕)/.test(t) ? -1 : /^(喜歡|迷上)/.test(t) ? 1 : 0);
const objOf = (t) => t.replace(/^(不喜歡|討厭|受不了|不敢吃|不敢喝|不吃|不喝|怕|喜歡吃|喜歡喝|喜歡看|喜歡玩|喜歡聽|喜歡|迷上)/, '');

function add(nb, notes, now = new Date(), { max = DEFAULTS.max } = {}) {
  const at = now.getTime();
  const added = [], updated = [];
  for (const n of notes) {
    const same = nb.items.find((x) => x.kind === n.kind && (
      (n.kind === 'date' && x.date === n.date && sim(x.text, n.text) >= 0.3) ||
      (n.kind === 'like' && objOf(x.text) && objOf(x.text) === objOf(n.text)) ||
      sim(x.text, n.text) >= 0.6));
    if (same) {
      const changed = same.text !== n.text;
      Object.assign(same, { text: n.text, updatedAt: at }, n.date ? { date: n.date, yearly: !!n.yearly } : {}, n.mood ? { mood: n.mood } : {});
      if (n.kind === 'event' && changed) same.followed = 0; // 同一件事又有新進展：之後再問一次
      if (changed) updated.push(same);
      continue;
    }
    const item = { id: `n${nb.seq++}`, kind: n.kind, text: n.text, at, updatedAt: at, source: n.source || 'rule' };
    if (n.date) Object.assign(item, { date: n.date, yearly: !!n.yearly });
    if (n.self) item.self = true;
    if (n.mood) item.mood = n.mood;
    nb.items.push(item);
    added.push(item);
  }
  prune(nb, now, max);
  return { added, updated };
}
function prune(nb, now, max) {
  if (nb.items.length <= max) return;
  const at = now.getTime();
  // 先丟：問過、過了一個月的「最近的事」→ 已經過去的一次性日子 → 最舊的（生日、每年的紀念日留著）
  const score = (x) => (x.kind === 'event' && x.followed && at - x.at > 30 * DAY ? 0
    : x.kind === 'date' && !x.yearly && x.date < iso(now) ? 1
      : x.kind === 'date' && x.yearly ? 9 : 5);
  const order = [...nb.items].sort((a, b) => score(a) - score(b) || a.updatedAt - b.updatedAt);
  const drop = new Set(order.slice(0, nb.items.length - max).map((x) => x.id));
  nb.items = nb.items.filter((x) => !drop.has(x.id));
}
function forget(nb, id) {
  const n = nb.items.length;
  nb.items = nb.items.filter((x) => x.id !== id);
  return nb.items.length < n;
}

function agoText(at, now) {
  const a = new Date(at); const d0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((d1 - d0) / DAY);
  return days <= 0 ? '剛剛' : days === 1 ? '昨天' : days === 2 ? '前天' : days < 7 ? `${days} 天前` : days < 14 ? '上週' : `${Math.floor(days / 7)} 週前`;
}
const dateLabel = (x) => { const [m, d] = x.date.slice(-5).split('-').map(Number); return `${m}/${d}`; };
const label = (x) => (x.kind === 'date' && x.date ? `${dateLabel(x)} ${x.text}` : x.text); // 「10/8 生日」

// 聊天時：跟這句話有關的筆記（問「你還記得我什麼」就多給幾則），再加一件最近還沒問過的事
const ASK_MEMORY = /記得|小本子|你知道我|還記不記得|我說過|我跟你說過/;
function relevant(nb, text, now = new Date(), k = 3) {
  const items = nb.items || [];
  if (!items.length) return [];
  if (ASK_MEMORY.test(text)) return [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const scored = items.map((x) => ({ x, s: sim(x.text, text) + (x.kind === 'date' ? 0 : 0) })).filter((y) => y.s >= 0.34).sort((a, b) => b.s - a.s).slice(0, k).map((y) => y.x);
  const open = items.filter((x) => x.kind === 'event' && !x.followed && now - x.at < 5 * DAY && !scored.includes(x)).sort((a, b) => b.at - a.at)[0];
  return open ? [...scored, open] : scored;
}
function contextText(notes, now, call = '冒險者', self = '艾琳') {
  if (!notes.length) return '';
  const fmt = (x) => `${x.kind === 'date' ? `${dateLabel(x)} ` : ''}${x.text}（${agoText(x.at, now)}記的）`;
  return `【小本子】${self}記得${call}說過：${notes.map(fmt).join('；')}。\n只在跟現在聊的事有關時自然地提起（一次最多一件），不要每句都提，也不要說「小本子上寫著」。`;
}

// 主動追問：最近的事（隔天以後、十天內）優先，其次是工作上在忙的事（隔幾天問一次進度）
function dueFollowUp(nb, now = new Date(), cfg = DEFAULTS) {
  const at = now.getTime();
  const ev = (nb.items || []).filter((x) => x.kind === 'event' && !x.followed && at - x.updatedAt >= cfg.followAfterHours * 3600000 && at - x.updatedAt <= cfg.followWithinDays * DAY);
  if (ev.length) return ev.sort((a, b) => a.updatedAt - b.updatedAt)[0];
  const wk = (nb.items || []).filter((x) => x.kind === 'work' && at - Math.max(x.updatedAt, x.followed || 0) >= cfg.followWorkDays * DAY && at - x.updatedAt <= 30 * DAY);
  return wk.sort((a, b) => a.updatedAt - b.updatedAt)[0] || null;
}
// 重要的日子：今天是那天（每年的生日、紀念日；或一次性的發表、考試），或明天就是一次性的那件事
function dueDates(nb, now = new Date()) {
  const today = iso(now), tmr = iso(new Date(now.getTime() + DAY));
  const out = [];
  for (const x of nb.items || []) {
    if (x.kind !== 'date' || !x.date) continue;
    const isToday = x.yearly ? x.date.slice(-5) === mmdd(now) : x.date === today;
    const isEve = !x.yearly && x.date === tmr;
    if (isToday && x.saidOn !== today) out.push({ item: x, when: 'today' });
    else if (isEve && x.eveOn !== today) out.push({ item: x, when: 'eve' });
  }
  return out;
}

function view(nb, now = new Date()) {
  const groups = KIND_KEYS.map((k) => ({
    kind: k, ...KINDS[k],
    items: (nb.items || []).filter((x) => x.kind === k)
      .sort((a, b) => (k === 'date' ? (a.date.slice(-5) < b.date.slice(-5) ? -1 : 1) : b.updatedAt - a.updatedAt))
      .map((x) => ({ id: x.id, text: x.text, when: x.kind === 'date' ? `${dateLabel(x)}${x.yearly ? '（每年）' : ''}` : '', noted: `${new Date(x.at).getMonth() + 1}/${new Date(x.at).getDate()}`, followed: !!x.followed })),
  })).filter((g) => g.items.length);
  return { groups, count: (nb.items || []).length };
}

module.exports = { label, relDate, KINDS, KIND_KEYS, DEFAULTS, RULES, SCHEMA, blank, extractRules, guardAI, add, forget, relevant, contextText, dueFollowUp, dueDates, agoText, view, depersonalize, supported, sim, parseMD, normDate, iso };
