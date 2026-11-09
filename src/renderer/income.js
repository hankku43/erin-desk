// 🔔 收入撲滿：照月薪算「現在這一秒賺了多少」（UMD 純函式；畫面的 piggy.js、引擎、測試共用）
//   時薪＝月薪 ÷ 240（勞基法的算法：30 天 × 8 小時）；只算上班時間（上班～下班、扣掉午休），週末、國定假日不算（請假看設定）
//   月薪只存在這台電腦的設定檔，不會放進給 AI 的提示
(function (root) {
  'use strict';
  const DEFAULTS = { enabled: false, monthly: 0, start: '09:00', end: '18:00', interval: 1, countLeave: false, showTotal: true };
  const INTERVALS = [1, 5, 10, 30, 60, 300, 600, 1800, 3600]; // 秒
  const INTERVAL_LABEL = { 1: '每 1 秒', 5: '每 5 秒', 10: '每 10 秒', 30: '每 30 秒', 60: '每 1 分鐘', 300: '每 5 分鐘', 600: '每 10 分鐘', 1800: '每 30 分鐘', 3600: '每 1 小時' };

  const mm = (hhmm) => { const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
  const hourly = (monthly) => (Number(monthly) > 0 ? Number(monthly) / 240 : 0);
  const perSec = (monthly) => hourly(monthly) / 3600;

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
  // v＝view().income：{ on, monthly, start, end, lunch, workday, date }
  function today(v, now) {
    if (!v || !v.on) return { earned: 0, max: 0, working: false, worked: 0 };
    const win = windows(v);
    const rate = perSec(v.monthly);
    const sameDay = !v.date || v.date === iso(now);
    if (!v.workday || !sameDay) return { earned: 0, max: daySec(win) * rate, working: false, worked: 0, off: true };
    const worked = workedSec(win, now);
    return { earned: worked * rate, max: daySec(win) * rate, working: working(win, now), worked };
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
    const interval = INTERVALS.includes(Number(f.interval)) ? Number(f.interval) : DEFAULTS.interval;
    return { ok: true, cfg: { enabled: f.enabled !== false, monthly, start, end, interval, countLeave: !!f.countLeave, showTotal: f.showTotal !== false } };
  }

  const Income = { DEFAULTS, INTERVALS, INTERVAL_LABEL, mm, hourly, perSec, windows, daySec, workedSec, working, today, fmt, fmtBy, durText, normalize, iso };
  if (typeof module === 'object' && module.exports) module.exports = Income;
  else root.Income = Income;
})(typeof window !== 'undefined' ? window : globalThis);
