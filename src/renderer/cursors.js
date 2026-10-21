// 🐾 摸艾琳的時候換鼠標：冒險者的手套（跟開場序章那雙一樣：棕色皮手套＋白袖口、皮帶扣）
// 頭和耳朵＝張開的手（摸頭時跟著滑鼠左右擺）、臉頰＝伸出一根手指（戳）、尾巴＝輕輕捏；身體其他地方照舊
// 32×32 的 SVG（data: 網址，不用另外的檔案）；深色描邊外面再包一圈白邊，深色、淺色的桌面都看得清楚
(function (root) {
  'use strict';
  const LEATHER = '#7a4e30', LEATHER_HI = '#9c6a44', INK = '#2b1a10', CUFF = '#fbf7ee', BUCKLE = '#e2b04a';
  // 袖口（每隻手都一樣）
  const cuff = '<rect x="9" y="24.4" width="15" height="6.6" rx="1.6" class="c"/><rect x="9" y="26.6" width="15" height="2.1" class="s"/><rect x="18.2" y="26.2" width="2.6" height="2.9" rx=".5" class="b"/>';
  const palm = (top = 14) => `<path d="M9.5 ${top} H23.6 V22 C23.6 25 21.6 26.4 19 26.4 H13.6 C10.9 26.4 9.5 25 9.5 22 Z" class="g"/>`;
  const finger = (x, y, h, w = 3.4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" class="g"/>`;
  const shine = (x, y, h) => `<path d="M${x} ${y} v${h}" class="h"/>`;
  // 張開的手（手背、手指朝上）
  const open = () => [
    '<path d="M10.4 19.6 C7.4 18.4 5 15.6 5.6 13.6 C6.2 12.2 8.4 12.8 10.2 15.2 Z" class="g"/>', // 大拇指
    finger(9.6, 6.2, 11), finger(13.2, 4, 13), finger(16.8, 5, 12), finger(20.4, 8, 9, 3.2),
    palm(14), shine(11.3, 8, 5), shine(14.9, 6, 6), shine(18.5, 7, 5),
  ].join('');
  // 伸出食指（戳臉頰）
  const poke = () => [
    finger(10, 2.4, 14.4, 3.6), finger(13.4, 12.2, 5.4), finger(16.8, 12.6, 5), finger(20.2, 13.2, 4.6, 3.2),
    '<path d="M10.4 21.4 C8.2 20.6 6.6 18.6 7.2 17.2 C7.8 16.2 9.4 16.6 10.6 18.2 Z" class="g"/>', palm(15), shine(11.8, 4.4, 6), // 大拇指收在旁邊
  ].join('');
  // 輕輕捏（大拇指和食指在左上角碰在一起）
  const pinch = () => [
    '<path d="M13.4 16.4 C12.6 12.2 10.8 8.6 8.4 7 C7 6.1 5.6 7.4 6.5 8.8 C8 11 9.2 13.6 9.8 17 Z" class="g"/>', // 食指
    '<path d="M10.2 21 C7.6 19.4 5.4 15.6 5 12 C4.8 10.6 6.5 10.1 7.1 11.4 C8 13.6 9.6 16 11.8 17.6 Z" class="g"/>', // 大拇指
    finger(13.4, 12.6, 5.2), finger(16.8, 12.8, 5), finger(20.2, 13.4, 4.6, 3.2),
    palm(15),
  ].join('');
  const STYLE = `<style>.g{fill:${LEATHER};stroke:${INK};stroke-width:1.1;stroke-linejoin:round}.c{fill:${CUFF};stroke:${INK};stroke-width:1.1}.s{fill:${LEATHER};stroke:${INK};stroke-width:.6}.b{fill:${BUCKLE};stroke:${INK};stroke-width:.6}.h{stroke:${LEATHER_HI};stroke-width:1.1;stroke-linecap:round;fill:none}.t{fill:none;stroke:${INK};stroke-width:1.1;stroke-linecap:round}.w .g,.w .c,.w .s,.w .b,.w .t{stroke:#fff;stroke-width:3.4;fill:#fff}.w .h{display:none}</style>`;
  // 白邊：同一隻手先用白色粗線畫一次墊在下面
  const hand = (inner, tf = '') => `<g${tf ? ` transform="${tf}"` : ''}><g class="w">${inner}${cuff}</g><g>${inner}${cuff}</g></g>`;
  const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${STYLE}${body}</svg>`;

  // 每種鼠標：圖、熱點（點下去算哪一個點：指尖）
  const CURSORS = {
    open: { svg: svg(hand(open())), x: 15, y: 5 },
    patL: { svg: svg(hand(open(), 'rotate(-16 16 27)')), x: 11, y: 6 },
    patR: { svg: svg(hand(open(), 'rotate(16 16 27)')), x: 19, y: 6 },
    poke: { svg: svg(hand(poke())), x: 11, y: 3 },
    pinch: { svg: svg(hand(pinch())), x: 6, y: 9 },
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
