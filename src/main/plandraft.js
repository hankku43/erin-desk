// 📓 用聊的寫週計畫：草稿（委託、時段、提醒、每天的主題、不確定的）＋規則速記＋AI 整理的格式＋轉成計畫檔／合併
// AI 不直接寫 Markdown：只回結構化的項目（日期照原話），由這裡換成日期、套進草稿，最後用 planParser 的函式寫進檔案
// 純函式，不碰檔案
'use strict';

const P = require('./planParser');

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const TIERS = ['main', 'major', 'side'];
const TIER_NAME = { main: '主線', major: '重要', side: '有空再做' };
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d); };
const dowOf = (iso) => new Date(`${iso}T00:00:00`).getDay();
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const dayLabel = (iso) => `週${WD[dowOf(iso)]} ${md(iso)}`;
const validISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
const validHM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const norm = (s) => String(s || '').toLowerCase().replace(/[\s，。、；：:!！?？「」『』()（）\[\]【】~～\-–—_/\\.,'"`]/g, '');
const clip = (s, n = 60) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

// ---------- 哪一週 ----------
function mondayOf(iso) { const w = dowOf(iso) || 7; return addDays(iso, 1 - w); }
function weekOf(today, which = 'this') {
  const start = addDays(mondayOf(today), which === 'next' ? 7 : 0);
  const end = addDays(start, 4);
  return { which, start, end, label: `${md(start)}–${md(end)}`, name: which === 'next' ? '下週' : '本週' };
}
// 週一～三預設寫本週；週四以後先問（很多人週五排下週）
const needAsk = (today) => [0, 4, 5, 6].includes(dowOf(today));

// ---------- 中文日期、時間 ----------
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnNum(s) {
  if (/^\d+$/.test(s)) return +s;
  if (s === '十') return 10;
  const m = s.match(/^([一二兩三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
  return s.length === 1 && CN[s] !== undefined ? CN[s] : NaN;
}
const DAY_CH = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const RE_DAY = /(大後天|後天|明天|今天)|(下下|下|這|本|上)?\s*(?:週|周|星期|禮拜)\s*([一二三四五六日天])|(\d{1,2})\s*[/月]\s*(\d{1,2})\s*[日號]?/;
// 一段文字裡的日子 → { date, raw, index }；week＝要寫的那一週（「週三」就是那一週的週三）
function findDay(text, { week, today } = {}) {
  const m = String(text || '').match(RE_DAY);
  if (!m) return null;
  let date = null;
  if (m[1]) date = addDays(today, { 今天: 0, 明天: 1, 後天: 2, 大後天: 3 }[m[1]]);
  else if (m[3]) {
    const dow = DAY_CH[m[3]];
    const base = m[2] === '下' ? addDays(mondayOf(today), 7) : m[2] === '下下' ? addDays(mondayOf(today), 14) : m[2] === '上' ? addDays(mondayOf(today), -7)
      : m[2] === '這' || m[2] === '本' ? mondayOf(today) : week.start;
    date = addDays(base, dow === 0 ? 6 : dow - 1);
  } else if (m[4]) {
    const y0 = +week.start.slice(0, 4), wm = +week.start.slice(5, 7);
    const mo = +m[4], d = +m[5];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const y = mo - wm > 6 ? y0 - 1 : wm - mo > 6 ? y0 + 1 : y0; // 跨年：12 月排 1 月的事
    date = `${y}-${pad(mo)}-${pad(d)}`;
    if (!validISO(date)) return null;
  }
  return date ? { date, raw: m[0], index: m.index } : null;
}
// 只給 AI 的「day」欄位：整串就是日子（週五、10/16、明天）
function resolveDay(phrase, ctx) { const f = findDay(phrase, ctx); return f ? f.date : null; }

const NUM = '(\\d{1,2}|[一二兩三四五六七八九十]{1,3})';
const PERIOD = '(早上|上午|中午|下午|傍晚|晚上|凌晨)?';
const RE_HM_RANGE = /(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:[–\-~～]|到|至)\s*(\d{1,2})\s*[:：]\s*(\d{2})/;
const RE_HM = /(\d{1,2})\s*[:：]\s*(\d{2})/;
const RE_CN_TIME = new RegExp(`${PERIOD}\\s*${NUM}\\s*點\\s*(半|一刻|三刻|(\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*分?)?(?:\\s*(?:[–\\-~～]|到|至)\\s*${PERIOD}\\s*${NUM}\\s*點\\s*(半|一刻|三刻|(\\d{1,2}|[一二三四五六七八九十]{1,3})\\s*分?)?)?`);
function hourOf(h, period, { work = true } = {}) {
  if (period === '下午' || period === '晚上' || period === '傍晚') return h < 12 ? h + 12 : h;
  if (period === '中午') return h <= 2 ? h + 12 : h;
  if (period === '凌晨' || period === '早上' || period === '上午') return h === 12 ? 0 : h;
  return work && h >= 1 && h <= 7 ? h + 12 : h; // 上班的事：「3 點開會」是下午三點
}
const minOf = (s) => (!s ? 0 : s === '半' ? 30 : s === '一刻' ? 15 : s === '三刻' ? 45 : cnNum(String(s).replace(/\s*分$/, '')) || 0);
const hm = (h, m) => (h >= 0 && h < 24 && m >= 0 && m < 60 ? `${pad(h)}:${pad(m)}` : null);
// 一段文字裡的時間 → { start, end, raw, index }（沒有結束時間 end＝''）
function findTime(text) {
  const s = String(text || '');
  let m = s.match(RE_HM_RANGE);
  if (m) { const a = hm(+m[1], +m[2]), b = hm(+m[3], +m[4]); if (a) return { start: a, end: b && b > a ? b : '', raw: m[0], index: m.index }; }
  m = s.match(RE_CN_TIME);
  if (m) {
    const h1 = cnNum(m[2]);
    if (!Number.isNaN(h1) && h1 <= 24) {
      const sh = hourOf(h1, m[1]);
      const a = hm(sh, minOf(m[3]));
      let b = '';
      if (m[6]) {
        const h2 = cnNum(m[6]);
        let eh = hourOf(h2, m[5] || m[1]);
        if (!m[5] && eh < sh && eh + 12 < 24) eh += 12;
        b = hm(eh, minOf(m[7])) || '';
      }
      if (a) return { start: a, end: b && b > a ? b : '', raw: m[0], index: m.index };
    }
  }
  m = s.match(RE_HM);
  if (m) { const a = hm(+m[1], +m[2]); if (a) return { start: a, end: '', raw: m[0], index: m.index }; }
  m = s.match(/中午(?!\s*(?:之前|以前|前|為止))/); // 「中午訂便當」＝12:00；「中午前回信」是截止
  if (m) return { start: '12:00', end: '', raw: m[0], index: m.index };
  return null;
}
// AI 回的時間欄位：「14:00」「下午兩點」都可以
function normTime(s) { if (validHM(s)) return s; const t = findTime(s); return t ? t.start : ''; }
const plusMin = (t, n) => { const [h, m] = t.split(':').map(Number); const x = Math.min(23 * 60 + 59, h * 60 + m + n); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };

// ---------- 規則速記：一句話 → 項目 ----------
const RE_MEETING = /📯|團戰|會議|開會|週會|周會|例會|晨會|站會|月會|面談|面試|一對一|1\s*on\s*1|meeting|sync|review會|檢討會|討論|說明會|分享會|座談|研討會|工作坊|workshop|拜訪|見客戶|簡報/i;
const RE_REMIND = /⏰|提醒我|提醒一下|記得提醒/;
const RE_MAIN = /⭐|最重要|一定要|必須|必達|主線|最優先/;
const RE_SIDE = /🌿|有空|順便|順手|支線|有時間再|不急/;
const RE_ALLDAY = /整天|全天|一整天/;
const RE_DAYOFF = /^(?:請假|休假|特休|補休|放假|病假|事假|出差|外訓|出國)$/; // 「週二請假」：那天整天
const RE_PERIOD_HEAD = /^(?:上午|下午|早上|晚上|中午|傍晚)(?!茶)/;
// 「嗯……我想想」「就這樣」這種不是要記的
const RE_CHATTER = /^(?:嗯|呃|欸|啊|喔|哦|噢|好|對|是|ok|okay|沒了|沒有了|就這樣|先這樣|差不多了|好了|等等|等一下|我想想|讓我想想|想一下|然後呢|還有嗎|謝謝|謝啦|辛苦了)+$/i;
const isChatter = (t) => RE_CHATTER.test(String(t || '').replace(/[…\.。!！?？~～,，、\s]/g, ''));
const RE_ENOUGH = /^(?:(?:好|嗯|ok|okay)[，,\s]*)?(?:應該|大概|暫時)?(?:沒了|沒有了|就這樣|就這些|先這樣|先這些|差不多了|差不多就這(?:樣|些)|差不多|好了|說完了|講完了)(?:吧|啦|喔|囉)?[。.!！~～…\s]*$/i;
const isEnough = (t) => { const x = String(t || '').trim(); return x.length <= 14 && RE_ENOUGH.test(x); }; // 「好，差不多就這些」：說完了，不是要記的事
// 「週三做測試、週四修 bug、週五上線」：每一段有自己的日子就拆開；「週四上午做簡報，下午練講稿」也拆
const RE_SPLIT = /[，,、]\s*(?=(?:(?:下下|下|這|本)?\s*(?:週|周|星期|禮拜)\s*[一二三四五六日天]|大後天|後天|明天|今天|\d{1,2}\s*[/月]\s*\d{1,2})|(?:上午|下午|早上|晚上|中午|傍晚)(?!茶))/;
const FILLER_HEAD = /^(?:(?:上午|下午|早上|晚上|傍晚|中午(?!前|之前))(?!茶)|(?:這週|本週|下週|這禮拜|下禮拜|這星期|我們|我|你|一定要|必須要|必須|最重要的是|最重要的|最重要|最優先|有空的話|有空再|有空|有時間的話|有時間再|順便|順手|不急的|不急|要|得|需要|預計|打算|會|還要|另外|然後|再來|還有|記得|幫我|請|在|於)\s*)+/;
const FILLER_TAIL = /(?:之前|以前|前|要交|交出去|截止|為止|左右|吧|喔|哦|囉|啦|了)\s*$/;
function cleanText(s) {
  let t = String(s || '').replace(/^\s*(?:[-*+・•]|\d+[.、)])\s*/, '').replace(/^#+\s*/, '').replace(/\[[ xX]\]\s*/, '');
  t = t.replace(/[⭐🔧🌿📯⏰📅]/gu, ' ').replace(/\s+/g, ' ').replace(/\s*([，、：；（）])\s*/g, '$1').trim();
  for (let i = 0; i < 3; i++) t = t.replace(FILLER_HEAD, '').replace(FILLER_TAIL, '').replace(/^[，,：:、\s]+|[，,。：:、\s]+$/g, '').trim();
  return t;
}
// 把日子／時間從句子裡拿掉；日子連同前面的「在」和後面的「前／之前」一起拿（「在週四前送出」→「送出」）
function cutOut(text, ...hits) {
  let t = text;
  for (const h of hits.filter(Boolean).sort((a, b) => b.index - a.index)) {
    let from = h.index, to = h.index + h.raw.length;
    const after = t.slice(to).match(/^\s*(?:(?:的)?(?:下班|上班|中午|午休|早上|上午|下午|晚上|一早|結束)\s*)?(之前|以前|前|為止)/); if (after) to += after[0].length;
    const before = t.slice(0, from).match(/(在|於|到)\s*$/); if (before) from -= before[0].length;
    t = t.slice(0, from) + ' ' + t.slice(to);
  }
  return t;
}
const tierOf = (t) => (RE_MAIN.test(t) ? 'main' : RE_SIDE.test(t) ? 'side' : 'major');

// 回傳項目陣列：{ kind: quest|row|reminder|theme|unsure, … }
function splitUnits(line, ctx) {
  const out = [];
  for (const part of String(line).split(/[。；;]\s*/).map((x) => x.trim()).filter(Boolean)) {
    const pieces = part.split(RE_SPLIT).map((x) => x.trim()).filter(Boolean);
    const mine = [];
    let buf = '';
    pieces.forEach((pc, i) => { // 只有日子／時間、沒有事的那段不拆：併到下一段（「週三、週四出差」），最後一段就併回前一段（「週二開會，下午兩點」）
      const cur = buf ? `${buf}、${pc}` : pc;
      const empty = !cleanText(cutOut(pc, findDay(pc, ctx), findTime(pc)));
      if (empty && i < pieces.length - 1) { buf = cur; return; }
      const d = findDay(pc, ctx);
      const deadline = d && d.index === 0 && /^\s*(?:之前|以前|前)/.test(pc.slice(d.raw.length)) && mine.length && !findDay(mine[mine.length - 1], ctx); // 「看一下 A，週五前給意見」：截止日是前面那件的
      if ((empty || deadline) && mine.length) mine[mine.length - 1] += `，${cur}`; else mine.push(cur);
      buf = '';
    });
    out.push(...mine);
  }
  return out;
}
function ruleExtract(text, ctx) {
  const out = [];
  let lastQuest = null;
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    // 縮排或「- 」開頭、接在委託後面：那個委託的步驟
    if (lastQuest && /^\s+[-*+・•]|^\s*[-*+・•]\s+\[?[ xX]?\]?/.test(rawLine) && /^\s/.test(rawLine)) {
      const st = cleanText(rawLine);
      if (st) { lastQuest.steps.push(clip(st)); continue; }
    }
    let lastDay = null;
    for (const unit of splitUnits(rawLine, ctx)) {
      if (isChatter(unit) || isEnough(unit)) continue;
      const own = findDay(unit, ctx);
      const day = own || (lastDay && RE_PERIOD_HEAD.test(unit) ? { date: lastDay.date, raw: '', index: -1 } : null); // 「下午練講稿」：跟前一段同一天
      if (own) lastDay = own;
      const time = findTime(unit);
      const rest = cutOut(unit, day && day.index >= 0 ? day : null, time);
      if (RE_REMIND.test(unit) && time) {
        out.push({ kind: 'reminder', date: day ? day.date : ctx.today, time: time.start, title: clip(cleanText(rest.replace(RE_REMIND, ' '))) || '提醒' });
        lastQuest = null; continue;
      }
      if (time) {
        const title = clip(cleanText(rest)) || '（沒寫內容）';
        if (!day) out.push({ kind: 'unsure', title: `${time.start} ${title}`, question: '是哪一天？', guess: { kind: 'row', start: time.start, end: time.end, title, raid: RE_MEETING.test(unit) } });
        else out.push({ kind: 'row', date: day.date, start: time.start, end: time.end || (RE_MEETING.test(unit) ? plusMin(time.start, 60) : ''), title, raid: RE_MEETING.test(unit) });
        lastQuest = null; continue;
      }
      if (day && RE_DAYOFF.test(rest.replace(/\s+/g, ''))) { out.push({ kind: 'theme', date: day.date, title: rest.replace(/\s+/g, '') }); lastQuest = null; continue; }
      if (day && RE_ALLDAY.test(unit)) {
        out.push({ kind: 'theme', date: day.date, title: clip(cleanText(rest.replace(RE_ALLDAY, ' '))) || '整天' });
        lastQuest = null; continue;
      }
      // 委託：「標題：步驟、步驟」
      const cm = cleanText(rest).match(/^(.{2,40}?)\s*[：:]\s*(.+)$/);
      const title = clip(cm ? cm[1] : cleanText(rest));
      if (!title) continue;
      const steps = cm ? cm[2].split(/[、，,；;]|然後|再來/).map((x) => clip(cleanText(x))).filter((x) => x.length >= 2) : [];
      const q = { kind: 'quest', title, tier: tierOf(unit), tierSet: RE_MAIN.test(unit) || RE_SIDE.test(unit), due: day ? day.date : '', steps };
      out.push(q); lastQuest = q;
    }
  }
  return out;
}

// ---------- AI ----------
// 逐句整理：照原話寫日子（day），時間寫 HH:MM；沒把握的放 unclear
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['task', 'schedule', 'reminder', 'theme', 'unclear'] },
          title: { type: 'string' },
          day: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          importance: { type: 'string', enum: ['main', 'major', 'side'] },
          steps: { type: 'array', items: { type: 'string' } },
          meeting: { type: 'boolean' },
          question: { type: 'string' },
        },
        required: ['kind', 'title'],
      },
    },
  },
  required: ['items'],
};
const EXTRACT_SYSTEM = [
  '你是整理週計畫的小幫手。把使用者這一句話整理成週計畫的項目，用 JSON 回答 items 陣列，一句話通常 1～3 個項目，沒有要記的就回空陣列。',
  'kind 的意思：task＝要完成的工作（委託），day 寫截止日；schedule＝有固定時間的行程（會議、拜訪、課），day 寫哪一天、start／end 寫 24 小時制時間；reminder＝到時候要提醒的事，day＋start；theme＝某一天整天的狀態（出差、外訓、請假）；unclear＝看不懂或缺日期的，question 寫要問使用者什麼。',
  'title 用使用者原本的用字，簡短，不要加日期和時間。day 照原話寫（例如：週五、下週三、明天、10/16），沒說就留空。上班時間說「3 點」是下午 15:00。',
  'importance：main＝很重要／一定要，side＝有空再做，其他 major。steps：使用者有列出步驟才寫。meeting：會議、討論、拜訪這類要跟別人碰面的寫 true。',
].join('\n');
function extractUser(text, ctx) {
  const days = [0, 1, 2, 3, 4].map((i) => dayLabel(addDays(ctx.week.start, i))).join('、');
  return `【要寫的這一週】${days}\n【今天】${dayLabel(ctx.today)}\n【使用者說】${String(text).slice(0, 600)}`;
}
// AI 的項目 → 跟規則一樣的格式；日子、時間換成日期，壞的丟掉
function normalizeAI(json, ctx) {
  const out = [];
  for (const it of (json && Array.isArray(json.items) ? json.items : []).slice(0, 8)) {
    if (!it || typeof it !== 'object') continue;
    const title = clip(cleanText(it.title || ''));
    if (!title) continue;
    const date = it.day ? resolveDay(String(it.day), ctx) : null;
    const start = normTime(it.start || ''), end0 = normTime(it.end || '');
    const end = end0 && start && end0 > start ? end0 : '';
    const kind = it.kind;
    if (kind === 'schedule' || (kind === 'reminder' && !start && date)) {
      if (!start) { out.push({ kind: 'unsure', title, question: '是幾點？', guess: { kind: 'row', date, title, raid: !!it.meeting } }); continue; }
      if (!date) { out.push({ kind: 'unsure', title: `${start} ${title}`, question: '是哪一天？', guess: { kind: 'row', start, end, title, raid: !!it.meeting } }); continue; }
      out.push({ kind: 'row', date, start, end: end || (it.meeting ? plusMin(start, 60) : ''), title, raid: !!it.meeting || RE_MEETING.test(title) });
    } else if (kind === 'reminder') {
      out.push({ kind: 'reminder', date: date || ctx.today, time: start, title });
    } else if (kind === 'theme') {
      if (date) out.push({ kind: 'theme', date, title }); else out.push({ kind: 'unsure', title, question: '是哪一天？' });
    } else if (kind === 'unclear') {
      out.push({ kind: 'unsure', title, question: clip(it.question || '要記成什麼呢？', 40) });
    } else {
      out.push({ kind: 'quest', title, tier: TIERS.includes(it.importance) ? it.importance : 'major', tierSet: it.importance === 'main' || it.importance === 'side', due: date || '', steps: (Array.isArray(it.steps) ? it.steps : []).map((x) => clip(cleanText(x))).filter((x) => x.length >= 2).slice(0, 8) });
    }
  }
  return out;
}

// 修改：草稿目錄（q1／r1／m1／u1）＋使用者的指示 → 變更
const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add_task', 'add_step', 'add_schedule', 'add_reminder', 'set_theme', 'edit', 'delete'] },
          ref: { type: 'string' },
          title: { type: 'string' },
          day: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          importance: { type: 'string', enum: ['main', 'major', 'side'] },
          steps: { type: 'array', items: { type: 'string' } },
          meeting: { type: 'boolean' },
        },
        required: ['op'],
      },
    },
  },
  required: ['ops'],
};
const EDIT_SYSTEM = [
  '你是整理週計畫的小幫手。下面是目前的週計畫草稿，每一項前面有代號（q＝委託、r＝時段、m＝提醒）。照使用者的指示改草稿，用 JSON 回答 ops 陣列，只改指示說到的地方。',
  'op：edit＝改某一項（ref 寫代號，只填要改的欄位：title、day、start、end、importance、meeting）；delete＝刪掉某一項（ref）；add_step＝幫某個委託加步驟（ref＋steps）；add_task／add_schedule／add_reminder＝新增（欄位同上）；set_theme＝某一天整天的狀態（day＋title）。',
  'day 照原話寫（例如：週五、10/16），時間寫 24 小時制；上班時間說「3 點」是 15:00。換到別天就用 edit 改 day。',
].join('\n');
function indexText(d) {
  const L = [];
  d.quests.forEach((q) => L.push(`${q.id} 委託「${q.title}」${TIER_NAME[q.tier]}${q.due ? `，${dayLabel(q.due)}前` : ''}${q.steps.length ? `，步驟：${q.steps.map((s) => s.text).join('、')}` : ''}`));
  d.rows.forEach((r) => L.push(`${r.id} 時段 ${dayLabel(r.date)} ${r.start}${r.end ? `–${r.end}` : ''}「${r.title}」${r.raid ? '（會議）' : ''}`));
  d.reminders.forEach((m) => L.push(`${m.id} 提醒 ${dayLabel(m.date)} ${m.time}「${m.title}」`));
  Object.entries(d.themes).forEach(([date, t]) => L.push(`${dayLabel(date)} 整天：${t}`));
  return L.join('\n') || '（還是空的）';
}
function editUser(d, instruction, ctx) {
  return `【這一週】${[0, 1, 2, 3, 4].map((i) => dayLabel(addDays(ctx.week.start, i))).join('、')}\n【草稿】\n${indexText(d)}\n【使用者說】${String(instruction).slice(0, 300)}`;
}

// ---------- 草稿 ----------
function blank(week, now) {
  return { v: 1, week, active: true, quests: [], rows: [], reminders: [], themes: {}, unsure: [], log: [], seq: 1, createdAt: now, updatedAt: now, history: [] };
}
const nextId = (d, p) => `${p}${d.seq++}`;
function snapshot(d) {
  d.history = [...(d.history || []), JSON.stringify({ quests: d.quests, rows: d.rows, reminders: d.reminders, themes: d.themes, unsure: d.unsure })].slice(-20);
}
function undo(d) {
  const s = (d.history || []).pop();
  if (!s) return false;
  Object.assign(d, JSON.parse(s));
  return true;
}
function findItem(d, id) {
  for (const k of ['quests', 'rows', 'reminders', 'unsure']) { const x = d[k].find((i) => i.id === id); if (x) return { list: k, item: x }; }
  return null;
}

// 套用項目（規則或 AI 整理出來的）；log＝哪一句話記的（撤銷用）。回傳新增／更新的 id
function addItems(d, items, log = null) {
  const ids = [];
  for (const it of items) {
    if (it.kind === 'quest') {
      const same = d.quests.find((q) => norm(q.title) === norm(it.title));
      if (same) { // 同一個委託又說了一次：補上截止日、類型、步驟
        if (it.due) same.due = it.due;
        if (it.tierSet) { same.tier = it.tier; same.tierSet = true; }
        for (const s of it.steps || []) if (!same.steps.some((x) => norm(x.text) === norm(s))) same.steps.push({ id: nextId(d, 's'), text: s });
        ids.push(same.id); continue;
      }
      const q = { id: nextId(d, 'q'), title: it.title, tier: TIERS.includes(it.tier) ? it.tier : 'major', tierSet: !!it.tierSet, due: validISO(it.due) ? it.due : '', project: clip(it.project || '', 30), steps: (it.steps || []).map((s) => ({ id: nextId(d, 's'), text: s })), log };
      d.quests.push(q); ids.push(q.id);
    } else if (it.kind === 'row') {
      if (!validISO(it.date) || !validHM(it.start)) continue;
      if (d.rows.some((r) => r.date === it.date && r.start === it.start && norm(r.title) === norm(it.title))) continue;
      const r = { id: nextId(d, 'r'), date: it.date, start: it.start, end: validHM(it.end) && it.end > it.start ? it.end : '', title: it.title, output: '', raid: !!it.raid, log };
      d.rows.push(r); ids.push(r.id);
    } else if (it.kind === 'reminder') {
      if (!validISO(it.date) || !validHM(it.time)) continue;
      const m = { id: nextId(d, 'm'), date: it.date, time: it.time, title: it.title, log };
      d.reminders.push(m); ids.push(m.id);
    } else if (it.kind === 'theme') {
      if (!validISO(it.date)) continue;
      d.themes[it.date] = d.themes[it.date] && !d.themes[it.date].includes(it.title) ? `${d.themes[it.date]}、${it.title}` : it.title;
      d.themeLog = { ...(d.themeLog || {}), [it.date]: log };
      ids.push(`t:${it.date}`);
    } else if (it.kind === 'unsure') {
      const u = { id: nextId(d, 'u'), title: it.title, question: it.question || '', guess: it.guess || null, log };
      d.unsure.push(u); ids.push(u.id);
    }
  }
  sortDraft(d);
  return ids;
}
function sortDraft(d) {
  d.rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  d.reminders.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
// 撤銷某一句話記下的全部
function removeLog(d, logId) {
  const keep = (x) => x.log !== logId || x.touched;
  d.quests = d.quests.filter(keep); d.rows = d.rows.filter(keep); d.reminders = d.reminders.filter(keep); d.unsure = d.unsure.filter(keep);
  for (const [date, l] of Object.entries(d.themeLog || {})) if (l === logId) { delete d.themes[date]; delete d.themeLog[date]; }
}
function removeItem(d, id) {
  if (id.startsWith('t:')) { delete d.themes[id.slice(2)]; return true; }
  for (const k of ['quests', 'rows', 'reminders', 'unsure']) { const n = d[k].length; d[k] = d[k].filter((x) => x.id !== id); if (d[k].length !== n) return true; }
  for (const q of d.quests) { const n = q.steps.length; q.steps = q.steps.filter((s) => s.id !== id); if (q.steps.length !== n) return true; }
  return false;
}
// 手動改（大視窗的表單）：欄位都檢查過才改
function editItem(d, id, f = {}) {
  if (id.startsWith('t:')) { const t = clip(f.title || '', 40); if (t) d.themes[id.slice(2)] = t; else delete d.themes[id.slice(2)]; return true; }
  const hit = findItem(d, id);
  if (!hit) throw new Error('找不到這一項');
  const x = hit.item;
  if (f.title !== undefined) { const t = clip(cleanText(f.title) || f.title); if (!t) throw new Error('要有名稱'); x.title = t; }
  if (hit.list === 'quests') {
    if (f.tier !== undefined && TIERS.includes(f.tier)) { x.tier = f.tier; x.tierSet = true; }
    if (f.due !== undefined) { if (f.due && !validISO(f.due)) throw new Error('日期格式不對'); x.due = f.due || ''; }
    if (f.project !== undefined) x.project = clip(f.project, 30);
    if (Array.isArray(f.steps)) x.steps = f.steps.map((s) => clip(s)).filter(Boolean).map((text) => ({ id: (x.steps.find((s) => s.text === text) || {}).id || nextId(d, 's'), text }));
  } else if (hit.list === 'rows') {
    if (f.date !== undefined) { if (!validISO(f.date)) throw new Error('日期格式不對'); x.date = f.date; }
    if (f.start !== undefined) { if (!validHM(f.start)) throw new Error('開始時間格式不對'); x.start = f.start; }
    if (f.end !== undefined) { if (f.end && (!validHM(f.end) || f.end <= x.start)) throw new Error('結束時間要在開始之後'); x.end = f.end || ''; }
    if (f.raid !== undefined) x.raid = !!f.raid;
  } else if (hit.list === 'reminders') {
    if (f.date !== undefined) { if (!validISO(f.date)) throw new Error('日期格式不對'); x.date = f.date; }
    if (f.time !== undefined) { if (!validHM(f.time)) throw new Error('時間格式不對'); x.time = f.time; }
  }
  x.touched = true; // 自己改過的：AI 晚到的整理結果不會蓋掉它
  sortDraft(d);
  return true;
}
// 不確定的 → 變成委託／時段（照猜的那樣，沒猜就當委託）
function resolveUnsure(d, id, as = 'quest', f = {}) {
  const u = d.unsure.find((x) => x.id === id);
  if (!u) throw new Error('找不到這一項');
  const g = u.guess || {};
  let ids;
  if (as === 'row') ids = addItems(d, [{ kind: 'row', date: f.date || g.date, start: f.start || g.start, end: f.end || g.end || '', title: f.title || g.title || u.title, raid: f.raid !== undefined ? f.raid : !!g.raid }], u.log);
  else ids = addItems(d, [{ kind: 'quest', title: f.title || g.title || u.title, tier: 'major', due: f.due || '', steps: [] }], u.log);
  if (!ids.length) throw new Error(as === 'row' ? '要先選日期和開始時間' : '加不進去');
  d.unsure = d.unsure.filter((x) => x.id !== id);
  return ids;
}

// AI 的修改 → 套進草稿；回傳改到的 id 和給人看的摘要
function applyEdits(d, json, ctx) {
  const changed = [], said = [];
  for (const op of (json && Array.isArray(json.ops) ? json.ops : []).slice(0, 12)) {
    if (!op || typeof op !== 'object') continue;
    const date = op.day ? resolveDay(String(op.day), ctx) : null;
    const start = op.start ? normTime(op.start) : '', end = op.end ? normTime(op.end) : '';
    const hit = op.ref ? findItem(d, String(op.ref).trim()) : null;
    try {
      if (op.op === 'delete' && hit) { removeItem(d, hit.item.id); said.push(`刪掉「${hit.item.title}」`); continue; }
      if (op.op === 'edit' && hit) {
        const f = {};
        if (op.title) f.title = op.title;
        if (hit.list === 'quests') { if (date) f.due = date; if (TIERS.includes(op.importance)) f.tier = op.importance; }
        if (hit.list === 'rows') { if (date) f.date = date; if (start) f.start = start; if (end && end > (start || hit.item.start)) f.end = end; else if (start && hit.item.end) { const len = toMin(hit.item.end) - toMin(hit.item.start); f.end = plusMin(start, len); } if (op.meeting !== undefined) f.raid = !!op.meeting; }
        if (hit.list === 'reminders') { if (date) f.date = date; if (start) f.time = start; }
        if (!Object.keys(f).length) continue;
        editItem(d, hit.item.id, f); // 請 AI 改的也算自己改的：晚到的整理結果不會蓋掉
        changed.push(hit.item.id); said.push(`「${hit.item.title}」${f.date || f.due ? `→ ${dayLabel(f.date || f.due)}` : ''}${f.start ? ` ${f.start}` : ''}${f.tier ? ` ${TIER_NAME[f.tier]}` : ''}`.trim());
        continue;
      }
      if (op.op === 'add_step' && hit && hit.list === 'quests') {
        const steps = (Array.isArray(op.steps) ? op.steps : [op.title]).map((s) => clip(cleanText(s))).filter((s) => s && s.length >= 2);
        for (const s of steps) if (!hit.item.steps.some((x) => norm(x.text) === norm(s))) hit.item.steps.push({ id: nextId(d, 's'), text: s });
        if (steps.length) { changed.push(hit.item.id); said.push(`「${hit.item.title}」加了 ${steps.length} 個步驟`); }
        continue;
      }
      if (op.op === 'set_theme' && date && op.title) { d.themes[date] = clip(op.title, 40); changed.push(`t:${date}`); said.push(`${dayLabel(date)}：${op.title}`); continue; }
      const kind = { add_task: 'task', add_schedule: 'schedule', add_reminder: 'reminder' }[op.op];
      if (kind) {
        const items = normalizeAI({ items: [{ kind, title: op.title, day: op.day, start: op.start, end: op.end, importance: op.importance, steps: op.steps, meeting: op.meeting }] }, ctx);
        const ids = addItems(d, items, null);
        changed.push(...ids);
        if (ids.length) said.push(`加了「${clip(op.title, 20)}」`);
      }
    } catch (_) { /* 這一個變更不合理就跳過 */ }
  }
  sortDraft(d);
  return { changed, said };
}
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// 一句話記下的東西，給人看的短句：「📜 週報（週五前）、📯 週二 14:00 週會」
function itemsText(d, ids) {
  const parts = [];
  for (const id of ids) {
    if (id.startsWith('t:')) { parts.push(`🗓 ${dayLabel(id.slice(2))}：${d.themes[id.slice(2)] || ''}`); continue; }
    const hit = findItem(d, id);
    if (!hit) continue;
    const x = hit.item;
    if (hit.list === 'quests') parts.push(`📜 ${x.title}${x.due ? `（${dayLabel(x.due)}前）` : ''}`);
    else if (hit.list === 'rows') parts.push(`${x.raid ? '📯' : '🕘'} ${dayLabel(x.date)} ${x.start} ${x.title}`);
    else if (hit.list === 'reminders') parts.push(`⏰ ${dayLabel(x.date)} ${x.time} ${x.title}`);
    else parts.push(`❓ ${x.title}`);
  }
  return parts.join('、');
}
function summary(d) {
  const raids = d.rows.filter((r) => r.raid).length;
  const parts = [`${d.quests.length} 個委託`, `${d.rows.length - raids} 格行程`];
  if (raids) parts.push(`${raids} 場團戰`);
  if (d.reminders.length) parts.push(`${d.reminders.length} 個提醒`);
  if (d.unsure.length) parts.push(`${d.unsure.length} 件不確定`);
  return parts.join('、');
}

// 檢查：時間重疊、排在放假日、日期不在這週、沒有截止日
function checks(d, { offDay = null } = {}) {
  const out = [];
  const byDay = {};
  for (const r of d.rows) (byDay[r.date] = byDay[r.date] || []).push(r);
  for (const rows of Object.values(byDay)) {
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const ae = a.end || plusMin(a.start, 30), be = b.end || plusMin(b.start, 30);
      if (a.start < be && b.start < ae) out.push({ ids: [a.id, b.id], text: `${dayLabel(a.date)} ${a.start}「${a.title}」和「${b.title}」時間重疊` });
    }
  }
  const dates = [...new Set([...d.rows.map((r) => r.date), ...d.reminders.map((m) => m.date), ...d.quests.map((q) => q.due).filter(Boolean)])];
  for (const date of dates) {
    const off = offDay ? offDay(date) : null;
    const who = [...d.rows.filter((r) => r.date === date), ...d.quests.filter((q) => q.due === date)];
    if (off && off.off && off.kind !== 'weekend' && who.length) out.push({ ids: who.map((x) => x.id), text: `${dayLabel(date)} 是${off.name}，排了「${who[0].title}」` });
    if (date < d.week.start || date > addDays(d.week.start, 6)) out.push({ ids: who.map((x) => x.id), text: `${dayLabel(date)} 不在這一週（${d.week.label}）` });
  }
  return out;
}

// ---------- 寫進計畫檔 ----------
const dueLabel = (iso) => (iso ? md(iso) : '');
// 整份新寫（新的一週，或「整份重寫」）
function toMarkdown(d, { title } = {}) {
  let c = `# ${title || `我的一週 ${d.week.label}`}\n`;
  return addAll(c, d);
}
function addAll(content, d) {
  let c = content;
  for (const q of d.quests) c = P.addQuest(c, { title: q.title, tier: q.tier, deadlineLabel: dueLabel(q.due), objectives: q.steps.map((s) => s.text), project: q.project || '' });
  for (const r of d.rows) c = P.addScheduleRow(c, r.date, { start: r.start, end: r.end, text: r.title, output: r.output || '', raid: r.raid });
  for (const m of d.reminders) c = P.addReminder(c, { at: `${m.date}T${m.time}:00`, text: m.title });
  for (const [date, t] of Object.entries(d.themes)) c = P.setDayTheme(c, date, t);
  return tidy(c);
}
// 標題前空一行、不要連續好幾個空行、檔尾一個換行
const tidy = (c) => c.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
// 合併進現有的計畫：重複的（同名委託、同一天同時間或同名的時段、同時間的提醒）覆蓋，其他照加
// 覆蓋委託時，原本已經做完的同名步驟保持打勾
function merge(content, d, now = new Date()) {
  let c = content;
  const replaced = [];
  const plan0 = P.parsePlan(c);
  for (const q of d.quests) {
    const old = P.parsePlan(c).quests.find((x) => norm(x.title) === norm(q.title));
    let doneSteps = [];
    let project = q.project || '', tier = q.tier, due = dueLabel(q.due), steps = q.steps.map((s) => s.text);
    if (old) { // 覆蓋：這次有講的欄位用新的，沒講的（類型、截止日、步驟）沿用原本的
      doneSteps = old.objectives.filter((o) => o.done).map((o) => norm(o.text));
      if (!project && old.project) project = old.project;
      if (!q.tierSet) tier = old.tier;
      if (!due && old.deadlineLabel && old.deadlineLabel !== '本週內') due = old.deadlineLabel;
      if (!steps.length && !old.implicit) steps = old.objectives.map((o) => o.text);
      c = P.deleteQuest(c, old.id);
      replaced.push(`委託「${old.title}」`);
    }
    c = P.addQuest(c, { title: q.title, tier, deadlineLabel: due, objectives: steps, project });
    if (doneSteps.length) {
      const nq = P.parsePlan(c).quests.find((x) => norm(x.title) === norm(q.title));
      if (nq) nq.objectives.forEach((o, i) => { if (doneSteps.includes(norm(o.text))) c = P.setObjective(c, nq.id, i, true, now); });
    }
  }
  for (const r of d.rows) {
    const day = P.parsePlan(c).days.find((x) => x.date === r.date);
    const old = day && day.rows.filter((x) => x.start === r.start || norm(x.a) === norm(r.title)).sort((a, b) => b.line - a.line);
    for (const o of old || []) { c = P.removeLine(c, o.line); replaced.push(`${dayLabel(r.date)} ${o.slot} ${o.a}`); }
    c = P.addScheduleRow(c, r.date, { start: r.start, end: r.end, text: r.title, output: r.output || '', raid: r.raid });
  }
  for (const m of d.reminders) {
    const old = P.parsePlan(c).decisions.filter((x) => x.date === m.date && x.time === m.time).sort((a, b) => b.line - a.line);
    for (const o of old) { c = P.removeLine(c, o.line); replaced.push(`提醒 ${o.label}`); }
    c = P.addReminder(c, { at: `${m.date}T${m.time}:00`, text: m.title });
  }
  for (const [date, t] of Object.entries(d.themes)) {
    const day = P.parsePlan(c).days.find((x) => x.date === date);
    if (day && day.theme && day.theme !== t) replaced.push(`${dayLabel(date)} 的主題「${day.theme}」`);
    c = P.setDayTheme(c, date, t);
  }
  return { content: tidy(c), replaced, before: plan0.quests.length };
}
// 合併前先看會蓋掉哪些（大視窗上提醒）
function conflicts(content, d) {
  if (!content) return [];
  const plan = P.parsePlan(content);
  const out = [];
  for (const q of d.quests) { const o = plan.quests.find((x) => norm(x.title) === norm(q.title)); if (o) out.push({ id: q.id, text: `委託「${o.title}」` }); }
  for (const r of d.rows) {
    const day = plan.days.find((x) => x.date === r.date);
    for (const o of (day ? day.rows : []).filter((x) => x.start === r.start || norm(x.a) === norm(r.title))) out.push({ id: r.id, text: `${dayLabel(r.date)} ${o.slot} ${o.a}` });
  }
  for (const m of d.reminders) for (const o of plan.decisions.filter((x) => x.date === m.date && x.time === m.time)) out.push({ id: m.id, text: `提醒 ${o.label}` });
  return out;
}

// 給畫面看的草稿（不含 history）
function view(d, { offDay = null, content = '', mode = 'merge' } = {}) {
  if (!d) return null;
  const days = [];
  const last = [...d.rows.map((r) => r.date), ...d.reminders.map((m) => m.date)].sort().pop() || '';
  const n = last > addDays(d.week.start, 4) ? Math.min(7, Math.round((new Date(`${last}T00:00:00`) - new Date(`${d.week.start}T00:00:00`)) / 86400000) + 1) : 5;
  for (let i = 0; i < n; i++) {
    const date = addDays(d.week.start, i);
    const off = offDay ? offDay(date) : null;
    days.push({ date, label: dayLabel(date), theme: d.themes[date] || '', off: off && off.off && off.kind !== 'weekend' ? off.name : '' });
  }
  return {
    week: d.week, active: !!d.active, quests: d.quests, rows: d.rows, reminders: d.reminders, themes: d.themes, unsure: d.unsure,
    log: d.log.slice(-30), days, summary: summary(d), checks: checks(d, { offDay }), conflicts: mode === 'merge' ? conflicts(content, d) : [],
    canUndo: !!(d.history && d.history.length), count: d.quests.length + d.rows.length + d.reminders.length + Object.keys(d.themes).length + d.unsure.length,
    pending: d.log.filter((l) => l.pending).length,
  };
}

module.exports = {
  WD, TIER_NAME, weekOf, mondayOf, needAsk, findDay, resolveDay, findTime, normTime, ruleExtract, splitUnits, cleanText, isChatter,
  isEnough,
  EXTRACT_SCHEMA, EXTRACT_SYSTEM, extractUser, normalizeAI, EDIT_SCHEMA, EDIT_SYSTEM, editUser, indexText, applyEdits,
  blank, snapshot, undo, addItems, removeLog, removeItem, editItem, resolveUnsure, findItem, itemsText, summary, checks,
  toMarkdown, merge, conflicts, view, dayLabel, addDays, validISO, validHM,
};
