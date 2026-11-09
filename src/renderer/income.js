// 🔔 收入撲滿：照月薪算「現在這一秒賺了多少」（UMD 純函式；畫面的 piggy.js、引擎、測試共用）
//   時薪＝月薪 ÷（這個月實際的工作天數 × 每天的工作時數）（11/9 使用者改的；原本是 ÷ 240）
//     工作天數＝這個月扣掉週末、國定假日（補班日算）的天數，請假不扣（特休也是這個月的工作天）；由 engine 算好放在 view.income.monthDays
//     每天的工作時數＝上班～下班扣掉午休；午休不進帳。一個月每個工作天都上滿，加起來剛好等於月薪
//   週末、國定假日不算（請假看設定）
//   月薪只存在這台電腦的設定檔，不會放進給 AI 的提示
(function (root) {
  'use strict';
  const DEFAULTS = { enabled: false, monthly: 0, start: '09:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00', interval: 1, countLeave: false, showTotal: true, totalMode: 'day' };
  const INTERVALS = [1, 5, 10, 30, 60, 300, 600, 1800, 3600]; // 秒
  const INTERVAL_LABEL = { 1: '每 1 秒', 5: '每 5 秒', 10: '每 10 秒', 30: '每 30 秒', 60: '每 1 分鐘', 300: '每 5 分鐘', 600: '每 10 分鐘', 1800: '每 30 分鐘', 3600: '每 1 小時' };

  const mm = (hhmm) => { const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
  // 這個月的週一～週五有幾天（engine 沒給 monthDays 時的備用；不知道國定假日）
  function weekdaysIn(date) {
    const y = date.getFullYear(), m = date.getMonth(), n = new Date(y, m + 1, 0).getDate();
    let c = 0;
    for (let d = 1; d <= n; d++) { const w = new Date(y, m, d).getDay(); if (w !== 0 && w !== 6) c++; }
    return c;
  }
  // 每天工作幾秒（扣掉午休）
  const workSecOf = (v) => daySec(windows(v || {}));
  // 時薪、每秒：月薪 ÷（工作天數 × 每天工作時數）
  function hourly(v, now = new Date()) {
    if (!v || !(Number(v.monthly) > 0)) return 0;
    const days = Number(v.monthDays) > 0 ? Number(v.monthDays) : weekdaysIn(now);
    const hrs = workSecOf(v) / 3600;
    return days > 0 && hrs > 0 ? Number(v.monthly) / (days * hrs) : 0;
  }
  const perSec = (v, now) => hourly(v, now) / 3600;

  // 一天裡算錢的時段（分鐘）：上班～下班，扣掉午休；回 [[開始, 結束], …]
  function windows({ start, end, lunch } = {}) {
    const a = mm(start), b = mm(end);
    if (a === null || b === null || b <= a) return [];
    let out = [[a, b]];
    const la = lunch && mm(lunch[0]), lb = lunch && mm(lunch[1]);
    if (la !== null && lb !== null && la !== undefined && lb !== undefined && lb > la) {
      out = out.flatMap(([s, e]) => (lb <= s || la >= e ? [[s, e]] : [[s, la], [lb, e]].filter(([x, y]) => y > x)));
    }
    return out;
  }
  const daySec = (win) => win.reduce((n, [s, e]) => n + (e - s) * 60, 0);
  // 今天到 now 為止上班了幾秒
  function workedSec(win, now) {
    const t = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
    return win.reduce((n, [s, e]) => n + Math.max(0, Math.min(t, e * 60) - s * 60), 0);
  }
  function working(win, now) {
    const t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    return win.some(([s, e]) => t >= s && t < e);
  }
  // v＝view().income：{ on, monthly, start, end, lunch, monthDays, workday, date }
  function today(v, now) {
    if (!v || !v.on) return { earned: 0, max: 0, working: false, worked: 0 };
    const win = windows(v);
    const rate = perSec(v, now);
    const sameDay = !v.date || v.date === iso(now);
    if (!v.workday || !sameDay) return { earned: 0, max: daySec(win) * rate, working: false, worked: 0, off: true };
    const worked = workedSec(win, now);
    return { earned: worked * rate, max: daySec(win) * rate, working: working(win, now), worked };
  }
  // 這個月到現在的累計：之前的工作天（engine 算好 monthPastDays，請假看設定）每天上滿＋今天到現在
  function month(v, now) {
    if (!v || !v.on) return 0;
    const sameMonth = !v.date || v.date.slice(0, 7) === iso(now).slice(0, 7);
    if (!sameMonth) return 0;
    return (Number(v.monthPastDays) || 0) * workSecOf(v) * perSec(v, now) + today(v, now).earned;
  }
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // 金額：不到 1 元兩位小數、不到 10 元一位、其他整數加千分位
  function fmt(n) {
    const x = Number(n) || 0;
    if (x < 1) return x.toFixed(2);
    if (x < 10) return x.toFixed(1);
    return Math.round(x).toLocaleString('en-US');
  }
  // 累計：小數位數跟著每一枚的大小走（每枚不到 1 元就寫到角分，才看得到數字一直在跳）
  function fmtBy(n, step) {
    const d = step < 1 ? 2 : step < 10 ? 1 : 0;
    return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function durText(sec) { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分鐘`; }
  // 存設定前檢查：回 { ok, cfg, error }
  function normalize(f = {}) {
    const monthly = Math.round(Number(String(f.monthly === undefined ? '' : f.monthly).replace(/[,\s]/g, '')));
    if (!(monthly > 0) || monthly > 10000000) return { ok: false, error: '月薪要填 1 到 10,000,000 之間的數字' };
    const start = String(f.start || DEFAULTS.start), end = String(f.end || DEFAULTS.end);
    if (mm(start) === null || mm(end) === null) return { ok: false, error: '上下班時間的格式像 09:00' };
    if (mm(end) <= mm(start)) return { ok: false, error: '下班時間要比上班時間晚' };
    // 午休：兩個都空＝沒有午休；有填就要格式對、結束比開始晚
    const ls = String(f.lunchStart === undefined ? DEFAULTS.lunchStart : f.lunchStart || ''), le = String(f.lunchEnd === undefined ? DEFAULTS.lunchEnd : f.lunchEnd || '');
    if (ls || le) {
      if (mm(ls) === null || mm(le) === null) return { ok: false, error: '午休時間的格式像 12:00（不休就兩格都清空）' };
      if (mm(le) <= mm(ls)) return { ok: false, error: '午休結束要比開始晚' };
    }
    if (!daySec(windows({ start, end, lunch: ls ? [ls, le] : null }))) return { ok: false, error: '扣掉午休之後沒有上班時間了' };
    const interval = INTERVALS.includes(Number(f.interval)) ? Number(f.interval) : DEFAULTS.interval;
    return { ok: true, cfg: { enabled: f.enabled !== false, monthly, start, end, lunchStart: ls, lunchEnd: le, interval, countLeave: !!f.countLeave, showTotal: f.showTotal !== false } };
  }

  const Income = { DEFAULTS, INTERVALS, INTERVAL_LABEL, mm, weekdaysIn, workSecOf, hourly, perSec, windows, daySec, workedSec, working, today, month, fmt, fmtBy, durText, normalize, iso };
  if (typeof module === 'object' && module.exports) module.exports = Income;
  else root.Income = Income;
})(typeof window !== 'undefined' ? window : globalThis);
