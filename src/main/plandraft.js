// 📓 艾琳的筆記本（委託）：一週的計畫＝計畫檔原本的（墨水）＋這次說的、改的（鉛筆），按「寫進計畫檔」才寫
// 草稿：委託、時段、提醒、每天的主題、不確定的；原本就有的帶 orig（計畫檔裡的樣子），改了＝dirty、刪了＝del
// AI 不直接寫 Markdown：只回結構化的項目（日期照原話），由這裡換成日期、套進草稿，最後用 planParser 的函式一項一項寫進檔案
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
function weekAt(start) { const s = mondayOf(start); const end = addDays(s, 4); return { start: s, end, label: `${md(s)}–${md(end)}` }; }
function weekOf(today, which = 'this') { return { which, ...weekAt(addDays(mondayOf(today), which === 'next' ? 7 : 0)), name: which === 'next' ? '下週' : '這週' }; }
// 週一～三預設這週；週四以後預設下週（很多人週五排下週）
const defaultWhich = (today) => ([0, 4, 5, 6].includes(dowOf(today)) ? 'next' : 'this');
const needAsk = (today) => [0, 4, 5, 6].includes(dowOf(today)); // 舊名字（測試、舊程式用）
function weekName(start, today) {
  const m = mondayOf(today);
  return start === m ? '這週' : start === addDays(m, 7) ? '下週' : start === addDays(m, -7) ? '上週' : weekAt(start).label;
}

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
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

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
const FILLER_HEAD = /^(?:(?:上午|下午|早上|晚上|傍晚|中午(?!前|之前))(?!茶)|(?:這週|本週|下週|這禮拜|下禮拜|這星期|我們|我|你|一定要|一定|必須要|必須|最重要的是|最重要的|最重要|最優先|有空的話|有空再|有空|有時間的話|有時間再|順便|順手|不急的|不急|要|得|需要|預計|打算|會|還要|另外|然後|再來|還有|記得|幫我|請|在|於)\s*)+/;
const FILLER_TAIL = /(?:之前|以前|前|要交|交出去|截止|為止|左右|吧|喔|哦|囉|啦|了)\s*$/;
function cleanText(s) {
  let t = String(s || '').replace(/^\s*(?:[-*+・•]|\d+[.、)])\s*/, '').replace(/^#+\s*/, '').replace(/\[[ xX]\]\s*/, '');
  t = t.replace(/[⭐🔧🌿📯⏰📅]/gu, ' ').replace(/\s+/g, ' ').replace(/\s*([，、：；（）])\s*/g, '$1').replace(/\s+(?=[\u4e00-\u9fff])/g, '').trim(); // 「後端API 做完」→「後端API做完」（「修 bug」不動）
  for (let i = 0; i < 3; i++) t = t.replace(FILLER_HEAD, '').replace(FILLER_TAIL, '').replace(/^[，,：:、\s]+|[，,。：:、\s]+$/g, '').trim();
  return t;
}
// 把日子／時間從句子裡拿掉；日子連同前面的「在」和後面的「前／之前」一起拿（「在週四前送出」→「送出」）
function cutOut(text, ...hits) {
  let t = text;
  for (const h of hits.filter(Boolean).sort((a, b) => b.index - a.index)) {
    let from = h.index, to = h.index + h.raw.length;
    const after = t.slice(to).match(/^\s*(?:(?:的)?(?:下班|上班|中午|午休|早上|上午|下午|晚上|一早|結束)\s*)?(之前|以前|前|為止)/); if (after) to += after[0].length;
    const before = t.slice(0, from).match(/(?:要|得|會)?(在|於|到)\s*$/); if (before) from -= before[0].length;
    t = t.slice(0, from) + ' ' + t.slice(to);
  }
  return t;
}
const tierOf = (t) => (RE_MAIN.test(t) ? 'main' : RE_SIDE.test(t) ? 'side' : 'major');

// ---- 步驟 ----
// 「X 的步驟有／是／包括…」「X 分成三步：…」「X 的步驟加上 Y」
const RE_STEP_INTRO = /(?:的)?(?:步驟|流程|做法|作法|程序)\s*(?:大概|大致|主要|應該|基本上|會)?\s*(?:(?:要|就)?\s*(?:有|是|為|包括|包含|如下|分成|分為|再加上|加上|新增|補上|多加|加)\s*[：:]?|[：:]|(?=(?:要|就|得)?\s*(?:先|首先|第一步|1\s*[.、]|①)))|(?:分成|分為|拆成)\s*[一二三四五六七八九十兩\d]+\s*(?:個)?\s*(?:步驟?|階段|部分)\s*[：:，,]?/;
// 「整理月報的步驟：」「步驟如下」（後面換行再列）
const RE_INTRO_END = /^(.{0,40}?)(?:的)?(?:步驟|流程|做法|作法|程序)\s*(?:(?:要|就)?(?:有|是|為|包括|包含))?\s*(?:如下\s*[：:]?|[：:])\s*$/;
// 指上一個委託：「這個任務」「這件事」「它」
const RE_REF = /^(?:這個|這件|那個|那件|該|上面的?|剛剛的?|剛才的?|前面的?)?\s*(?:任務|委託|事情|事|工作|案子)?$|^(?:它|他|這|那)$/;
// 「(要)先做 A 後 B 再接著 C，最後 D」「1. A 2. B」「首先…接著…」→ 一個一個步驟
const RE_SEQ = /\s*(?:[、，,；;]\s*(?:再接著|然後|接著|再來|之後|最後|再|後)?|(?<=\S)(?:跟|和|以及|還有)(?![進著上蹤單解平諧好])|再接著|然後|接著|再來|之後|最後|再(?!次|生|利用|版|三)|(?<![前最然之午今以落背日])後(?![端台續製測面天來半期段續]))\s*/;
const RE_NUMBERED = /(?:^|\s|[，,、；;])\s*(?:\d{1,2}\s*[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩]|第[一二三四五六七八九十\d]+步(?:是)?\s*[，、:：]?)\s*/;
// 步驟的文字：只拿掉開頭的「要、先、再、然後…」和結尾的語助詞（「請主管看」的「請」要留著）
function stepText(x) {
  let t = String(x || '').replace(/^\s*(?:[-*+・•]\s*(?:\[[ xX]\]\s*)?|\d{1,2}\s*[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/, '');
  t = t.replace(/[⭐🔧🌿📯⏰📅]/gu, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2; i++) t = t.replace(/^(?:要|得|需要|就|會|先|首先|再|然後|接著|再來|之後|最後|去)\s*/, '').replace(/(?:吧|喔|哦|囉|啦|了|就好)\s*$/, '').replace(/^[，,：:、\s]+|[，,。：:、\s]+$/g, '').trim();
  return clip(t);
}
function seqSteps(s) {
  const t = String(s || '').replace(/^[\s：:，,]+/, '').replace(/^(?:要|得|需要|就)?\s*(?:首先|先)\s*(?:做(?![完好出成]))?\s*/, ''); // 「要先做文獻整理」→「文獻整理」
  const parts = RE_NUMBERED.test(t) ? t.split(new RegExp(RE_NUMBERED.source, 'g')) : t.split(new RegExp(RE_SEQ.source, 'g'));
  return parts.map(stepText).filter((x) => x.length >= 2).slice(0, 10);
}
// 一段話裡的步驟：回傳 { title, steps } 或 null（title＝''：沒說是哪個委託，接到上一個）
function findSteps(rest) {
  const s = String(rest || '');
  const m = s.match(RE_STEP_INTRO);
  if (m) {
    const steps = seqSteps(s.slice(m.index + m[0].length));
    if (!steps.length) return null;
    const head = cleanText(s.slice(0, m.index)).replace(/[的，,：:\s]+$/, '');
    return { title: RE_REF.test(head) ? '' : clip(head), steps, ref: true };
  }
  // 「寫週報要先收資料再整理然後寄出」：前面是委託、「先」後面有「再／然後／接著／最後／後」
  const f = s.match(/^(.*?)(?:，|,)?\s*(?:要|得|需要|就)?\s*(?:首先|先)(.+)$/);
  if (f && new RegExp(RE_SEQ.source).test(f[2]) && !/^[，,、；;]/.test(f[2])) {
    const steps = seqSteps(f[2]);
    if (steps.length >= 2) {
      const head = cleanText(f[1]).replace(/[的，,：:\s]+$/, '');
      return { title: RE_REF.test(head) ? '' : clip(head), steps, bare: !head };
    }
  }
  return null;
}

const RE_ENDS_DAY = new RegExp(`(?:${RE_DAY.source})\\s*$`);
function splitUnits(line, ctx) {
  const out = [];
  for (const part of String(line).split(/[。；;]\s*/).map((x) => x.trim()).filter(Boolean)) {
    // 「提醒我週二、週四下午四點填工時」：頓號前面剛好是日子＝一次說好幾天，不拆（之後 expandDays 再拆成每一天）
    const raw = part.split(/([，,、])\s*(?=(?:(?:下下|下|這|本)?\s*(?:週|周|星期|禮拜)\s*[一二三四五六日天]|大後天|後天|明天|今天|\d{1,2}\s*[/月]\s*\d{1,2})|(?:上午|下午|早上|晚上|中午|傍晚)(?!茶))/);
    const pieces = [];
    for (let i = 0; i < raw.length; i += 2) {
      const pc = raw[i], sep = raw[i - 1], m0 = RE_DAY.exec(pc);
      if (i > 0 && sep === '、' && RE_ENDS_DAY.test(pieces[pieces.length - 1] || '') && m0 && m0.index === 0) pieces[pieces.length - 1] += `、${pc}`;
      else pieces.push(pc);
    }
    for (let i = pieces.length - 1; i >= 0; i--) { pieces[i] = pieces[i].trim(); if (!pieces[i]) pieces.splice(i, 1); }
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
// 「週三、週四出差」「週二和週四 9 點站會」「週三到週五外訓」：一次說好幾天 → 拆成每一天各一句（日子換成 M/D）
const RE_DAY_G = new RegExp(RE_DAY.source, 'g');
const RE_DAY_SEP = /^\s*(?:[、，,／/和跟及與]|以及|還有)?\s*$/;
const RE_DAY_RANGE = /^\s*(?:到|至|~|～|－|-|–)\s*$/;
function expandDays(unit, ctx) {
  const ms = [...String(unit).matchAll(RE_DAY_G)];
  for (let i = 0; i < ms.length - 1; i++) {
    const run = [ms[i]], seps = [];
    for (let j = i + 1; j < ms.length; j++) {
      const between = unit.slice(ms[j - 1].index + ms[j - 1][0].length, ms[j].index);
      const range = RE_DAY_RANGE.test(between);
      if (!range && !RE_DAY_SEP.test(between)) break;
      run.push(ms[j]); seps.push(range);
    }
    if (run.length < 2) continue;
    const dates = [];
    run.forEach((m, k) => {
      const f = findDay(m[0], ctx);
      if (!f) return;
      if (k > 0 && seps[k - 1] && dates.length) { // 「週三到週五」：中間的日子也算（最多一週）
        for (let x = addDays(dates[dates.length - 1], 1); x < f.date && dates.length < 7; x = addDays(x, 1)) dates.push(x);
      }
      if (!dates.includes(f.date)) dates.push(f.date);
    });
    if (dates.length < 2) return [unit];
    const from = run[0].index, to = run[run.length - 1].index + run[run.length - 1][0].length;
    return dates.map((date) => `${unit.slice(0, from)}${md(date)}${unit.slice(to)}`);
  }
  return [unit];
}
// 回傳項目陣列：{ kind: quest|row|reminder|theme|unsure|steps, … }；steps＝{ ref: 委託名稱或 ''（上一個）, steps }
function ruleExtract(text, ctx) {
  const out = [];
  let lastQuest = null;
  let listFor = null; // 「…的步驟：」之後一行一行列的
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  for (const rawLine of lines) {
    if (!rawLine.trim()) { listFor = null; continue; }
    // 縮排或「- 」「1.」開頭、接在委託（或「步驟：」）後面：那個委託的步驟
    const listy = /^\s*(?:[-*+・•]|\d{1,2}\s*[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/.test(rawLine);
    if ((listFor && listy) || (lastQuest && listy && /^\s/.test(rawLine))) {
      const st = stepText(rawLine.replace(/^\s*(?:[-*+・•]\s*(?:\[[ xX]\]\s*)?|\d{1,2}\s*[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/, ''));
      if (st) { (listFor || lastQuest).steps.push(st); continue; }
    }
    listFor = null;
    let lastDay = null;
    for (const unit of splitUnits(rawLine, ctx).flatMap((u) => expandDays(u, ctx))) {
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
      const offWord = rest.replace(/\s+/g, '').replace(/^(?:都|也|全部|整天)?(?:要|得|會|在)?/, ''); // 「明天、後天都要請假」
      if (day && RE_DAYOFF.test(offWord)) { out.push({ kind: 'theme', date: day.date, title: offWord }); lastQuest = null; continue; }
      if (day && RE_ALLDAY.test(unit)) {
        out.push({ kind: 'theme', date: day.date, title: clip(cleanText(rest.replace(RE_ALLDAY, ' '))) || '整天' });
        lastQuest = null; continue;
      }
      // 步驟：「X 的步驟有先 A 後 B」「這個任務的步驟…」「X 要先 A 再 B」
      const st = findSteps(rest);
      if (st && st.bare && /^\s*(?:首先|第一步)/.test(rest) && (lastQuest || true)) { // 「首先…接著…最後…」：上一個委託的步驟
        if (lastQuest) for (const s of st.steps) lastQuest.steps.push(s); else out.push({ kind: 'steps', ref: '', steps: st.steps });
        continue;
      }
      if (st && st.bare) { // 「先寫週報再開會」（沒說是哪個委託）：各算一件
        for (const s of st.steps) { const q = { kind: 'quest', title: s, tier: tierOf(unit), tierSet: RE_MAIN.test(unit) || RE_SIDE.test(unit), due: day ? day.date : '', steps: [] }; out.push(q); lastQuest = q; }
        continue;
      }
      if (st) {
        if (st.title) { const q = { kind: 'quest', title: st.title, tier: tierOf(unit), tierSet: RE_MAIN.test(unit) || RE_SIDE.test(unit), due: day ? day.date : '', steps: st.steps, ...(st.ref ? { ref: true } : {}) }; out.push(q); lastQuest = q; }
        else if (lastQuest) for (const s of st.steps) lastQuest.steps.push(s);
        else out.push({ kind: 'steps', ref: '', steps: st.steps });
        continue;
      }
      // 「整理月報的步驟：」接著下一行開始列
      const intro = rest.trim().match(RE_INTRO_END);
      if (intro) {
        const head = clip(cleanText(intro[1]).replace(/[的，,\s]+$/, ''));
        if (head && !RE_REF.test(head)) { const q = { kind: 'quest', title: head, tier: tierOf(unit), tierSet: RE_MAIN.test(unit) || RE_SIDE.test(unit), due: day ? day.date : '', steps: [], ref: true }; out.push(q); lastQuest = q; listFor = q; }
        else if (lastQuest) listFor = lastQuest;
        else { const s = { kind: 'steps', ref: '', steps: [] }; out.push(s); listFor = s; }
        continue;
      }
      // 委託：「標題：步驟、步驟」
      const cm = cleanText(rest).match(/^(.{2,40}?)\s*[：:]\s*(.*)$/);
      const title = clip(cm ? cm[1] : cleanText(rest));
      if (!title) continue;
      const steps = cm && cm[2] ? seqSteps(cm[2]) : [];
      const q = { kind: 'quest', title, tier: tierOf(unit), tierSet: RE_MAIN.test(unit) || RE_SIDE.test(unit), due: day ? day.date : '', steps };
      out.push(q); lastQuest = q;
      if (cm && !cm[2]) listFor = q; // 「整理月報：」換行再列
    }
  }
  return out.filter((x) => x.kind !== 'steps' || x.steps.length);
}
// ---------- AI ----------
// 逐句整理：程式先用規則猜一次，AI 拿去改正、補步驟（一定要回至少一項：空清單是小模型最容易「偷懶」的答案）
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array', minItems: 1, maxItems: 6,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['task', 'steps', 'schedule', 'reminder', 'theme', 'unclear'] },
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
  '你是整理週計畫的小幫手。把【使用者說】整理成週計畫的項目，用 JSON 回答 items。',
  '【規則初步整理】是程式先猜的，可能有錯或漏（特別是步驟），參考它、改正後把全部項目完整寫出來。',
  'kind：task＝要完成的工作（委託），day 寫截止日；steps＝幫已經有的委託補步驟，title 寫那個委託的名稱（說「這個任務」就寫【上一個委託】）；schedule＝有固定時間的行程（會議、拜訪、上課），要有 day 和 start；reminder＝到時間要提醒的事（day＋start）；theme＝某一天整天的狀態（出差、外訓、請假）；unclear＝看不懂或缺日期，question 寫要問什麼。',
  '步驟：說「先 A 後 B 再 C」「步驟有 A、B、C」「1. A 2. B」時，A、B、C 一個一個放進 steps；不要把整句當成一個步驟，也不要把步驟當成新的委託。',
  'title 用使用者的原話，簡短，不含日期和時間。day 照原話寫（週五、下週三、明天、10/16），沒說就不寫。時間 24 小時制，上班時間說「3 點」是 15:00。importance：main＝很重要／一定要，side＝有空再做，其他 major。meeting：要跟別人碰面的寫 true。',
].join('\n');
// 規則的結果換成 AI 的格式（給 AI 參考）
function toAIItems(items, d) {
  const lastQ = d && d.lastQ ? (findItem(d, d.lastQ) || {}).item : null;
  return items.map((it) => {
    if (it.kind === 'quest') return { kind: 'task', title: it.title, ...(it.due ? { day: md(it.due) } : {}), importance: it.tier || 'major', ...(it.steps && it.steps.length ? { steps: it.steps } : {}) };
    if (it.kind === 'steps') return { kind: 'steps', title: it.ref || (lastQ ? lastQ.title : '上一個委託'), steps: it.steps };
    if (it.kind === 'row') return { kind: 'schedule', title: it.title, day: md(it.date), start: it.start, ...(it.end ? { end: it.end } : {}), meeting: !!it.raid };
    if (it.kind === 'reminder') return { kind: 'reminder', title: it.title, day: md(it.date), start: it.time };
    if (it.kind === 'theme') return { kind: 'theme', title: it.title, day: md(it.date) };
    return { kind: 'unclear', title: it.title, question: it.question || '' };
  });
}
function extractUser(text, ctx, { rule = [], d = null } = {}) {
  const days = [0, 1, 2, 3, 4].map((i) => dayLabel(addDays(ctx.week.start, i))).join('、');
  const qs = d ? live(d.quests).slice(-12).map((q) => q.title) : [];
  const lastQ = d && d.lastQ ? (findItem(d, d.lastQ) || {}).item : null;
  return `【這一週】${days}\n【今天】${dayLabel(ctx.today)}\n${qs.length ? `【已經有的委託】${qs.join('、')}\n` : ''}${lastQ ? `【上一個委託】${lastQ.title}\n` : ''}【規則初步整理】${JSON.stringify({ items: toAIItems(rule, d) })}\n【使用者說】${String(text).slice(0, 600)}`;
}
const RE_LAST = /^(?:上一個(?:委託|任務)?|這個(?:委託|任務)?|它|這件事)$/;
// AI 的項目 → 跟規則一樣的格式；日子、時間換成日期，壞的丟掉
function normalizeAI(json, ctx) {
  const out = [];
  for (const it of (json && Array.isArray(json.items) ? json.items : []).slice(0, 8)) {
    if (!it || typeof it !== 'object') continue;
    const steps = (Array.isArray(it.steps) ? it.steps : []).map(stepText).filter((x) => x.length >= 2).slice(0, 10);
    if (it.kind === 'steps') { if (steps.length) out.push({ kind: 'steps', ref: RE_LAST.test(String(it.title || '').trim()) ? '' : clip(cleanText(it.title || '')), steps }); continue; }
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
      out.push({ kind: 'quest', title, tier: TIERS.includes(it.importance) ? it.importance : 'major', tierSet: it.importance === 'main' || it.importance === 'side', due: date || '', steps });
    }
  }
  return out;
}

// ---- 規則和 AI 怎麼配合（10/13 使用者電腦 qwen3:4b 實測：65 題規則全對；AI 單獨 57 題，會自己編截止日、把「這個任務的步驟…」整句當成新委託）----
// 規則有把握的句子就不問 AI；沒把握的（沒記到東西、不確定、標題很長或還有逗號連接詞＝沒拆開）才請 AI 整理，回來的結果再檢查一次
function ruleConfident(text, rule) {
  if (!rule.length) return false;
  return rule.every((it) => {
    if (it.kind === 'unsure') return false;
    if (it.kind !== 'quest') return true;
    const t = String(it.title || '');
    return norm(t).length <= 20 && !/[，,、；;]|然後|接著|再來|之後|以及/.test(t);
  });
}
const needsAI = (text, rule) => !isChatter(text) && !isEnough(text) && !ruleConfident(text, rule);
// AI 的結果：原話沒說日子／時間的不能自己加；規則有拆出步驟、AI 卻沒有步驟 → 用規則的；整句變成一個委託標題 → 用規則的
function checkAI(items, text, ctx, rule) {
  if (!items || !items.length) return null;
  const hasDay = !!findDay(text, ctx), hasTime = !!findTime(text);
  // 「下午三點打電話給供應商」：有時間沒說哪天，規則已經記成不確定（問哪一天）；AI 也不知道是哪天，常常編一天或變成委託 → 用規則的
  if (hasTime && !hasDay && rule.some((r) => r.kind === 'unsure' && r.question === '是哪一天？')) return null;
  const nt = norm(text).length;
  const out = [];
  for (const it of items) {
    const x = { ...it };
    if (x.kind === 'quest' && x.due && !hasDay) x.due = '';
    if ((x.kind === 'row' || x.kind === 'reminder') && !hasTime) { out.push({ kind: 'quest', title: x.title, tier: 'major', tierSet: false, due: hasDay ? x.date || '' : '', steps: [] }); continue; }
    if ((x.kind === 'row' || x.kind === 'reminder' || x.kind === 'theme') && x.date && !hasDay) { out.push({ kind: 'unsure', title: x.kind === 'row' ? `${x.start} ${x.title}` : x.title, question: '是哪一天？', guess: x.kind === 'row' ? { kind: 'row', start: x.start, end: x.end, title: x.title, raid: x.raid } : null }); continue; }
    if (x.kind === 'quest' && nt > 12 && norm(x.title).length >= nt * 0.8 && rule.length) return null; // 整句當標題：AI 沒拆開
    out.push(x);
  }
  const ruleSteps = rule.some((r) => r.kind === 'steps' || (r.steps && r.steps.length));
  const aiSteps = out.some((r) => r.kind === 'steps' || (r.steps && r.steps.length));
  if (ruleSteps && !aiSteps) return null;
  return out.length ? out : null;
}

// 修改：這一週的目錄（q1／r1／m1）＋使用者的指示 → 變更
const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    ops: {
      type: 'array', minItems: 1, maxItems: 6,
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
  '你是整理週計畫的小幫手。下面是這一週的計畫，每一項前面有代號（q＝委託、r＝時段、m＝提醒）。照使用者的指示改，用 JSON 回答 ops，只改指示說到的地方，越少越好。',
  'op：edit＝改某一項（ref 寫代號，只寫要改的欄位：title、day、start、end、importance、meeting，沒有要改的欄位不要寫）；delete＝刪掉（ref）；add_step＝幫委託加步驟（ref＋steps）；add_task／add_schedule／add_reminder＝新增；set_theme＝某一天整天的狀態（day＋title）。',
  'day 照原話寫（週五、10/16），時間 24 小時制；上班時間說「3 點」是 15:00。換到別天就用 edit 改 day。',
].join('\n');
function indexText(d) {
  const L = [];
  live(d.quests).forEach((q) => L.push(`${q.id} 委託「${q.title}」${TIER_NAME[q.tier]}${q.due ? `，${dayLabel(q.due)}前` : ''}${q.steps.length ? `，步驟：${q.steps.map((s) => s.text).join('、')}` : ''}`));
  live(d.rows).forEach((r) => L.push(`${r.id} 時段 ${dayLabel(r.date)} ${r.start}${r.end ? `–${r.end}` : ''}「${r.title}」${r.raid ? '（會議）' : ''}`));
  live(d.reminders).forEach((m) => L.push(`${m.id} 提醒 ${dayLabel(m.date)} ${m.time}「${m.title}」`));
  Object.entries(d.themes).filter(([, t]) => t).forEach(([date, t]) => L.push(`${dayLabel(date)} 整天：${t}`));
  return L.join('\n') || '（還是空的）';
}
function editUser(d, instruction, ctx) {
  return `【這一週】${[0, 1, 2, 3, 4].map((i) => dayLabel(addDays(ctx.week.start, i))).join('、')}\n【計畫】\n${indexText(d)}\n【使用者說】${String(instruction).slice(0, 300)}`;
}

// ---------- 用規則改（不等 AI）：「把週報移到週五」「站會改十點」「刪掉讀書會」 ----------
const RE_EDIT_DEL = /刪掉|刪除|拿掉|去掉|劃掉|不要了|不用了|取消/;
const RE_EDIT_MOVE = /移到|改到|換到|挪到|延到|延後到|提前到|改成|改為|換成|調到|改在|延後|提前|改一下|改改|改(?=.{0,6}(?:\d|點|週|星期|禮拜|明天|後天|今天))/;
// 「調整、修改」也可能是新的工作（「調整參數」）：說到筆記本裡已經有的東西、或說到截止日／時間，才算要改
const RE_EDIT_WEAK = /調整|修改|更動|變更|改一下|改改/;
const isEditStrong = (t) => RE_EDIT_DEL.test(String(t || '')) || RE_EDIT_MOVE.test(String(t || ''));
function looksLikeEdit(t, d = null) {
  const s = String(t || '');
  if (RE_EDIT_DEL.test(s) || RE_EDIT_MOVE.test(s)) return true;
  if (!RE_EDIT_WEAK.test(s)) return false;
  if (/截止|期限|時間|日期|幾點|哪天/.test(s)) return true;
  if (!d) return false;
  const ns = norm(s);
  return [...live(d.quests), ...live(d.rows), ...live(d.reminders)].some((x) => { const n = norm(x.title); return n.length >= 2 && (ns.includes(n) || [...Array(Math.max(0, n.length - 1)).keys()].some((i) => ns.includes(n.slice(i, i + 2)) && n.length <= 4)); });
}
function ruleEdit(d, text, ctx) {
  const t = String(text || '');
  const del = RE_EDIT_DEL.test(t), mv = t.match(RE_EDIT_MOVE);
  if (!del && !mv) return null;
  const nt = norm(t);
  const items = [...live(d.quests), ...live(d.rows), ...live(d.reminders)];
  // 句子裡出現的名稱（取最長、而且只有一個）；沒有就用動詞前那段去找名稱裡有它的
  let hits = items.filter((x) => norm(x.title).length >= 2 && nt.includes(norm(x.title)));
  if (!hits.length) {
    const head = cleanText(t.split(mv ? mv[0] : RE_EDIT_DEL)[0].replace(/^(?:把|將|請|幫我)/, '').replace(RE_EDIT_DEL, '')).replace(/^(?:把|將)/, '');
    const nh = norm(head);
    if (nh.length >= 2) hits = items.filter((x) => norm(x.title).includes(nh));
  }
  if (!hits.length) return null;
  const best = Math.max(...hits.map((x) => norm(x.title).length));
  const top = hits.filter((x) => norm(x.title).length === best);
  if (top.length !== 1) return null;
  const x = top[0];
  if (del && !(mv && mv.index > (t.search(RE_EDIT_DEL)))) return { ops: [{ op: 'delete', ref: x.id }] };
  const after = t.slice(mv.index + mv[0].length);
  const day = findDay(after, ctx), time = findTime(after);
  if (day || time) return { ops: [{ op: 'edit', ref: x.id, ...(day ? { day: day.raw } : {}), ...(time ? { start: time.start, ...(time.end ? { end: time.end } : {}) } : {}) }] };
  if (/改成|改為|換成/.test(mv[0])) { const title = clip(cleanText(after)); if (title) return { ops: [{ op: 'edit', ref: x.id, title }] }; }
  return null;
}

// ---------- 草稿 ----------
// 項目：新加的沒有 orig；原本就有的帶 orig（計畫檔裡的樣子）；del＝刪掉（寫進去之前都還能復原）
const live = (list) => list.filter((x) => !x.del);
function blank(week, now) {
  return { v: 2, week: weekAt(week.start), quests: [], rows: [], reminders: [], themes: {}, themeOrig: {}, unsure: [], log: [], seq: 1, lastQ: null, createdAt: now, updatedAt: now, history: [] };
}
// 舊版（第一期）的草稿
function upgrade(d) {
  if (!d) return d;
  if (!d.themeOrig) d.themeOrig = {};
  if (!d.v || d.v < 2) { d.v = 2; d.week = weekAt(d.week.start); }
  return d;
}
const nextId = (d, p) => `${p}${d.seq++}`;
function snapshot(d) {
  d.history = [...(d.history || []), JSON.stringify({ quests: d.quests, rows: d.rows, reminders: d.reminders, themes: d.themes, unsure: d.unsure, lastQ: d.lastQ })].slice(-20);
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
// 「週報的步驟…」：名稱只有一部分也找得到（只有一個符合才算）
function findQuest(d, title, { fuzzy = false } = {}) {
  const n = norm(title);
  if (!n) return null;
  const qs = live(d.quests);
  const exact = qs.find((q) => norm(q.title) === n);
  if (exact || !fuzzy || n.length < 2) return exact || null;
  const near = qs.filter((q) => norm(q.title).includes(n) || (norm(q.title).length >= 2 && n.includes(norm(q.title))));
  return near.length === 1 ? near[0] : null;
}
const remember = (restore, list, x) => { if (restore && !restore.some((r) => r.id === x.id)) restore.push({ list, id: x.id, before: JSON.stringify(x) }); };

// 套用項目（規則或 AI 整理出來的）；log＝哪一句話記的（撤銷用）；restore 收集被改到的舊項目（撤銷時改回來）。回傳新增／更新的 id
function addItems(d, items, log = null, restore = null) {
  const ids = [];
  const addSteps = (q, steps) => { for (const s of steps || []) if (!q.steps.some((x) => norm(x.text) === norm(s))) q.steps.push({ id: nextId(d, 's'), text: s }); };
  for (const it of items) {
    if (it.kind === 'quest') {
      const same = findQuest(d, it.title, { fuzzy: !!it.ref });
      if (same) { // 同一個委託又說了一次：補上截止日、類型、步驟
        remember(restore, 'quests', same);
        if (it.due) same.due = it.due;
        if (it.tierSet) { same.tier = it.tier; same.tierSet = true; }
        addSteps(same, it.steps);
        d.lastQ = same.id; ids.push(same.id); continue;
      }
      const q = { id: nextId(d, 'q'), title: it.title, tier: TIERS.includes(it.tier) ? it.tier : 'major', tierSet: !!it.tierSet, due: validISO(it.due) ? it.due : '', project: clip(it.project || '', 30), steps: (it.steps || []).map((s) => ({ id: nextId(d, 's'), text: s })), log };
      d.quests.push(q); ids.push(q.id); d.lastQ = q.id;
    } else if (it.kind === 'steps') { // 幫某個委託補步驟（沒說是哪個＝上一個）
      const last = d.lastQ && (findItem(d, d.lastQ) || {}).item;
      const q = it.ref ? findQuest(d, it.ref, { fuzzy: true }) : last && !last.del ? last : null;
      if (q) { remember(restore, 'quests', q); addSteps(q, it.steps); ids.push(q.id); d.lastQ = q.id; continue; }
      if (it.ref) { const nq = { id: nextId(d, 'q'), title: clip(it.ref), tier: 'major', tierSet: false, due: '', project: '', steps: it.steps.map((s) => ({ id: nextId(d, 's'), text: s })), log }; d.quests.push(nq); ids.push(nq.id); d.lastQ = nq.id; continue; }
      const u = { id: nextId(d, 'u'), title: `步驟：${it.steps.join('、')}`, question: '要加在哪個委託？', guess: { kind: 'steps', steps: it.steps }, log };
      d.unsure.push(u); ids.push(u.id);
    } else if (it.kind === 'row') {
      if (!validISO(it.date) || !validHM(it.start)) continue;
      const same = live(d.rows).find((r) => r.date === it.date && r.start === it.start && norm(r.title) === norm(it.title));
      if (same) { if (it.end && it.end !== same.end && it.end > same.start) { remember(restore, 'rows', same); same.end = it.end; ids.push(same.id); } continue; }
      const r = { id: nextId(d, 'r'), date: it.date, start: it.start, end: validHM(it.end) && it.end > it.start ? it.end : '', title: it.title, output: '', raid: !!it.raid, log };
      d.rows.push(r); ids.push(r.id);
    } else if (it.kind === 'reminder') {
      if (!validISO(it.date) || !validHM(it.time)) continue;
      if (live(d.reminders).some((m) => m.date === it.date && m.time === it.time && norm(m.title) === norm(it.title))) continue;
      const m = { id: nextId(d, 'm'), date: it.date, time: it.time, title: it.title, action: '', log };
      d.reminders.push(m); ids.push(m.id);
    } else if (it.kind === 'theme') {
      if (!validISO(it.date)) continue;
      if (restore && !restore.some((r) => r.theme === it.date)) restore.push({ theme: it.date, before: d.themes[it.date] === undefined ? null : d.themes[it.date] });
      d.themes[it.date] = d.themes[it.date] && !d.themes[it.date].includes(it.title) ? `${d.themes[it.date]}、${it.title}` : it.title;
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
// 撤銷某一句話：那句新加的拿掉（自己改過的留著），那句改到的舊項目改回來
function removeLog(d, logId, restore = []) {
  const keep = (x) => x.log !== logId || x.touched;
  d.quests = d.quests.filter(keep); d.rows = d.rows.filter(keep); d.reminders = d.reminders.filter(keep); d.unsure = d.unsure.filter(keep);
  for (const r of [...(restore || [])].reverse()) {
    if (r.theme) { if (r.before === null) delete d.themes[r.theme]; else d.themes[r.theme] = r.before; continue; }
    const list = d[r.list]; const i = list ? list.findIndex((x) => x.id === r.id) : -1;
    if (i >= 0) list[i] = JSON.parse(r.before);
    else if (i < 0 && list) list.push(JSON.parse(r.before)); // 那句刪掉的，放回來
  }
  for (const [date, l] of Object.entries(d.themeLog || {})) if (l === logId) { delete d.themes[date]; delete d.themeLog[date]; } // 第一期的草稿
}
// 刪掉：新加的直接拿掉；原本就有的標成刪掉（寫進去前可以復原）
function removeItem(d, id) {
  if (id.startsWith('t:')) { const date = id.slice(2); if (d.themeOrig[date]) d.themes[date] = ''; else delete d.themes[date]; return true; }
  for (const k of ['quests', 'rows', 'reminders', 'unsure']) {
    const x = d[k].find((i) => i.id === id);
    if (!x) continue;
    if (x.orig) x.del = true; else d[k] = d[k].filter((i) => i.id !== id);
    return true;
  }
  for (const q of d.quests) { const n = q.steps.length; q.steps = q.steps.filter((s) => s.id !== id); if (q.steps.length !== n) return true; }
  return false;
}
function restoreItem(d, id) {
  if (id.startsWith('t:')) { const date = id.slice(2); if (d.themeOrig[date] === undefined) return false; d.themes[date] = d.themeOrig[date]; return true; }
  const hit = findItem(d, id);
  if (!hit || !hit.item.del) return false;
  hit.item.del = false;
  return true;
}
// 整頁擦掉重寫：原本的全部標成刪掉
function wipe(d) {
  for (const k of ['quests', 'rows', 'reminders']) for (const x of d[k]) { if (x.orig) x.del = true; }
  d[`quests`] = d.quests.filter((x) => x.orig); d.rows = d.rows.filter((x) => x.orig); d.reminders = d.reminders.filter((x) => x.orig);
  for (const date of Object.keys(d.themes)) { if (d.themeOrig[date]) d.themes[date] = ''; else delete d.themes[date]; }
}
// 手動改（大視窗的表單）：欄位都檢查過才改
function editItem(d, id, f = {}) {
  if (id.startsWith('t:')) { const t = clip(f.title || '', 40); const date = id.slice(2); if (t) d.themes[date] = t; else if (d.themeOrig[date]) d.themes[date] = ''; else delete d.themes[date]; return true; }
  const hit = findItem(d, id);
  if (!hit) throw new Error('找不到這一項');
  const x = hit.item;
  const oldTitle = x.title;
  if (f.title !== undefined) { const t = hit.list === 'rows' ? clip(String(f.title).replace(/\s+/g, ' ').trim()) : clip(cleanText(f.title) || f.title); if (!t) throw new Error('要有名稱'); x.title = t; } // 時段的「委託：步驟」冒號要留著
  if (hit.list === 'quests' && x.title !== oldTitle) renameLinked(d, oldTitle, x.title); // 委託改名：排進時刻簿的時段跟著改
  if (hit.list === 'quests') {
    if (f.tier !== undefined && TIERS.includes(f.tier)) { x.tier = f.tier; x.tierSet = true; }
    if (f.due !== undefined) { if (f.due && !validISO(f.due)) throw new Error('日期格式不對'); x.due = f.due || ''; }
    if (f.project !== undefined) x.project = clip(f.project, 30);
    if (Array.isArray(f.steps)) x.steps = f.steps.map((s) => clip(s)).filter(Boolean).map((text) => { const o = x.steps.find((s) => s.text === text); return o || { id: nextId(d, 's'), text }; });
    d.lastQ = x.id;
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
// 不確定的 → 變成委託／時段／某個委託的步驟
function resolveUnsure(d, id, as = 'quest', f = {}) {
  const u = d.unsure.find((x) => x.id === id);
  if (!u) throw new Error('找不到這一項');
  const g = u.guess || {};
  let ids;
  if (as === 'steps') {
    const q = f.quest && findItem(d, f.quest);
    if (!q || q.list !== 'quests') throw new Error('要先選委託');
    ids = addItems(d, [{ kind: 'steps', ref: q.item.title, steps: g.steps || [] }], u.log);
  } else if (as === 'row') ids = addItems(d, [{ kind: 'row', date: f.date || g.date, start: f.start || g.start, end: f.end || g.end || '', title: f.title || g.title || u.title, raid: f.raid !== undefined ? f.raid : !!g.raid }], u.log);
  else ids = addItems(d, [{ kind: 'quest', title: f.title || g.title || u.title.replace(/^步驟：/, ''), tier: 'major', due: f.due || '', steps: g.kind === 'steps' ? g.steps : [] }], u.log);
  if (!ids.length) throw new Error(as === 'row' ? '要先選日期和開始時間' : '加不進去');
  d.unsure = d.unsure.filter((x) => x.id !== id);
  return ids;
}

// ---------- 🕘 時刻簿：時段屬於哪個委託 ----------
// 計畫檔寫成「- 09:00–10:00 寫完週報：收資料」：冒號前面剛好是某個委託的名稱才算（「10/5 會議：提問清單」這種不會被誤認）
// 整格就是委託名稱（「- 14:00–16:00 寫完週報」）也算，只是沒有步驟
const RE_LINK_SEP = /^\s*[：:]\s*/;
function linkOf(title, quests) {
  const t = String(title || '').trim();
  let best = null;
  for (const q of quests) {
    const qt = String(q.title || '').trim();
    if (!qt || qt.length > t.length || (best && qt.length <= best.quest.length)) continue;
    if (t === qt) { best = { qid: q.id, quest: qt, step: '' }; continue; }
    if (t.startsWith(qt) && RE_LINK_SEP.test(t.slice(qt.length))) best = { qid: q.id, quest: qt, step: t.slice(qt.length).replace(RE_LINK_SEP, '').trim() };
  }
  return best;
}
const linkTitle = (quest, step) => (step ? `${quest}：${step}` : quest);
function renameLinked(d, oldTitle, newTitle) {
  for (const r of d.rows) {
    if (r.del) continue;
    const L = linkOf(r.title, [{ id: 'x', title: oldTitle }]);
    if (L) { r.title = linkTitle(newTitle, L.step); r.touched = true; }
  }
}

// 同一天的方塊怎麼並排（像行事曆 App）：互相重疊的一群分欄，每一個拿 lane（第幾欄）、lanes（這群共幾欄）
// items：[{ key, start, end }]，沒有結束時間的當作 30 分鐘
function layoutDay(items) {
  const xs = items.map((x) => ({ key: x.key, s: toMin(x.start), e: x.end && x.end > x.start ? toMin(x.end) : toMin(x.start) + 30 })).sort((a, b) => a.s - b.s || b.e - a.e);
  const out = {};
  let group = [], laneEnd = [], groupEnd = 0, gi = 0;
  const close = () => { const n = laneEnd.length; for (const g of group) out[g.key] = { lane: g.lane, lanes: n, g: gi }; gi++; group = []; laneEnd = []; }; // g＝第幾群（太擠時畫面收成「+N」用）
  for (const x of xs) {
    if (group.length && x.s >= groupEnd) close();
    let lane = laneEnd.findIndex((e) => e <= x.s);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(x.e); } else laneEnd[lane] = x.e;
    group.push({ key: x.key, lane });
    groupEnd = group.length === 1 ? x.e : Math.max(groupEnd, x.e);
  }
  close();
  return out;
}

// ---------- 🕘 委託拆成時段 ----------
// 手動寫的步驟：一行一個，後面可以寫要多久（「收資料 30」「寫初稿 1.5 小時」「整理 45分」）
function parseStepLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => {
    const raw = line.replace(/^\s*(?:[-*+・•]\s*(?:\[[ xX]\]\s*)?|\d{1,2}\s*[.、)）])\s*/, '').trim();
    if (!raw) return null;
    const m = raw.match(/^(.*?)[\s，,、（(]*(\d+(?:\.\d+)?)\s*(小時|hr|h|分鐘|分|min|m)?[）)]?\s*$/i);
    let min = 0, txt = raw;
    if (m && m[1].trim().length >= 1 && (m[3] || +m[2] >= 5)) { // 只有數字：5 以上才當分鐘（「第2版」的 2 不算）
      min = /小時|hr|h/i.test(m[3] || '') ? Math.round(+m[2] * 60) : Math.round(+m[2]);
      txt = m[1].trim();
    }
    txt = clip(txt.replace(/[，,、]+$/, ''), 40);
    return txt ? { text: txt, min: min > 0 ? Math.min(600, min) : 0 } : null;
  }).filter(Boolean).slice(0, 20);
}
const SPLIT_UNITS = [15, 30, 45, 60, 90, 120];
// 一天的時間窗扣掉忙的時段（📯 團戰）→ 空的區段（分鐘）
function freeSegments(date, from, to, busy) {
  let segs = [[from, to]];
  for (const b of busy.filter((x) => x.date === date)) {
    const bs = toMin(b.start), be = b.end && b.end > b.start ? toMin(b.end) : bs + 60;
    segs = segs.flatMap(([s, e]) => (be <= s || bs >= e ? [[s, e]] : [[s, Math.max(s, bs)], [Math.min(e, be), e]].filter(([a, c]) => c - a >= 5)));
  }
  return segs;
}
const hmOf = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
// 預覽：選的日子、時間、單位、步驟 → 會加哪些時段（不改草稿）
// o：{ dates, from, to, unit（分鐘或 'est'＝照步驟寫的時間）, steps:[{text,min}], fill:'spread'|'one', overflow:'next'|'stack', skipBusy, busy:[{date,start,end,title}], offDates:[], weekEnd }
function splitPlan(d, qid, o = {}) {
  const q = live(d.quests).find((x) => x.id === qid);
  if (!q) throw new Error('找不到這個委託');
  if (!validHM(o.from) || !validHM(o.to) || o.to <= o.from) throw new Error('結束時間要在開始之後');
  const est = o.unit === 'est';
  const g = est ? 15 : SPLIT_UNITS.includes(+o.unit) ? +o.unit : Math.max(5, Math.min(240, Math.round(+o.unit || 60)));
  const off = new Set(o.offDates || []);
  const dates = [...new Set((o.dates || []).filter(validISO))].sort();
  if (!dates.length) throw new Error('要選哪幾天');
  const steps = (o.steps || []).map((s) => (typeof s === 'string' ? { text: s, min: 0 } : s)).filter((s) => s && String(s.text || '').trim()).map((s) => ({ text: clip(String(s.text).trim(), 40), min: Math.max(0, Math.round(+s.min || 0)) })).slice(0, 20);
  const work = steps.length ? steps : [{ text: '', min: 0 }]; // 沒有步驟：整段就是做這個委託
  const busy = o.skipBusy === false ? [] : [...live(d.rows).filter((r) => r.raid && !r.canceled), ...(o.busy || [])];
  const F = toMin(o.from), T = toMin(o.to);
  const unitsOf = (date) => freeSegments(date, F, T, busy).flatMap(([s, e]) => {
    const u = [];
    for (let a = s; a < e; a += g) { const b = Math.min(e, a + g); if (b - a >= Math.min(g, 15)) u.push({ date, s: a, e: b }); }
    return u;
  });
  let U = dates.flatMap(unitsOf);
  // 延到下一天：選的最後一天之後、這一週還沒放假的日子
  const weekEnd = validISO(o.weekEnd) ? o.weekEnd : addDays(d.week.start, 4);
  const extDays = [];
  for (let x = addDays(dates[dates.length - 1], 1); x <= weekEnd; x = addDays(x, 1)) if (!off.has(x) && dowOf(x) !== 0 && dowOf(x) !== 6) extDays.push(x);
  const need = est ? work.reduce((n, s) => n + Math.max(1, Math.round((s.min || 60) / 15)), 0) : work.length;
  const extUsed = [];
  while (o.overflow !== 'stack' && U.length < need && extDays.length) { const x = extDays.shift(); extUsed.push(x); U = U.concat(unitsOf(x)); }
  if (extUsed.length) U = U.slice(0, need); // 延到下一天只是為了排得下：多出來的格子不用
  // 分配：每個步驟拿到哪幾格
  const assign = work.map(() => []);
  const leftover = [];
  if (est) {
    let k = 0;
    work.forEach((s, i) => { const n = Math.max(1, Math.round((s.min || 60) / 15)); if (k + n > U.length) { leftover.push(s.text); return; } for (let j = 0; j < n; j++) assign[i].push(U[k++]); });
  } else if (!U.length) work.forEach((s) => leftover.push(s.text));
  else if (work.length <= U.length) {
    const N = U.length, S = work.length;
    work.forEach((s, i) => { if (o.fill === 'one' && steps.length) assign[i].push(U[i]); else for (let j = Math.floor((i * N) / S); j < Math.floor(((i + 1) * N) / S); j++) assign[i].push(U[j]); });
  } else if (o.overflow !== 'stack') { // 延到下一天也排不下（這週沒有日子了）：排得下的一步一格，剩下的說排不下
    work.forEach((s, i) => { if (i < U.length) assign[i].push(U[i]); else leftover.push(s.text); });
  } else { // 步驟比格子多：擠在同一格（同時段好幾件）
    const N = U.length, S = work.length;
    work.forEach((s, i) => assign[i].push(U[Math.min(N - 1, Math.floor((i * N) / S))]));
  }
  // 連在一起的格子合成一段
  const rows = [];
  work.forEach((s, i) => {
    let cur = null;
    for (const u of assign[i]) {
      if (cur && cur.date === u.date && cur.e === u.s) { cur.e = u.e; continue; }
      if (cur) rows.push(cur);
      cur = { date: u.date, s: u.s, e: u.e };
    }
    if (cur) rows.push(cur);
    for (const r of rows.filter((x) => x.i === undefined)) { r.i = i; r.step = s.text; }
  });
  const out = rows.map((r) => ({ date: r.date, start: hmOf(r.s), end: hmOf(r.e), step: r.step, title: linkTitle(q.title, r.step) })).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start) || 0);
  // 給人看的提醒：跟別的時段同時（可以，只是說一聲）、排不下的、跳過的團戰
  const others = live(d.rows).filter((r) => !r.raid && !r.canceled);
  const overlap = out.filter((r) => others.some((x) => x.date === r.date && x.start < r.end && r.start < (x.end || plusMin(x.start, 30)))).length;
  const stacked = out.filter((r, i) => out.some((x, j) => j !== i && x.date === r.date && x.start < r.end && r.start < x.end)).length;
  const skipped = busy.filter((b) => [...dates, ...extUsed].includes(b.date) && b.start < o.to && (b.end || plusMin(b.start, 60)) > o.from).map((b) => `${dayLabel(b.date)} ${b.start} ${b.title}`);
  return { rows: out, leftover, extDays: extUsed, overlap, stacked, skipped, unit: est ? 'est' : g };
}
// 套用：步驟補進委託、時段加進草稿（之後一樣按「寫進計畫檔」才寫）
function applySplit(d, qid, res, steps = []) {
  const q = live(d.quests).find((x) => x.id === qid);
  if (!q) throw new Error('找不到這個委託');
  if (!res || !res.rows || !res.rows.length) throw new Error('沒有排到任何時段');
  for (const s of steps) { const t = typeof s === 'string' ? s : s.text; if (t && !q.steps.some((x) => norm(x.text) === norm(t))) q.steps.push({ id: nextId(d, 's'), text: clip(t, 40) }); }
  const ids = addItems(d, res.rows.map((r) => ({ kind: 'row', date: r.date, start: r.start, end: r.end, title: r.title, raid: false })), null);
  for (const id of ids) { const h = findItem(d, id); if (h) h.item.touched = true; }
  d.lastQ = q.id;
  return ids;
}

// 請 AI 建議步驟（委託沒有步驟、或想重新拆）：只回步驟和大概要幾分鐘，冒險者看過、可以改才排
const STEPS_SCHEMA = {
  type: 'object',
  properties: { steps: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'object', properties: { text: { type: 'string' }, minutes: { type: 'integer' } }, required: ['text', 'minutes'] } } },
  required: ['steps'],
};
const STEPS_SYSTEM = [
  '你是幫忙拆解工作的小幫手。把【委託】拆成 3～6 個照順序做的具體步驟，用 JSON 回答 steps。',
  'text：每個步驟 2～15 個字，是動作（例如「收集資料」「寫初稿」「請主管看」），不要寫日期和時間、不要重複委託的名稱。minutes：大約要幾分鐘（15 的倍數）。',
  '有【已經有的步驟】就照它們的意思補完整或拆細，不要寫跟委託無關的事。',
].join('\n');
function stepsUser(q, { minutes = 0 } = {}) {
  const has = (q.steps || []).map((s) => s.text);
  return `【委託】${q.title}${q.due ? `（${dayLabel(q.due)}前）` : ''}\n${has.length ? `【已經有的步驟】${has.join('、')}\n` : ''}${minutes ? `【可以用的時間】大約 ${minutes} 分鐘\n` : ''}`;
}
function normalizeSteps(json, q) {
  const seen = new Set();
  const out = [];
  for (const s of (json && Array.isArray(json.steps) ? json.steps : []).slice(0, 8)) {
    const text = stepText(s && s.text);
    if (!text || text.length < 2 || text.length > 30 || norm(text) === norm(q.title) || seen.has(norm(text))) continue;
    seen.add(norm(text));
    const min = Math.max(15, Math.min(240, Math.round((+(s && s.minutes) || 60) / 15) * 15));
    out.push({ text, min });
  }
  return out.length >= 2 ? out : [];
}

// AI（或規則）的修改 → 套進草稿；回傳改到的 id 和給人看的摘要
function applyEdits(d, json, ctx, { log = null, restore = null } = {}) {
  const changed = [], said = [];
  for (const op of (json && Array.isArray(json.ops) ? json.ops : []).slice(0, 12)) {
    if (!op || typeof op !== 'object') continue;
    const date = op.day ? resolveDay(String(op.day), ctx) : null;
    const start = op.start ? normTime(op.start) : '', end = op.end ? normTime(op.end) : '';
    const hit0 = op.ref ? findItem(d, String(op.ref).trim()) : null;
    const hit = hit0 && !hit0.item.del ? hit0 : null;
    try {
      if (op.op === 'delete' && hit) { remember(restore, hit.list, hit.item); removeItem(d, hit.item.id); changed.push(hit.item.id); said.push(`刪掉「${hit.item.title}」`); continue; }
      if (op.op === 'edit' && hit) {
        const f = {};
        if (op.title && op.title !== hit.item.title) f.title = op.title;
        if (hit.list === 'quests') { if (date) f.due = date; if (TIERS.includes(op.importance) && op.importance !== hit.item.tier) f.tier = op.importance; }
        if (hit.list === 'rows') { if (date) f.date = date; if (start) f.start = start; if (end && end > (start || hit.item.start)) f.end = end; else if (start && hit.item.end) { const len = toMin(hit.item.end) - toMin(hit.item.start); f.end = plusMin(start, len); } if (op.meeting !== undefined && !!op.meeting !== !!hit.item.raid) f.raid = !!op.meeting; }
        if (hit.list === 'reminders') { if (date) f.date = date; if (start) f.time = start; }
        if (!Object.keys(f).length) continue;
        const old = hit.item.title;
        remember(restore, hit.list, hit.item);
        editItem(d, hit.item.id, f); // 請 AI 改的也算自己改的：晚到的整理結果不會蓋掉
        changed.push(hit.item.id); said.push(`「${old}」${f.title ? `→「${f.title}」` : ''}${f.date || f.due ? `→ ${dayLabel(f.date || f.due)}` : ''}${f.start ? ` ${f.start}` : ''}${f.tier ? ` ${TIER_NAME[f.tier]}` : ''}`.trim());
        continue;
      }
      if (op.op === 'add_step' && hit && hit.list === 'quests') {
        const steps = (Array.isArray(op.steps) ? op.steps : [op.title]).map(stepText).filter((s) => s && s.length >= 2);
        remember(restore, 'quests', hit.item);
        for (const s of steps) if (!hit.item.steps.some((x) => norm(x.text) === norm(s))) hit.item.steps.push({ id: nextId(d, 's'), text: s });
        if (steps.length) { hit.item.touched = true; changed.push(hit.item.id); said.push(`「${hit.item.title}」加了 ${steps.length} 個步驟`); }
        continue;
      }
      if (op.op === 'set_theme' && date && op.title) { if (restore && !restore.some((r) => r.theme === date)) restore.push({ theme: date, before: d.themes[date] === undefined ? null : d.themes[date] }); d.themes[date] = clip(op.title, 40); changed.push(`t:${date}`); said.push(`${dayLabel(date)}：${op.title}`); continue; }
      const kind = { add_task: 'task', add_schedule: 'schedule', add_reminder: 'reminder' }[op.op];
      if (kind) {
        const items = normalizeAI({ items: [{ kind, title: op.title, day: op.day, start: op.start, end: op.end, importance: op.importance, steps: op.steps, meeting: op.meeting }] }, ctx);
        const ids = addItems(d, items, log, restore);
        changed.push(...ids);
        if (ids.length) said.push(`加了「${clip(op.title, 20)}」`);
      }
    } catch (_) { /* 這一個變更不合理就跳過 */ }
  }
  sortDraft(d);
  return { changed, said };
}

// 一句話記下的東西，給人看的短句：「📜 週報（週五前）、📯 週二 14:00 週會」
function itemsText(d, ids) {
  const parts = [];
  for (const id of ids) {
    if (id.startsWith('t:')) { parts.push(`🗓 ${dayLabel(id.slice(2))}：${d.themes[id.slice(2)] || ''}`); continue; }
    const hit = findItem(d, id);
    if (!hit) continue;
    const x = hit.item;
    if (hit.list === 'quests') parts.push(`📜 ${x.title}${x.due ? `（${dayLabel(x.due)}前）` : ''}${x.steps.length ? `：${x.steps.map((s) => s.text).join('→')}` : ''}`);
    else if (hit.list === 'rows') parts.push(`${x.raid ? '📯' : '🕘'} ${dayLabel(x.date)} ${x.start} ${x.title}`);
    else if (hit.list === 'reminders') parts.push(`⏰ ${dayLabel(x.date)} ${x.time} ${x.title}`);
    else parts.push(`❓ ${x.title}`);
  }
  return parts.join('、');
}
function summary(d) {
  const rows = live(d.rows), raids = rows.filter((r) => r.raid).length;
  const parts = [`${live(d.quests).length} 個委託`, `${rows.length - raids} 格行程`];
  if (raids) parts.push(`${raids} 場團戰`);
  if (live(d.reminders).length) parts.push(`${live(d.reminders).length} 個提醒`);
  if (d.unsure.length) parts.push(`${d.unsure.length} 件不確定`);
  return parts.join('、');
}

// ---------- 原本就有的（計畫檔）＋這次改的 ----------
const stepKey = (steps) => steps.map((s) => norm(s.text)).sort().join('|');
function questState(q) {
  if (!q.orig) return q.del ? 'del' : 'new';
  if (q.del) return 'del';
  const o = q.orig;
  return q.title !== o.title || q.tier !== o.tier || (q.due || '') !== (o.due || '') || (q.project || '') !== (o.project || '') || stepKey(q.steps) !== stepKey(o.steps) ? 'dirty' : '';
}
function rowState(r) {
  if (!r.orig) return 'new';
  if (r.del) return 'del';
  const o = r.orig;
  return r.date !== o.date || r.start !== o.start || (r.end || '') !== (o.end || '') || r.title !== o.title || !!r.raid !== !!o.raid ? 'dirty' : '';
}
function remState(m) {
  if (!m.orig) return 'new';
  if (m.del) return 'del';
  const o = m.orig;
  return m.date !== o.date || m.time !== o.time || m.title !== o.title ? 'dirty' : '';
}
// 還沒寫進計畫檔的改變有幾處
function changes(d) {
  let n = 0;
  n += d.quests.filter((q) => questState(q)).length;
  n += d.rows.filter((r) => rowState(r)).length;
  n += d.reminders.filter((m) => remState(m)).length;
  for (const date of new Set([...Object.keys(d.themes), ...Object.keys(d.themeOrig)])) if ((d.themes[date] || '') !== (d.themeOrig[date] || '')) n++;
  return n;
}
// 從計畫檔讀進來：原本就有的放進草稿（墨水）；沒改過的跟著檔案更新，改過的保留你的版本（勾選狀態一樣跟著檔案）
// plan＝這一週的計畫（parsePlan 的結果），null＝這一週還沒有計畫檔
function syncPlan(d, plan) {
  const inWeek = (iso) => iso >= d.week.start && iso <= addDays(d.week.start, 6);
  const drop = (list, stateOf) => list.filter((x) => {
    if (!x.orig || x._seen) return true;
    if (x.del || !stateOf(x)) return false; // 檔案裡已經沒有了：沒改過的就拿掉
    delete x.orig; return true; // 改過的變成新加的
  });
  // 委託
  for (const pq of plan ? plan.quests : []) {
    const o = { key: pq.id, title: pq.title, tier: pq.tier, due: pq.deadlineLabel === '本週內' ? '' : pq.deadline || '', project: pq.project || '', steps: pq.objectives.filter((x) => !x.implicit).map((x) => ({ text: x.text, done: !!x.done })), reason: pq.reason || '', implicit: !!pq.implicit, done: pq.implicit ? !!(pq.objectives[0] && pq.objectives[0].done) : undefined };
    let q = d.quests.find((x) => x.orig && x.orig.key === o.key);
    if (!q) { q = { id: nextId(d, 'q'), title: o.title, tier: o.tier, tierSet: true, due: o.due, project: o.project, steps: o.steps.map((s) => ({ id: nextId(d, 's'), text: s.text, done: s.done })), orig: o }; d.quests.push(q); }
    else if (!questState(q)) Object.assign(q, { title: o.title, tier: o.tier, due: o.due, project: o.project, steps: o.steps.map((s) => ({ id: (q.steps.find((x) => norm(x.text) === norm(s.text)) || {}).id || nextId(d, 's'), text: s.text, done: s.done })) });
    else for (const s of q.steps) { const m = o.steps.find((x) => norm(x.text) === norm(s.text)); s.done = m ? m.done : undefined; }
    q.orig = o; q._seen = true;
  }
  d.quests = drop(d.quests, questState);
  // 時段
  const seenKeys = {};
  for (const day of plan ? plan.days.filter((x) => inWeek(x.date)) : []) {
    for (const pr of day.rows) {
      let key = `${day.date}|${pr.start}|${norm(pr.a)}`;
      seenKeys[key] = (seenKeys[key] || 0) + 1; if (seenKeys[key] > 1) key += `#${seenKeys[key]}`;
      const o = { key, date: day.date, start: pr.start, end: pr.end || '', title: pr.a, output: pr.b || '', raid: !!pr.raid, done: !!pr.done, canceled: !!pr.canceled };
      let r = d.rows.find((x) => x.orig && x.orig.key === key);
      if (!r) { r = { id: nextId(d, 'r'), date: o.date, start: o.start, end: o.end, title: o.title, output: o.output, raid: o.raid }; d.rows.push(r); }
      else if (!rowState(r)) Object.assign(r, { date: o.date, start: o.start, end: o.end, title: o.title, output: o.output, raid: o.raid });
      r.done = o.done; r.canceled = o.canceled; r.orig = o; r._seen = true;
    }
  }
  d.rows = drop(d.rows, rowState);
  // 提醒
  const seenR = {};
  for (const pd of plan ? plan.decisions.filter((x) => inWeek(x.date)) : []) {
    let key = `${pd.date}|${pd.time}|${norm(pd.condition)}`;
    seenR[key] = (seenR[key] || 0) + 1; if (seenR[key] > 1) key += `#${seenR[key]}`;
    const o = { key, date: pd.date, time: pd.time, title: pd.condition, action: pd.action || '' };
    let m = d.reminders.find((x) => x.orig && x.orig.key === key);
    if (!m) { m = { id: nextId(d, 'm'), date: o.date, time: o.time, title: o.title, action: o.action }; d.reminders.push(m); }
    else if (!remState(m)) Object.assign(m, { date: o.date, time: o.time, title: o.title });
    m.orig = o; m._seen = true;
  }
  d.reminders = drop(d.reminders, remState);
  for (const k of ['quests', 'rows', 'reminders']) for (const x of d[k]) delete x._seen;
  // 每天的主題：沒改過的跟著檔案
  const themeOrig = {};
  for (const day of plan ? plan.days.filter((x) => inWeek(x.date)) : []) if (day.theme) themeOrig[day.date] = day.theme;
  for (const date of new Set([...Object.keys(themeOrig), ...Object.keys(d.themeOrig)])) {
    const was = d.themeOrig[date] || '';
    const cur = d.themes[date] === undefined ? was : d.themes[date];
    if (cur === was) { if (themeOrig[date]) d.themes[date] = themeOrig[date]; else delete d.themes[date]; }
  }
  d.themeOrig = themeOrig;
  sortDraft(d);
  return d;
}

// ---------- 寫進計畫檔 ----------
const dueLabel = (iso) => (iso ? md(iso) : '');
// 整份新寫（這一週還沒有計畫檔）
function toMarkdown(d, { title } = {}) {
  let c = `# ${title || `我的一週 ${d.week.label}`}\n`;
  for (const q of live(d.quests)) c = P.addQuest(c, { title: q.title, tier: q.tier, deadlineLabel: dueLabel(q.due), objectives: q.steps.map((s) => s.text), project: q.project || '' });
  for (const r of live(d.rows)) c = P.addScheduleRow(c, r.date, { start: r.start, end: r.end, text: r.title, output: r.output || '', raid: r.raid });
  for (const m of live(d.reminders)) c = P.addReminder(c, { at: `${m.date}T${m.time}:00`, text: m.title, action: m.action || '' });
  for (const [date, t] of Object.entries(d.themes)) if (t) c = P.setDayTheme(c, date, t);
  return tidy(c);
}
// 標題前空一行、不要連續好幾個空行、檔尾一個換行
const tidy = (c) => c.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
// 寫進已經有的計畫檔：一項一項改（刪掉的、改過的、新加的），其他內容（說明、子目標、進度紀錄、自己加的段落）都不動
function applyToContent(content, d) {
  let c = content;
  const stats = { added: 0, edited: 0, deleted: 0, missing: 0 };
  const plan = () => P.parsePlan(c);
  const later = { quests: [], rows: [], reminders: [] };
  for (const q of d.quests) {
    const st = questState(q);
    if (!q.orig) { if (!q.del) later.quests.push(q); continue; }
    if (!st) continue;
    const pq = plan().quests.find((x) => x.id === q.orig.key);
    if (!pq) { stats.missing++; if (!q.del) later.quests.push(q); continue; }
    if (q.del) { c = P.deleteQuest(c, pq.id); stats.deleted++; continue; }
    const o = q.orig, f = {};
    if (q.title !== o.title) f.title = q.title;
    if (q.tier !== o.tier) f.tier = q.tier;
    if ((q.due || '') !== (o.due || '')) f.deadlineLabel = dueLabel(q.due);
    if ((q.project || '') !== (o.project || '')) f.project = q.project || '';
    if (Object.keys(f).length) c = P.editQuest(c, pq.id, f);
    const qid = f.title ? (plan().quests.find((x) => norm(x.title) === norm(q.title)) || {}).id : pq.id;
    if (qid) {
      const now = q.steps.map((s) => norm(s.text)), was = o.steps.map((s) => norm(s.text));
      for (const s of o.steps.filter((x) => !now.includes(norm(x.text)))) {
        const pq2 = plan().quests.find((x) => x.id === qid);
        const i = pq2 ? pq2.objectives.findIndex((x) => !x.implicit && norm(x.text) === norm(s.text)) : -1;
        if (i >= 0) c = P.deleteObjective(c, qid, i);
      }
      for (const s of q.steps.filter((x) => !was.includes(norm(x.text)))) c = P.addObjective(c, qid, s.text);
    }
    stats.edited++;
  }
  const findRow = (o) => { const day = plan().days.find((x) => x.date === o.date); return day && day.rows.find((x) => x.start === o.start && norm(x.a) === norm(o.title)); };
  for (const r of d.rows) {
    const st = rowState(r);
    if (!r.orig) { if (!r.del) later.rows.push(r); continue; }
    if (!st) continue;
    const pr = findRow(r.orig);
    if (!pr) { stats.missing++; if (!r.del) later.rows.push(r); continue; }
    if (r.del) { c = P.removeLine(c, pr.line); stats.deleted++; continue; }
    if (r.date === r.orig.date) c = P.editScheduleRow(c, pr.line, { start: r.start, end: r.end || '', text: r.title, raid: !!r.raid });
    else { c = P.removeLine(c, pr.line); c = P.addScheduleRow(c, r.date, { start: r.start, end: r.end, text: r.title, output: r.output || '', raid: r.raid }); }
    stats.edited++;
  }
  const findRem = (o) => plan().decisions.find((x) => x.date === o.date && x.time === o.time && norm(x.condition) === norm(o.title));
  for (const m of d.reminders) {
    const st = remState(m);
    if (!m.orig) { if (!m.del) later.reminders.push(m); continue; }
    if (!st) continue;
    const pd = findRem(m.orig);
    if (!pd) { stats.missing++; if (!m.del) later.reminders.push(m); continue; }
    c = P.removeLine(c, pd.line);
    if (m.del) { stats.deleted++; continue; }
    c = P.addReminder(c, { at: `${m.date}T${m.time}:00`, text: m.title, action: m.action || m.orig.action || '' });
    stats.edited++;
  }
  for (const date of new Set([...Object.keys(d.themes), ...Object.keys(d.themeOrig)])) {
    const t = d.themes[date] || '', was = d.themeOrig[date] || '';
    if (t === was) continue;
    c = P.setDayTheme(c, date, t);
    if (t && was) stats.edited++; else if (t) stats.added++; else stats.deleted++;
  }
  for (const q of later.quests) { c = P.addQuest(c, { title: q.title, tier: q.tier, deadlineLabel: dueLabel(q.due), objectives: q.steps.map((s) => s.text), project: q.project || '' }); stats.added++; }
  for (const r of later.rows) { c = P.addScheduleRow(c, r.date, { start: r.start, end: r.end, text: r.title, output: r.output || '', raid: r.raid }); stats.added++; }
  for (const m of later.reminders) { c = P.addReminder(c, { at: `${m.date}T${m.time}:00`, text: m.title, action: m.action || '' }); stats.added++; }
  return { content: c.replace(/\n{3,}/g, '\n\n'), stats };
}

// 檢查：跟團戰撞時間、排在放假日、日期不在這週
// 同一個時段本來就可以不只一件事（邊等編譯邊回信）；只有跟 📯 團戰（會議）撞到才提醒——開會的時候做不了別的
function checks(d, { offDay = null, raids = [] } = {}) {
  const out = [];
  const byDay = {};
  for (const r of live(d.rows).filter((x) => !x.canceled)) (byDay[r.date] = byDay[r.date] || []).push(r);
  for (const rows of Object.values(byDay)) {
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const ae = a.end || plusMin(a.start, 30), be = b.end || plusMin(b.start, 30);
      if ((a.raid || b.raid) && a.start < be && b.start < ae && (rowState(a) || rowState(b))) out.push({ ids: [a.id, b.id], text: `${dayLabel(a.date)} ${a.start}「${a.title}」和團戰「${(a.raid ? a : b).title}」撞時間` }); // 原本就撞的不再囉嗦
    }
  }
  for (const r of live(d.rows).filter((x) => !x.canceled && !x.raid && rowState(x))) { // 自己建的團戰（不在計畫檔裡）
    const x = raids.find((b) => b.date === r.date && b.start < (r.end || plusMin(r.start, 30)) && r.start < (b.end || plusMin(b.start, 60)));
    if (x) out.push({ ids: [r.id], text: `${dayLabel(r.date)} ${r.start}「${r.title}」和團戰「${x.title}」撞時間` });
  }
  const qs = live(d.quests);
  // 🕘 排進時刻簿的時段在委託截止日之後：來不及
  for (const r of live(d.rows).filter((x) => !x.canceled)) {
    const L = linkOf(r.title, qs);
    const q = L && qs.find((x) => x.id === L.qid);
    if (q && q.due && r.date > q.due && (rowState(r) || questState(q))) out.push({ ids: [r.id, q.id], text: `${dayLabel(r.date)}「${r.title}」排在截止日（${dayLabel(q.due)}）之後` });
  }
  const dates = [...new Set([...live(d.rows).map((r) => r.date), ...live(d.reminders).map((m) => m.date), ...qs.map((q) => q.due).filter(Boolean)])];
  for (const date of dates) {
    const off = offDay ? offDay(date) : null;
    const who = [...live(d.rows).filter((r) => r.date === date && rowState(r)), ...qs.filter((q) => q.due === date && questState(q))];
    if (!who.length) continue;
    if (off && off.off && off.kind !== 'weekend') out.push({ ids: who.map((x) => x.id), text: `${dayLabel(date)} 是${off.name}，排了「${who[0].title}」` });
    if (date < d.week.start || date > addDays(d.week.start, 6)) out.push({ ids: who.map((x) => x.id), text: `${dayLabel(date)} 不在這一週（${d.week.label}）` });
  }
  return out;
}

// 給畫面看的草稿（不含 history）；每一項多一個 st：new／dirty／del／''（原本的、沒改）
// 時段多 link（屬於哪個委託、哪個步驟）和 lane／lanes（時刻簿並排）；raids＝自己建的團戰（只顯示，一起排並排）
function view(d, { offDay = null, today = null, raids = [] } = {}) {
  if (!d) return null;
  const days = [];
  const last = [...live(d.rows).map((r) => r.date), ...live(d.reminders).map((m) => m.date), ...raids.map((r) => r.date)].filter((x) => x <= addDays(d.week.start, 6)).sort().pop() || '';
  const n = last > addDays(d.week.start, 4) ? Math.min(7, Math.round((new Date(`${last}T00:00:00`) - new Date(`${d.week.start}T00:00:00`)) / 86400000) + 1) : 5;
  for (let i = 0; i < n; i++) {
    const date = addDays(d.week.start, i);
    const off = offDay ? offDay(date) : null;
    const theme = d.themes[date] === undefined ? '' : d.themes[date];
    days.push({ date, label: dayLabel(date), theme, themeSt: theme === (d.themeOrig[date] || '') ? '' : !d.themeOrig[date] ? 'new' : !theme ? 'del' : 'dirty', themeWas: d.themeOrig[date] || '', off: off && off.off && off.kind !== 'weekend' ? off.name : '' });
  }
  const strip = (x) => { const { orig, ...rest } = x; return rest; };
  const qs = live(d.quests);
  const rows = d.rows.map((r) => {
    const L = linkOf(r.title, qs);
    const q = L && qs.find((x) => x.id === L.qid);
    const s = q && L.step ? q.steps.find((x) => norm(x.text) === norm(L.step)) : null;
    return { ...strip(r), st: rowState(r), was: r.orig ? { date: r.orig.date, start: r.orig.start, title: r.orig.title } : null, link: L ? { ...L, stepDone: !!(s && s.done), hasStep: !!s } : null };
  });
  const ext = raids.map((x, i) => ({ ...x, id: `x${i}` }));
  const lanes = {};
  for (const date of new Set([...rows.map((r) => r.date), ...ext.map((x) => x.date)])) Object.assign(lanes, layoutDay([...rows.filter((r) => r.date === date && r.start), ...ext.filter((x) => x.date === date)].map((x) => ({ key: x.id, start: x.start, end: x.end }))));
  for (const r of [...rows, ...ext]) Object.assign(r, lanes[r.id] || { lane: 0, lanes: 1 });
  const quests = d.quests.map((q) => {
    const mine = rows.filter((r) => !r.del && r.link && r.link.qid === q.id);
    return { ...strip(q), st: questState(q), was: q.orig ? { title: q.orig.title, due: q.orig.due } : null, reason: q.orig ? q.orig.reason : '', implicit: q.orig ? q.orig.implicit : false, doneSelf: q.orig ? q.orig.done : undefined, key: q.orig ? q.orig.key : null, slots: mine.length, slotDates: [...new Set(mine.map((r) => r.date))].sort() };
  });
  return {
    week: { ...d.week, name: today ? weekName(d.week.start, today) : d.week.label },
    quests, rows, raids: ext,
    reminders: d.reminders.map((m) => ({ ...strip(m), st: remState(m) })),
    themes: d.themes, unsure: d.unsure,
    log: d.log.slice(-30).map((l) => ({ id: l.id, said: l.said, at: l.at, by: l.by, pending: l.pending, text: l.text, edit: !!l.edit, ids: l.ids || [] })),
    days, summary: summary(d), checks: checks(d, { offDay, raids }), changes: changes(d),
    canUndo: !!(d.history && d.history.length),
    count: live(d.quests).length + live(d.rows).length + live(d.reminders).length + Object.values(d.themes).filter(Boolean).length + d.unsure.length,
    pending: d.log.filter((l) => l.pending).length,
  };
}

module.exports = {
  WD, TIER_NAME, weekOf, weekAt, weekName, mondayOf, needAsk, defaultWhich, findDay, resolveDay, findTime, normTime, ruleExtract, splitUnits, cleanText, isChatter,
  isEnough, findSteps, seqSteps, stepText, looksLikeEdit, isEditStrong, ruleEdit, ruleConfident, needsAI, checkAI,
  EXTRACT_SCHEMA, EXTRACT_SYSTEM, extractUser, normalizeAI, toAIItems, EDIT_SCHEMA, EDIT_SYSTEM, editUser, indexText, applyEdits,
  blank, upgrade, snapshot, undo, addItems, removeLog, removeItem, restoreItem, wipe, editItem, resolveUnsure, findItem, findQuest, itemsText, summary, checks,
  questState, rowState, remState, changes, syncPlan, toMarkdown, applyToContent, view, dayLabel, addDays, validISO, validHM, live,
  linkOf, linkTitle, layoutDay, parseStepLines, freeSegments, splitPlan, applySplit, SPLIT_UNITS, STEPS_SCHEMA, STEPS_SYSTEM, stepsUser, normalizeSteps,
};
