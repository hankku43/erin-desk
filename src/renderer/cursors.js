// 🐾 摸艾琳的時候換鼠標：冒險者的手套（跟開場序章那雙一樣：棕色皮手套＋白袖口、皮帶扣）
// 頭和耳朵＝張開的手（摸頭時跟著滑鼠左右擺）、臉頰＝伸出一根手指（戳）、尾巴＝輕輕捏；身體其他地方照舊
// 32×32 的 SVG（data: 網址，不用另外的檔案；每個鼠標是獨立的 SVG 文件，所以可以用漸層）
// 畫法：光從左上來（左上亮、右下暗）、指縫和手背有縫線、深色描邊外面再包一圈白邊，深色、淺色的桌面都看得清楚
(function (root) {
  'use strict';
  const INK = '#2a170c';
  const DEFS = `<defs>
<linearGradient id="lt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b07a4e"/><stop offset=".45" stop-color="#8a5633"/><stop offset="1" stop-color="#5e3620"/></linearGradient>
<linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e1d0"/></linearGradient>
<linearGradient id="bk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c98a15"/></linearGradient>
</defs>
<style>
.g{fill:url(#lt);stroke:${INK};stroke-width:1.15;stroke-linejoin:round}
.c{fill:url(#cf);stroke:${INK};stroke-width:1.15;stroke-linejoin:round}
.st{fill:#5a3419;stroke:${INK};stroke-width:.7}
.bk{fill:url(#bk);stroke:${INK};stroke-width:.7}
.hl{fill:#ffffff;opacity:.28}
.sm{fill:none;stroke:#f3d7b0;stroke-width:.75;stroke-linecap:round;stroke-dasharray:1.2 1;opacity:.75}
.sh{fill:#3d2111;opacity:.28}
.w *{stroke:#ffffff;stroke-width:3.6;fill:#ffffff;opacity:1;stroke-dasharray:none}
</style>`;

  // ---- 零件 ----
  // 袖口：白布翻摺＋皮帶＋金扣（每隻手都一樣，放在手腕下面）
  const cuff = () => [
    '<path d="M8.6 24.2 H24.4 Q25.6 24.2 25.6 25.4 V30 Q25.6 31.2 24.4 31.2 H8.6 Q7.4 31.2 7.4 30 V25.4 Q7.4 24.2 8.6 24.2 Z" class="c"/>',
    '<path d="M7.6 26.9 H25.4 V29.2 H7.6 Z" class="st"/>',
    '<rect x="18.4" y="26.3" width="3.1" height="3.5" rx=".7" class="bk"/>',
    '<path d="M8.4 24.9 H24.6" fill="none" stroke="#c9bea6" stroke-width=".6"/>',
  ].join('');
  // 一根手指：從 (x, base) 往上長 h、寬 w、整根往左右歪 tilt 度；指尖圓、指根稍寬；加一道高光和一條縫線
  const finger = (x, base, h, w, tilt = 0) => {
    const hw = w / 2;
    return `<g transform="rotate(${tilt} ${x} ${base})">
<path d="M${x - hw - .25} ${base} L${x - hw} ${base - h + hw} A${hw} ${hw} 0 0 1 ${x + hw} ${base - h + hw} L${x + hw + .25} ${base} Z" class="g"/>
<path d="M${x - hw + .55} ${base - h + hw * .9} A${hw * .55} ${hw * .55} 0 0 1 ${x - .1} ${base - h + .5} L${x - .1} ${base - h + 2.2} A${hw * .5} ${hw * .5} 0 0 0 ${x - hw + .55} ${base - h + 2.4} Z" class="hl"/>
<path d="M${x} ${base - h + hw + .6} V${base - 1.2}" class="sm"/>
</g>`;
  };
  // 手掌（手背）：上緣有四個指根的弧度，下面收進手腕
  const palm = (top) => `<path d="M8.2 ${top + .4} C8.2 ${top - 1} 10 ${top - 1.4} 11 ${top} C12.2 ${top - 1.2} 14 ${top - 1.2} 15.2 ${top} C16.4 ${top - 1.2} 18.2 ${top - 1.2} 19.4 ${top} C20.6 ${top - 1} 22.4 ${top - 1} 23.2 ${top + .6} L23.6 21.4 C23.8 24 21.4 25.3 18.6 25.3 H13.4 C10.6 25.3 8.2 24 8.4 21.4 Z" class="g"/>
<path d="M9.2 ${top + 1.2} C9.4 ${top + 4} 9.6 19.2 10.6 23.2" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".18"/>
<path d="M10.6 21.9 Q16 24.6 21.4 21.9" class="sm"/>`;
  // 大拇指：從手掌左側斜斜伸出去
  const thumb = (dx = 0, dy = 0, rot = 0) => `<g transform="translate(${dx} ${dy}) rotate(${rot} 10 19)">
<path d="M10.4 20.6 C8.2 19.6 5.4 17 5.2 14.6 C5.1 13.3 6.5 12.8 7.5 13.7 C9 15.1 10.4 16.6 11.6 18.4 Z" class="g"/>
<path d="M6.6 14.1 C6.3 15 7 16 7.9 16.6" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".3"/>
</g>`;
  // 摺起來的手指（戳、捏的時候，另外三根彎著，只看得到指關節）
  const knuckle = (x, y, r = 1.9) => `<circle cx="${x}" cy="${y}" r="${r}" class="g"/><circle cx="${x - .5}" cy="${y - .6}" r="${r * .4}" class="hl"/>`;

  // ---- 三種手 ----
  // 張開的手（手背、手指朝上，稍微張開）
  const open = () => [
    thumb(),
    finger(10.6, 14.4, 11.4, 3.6, -8), finger(14.4, 13.4, 13.2, 3.7, -2), finger(18.2, 13.4, 12.4, 3.6, 3), finger(21.8, 14.6, 9.4, 3.3, 9),
    palm(13.6),
    '<path d="M9.4 24.2 H23.2" class="sh"/>',
  ].join('');
  // 伸出食指（戳）：食指直直往上，其他三根彎起來、大拇指貼在旁邊
  const poke = () => [
    finger(10.8, 14.6, 14.2, 3.9, -2),
    knuckle(14.8, 14.2), knuckle(18.4, 14.5), knuckle(21.8, 15.4, 1.7),
    palm(14.6),
    '<path d="M10.2 20.8 C8 19.8 6.2 17.6 6.4 15.9 C6.5 14.9 7.7 14.7 8.5 15.5 C9.6 16.7 10.6 18.2 11.4 19.9 Z" class="g"/>',
    '<path d="M13.2 17.6 C15.8 18.6 19.6 18.6 22 17.6" class="sm"/>',
  ].join('');
  // 輕輕捏：大拇指和食指在左上碰在一起，其他三根彎著
  const pinch = () => [
    `<path d="M12.6 16.2 C11.8 12.4 10 9 7.6 7.2 C6.4 6.3 5 7.4 5.7 8.7 C7.4 11.2 8.8 13.9 9.3 17.2 Z" class="g"/>`, // 食指
    `<path d="M6.9 8.4 C6.9 9.4 7.6 10.6 8.4 11.6" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".3"/>`,
    `<path d="M10.2 21.4 C7.6 19.6 5.2 15.8 4.6 12.2 C4.4 10.8 6 10.2 6.7 11.4 C7.9 13.8 9.6 16.4 12 18.2 Z" class="g"/>`, // 大拇指
    knuckle(14.8, 14.4), knuckle(18.4, 14.7), knuckle(21.8, 15.6, 1.7),
    palm(14.8),
    '<path d="M13.2 17.8 C15.8 18.8 19.6 18.8 22 17.8" class="sm"/>',
  ].join('');

  // 白邊：同一隻手先用白色粗線畫一次墊在下面，再畫正常的
  const hand = (inner, tf = '') => `<g${tf ? ` transform="${tf}"` : ''}><g class="w">${inner}${cuff()}</g><g>${inner}${cuff()}</g></g>`;
  const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${DEFS}${body}</svg>`;

  // 每種鼠標：圖、熱點（點下去算哪一個點：指尖）
  const CURSORS = {
    open: { svg: svg(hand(open())), x: 15, y: 2 },
    patL: { svg: svg(hand(open(), 'rotate(-16 16 30)')), x: 10, y: 4 },
    patR: { svg: svg(hand(open(), 'rotate(16 16 30)')), x: 20, y: 4 },
    poke: { svg: svg(hand(poke())), x: 11, y: 1 },
    pinch: { svg: svg(hand(pinch())), x: 6, y: 7 },
  };
  // 部位 → 鼠標（身體其他地方 null＝照舊）
  const OF_ZONE = { head: 'open', earL: 'open', earR: 'open', face: 'poke', tail: 'pinch' };
  const url = (k) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(CURSORS[k].svg)}`;
  // CSS 的 cursor 值：讀不到圖時退回手指形狀
  const css = (k) => (CURSORS[k] ? `url("${url(k)}") ${CURSORS[k].x} ${CURSORS[k].y}, pointer` : '');

  const Cursors = { CURSORS, OF_ZONE, url, css };
  if (typeof module === 'object' && module.exports) module.exports = Cursors;
  else root.Cursors = Cursors;
})(typeof window !== 'undefined' ? window : globalThis);
