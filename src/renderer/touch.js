// 🐾 摸不同的地方有不同反應：點到哪裡（頭、耳朵、尾巴、臉頰）、在頭上來回滑（摸頭）
// UMD：畫面用、測試也可以 require。座標都是立繪原圖（1093×1200）的座標；每張表情、動作圖都對齊 normal.png 的臉，
// 所以頭、耳朵、臉的位置每張都一樣，只有尾巴會因為姿勢不同跑到別的地方
(function (root) {
  'use strict';
  const IMG_W = 1093, IMG_H = 1200;
  // 先比耳朵（耳朵和頭頂的框有重疊，耳朵優先），再比頭、臉、尾巴
  const BASE = [
    { zone: 'earL', x0: 290, y0: 20, x1: 420, y1: 200 },
    { zone: 'earR', x0: 640, y0: 80, x1: 800, y1: 270 },
    { zone: 'head', x0: 380, y0: 70, x1: 650, y1: 255 },
    { zone: 'face', x0: 390, y0: 270, x1: 640, y1: 490 },
  ];
  // 尾巴：大部分的圖在右下角；思考、驚訝、歡呼、擔心的時候尾巴翹得很高；害羞時尾巴繞到前面（不判定，算一般的戳）
  const TAIL = { low: { x0: 800, y0: 790, x1: 1000, y1: 1200 }, tall: { x0: 800, y0: 420, x1: 1010, y1: 1200 } };
  const TALL = new Set(['thinking', 'surprised', 'cheer', 'worried']);
  const NO_TAIL = new Set(['shy']);
  const inBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

  // 原圖座標 (x, y) 在哪個部位；pose＝現在顯示的表情或動作圖名稱。沒有＝null（一般的戳）
  function zoneAt(x, y, pose) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    for (const b of BASE) if (inBox(b, x, y)) return b.zone;
    if (!NO_TAIL.has(pose) && inBox(TALL.has(pose) ? TAIL.tall : TAIL.low, x, y)) return 'tail';
    return null;
  }
  // 部位 → 跟艾琳說的（左右耳都算耳朵）
  const partOf = (zone) => (zone === 'earL' || zone === 'earR' ? 'ear' : zone || null);
  // 點下去的當下先冒的小表情（不用等她說話）
  const EMOTE = { earL: 'flickL', earR: 'flickR', head: 'pat', face: 'cheek', tail: 'flickTail' };

  // 摸頭：滑鼠（沒按著）在頭上左右來回滑。每次往同一個方向滑超過 minStep 像素才算一下，windowMs 內換方向 minFlips 次＝摸頭
  // 只是經過（一路滑過去）不會換方向，所以不會誤判
  function PatDetector({ minFlips = 3, minStep = 8, windowMs = 1500 } = {}) {
    let lastX = null, dir = 0, run = 0, flips = [];
    const reset = () => { lastX = null; dir = 0; run = 0; flips = []; };
    return {
      reset,
      feed(x, t, onHead) {
        if (!onHead) { reset(); return false; }
        if (lastX === null) { lastX = x; return false; }
        const dx = x - lastX;
        lastX = x;
        if (!dx) return false;
        const d = dx > 0 ? 1 : -1;
        if (d === dir) run += Math.abs(dx);
        else { if (dir && run >= minStep) flips.push(t); dir = d; run = Math.abs(dx); }
        flips = flips.filter((ft) => t - ft <= windowMs);
        if (flips.length >= minFlips) { reset(); return true; }
        return false;
      },
    };
  }

  const Touch = { IMG_W, IMG_H, BASE, TAIL, zoneAt, partOf, EMOTE, PatDetector };
  if (typeof module === 'object' && module.exports) module.exports = Touch;
  else root.Touch = Touch;
})(typeof window !== 'undefined' ? window : globalThis);
