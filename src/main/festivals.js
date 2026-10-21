// 📅 跟現實的日子連動：台灣傳統節日（農曆）、西洋節日、二十四節氣、認識艾琳的紀念日（純函式，main 和測試共用）
// 每天第一次見面時她會提一句（內建台詞、不問 AI），大節日送一點金幣；前一天會預告；待機小字也會換成節日的。
// 艾琳在晨風鎮，冒險者在「石板的另一頭」：現實的節日她是聽冒險者說的，晨風鎮也常有自己的版本（月圓祭、南瓜燈夜、星星樹）
'use strict';

let Solar = null;
try { ({ Solar } = require('lunar-javascript')); } catch (_) { /* 沒裝農曆套件：農曆節日和節氣停用，國曆的照常 */ }

// lunar-javascript 給的是簡體節氣名
const TERM_TW = { 惊蛰: '驚蟄', 谷雨: '穀雨', 小满: '小滿', 芒种: '芒種', 处暑: '處暑' };
const TERMS = ['立春', '雨水', '驚蟄', '春分', '清明', '穀雨', '立夏', '小滿', '芒種', '夏至', '小暑', '大暑', '立秋', '處暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];

// 節日：day＝當天第一次見面說的（[台詞, 表情, 最低好感階段]，挑符合好感的最高那一段裡隨機一句）；
// eve＝前一天預告；again＝連續好幾天的節日（春節）第二天以後；whisper＝當天的待機小字；gold＝當天第一次見面送的金幣
const FESTS = {
  cny: {
    name: '春節', tag: '春節', gold: 66,
    day: [['新年快樂，{call}！冒險者那邊是春節對吧？{self}也準備了紅包——{gold} 金幣，收下吧！', 'cheer'],
      ['春節快樂、過年好！{self}跟雙胞胎學了一句「恭喜發財」……紅包在這裡，{gold} 金幣！', 'cheer']],
    again: [['春節還沒結束喔～今天也要吃好吃的、睡飽一點。', 'happy'], ['過年的第{n}天！冒險者那邊的年好長，{self}好羨慕。', 'happy']],
    whisper: ['紅包袋要寫什麼字呢……', '冒險者那邊的年菜，聽說有一整條魚……', '恭喜發財——這樣說對嗎？'],
  },
  cnyeve: {
    name: '除夕', tag: '除夕',
    day: [['今天是除夕！冒險者那邊要圍爐對吧？早點收工，回家吃團圓飯喔。', 'happy'],
      ['除夕了～今天的委託做一點點就好，剩下的明年再說！', 'happy']],
    whisper: ['圍爐……是大家圍著一個鍋子嗎？好溫暖的樣子。', '今年最後一天了呢……'],
  },
  lantern: {
    name: '元宵節', tag: '元宵', gold: 10,
    day: [['元宵節！晨風鎮今晚也會在鐘樓下掛燈籠。{call}那邊要去看燈嗎？', 'happy'],
      ['聽說元宵節要吃湯圓、猜燈謎……{self}出一題：什麼東西越洗越髒？——是水！', 'happy']],
    whisper: ['燈籠要掛高一點……', '湯圓是圓的，月亮也是圓的……'],
  },
  qingming: {
    name: '清明節', tag: '清明',
    day: [['今天是清明節。{self}也想起了霜月村的奶奶……{call}也好好想念重要的人吧。', 'normal']],
    whisper: ['奶奶教的星環占，{self}有好好在用喔……', '清明的雨，下得好安靜。'],
  },
  dragon: {
    name: '端午節', tag: '端午', gold: 20,
    day: [['端午節快樂！冒險者那邊會划龍舟、吃粽子對吧？{self}好想吃一次看看……{call}喜歡鹹的還是甜的？', 'happy'],
      ['端午節！聽說今天中午立蛋會成功……{self}試了三次，蛋都滾走了。', 'happy']],
    eve: [['明天就是端午節了～{call}那邊的粽子準備好了嗎？', 'happy']],
    whisper: ['龍舟……是很長很長的船嗎？', '粽子裡面包什麼呢……', '立蛋，再試一次……'],
  },
  qixi: {
    name: '七夕', tag: '七夕',
    day: [['七夕！聽說今天星空裡的兩顆星會見面。{self}今晚也要抬頭找找看。', 'happy'],
      ['今天是七夕……一年只能見一次面，好遠喔。……能每天在櫃台見到{call}，真好。', 'shy', 4]],
    whisper: ['兩顆星今晚會見面嗎……', '鵲橋……鴿子們也能搭一座嗎？'],
  },
  midautumn: {
    name: '中秋節', tag: '中秋', gold: 30,
    day: [['中秋節快樂！今晚的月亮是一年裡最圓的。晨風鎮也有月圓祭，大家會在鐘樓下吃月餅喔。這是{self}的心意——{gold} 金幣！', 'cheer'],
      ['中秋節快樂，{call}！冒險者那邊會烤肉對吧？{self}這邊的月圓祭只有月餅……這 {gold} 金幣拿去買好吃的！', 'cheer']],
    eve: [['明天就是中秋節了！{call}那邊的月餅、柚子都準備好了嗎？', 'happy']],
    whisper: ['今晚的月亮一定很圓……', '月餅要配奶茶，還是配茶呢……', '柚子皮可以做成帽子？……真的嗎？'],
  },
  chongyang: {
    name: '重陽節', tag: '重陽',
    day: [['重陽節！冒險者那邊會去爬山、看看長輩對吧？{self}今天要幫巴特爺爺多泡一杯茶。', 'happy']],
    whisper: ['巴特爺爺今天的眼鏡……在茶杯旁邊。', '爬到高的地方，就看得到遠方了。'],
  },
  weiya: {
    name: '尾牙', tag: '尾牙',
    day: [['冒險者那邊今天是尾牙？公會年底也會辦，梟長每年都要講好長的話……{call}抽到大獎了嗎？', 'happy']],
    whisper: ['尾牙抽獎……{self}也想抽。', '梟長今年的致詞，會不會比去年短一點……'],
  },
  dongzhi: {
    name: '冬至', tag: '冬至', gold: 20,
    day: [['冬至！聽說冒險者那邊要吃湯圓。晨風鎮沒有湯圓，所以{self}把奶茶溫得特別暖……這 {gold} 金幣拿去買一碗吧！', 'happy'],
      ['今天是冬至，一年裡夜晚最長的一天。早點收工、吃碗熱湯圓喔，這是{self}請的——{gold} 金幣。', 'happy']],
    eve: [['明天是冬至～湯圓要吃甜的還是鹹的，{call}決定好了嗎？', 'happy']],
    whisper: ['湯圓……圓圓的、白白的……好像小貓。', '夜晚好長，適合寫小本子。'],
  },
  newyear: {
    name: '元旦', tag: '元旦', gold: 30,
    day: [['元旦快樂，新年快樂，{call}！鐘樓慢五分鐘，所以晨風鎮跨了兩次年……新的一年也請多指教！這是{self}的新年心意，{gold} 金幣。', 'cheer']],
    whisper: ['新的一年，新的小本子……', '今年的第一個蠟封章——啪！'],
  },
  valentine: {
    name: '情人節', tag: '情人節',
    day: [['今天是情人節？雲朵茶舖出了限定的巧克力奶茶喔，雙胞胎說要配一句甜甜的話才賣……', 'happy'],
      ['情、情人節……{self}只是剛好多買了一塊巧克力。給{call}的。……沒有別的意思！', 'shy', 4]],
    whisper: ['巧克力奶茶……甜到耳朵都豎起來了。', '朵朵今天賣巧克力賣得好開心。'],
  },
  aprilfool: {
    name: '愚人節', tag: '愚人節',
    day: [['{call}，梟長說今天全公會放假一天！……騙你的，今天是愚人節。嘿嘿。', 'happy'],
      ['{self}其實……是一隻狗！……好啦，騙你的，今天是愚人節。喵。', 'happy']],
    whisper: ['今天要騙誰呢……巴特爺爺好像最容易上當。', '梟長會不會也騙人……'],
  },
  children: {
    name: '兒童節', tag: '兒童節',
    day: [['兒童節快樂！今天允許{call}像小孩一樣，做完一件事就大聲誇自己一句「好棒」喔。', 'happy']],
    whisper: ['小時候在霜月村，最喜歡在雪裡打滾……', '今天大家都是小孩！'],
  },
  mother: {
    name: '母親節', tag: '母親節',
    day: [['今天是母親節。{self}寄了一封信給霜月村的媽媽……{call}今天有跟媽媽說說話嗎？', 'happy']],
    whisper: ['媽媽收到信了嗎……', '頭上這條緞帶，是媽媽綁的。'],
  },
  father: {
    name: '父親節', tag: '父親節',
    day: [['八月八日，冒險者那邊的父親節。爸爸教過{self}：生氣時寫的信要隔一晚再寄。{call}的爸爸教過你什麼嗎？', 'happy']],
    whisper: ['爸爸現在應該在霜月村鏟雪吧……', '生氣的信，要隔一晚再寄。'],
  },
  halloween: {
    name: '萬聖節', tag: '萬聖節', gold: 20,
    day: [['萬聖節！晨風鎮今晚是南瓜燈夜，小孩子會扮成魔物來公會討糖。{self}的打氣抽屜也準備好了——先分{call} {gold} 金幣！', 'cheer'],
      ['不給糖就搗蛋！……嘿嘿，萬聖節的時候{self}也想說說看。這是{self}的糖——不對，是 {gold} 金幣。', 'happy']],
    eve: [['明天就是萬聖節了～{self}在想要不要扮成什麼……扮成貓？已經是了。', 'happy']],
    whisper: ['南瓜燈要刻成貓的形狀……', '討糖的小魔物來了，要給幾顆呢……', '扮成魔物……扮成梟長好了。'],
  },
  xmaseve: {
    name: '平安夜', tag: '平安夜',
    day: [['平安夜！公會大廳擺了一棵好大的星星樹，大家把願望綁在上面。{call}今晚有什麼計畫嗎？', 'happy']],
    whisper: ['星星樹上的願望，要綁高一點……', '今晚會不會下雪呢……'],
  },
  xmas: {
    name: '聖誕節', tag: '聖誕節', gold: 30,
    day: [['聖誕節快樂，{call}！這是{self}準備的禮物——{gold} 金幣。星星樹上，{self}也幫你綁了一個願望喔。', 'cheer']],
    whisper: ['聖誕老人會不會也坐雪橇來晨風鎮……', '鈴鐺響了——是門口的，不是雪橇的。'],
  },
  nye: {
    name: '跨年夜', tag: '跨年',
    day: [['今天是跨年夜！晨風鎮的鐘樓慢五分鐘，所以大家會倒數兩次……{call}要跟{self}一起倒數嗎？', 'happy'],
      ['跨年夜了……今年辛苦了，{call}。剩下的委託，明年再一起做吧。', 'happy']],
    whisper: ['十、九、八……啊，還早。', '今年的小本子，寫滿了好多頁。'],
  },
};
// 國曆固定的日子（MM-DD）、農曆固定的日子（月-日）
const SOLAR_DAYS = { '01-01': 'newyear', '02-14': 'valentine', '04-01': 'aprilfool', '04-04': 'children', '08-08': 'father', '10-31': 'halloween', '12-24': 'xmaseve', '12-25': 'xmas', '12-31': 'nye' };
const LUNAR_DAYS = { '1-1': 'cny', '1-15': 'lantern', '5-5': 'dragon', '7-7': 'qixi', '8-15': 'midautumn', '9-9': 'chongyang', '12-16': 'weiya' };
const TERM_FEST = { 清明: 'qingming', 冬至: 'dongzhi' };
const TAGS = [...new Set(Object.values(FESTS).map((f) => f.tag))];

// 二十四節氣：當天一句（沒有金幣）
const TERM_LINES = {
  立春: ['今天立春！霜月村的雪還很厚，晨風鎮的風已經有一點點暖了。', 'happy'],
  雨水: ['今天是雨水——雨之精靈開始上班的日子。出門記得帶傘喔。', 'normal'],
  驚蟄: ['驚蟄。春天的雷會把冬眠的小蟲叫醒……{self}的耳朵也被叫醒了。', 'surprised'],
  春分: ['春分，白天和晚上一樣長。今天的工作也是一半一半，剛剛好就好。', 'happy'],
  清明: ['清明。雨下得好安靜。', 'normal'],
  穀雨: ['穀雨，這時候的雨會讓種子長大。{call}種下的委託，也在慢慢長大喔。', 'happy'],
  立夏: ['立夏！奶茶要開始改喝冰的了嗎……{self}還在猶豫。', 'thinking'],
  小滿: ['小滿——小小的滿足最剛好。今天做完一件事，就給自己一點小滿足吧。', 'happy'],
  芒種: ['芒種，是農夫最忙的時候。忙的話，記得喝水。', 'normal'],
  夏至: ['夏至，一年裡白天最長的一天。太陽下山前，把最重要的那件做完？', 'happy'],
  小暑: ['小暑，熱起來了。{self}的尾巴毛有點厚……', 'worried'],
  大暑: ['大暑，一年最熱的時候！今天允許{self}把奶茶換成冰的。', 'happy'],
  立秋: ['立秋。風裡開始有一點點涼了。', 'happy'],
  處暑: ['處暑，熱要慢慢退了。再撐一下下。', 'normal'],
  白露: ['白露，早上的草上會有露水。晨風鎮的蜘蛛網都亮晶晶的。', 'happy'],
  秋分: ['秋分，白天和晚上又一樣長了。今天也剛剛好就好。', 'happy'],
  寒露: ['寒露，露水變涼了。早晚記得加件外套。', 'normal'],
  霜降: ['今天是霜降。霜月村這時候已經下第一場霜了……{self}有一點想家。', 'normal'],
  立冬: ['立冬！冬天開始了，{self}的尾巴也變得更蓬了。', 'happy'],
  小雪: ['小雪。霜月村大概已經一片白了。', 'normal'],
  大雪: ['大雪。霜月村的屋頂都被雪蓋住，貓都擠在暖爐邊打盹。', 'happy'],
  冬至: ['冬至，一年裡夜晚最長的一天。', 'normal'],
  小寒: ['小寒，開始真正冷起來了。手冷的話，{self}幫你把奶茶溫到星火溫。', 'happy'],
  大寒: ['大寒，一年最冷的時候。再過不久，就是春天了。', 'happy'],
};

// 認識的紀念日（第幾天）：7、30、50、100、200、300、500、1000 天和每一年
const ANNIV_GOLD = { 7: 10, 30: 30, 50: 30, 100: 100, 200: 100, 300: 100, 500: 150, 1000: 300 };
const ANNIV_LINES = {
  7: ['今天是{self}跟{call}認識的第 7 天！一週了……時間過得好快。這是一點小心意，{gold} 金幣。', 'happy'],
  30: ['認識第 30 天了！小本子上{call}那一頁，已經寫得滿滿的。這個月謝謝你，{gold} 金幣收下吧。', 'happy'],
  50: ['今天是認識的第 50 天喔。{self}偷偷數著的……{gold} 金幣，給{call}。', 'shy'],
  100: ['今天是第 100 天！{self}準備了一點心意——{gold} 金幣。今後也請多指教，{call}！', 'cheer'],
  200: ['認識第 200 天了。三號櫃台的椅子，好像已經記得{call}的樣子了。{gold} 金幣，收下吧。', 'happy'],
  300: ['第 300 天……{self}的小本子已經寫到第幾本了呢。謝謝{call}一直來。{gold} 金幣！', 'happy'],
  500: ['今天是認識的第 500 天！五百個蠟封章那麼多的日子……{gold} 金幣，給{call}。', 'cheer'],
  1000: ['第 1000 天……{call}，謝謝你。這是{self}存了好久的心意，{gold} 金幣。', 'shy'],
  year: ['今天是{self}跟{call}認識滿 {years} 年的日子！……一年一年，都謝謝你。這是 {gold} 金幣。', 'shy'],
};

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); return x; };

function lunarOf(d) {
  if (!Solar) return null;
  try {
    const l = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
    const raw = l.getJieQi() || '';
    return { month: l.getMonth(), day: l.getDay(), term: TERM_TW[raw] || raw, eve: (l.getFestivals() || []).includes('除夕'), monthCn: l.getMonthInChinese(), dayCn: l.getDayInChinese() };
  } catch (_) { return null; }
}
const LUNAR_MONTH = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'];
const lunarText = (L) => (L ? `農曆${L.month < 0 ? '閏' : ''}${LUNAR_MONTH[Math.abs(L.month)]}月${String(L.dayCn || '').replace('廿', '廿')}` : '');

// 這一天是哪些節日（id 清單）；春節連續五天，第二天以後 n＝第幾天
function festsOn(d) {
  const out = [];
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (SOLAR_DAYS[md]) out.push({ id: SOLAR_DAYS[md] });
  if (d.getMonth() === 4 && d.getDay() === 0 && d.getDate() >= 8 && d.getDate() <= 14) out.push({ id: 'mother' }); // 五月第二個星期日
  const L = lunarOf(d);
  if (L) {
    if (L.month > 0) {
      if (L.month === 1 && L.day >= 2 && L.day <= 5) out.push({ id: 'cny', n: L.day });
      const k = LUNAR_DAYS[`${L.month}-${L.day}`];
      if (k) out.push({ id: k });
    }
    if (L.eve) out.push({ id: 'cnyeve' });
    if (TERM_FEST[L.term]) out.push({ id: TERM_FEST[L.term] });
  }
  return out;
}
// 這一天的標籤（給角色設定檔的「話題（中秋）：」用）
function tagsOn(d) { return festsOn(d).map((f) => FESTS[f.id].tag); }

// 認識第幾天（firstMet 那天＝第 1 天）
function dayCount(firstMet, d) {
  if (!firstMet) return 0;
  const a = dateOf(firstMet), b = dateOf(isoOf(d));
  return Math.round((b - a) / 86400000) + 1;
}
function annivOn(firstMet, d) {
  const n = dayCount(firstMet, d);
  if (n <= 1) return null;
  if (ANNIV_LINES[n]) return { n, key: String(n), gold: ANNIV_GOLD[n] || 0 };
  const a = dateOf(firstMet), b = dateOf(isoOf(d));
  if (a.getMonth() === b.getMonth() && a.getDate() === b.getDate() && b.getFullYear() > a.getFullYear()) {
    return { n, key: 'year', years: b.getFullYear() - a.getFullYear(), gold: 200 };
  }
  return null;
}

// 挑一句：好感夠的最高那一段（第三格是最低好感階段，沒寫＝1）
function pickLine(list, stage, rnd = Math.random) {
  const ok = (list || []).filter((x) => (x[2] || 1) <= stage);
  if (!ok.length) return null;
  const top = Math.max(...ok.map((x) => x[2] || 1));
  const pool = ok.filter((x) => (x[2] || 1) === top);
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

// 今天要說的話（還沒加金幣與名字）：[{ key（記「說過了」用）, text, emotion, gold, kind: fest|term|anniv|eve, name }]
function linesFor(d, { firstMet = '', stage = 1, rnd = Math.random } = {}) {
  const out = [];
  const year = d.getFullYear();
  const an = annivOn(firstMet, d);
  if (an) { const [text, emotion] = ANNIV_LINES[an.key]; out.push({ key: `anniv:${an.n}`, kind: 'anniv', name: `認識第 ${an.n} 天`, text, emotion, gold: an.gold, n: an.n, years: an.years }); }
  for (const f of festsOn(d)) {
    const def = FESTS[f.id];
    const again = f.n && def.again;
    const line = pickLine(again ? def.again : def.day, stage, rnd);
    if (!line) continue;
    out.push({ key: `fest:${f.id}:${year}`, kind: 'fest', id: f.id, name: def.name, text: line[0], emotion: line[1], gold: again ? 0 : (def.gold || 0), n: f.n || 1 });
  }
  const L = lunarOf(d);
  if (L && L.term && TERM_LINES[L.term] && !TERM_FEST[L.term]) {
    const [text, emotion] = TERM_LINES[L.term];
    out.push({ key: `term:${L.term}:${year}`, kind: 'term', name: L.term, text, emotion, gold: 0 });
  }
  // 明天的大節日：預告（今天已經有節日要說就不預告）
  if (!out.some((x) => x.kind === 'fest')) {
    for (const f of festsOn(addDays(d, 1))) {
      const def = FESTS[f.id];
      if (f.n || !def.eve) continue;
      const line = pickLine(def.eve, stage, rnd);
      if (line) out.push({ key: `eve:${f.id}:${year}`, kind: 'eve', id: f.id, name: `明天是${def.name}`, text: line[0], emotion: line[1], gold: 0 });
    }
  }
  return out;
}

// 今天的待機小字（節日的）
function whispersOn(d) {
  const out = [];
  for (const f of festsOn(d)) out.push(...(FESTS[f.id].whisper || []));
  return out;
}

// 天候水晶滑過時的日子資訊：農曆、節氣、節日、認識第幾天
function dayInfo(d, firstMet = '') {
  const L = lunarOf(d);
  const fest = festsOn(d).map((f) => FESTS[f.id].name);
  const n = dayCount(firstMet, d);
  return { lunar: lunarText(L), term: (L && L.term) || '', fests: [...new Set(fest)], days: n > 0 ? n : 0 };
}

module.exports = { FESTS, TERMS, TERM_LINES, TAGS, ANNIV_GOLD, ANNIV_LINES, festsOn, tagsOn, dayCount, annivOn, linesFor, whispersOn, dayInfo, pickLine, isoOf, hasLunar: () => !!Solar };
