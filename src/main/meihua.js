// 梅花易數：起卦（報數／時間）、本卦・互卦・變卦、體用與五行生剋
// 艾琳的「星環占」在介面上是魔法，實際上就是這套規則；純函式，不依賴 Electron
'use strict';

// 先天八卦數：乾1 兌2 離3 震4 巽5 坎6 艮7 坤8；lines 由下往上，1＝陽爻
const TRIGRAMS = {
  1: { n: 1, name: '乾', sym: '☰', nature: '天', el: '金', lines: [1, 1, 1] },
  2: { n: 2, name: '兌', sym: '☱', nature: '澤', el: '金', lines: [1, 1, 0] },
  3: { n: 3, name: '離', sym: '☲', nature: '火', el: '火', lines: [1, 0, 1] },
  4: { n: 4, name: '震', sym: '☳', nature: '雷', el: '木', lines: [1, 0, 0] },
  5: { n: 5, name: '巽', sym: '☴', nature: '風', el: '木', lines: [0, 1, 1] },
  6: { n: 6, name: '坎', sym: '☵', nature: '水', el: '水', lines: [0, 1, 0] },
  7: { n: 7, name: '艮', sym: '☶', nature: '山', el: '土', lines: [0, 0, 1] },
  8: { n: 8, name: '坤', sym: '☷', nature: '地', el: '土', lines: [0, 0, 0] },
};
const byLines = (l) => Object.values(TRIGRAMS).find((t) => t.lines.join('') === l.join(''));

// 64 卦：HEX[上卦][下卦] = [卦序, 卦名]
const HEX = {
  1: { 1: [1, '乾為天'], 2: [10, '天澤履'], 3: [13, '天火同人'], 4: [25, '天雷無妄'], 5: [44, '天風姤'], 6: [6, '天水訟'], 7: [33, '天山遯'], 8: [12, '天地否'] },
  2: { 1: [43, '澤天夬'], 2: [58, '兌為澤'], 3: [49, '澤火革'], 4: [17, '澤雷隨'], 5: [28, '澤風大過'], 6: [47, '澤水困'], 7: [31, '澤山咸'], 8: [45, '澤地萃'] },
  3: { 1: [14, '火天大有'], 2: [38, '火澤睽'], 3: [30, '離為火'], 4: [21, '火雷噬嗑'], 5: [50, '火風鼎'], 6: [64, '火水未濟'], 7: [56, '火山旅'], 8: [35, '火地晉'] },
  4: { 1: [34, '雷天大壯'], 2: [54, '雷澤歸妹'], 3: [55, '雷火豐'], 4: [51, '震為雷'], 5: [32, '雷風恆'], 6: [40, '雷水解'], 7: [62, '雷山小過'], 8: [16, '雷地豫'] },
  5: { 1: [9, '風天小畜'], 2: [61, '風澤中孚'], 3: [37, '風火家人'], 4: [42, '風雷益'], 5: [57, '巽為風'], 6: [59, '風水渙'], 7: [53, '風山漸'], 8: [20, '風地觀'] },
  6: { 1: [5, '水天需'], 2: [60, '水澤節'], 3: [63, '水火既濟'], 4: [3, '水雷屯'], 5: [48, '水風井'], 6: [29, '坎為水'], 7: [39, '水山蹇'], 8: [8, '水地比'] },
  7: { 1: [26, '山天大畜'], 2: [41, '山澤損'], 3: [22, '山火賁'], 4: [27, '山雷頤'], 5: [18, '山風蠱'], 6: [4, '山水蒙'], 7: [52, '艮為山'], 8: [23, '山地剝'] },
  8: { 1: [11, '地天泰'], 2: [19, '地澤臨'], 3: [36, '地火明夷'], 4: [24, '地雷復'], 5: [46, '地風升'], 6: [7, '地水師'], 7: [15, '地山謙'], 8: [2, '坤為地'] },
};

// 卦義（給 AI 參考與離線解讀用的簡短關鍵字），依卦序
const MEANING = {
  1: '剛健進取，自強不息', 2: '柔順包容，厚德載物', 3: '萬事起頭難，宜耐心打底', 4: '尚在摸索，虛心學習', 5: '時機未到，耐心等待',
  6: '容易起爭執，宜和解不宜硬碰', 7: '統整人力，講紀律', 8: '親近合作，找對夥伴', 9: '小有累積，暫時蓄力', 10: '如履虎尾，謹慎行事',
  11: '天地交泰，順利通達', 12: '閉塞不通，守正待時', 13: '志同道合，與人同心', 14: '豐收大有，保持謙和', 15: '謙虛得益',
  16: '安樂和順，提前準備', 17: '順勢而為，跟隨正道', 18: '整頓舊弊，除舊佈新', 19: '親臨督導，積極面對', 20: '先觀察再行動',
  21: '排除障礙，明快決斷', 22: '修飾外表，更要顧內涵', 23: '逐漸剝落，宜守不宜進', 24: '一陽來復，重新開始', 25: '真誠不妄動',
  26: '厚積實力，蓄勢待發', 27: '頤養身心，慎言節食', 28: '負荷過重，需要支撐', 29: '險難重重，守信方能過關', 30: '光明依附，互相照亮',
  31: '彼此感應，以誠相待', 32: '恆久持續，守住原則', 33: '適時退避，保存實力', 34: '聲勢壯盛，勿躁進', 35: '步步晉升，前景光明',
  36: '光明受損，韜光養晦', 37: '家人和睦，內部穩定', 38: '意見乖離，求同存異', 39: '前路艱難，宜求助他人', 40: '困難解除，把握時機',
  41: '先減損後得益', 42: '增益向上，宜積極行動', 43: '果斷決定，除去障礙', 44: '不期而遇，留意突發', 45: '人事聚集，凝聚共識',
  46: '穩步上升', 47: '暫處困境，守住志向', 48: '修養自身，源源供給', 49: '變革除舊', 50: '鼎新穩重，各司其職',
  51: '震動警醒，臨事不亂', 52: '適可而止，靜下心來', 53: '循序漸進', 54: '名分未正，不宜急進', 55: '盛大豐足，防盛極而衰',
  56: '在外旅行，謹慎小心', 57: '謙遜順入，隨風而行', 58: '喜悅溝通，和樂相處', 59: '渙散之時，凝聚人心', 60: '懂得節制，適度為宜',
  61: '以誠信感人', 62: '小有過越，宜低調行事', 63: '事已完成，防範變化', 64: '尚未完成，仍有轉機',
};

const GEN = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 相生
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };  // 相剋
const LINE_NAME = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const CN_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const mod = (n, m) => { const r = ((Math.trunc(n) % m) + m) % m; return r === 0 ? m : r; };

function hexagram(upperN, lowerN) {
  const upper = TRIGRAMS[upperN], lower = TRIGRAMS[lowerN];
  const [no, name] = HEX[upperN][lowerN];
  return { no, name, upper, lower, lines: [...lower.lines, ...upper.lines], meaning: MEANING[no], sym: `${upper.sym}${lower.sym}` };
}
function fromLines(lines) { return hexagram(byLines(lines.slice(3, 6)).n, byLines(lines.slice(0, 3)).n); }

// 體（不動的那一卦）與某一卦的五行關係
function relation(tiEl, otherEl) {
  if (tiEl === otherEl) return '比和';
  if (GEN[otherEl] === tiEl) return '用生體';
  if (GEN[tiEl] === otherEl) return '體生用';
  if (KE[tiEl] === otherEl) return '體剋用';
  return '用剋體';
}
const VERDICT = {
  用生體: { tag: '大吉', level: 5, text: '有外力相助，事情容易成' },
  比和: { tag: '吉', level: 4, text: '內外同心，順順地走' },
  體剋用: { tag: '小吉', level: 3, text: '能成，但要多花點力氣' },
  體生用: { tag: '小耗', level: 2, text: '付出會比收穫多，量力而為' },
  用剋體: { tag: '有阻', level: 1, text: '阻力比較大，宜緩、宜守' },
};
const ADVICE = {
  用生體: '順勢去做，記得接住別人伸出的手',
  比和: '照原本的步調走就好，不用急著改變',
  體剋用: '先把最難的那一步排進行程，一口氣處理掉',
  體生用: '先顧好自己，別一次答應太多事',
  用剋體: '先緩一緩、找人商量，再決定要不要動',
};

// 起卦核心：上卦數、下卦數、動爻數（都還沒取餘）
function cast(upperNum, lowerNum, movingNum, meta = {}) {
  const u = mod(upperNum, 8), l = mod(lowerNum, 8), mv = mod(movingNum, 6);
  const ben = hexagram(u, l);
  const lines = ben.lines;
  const hu = fromLines([lines[1], lines[2], lines[3], lines[2], lines[3], lines[4]]); // 互卦：下＝二三四爻，上＝三四五爻
  const changed = lines.slice(); changed[mv - 1] = 1 - changed[mv - 1];
  const bian = fromLines(changed);
  const movingInLower = mv <= 3;
  const ti = movingInLower ? ben.upper : ben.lower;    // 不動的是體
  const yong = movingInLower ? ben.lower : ben.upper;  // 有動爻的是用
  const rel = relation(ti.el, yong.el);
  const huRel = [relation(ti.el, hu.upper.el), relation(ti.el, hu.lower.el)];
  const bianYong = movingInLower ? bian.lower : bian.upper; // 用卦變了之後
  const bianRel = relation(ti.el, bianYong.el);
  return {
    upperNum, lowerNum, movingNum, moving: mv, movingName: LINE_NAME[mv - 1],
    ben, hu, bian, ti, yong, bianYong,
    relation: rel, verdict: VERDICT[rel], advice: ADVICE[rel], huRel, bianRel,
    formula: {
      upper: `${upperNum}÷8 餘 ${upperNum % 8}${upperNum % 8 === 0 ? '（算 8）' : ''} → ${ben.upper.name}`,
      lower: `${lowerNum}÷8 餘 ${lowerNum % 8}${lowerNum % 8 === 0 ? '（算 8）' : ''} → ${ben.lower.name}`,
      moving: `${movingNum}÷6 餘 ${movingNum % 6}${movingNum % 6 === 0 ? '（算 6）' : ''} → ${LINE_NAME[mv - 1]}動`,
    },
    ...meta,
  };
}

// 時辰：23:00–00:59 子（1）……21:00–22:59 亥（12）
function hourBranch(date) { const i = Math.floor(((date.getHours() + 1) % 24) / 2); return { idx: i + 1, name: BRANCHES[i] }; }

// 報數起卦：第一個數→上卦、第二個數→下卦、兩數相加再加時辰→動爻
function castByNumbers(a, b, date = new Date(), method = 'numbers') {
  a = Math.trunc(Number(a)); b = Math.trunc(Number(b));
  if (!(a >= 1) || !(b >= 1)) throw new Error('要兩個大於 0 的整數');
  const h = hourBranch(date);
  const r = cast(a, b, a + b + h.idx, { method, inputs: [a, b], hour: h });
  r.formula.source = `${method === 'circle' ? '星環停在' : '報數'} ${a}、${b}，${h.name}時（${h.idx}）`;
  r.formula.moving = `${a}＋${b}＋${h.idx}＝${a + b + h.idx}，${r.formula.moving}`;
  return r;
}

// 時間起卦：農曆年支數＋月＋日 → 上卦；再加時辰 → 下卦與動爻
let Solar = null;
try { ({ Solar } = require('lunar-javascript')); } catch (_) { /* 沒裝農曆套件：時間起卦停用 */ }
function lunarMonthName(m) { const n = Math.abs(m); const s = n === 1 ? '正' : n === 12 ? '臘' : n <= 10 ? CN_NUM[n] : `十${CN_NUM[n - 10]}`; return `${m < 0 ? '閏' : ''}${s}月`; }
function lunarDayName(d) { if (d === 10) return '初十'; if (d === 20) return '二十'; if (d === 30) return '三十'; return `${['初', '十', '廿', '三'][Math.floor(d / 10)]}${CN_NUM[d % 10]}`; }
function lunarInfo(date = new Date()) {
  if (!Solar) return null;
  const l = Solar.fromYmdHms(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()).getLunar();
  const yearZhi = l.getYearZhi(), month = Math.abs(l.getMonth()), day = l.getDay();
  const h = hourBranch(date);
  return { ganzhi: l.getYearInGanZhi(), yearZhi, yearIdx: BRANCHES.indexOf(yearZhi) + 1, month, day, hour: h, text: `${l.getYearInGanZhi()}年 ${lunarMonthName(l.getMonth())}${lunarDayName(day)} ${h.name}時` };
}
function castByTime(date = new Date()) {
  const L = lunarInfo(date);
  if (!L) throw new Error('時間起卦需要農曆套件，請重新執行一次「安裝.bat」');
  const s = L.yearIdx + L.month + L.day;
  const r = cast(s, s + L.hour.idx, s + L.hour.idx, { method: 'time', lunar: L, hour: L.hour });
  r.formula.source = `${L.text}：年支 ${L.yearZhi}（${L.yearIdx}）＋${L.month} 月＋${L.day} 日`;
  r.formula.upper = `${L.yearIdx}＋${L.month}＋${L.day}＝${s}，${r.formula.upper}`;
  r.formula.lower = `${s}＋時辰 ${L.hour.idx}＝${s + L.hour.idx}，${r.formula.lower}`;
  r.formula.moving = `${s + L.hour.idx}÷6 餘 ${(s + L.hour.idx) % 6}${(s + L.hour.idx) % 6 === 0 ? '（算 6）' : ''} → ${LINE_NAME[r.moving - 1]}動`;
  return r;
}

// 給 AI 看的卦象摘要
function describe(r, question) {
  const t = (x) => `${x.name}（${x.nature}・${x.el}）`;
  return [
    `【卦象】問題：${question}`,
    `起卦：${r.formula.source}；上卦 ${r.formula.upper}；下卦 ${r.formula.lower}；動爻 ${r.formula.moving}`,
    `本卦：${r.ben.name}（上${r.ben.upper.name}下${r.ben.lower.name}）— ${r.ben.meaning}`,
    `互卦（過程）：${r.hu.name} — ${r.hu.meaning}`,
    `變卦（結果）：${r.bian.name} — ${r.bian.meaning}`,
    `體卦：${t(r.ti)}；用卦：${t(r.yong)}；${r.relation} → ${r.verdict.tag}：${r.verdict.text}`,
    `過程：互卦 ${r.hu.upper.name}${r.hu.upper.el}、${r.hu.lower.name}${r.hu.lower.el} 對體 → ${r.huRel.join('、')}`,
    `結果：用卦變成 ${t(r.bianYong)} 對體 → ${r.bianRel}（${VERDICT[r.bianRel].text}）`,
  ].join('\n');
}

module.exports = { TRIGRAMS, HEX, MEANING, VERDICT, ADVICE, LINE_NAME, BRANCHES, cast, castByNumbers, castByTime, lunarInfo, hourBranch, relation, hexagram, describe, hasLunar: () => !!Solar };
