// 🔍 介面大小（純函式）：整個主畫面（艾琳、貓咪、狀態欄、對話框、面板）一起放大縮小
//   做法：主視窗的大小 × 比例，網頁用 webContents.setZoomFactor(比例) → 畫面裡的 CSS 座標完全不變（innerWidth 還是 610）
//   比例存在 config.json 的 window.scale；📓 筆記本等其他視窗不受影響
'use strict';

const MIN = 0.7, MAX = 1.5, STEP = 0.05, WHEEL = 0.1;
const PRESETS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5];
const round2 = (v) => Math.round(v * 100) / 100;

// 存檔或輸入的值 → 合法的比例（對齊 5%，0.7～1.5；亂填＝1）
function clamp(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return round2(Math.min(MAX, Math.max(MIN, Math.round(n / STEP) * STEP)));
}
// 這個螢幕放得下的最大比例（工作區域放得下整個視窗；對齊 5%）
function fit(workArea, base) {
  const r = Math.min(workArea.height / base.WIN_H, workArea.width / base.WIN_W);
  return round2(Math.floor(r / STEP + 1e-9) * STEP);
}
// 選單／滑桿最大可以選到多少：至少 100%（小螢幕上原本就是 100%，不會被逼著變小）
function maxFor(workArea, base) { return round2(Math.max(1, Math.min(MAX, fit(workArea, base)))); }
// 實際用的比例：想要的比 100% 大、螢幕放不下 → 縮到放得下（但不會小於 100%）
function effective(wanted, workArea, base) {
  const s = clamp(wanted);
  return s <= 1 ? s : Math.min(s, maxFor(workArea, base));
}
// 視窗的大小
function sizes(base, s) {
  return { WIN_W: Math.round(base.WIN_W * s), WIN_H: Math.round(base.WIN_H * s), MINI_SIZE: Math.round(base.MINI_SIZE * s) };
}
// Ctrl＋滾輪：一格 10%
function wheel(cur, dir, workArea, base) {
  const next = clamp(cur + (dir === 'in' ? WHEEL : -WHEEL));
  return workArea ? Math.min(next, maxFor(workArea, base)) : next;
}
const pct = (s) => `${Math.round(s * 100)}%`;

module.exports = { MIN, MAX, STEP, WHEEL, PRESETS, clamp, fit, maxFor, effective, sizes, wheel, pct };
