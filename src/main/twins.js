// 🐰 棉棉和朵朵出場：攤位以外，她們也會自己跑來櫃台（純函式，不碰檔案）
//   ☕ 下午茶外送：每天下午三點左右送奶茶給艾琳（一天一次；算艾琳收到一份心意，好感 +2，受每日上限）
//   🎉 慶祝道賀：升級、連續上工里程碑、整週委託全部完成 → 送「免費抽卡券」（一次最多 3 張）
//   🔖 存錢許願單：在雜貨舖請朵朵把想要的東西「留著」（最多 3 個），金幣存夠了她們跑來說
//   🌌 抽卡演出：畫面那邊做（renderer/twins.js），這裡只有台詞
// 她們不是艾琳：不套艾琳的口吻規則，叫對方「客人」；只有 ERIN_TEA（艾琳收到奶茶後小聲說的話）要照艾琳的口吻
// 出場排隊存在 state.twins.queue，畫面有空（沒在說話、沒開面板、不是專注或縮小）時才拿出來演
'use strict';

const DEFAULTS = { enabled: true, tea: true, teaFrom: '15:00', teaUntil: '17:00', teaAffection: 2, congrats: true, wish: true, wishMax: 3, maxTickets: 3 };
const NAMES = { mian: '棉棉', duo: '朵朵' };

// 每一種出場的台詞（幾組挑一組）；{item} {price} {level} {title} {days} {n} 會換掉
const SCRIPTS = {
  tea: [
    [['duo', '外送～！雲朵茶舖的下午茶來囉！'], ['mian', '今天也是「剛剛好多一點點」的甜度。艾琳，趁熱喝吧。']],
    [['mian', '打擾了。三點的奶茶，送到三號櫃台。'], ['duo', '杯套上的貓耳朵是朵朵畫的喔！今天畫得特別圓～']],
    [['duo', '叮咚～艾琳的第三杯……不對，第四杯奶茶！'], ['mian', '……朵朵，不要幫客人數杯數。'], ['duo', '客人也要記得喝水喔！']],
    [['mian', '下午茶時間到了。今天茶舖試了新的茶葉，請艾琳幫忙嚐嚐看。'], ['duo', '朵朵已經偷喝過了！很好喝！']],
    [['duo', '跑過來的時候差點灑出來……還好朵朵耳朵有平衡！'], ['mian', '耳朵沒有那種功能。……請慢用。']],
  ],
  level: [
    [['duo', '恭喜客人升到 Lv.{level}！朵朵在攤位那邊就看到星圖亮了～'], ['mian', '「{title}」，很好聽的稱號。這是雲朵雜貨舖的一點心意：抽卡券 ×{n}。']],
    [['mian', '聽說客人升級了，Lv.{level}。恭喜。'], ['duo', '朵朵帶了賀禮！抽卡券 ×{n}，來攤位抽抽看吧～']],
  ],
  streak: [
    [['duo', '連續上工 {days} 天！客人好認真，朵朵都記在攤位的小黑板上了！'], ['mian', '持續下去不容易。這是賀禮：抽卡券 ×{n}。']],
    [['mian', '{days} 天，每天都有來公會呢。'], ['duo', '所以朵朵和姊姊決定送抽卡券 ×{n}！不可以說不要喔～']],
  ],
  allclear: [
    [['duo', '這週的委託全部完成了？！客人太厲害了吧！'], ['mian', '辛苦了。週末好好休息……這個先收著：抽卡券 ×{n}。']],
    [['mian', '委託板上，客人的那一欄全部蓋滿章了。'], ['duo', '朵朵偷看到艾琳在櫃台偷偷拍手喔！賀禮是抽卡券 ×{n}～']],
  ],
  many: [
    [['duo', '客人今天好多好事！{what}！'], ['mian', '一起慶祝吧。賀禮：抽卡券 ×{n}。']],
  ],
  wish: [
    [['duo', '客人客人！上次請朵朵留著的「{item}」，金幣夠了喔！'], ['mian', '{price} 金幣。要現在帶走，還是再存一下都可以。']],
    [['mian', '打擾一下。客人想要的「{item}」，我們一直幫你留著。'], ['duo', '現在錢包裡的金幣已經夠了～要不要來看看？']],
  ],
  wishMany: [
    [['duo', '客人留著的東西，{item}……全部都買得起了！'], ['mian', '慢慢挑吧，我們都幫你留著。']],
  ],
};
// 攤位裡的台詞（shop.js 的 TWINS 以外，這次新增的）
const STALL = {
  wishSet: [['duo', '收到！「{item}」朵朵幫你留著，金幣存夠了朵朵會去叫你～'], ['mian', '幫你留著了。存夠了我們會去櫃台說一聲。']],
  wishOff: [['mian', '好的，不用留了。'], ['duo', '咦，不要了嗎？那朵朵放回架子上囉～']],
  wishFull: [['mian', '已經留了三樣了……先帶走一樣，或是取消一樣再來吧。']],
  ticket: [['duo', '用抽卡券抽一張！朵朵幫你洗牌～'], ['duo', '抽卡券收到！這張是免費的，手氣一定很好！']],
  noTicket: [['mian', '抽卡券用完了喔。升級或是連續上工的時候，我們會再送來。']],
};
// 艾琳收到奶茶後在頭旁邊小聲說的話（艾琳的口吻：自稱艾琳、叫冒險者）
const ERIN_TEA = {
  low: ['謝謝棉棉、朵朵～冒險者也休息一下吧？', '三點的奶茶來了！艾琳最喜歡這個時間了～', '暖暖的……冒險者也喝點什麼吧！'],
  mid: ['有奶茶就有力氣了！冒險者，下半場一起加油～', '嘿嘿，今天的貓耳朵畫得好圓。冒險者要看嗎？', '冒險者也來一口？……開玩笑的，杯子只有一個嘛。'],
  high: ['跟冒險者一起的下午茶時間，是艾琳一天裡最喜歡的時候。', '甜度剛剛好多一點點……跟今天一樣。冒險者也辛苦了。', '艾琳偷偷跟朵朵說過，明天想要兩杯——一杯給冒險者。'],
};

const fill = (s, data) => String(s).replace(/\{(\w+)\}/g, (_, k) => (data[k] === undefined ? '' : String(data[k])));
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
const mm = (hhmm) => { const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

function cfg(config) { return { ...DEFAULTS, ...((config && config.twins) || {}) }; }
function blank(level = 1) { return { queue: [], seq: 0, teaDay: '', level, wish: [], wishReady: {} }; }

// 下午茶該不該來：時段內、今天還沒來過、平日（作息設定只算平日時）
function teaDue(tw, now, { from = DEFAULTS.teaFrom, until = DEFAULTS.teaUntil, weekdaysOnly = true, today } = {}) {
  const t = now.getHours() * 60 + now.getMinutes();
  const a = mm(from), b = mm(until);
  if (a === null || b === null || t < a || t >= b) return false;
  if (weekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return false;
  return tw.teaDay !== today;
}

function lines(script, data) { return script.map(([who, text]) => ({ who, name: NAMES[who], text: fill(text, data) })); }

// 做一次出場：kind＝tea／congrats／wish
//   congrats 的 data：{ level, title, levels（升了幾級）, streak（天數）, allclear }，抽卡券張數照事件算
function build(kind, data = {}, rnd = Math.random) {
  if (kind === 'tea') return { kind, lines: lines(pick(SCRIPTS.tea, rnd), data), actions: [] };
  if (kind === 'wish') {
    const items = data.items || [];
    const one = items.length === 1;
    const script = one ? pick(SCRIPTS.wish, rnd) : pick(SCRIPTS.wishMany, rnd);
    return { kind, items, lines: lines(script, { item: items.map((x) => x.name).join('、'), price: one ? items[0].price : '' }), actions: [{ id: 'shop', label: one ? `🛒 去看「${items[0].name}」` : '🛒 去看看', gold: true }, { id: 'later', label: '再存一下' }] };
  }
  // 道賀：抽卡券＝每升一級 1 張、連續上工里程碑 1 張（30 天以上 2 張）、整週全部完成 1 張；一次最多 maxTickets
  const n = Math.min(data.maxTickets || DEFAULTS.maxTickets,
    (data.levels || 0) + (data.streak ? (data.streak >= 30 ? 2 : 1) : 0) + (data.allclear ? 1 : 0)) || 1;
  const what = [data.levels ? `升到 Lv.${data.level}` : '', data.streak ? `連續上工 ${data.streak} 天` : '', data.allclear ? '這週的委託全部完成' : ''].filter(Boolean);
  const key = what.length > 1 ? 'many' : data.levels ? 'level' : data.streak ? 'streak' : 'allclear';
  return { kind: 'congrats', tickets: n, data, lines: lines(pick(SCRIPTS[key], rnd), { ...data, days: data.streak, n, what: what.join('、') }), actions: [{ id: 'draw', label: '🌌 去抽卡', gold: true }, { id: 'ok', label: '收下了' }] };
}

// 道賀合併：還沒演出來的那一次，把新的事件加進去（不會一下來三次）
function mergeCongrats(a = {}, b = {}) {
  return {
    level: Math.max(a.level || 0, b.level || 0) || undefined, title: b.title || a.title,
    levels: (a.levels || 0) + (b.levels || 0), streak: Math.max(a.streak || 0, b.streak || 0) || undefined, allclear: !!(a.allclear || b.allclear),
  };
}

// 許願單：哪幾個現在買得起、而且還沒通知過；買不起的把「通知過」清掉（之後存夠了會再說一次）
//   priceOf(id) → { name, price } 或 null（已經買了、不賣了）
function wishCheck(tw, gold, priceOf) {
  const ready = [];
  tw.wishReady = tw.wishReady || {};
  tw.wish = (tw.wish || []).filter((id) => priceOf(id)); // 已經擁有的裝飾自動拿掉
  for (const id of tw.wish) {
    const it = priceOf(id);
    if (gold >= it.price) { if (!tw.wishReady[id]) { tw.wishReady[id] = true; ready.push({ id, name: it.name, price: it.price }); } }
    else delete tw.wishReady[id];
  }
  for (const id of Object.keys(tw.wishReady)) if (!tw.wish.includes(id)) delete tw.wishReady[id];
  return ready;
}

function stallLine(key, data = {}, rnd = Math.random) {
  const [who, text] = pick(STALL[key], rnd);
  return { who, name: NAMES[who], text: fill(text, data) };
}
function erinTea(tier, rnd = Math.random) { return pick(ERIN_TEA[tier] || ERIN_TEA.low, rnd); }

module.exports = { DEFAULTS, NAMES, SCRIPTS, STALL, ERIN_TEA, cfg, blank, teaDue, build, mergeCongrats, wishCheck, stallLine, erinTea };
