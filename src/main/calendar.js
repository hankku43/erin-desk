// 📆 上班日曆：週末、台灣國定假日（含補假、補行上班）、自己請假的日子
// 連續上工不會因為放假斷掉；「只在平日」的提醒、平日／每週重複的團戰遇到放假也跳過
// 資料：行政院人事行政總處「政府行政機關辦公日曆表」（data.gov.tw 開放資料）；民營企業、學校、軍警可能不同，可以用 config 補
// 純函式，不碰檔案
'use strict';

// 放假的日子（落在週末的節日也列，畫面才叫得出名字）與補行上班的週末
// 新的一年人事總處通常在前一年 6 月左右公布，出來後補在這裡；還沒有資料的年份只算週末
const TW = {
  2025: {
    off: {
      '01-01': '開國紀念日', '01-27': '小年夜', '01-28': '農曆除夕', '01-29': '春節', '01-30': '春節', '01-31': '春節',
      '02-28': '和平紀念日', '04-03': '兒童節補假', '04-04': '兒童節及民族掃墓節', '05-30': '端午節補假', '05-31': '端午節',
      '09-28': '教師節', '09-29': '教師節補假', '10-06': '中秋節', '10-10': '國慶日', '10-24': '光復節補假', '10-25': '光復節', '12-25': '行憲紀念日',
    },
    work: { '02-08': '補行上班' },
  },
  2026: {
    off: {
      '01-01': '開國紀念日', '02-15': '小年夜', '02-16': '農曆除夕', '02-17': '春節', '02-18': '春節', '02-19': '春節', '02-20': '小年夜補假',
      '02-27': '和平紀念日補假', '02-28': '和平紀念日', '04-03': '兒童節補假', '04-04': '兒童節', '04-05': '清明節', '04-06': '清明節補假', '05-01': '勞動節', '06-19': '端午節',
      '09-25': '中秋節', '09-28': '教師節', '10-09': '國慶日補假', '10-10': '國慶日', '10-25': '光復節', '10-26': '光復節補假', '12-25': '行憲紀念日',
    },
    work: {},
  },
  2027: {
    off: {
      '01-01': '開國紀念日', '02-04': '小年夜', '02-05': '農曆除夕', '02-06': '春節', '02-07': '春節', '02-08': '春節', '02-09': '春節補假', '02-10': '春節補假',
      '02-28': '和平紀念日', '03-01': '和平紀念日補假', '04-04': '兒童節', '04-05': '清明節', '04-06': '兒童節補假', '04-30': '勞動節補假', '05-01': '勞動節', '06-09': '端午節',
      '09-15': '中秋節', '09-28': '教師節', '10-10': '國慶日', '10-11': '國慶日補假', '10-25': '光復節', '12-24': '行憲紀念日補假', '12-25': '行憲紀念日', '12-31': '開國紀念日補假',
    },
    work: {},
  },
};
const YEARS = Object.keys(TW).map(Number);
const WEEKEND = [0, 6];
const DEFAULTS = { region: 'TW', restDays: WEEKEND, holidays: {}, workdays: {} };

const dowOf = (iso) => new Date(`${iso}T00:00:00`).getDay();
const validISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
// config 裡可以寫陣列 ["2026-10-30"] 或物件 {"2026-10-30": "公司週年"}
const asMap = (x) => (Array.isArray(x) ? Object.fromEntries(x.filter(validISO).map((d) => [d, ''])) : x && typeof x === 'object' ? x : {});

// 這一天是不是國定假日／補行上班（region 不是 TW 就只看週末）
function official(iso, region = 'TW') {
  if (region !== 'TW') return null;
  const y = TW[+iso.slice(0, 4)];
  if (!y) return null;
  const k = iso.slice(5);
  if (y.work[k]) return { work: true, name: y.work[k] };
  if (y.off[k]) return { off: true, name: y.off[k] };
  return null;
}
function hasData(iso, region = 'TW') { return region === 'TW' && YEARS.includes(+String(iso).slice(0, 4)); }

// 這一天放不放假，回傳 { off, kind, name }：kind＝leave（自己請假）／holiday（國定假日、補假、自訂）／weekend／work（補行上班）／null（平常上班日）
// opts：{ region, restDays, holidays, workdays, leave }（leave＝自己請假的日子 {日期: 說明}）
function dayInfo(iso, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const leave = asMap(o.leave);
  if (leave[iso] !== undefined) return { off: true, kind: 'leave', name: leave[iso] || '請假' };
  const extraOff = asMap(o.holidays), extraWork = asMap(o.workdays);
  if (extraWork[iso] !== undefined) return { off: false, kind: 'work', name: extraWork[iso] || '上班日' };
  if (extraOff[iso] !== undefined) return { off: true, kind: 'holiday', name: extraOff[iso] || '放假' };
  const of = official(iso, o.region);
  if (of && of.work) return { off: false, kind: 'work', name: of.name };
  if (of && of.off) return { off: true, kind: 'holiday', name: of.name };
  if ((o.restDays || WEEKEND).includes(dowOf(iso))) return { off: true, kind: 'weekend', name: '週末' };
  return { off: false, kind: null, name: '' };
}
const isOff = (iso, opts) => dayInfo(iso, opts).off;

// 接下來（含今天）幾天內的國定假日，給畫面提醒用
function upcoming(fromISO, days = 14, opts = {}) {
  const out = [];
  const d = new Date(`${fromISO}T00:00:00`);
  for (let i = 0; i < days; i++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const info = dayInfo(iso, opts);
    if (info.off && info.kind !== 'weekend') out.push({ date: iso, ...info });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

module.exports = { TW, YEARS, DEFAULTS, official, hasData, dayInfo, isOff, upcoming, asMap, validISO };
