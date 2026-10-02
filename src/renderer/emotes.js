// ✨ 漂浮表情符號（emote）：待機小動作時飄在艾琳頭旁邊的音符、愛心、z z Z、汗滴、熱氣……
// 全部用 SVG 畫，跟頭上「!」「?」圖示同一套畫風：粗圓的海軍藍描邊、柔和漸層、一點白色光澤；
// 顏色只用她身上有的（金、玫瑰粉、天藍、米白、灰），不用系統 emoji 字型，每台電腦看起來一樣
(function (root) {
  'use strict';
  const W = 300, H = 332; // #npcWrap 的大小（角色在右下）；頭頂右側約 (190, 30)、右太陽穴約 (200, 48)、奶茶杯口約 (110, 182)
  const DEFS = `<defs>
<linearGradient id="emGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c2"/><stop offset="1" stop-color="#f2b93b"/></linearGradient>
<linearGradient id="emRose" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe8ee"/><stop offset="1" stop-color="#ff9fb8"/></linearGradient>
<linearGradient id="emSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf6ff"/><stop offset="1" stop-color="#7ec3ff"/></linearGradient>
<linearGradient id="emCream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#f3e6c4"/></linearGradient>
<linearGradient id="emGrey" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0f6"/><stop offset="1" stop-color="#c9cddd"/></linearGradient>
</defs>`;
  const S = 'stroke-linejoin="round" stroke-linecap="round" style="paint-order:stroke"';
  const NAVY = '#34437a', ROSE = '#d9607f', GOLD_DEEP = '#c98a15', BLUE = '#2f6fb0', GREY = '#6c6f8e';

  // ---- 零件（都畫在自己的小座標裡，由 piece() 搬到位置、縮放、套動畫）----
  const note = (fill = 'url(#emGold)') => `<path d="M14 4 L14 26 M14 4 C22 6 26 10 26 16" fill="none" stroke="${NAVY}" stroke-width="7" ${S}/><path d="M14 4 L14 26 M14 4 C22 6 26 10 26 16" fill="none" stroke="${fill}" stroke-width="3.2" ${S}/><ellipse cx="10" cy="27" rx="7.5" ry="5.5" fill="${fill}" stroke="${NAVY}" stroke-width="3" ${S}/><circle cx="8" cy="25" r="1.3" fill="#fff" opacity=".9"/>`;
  const heart = () => `<path d="M16 28 C6 20 2 15 2 9.5 C2 5 5.5 2 9.5 2 C12.5 2 14.8 3.8 16 6 C17.2 3.8 19.5 2 22.5 2 C26.5 2 30 5 30 9.5 C30 15 26 20 16 28 Z" fill="url(#emRose)" stroke="${ROSE}" stroke-width="3" ${S}/><path d="M7 7.5 C7.5 5.5 9 4.5 10.5 4.3" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".9"/>`;
  const spark = () => `<path d="M12 0 C13 7 15 10 24 12 C15 14 13 17 12 24 C11 17 9 14 0 12 C9 10 11 7 12 0 Z" fill="url(#emGold)" stroke="${GOLD_DEEP}" stroke-width="2.4" ${S}/><circle cx="9.5" cy="9" r="1.4" fill="#fff" opacity=".9"/>`;
  const drop = () => `<path d="M12 1 C12 1 3 13 3 19 C3 24.5 7 28 12 28 C17 28 21 24.5 21 19 C21 13 12 1 12 1 Z" fill="url(#emSky)" stroke="${BLUE}" stroke-width="2.8" ${S}/><path d="M7.5 20 C7.5 17 8.5 15 10 13.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".9"/>`;
  const zee = (ch = 'z') => `<text x="0" y="22" font-family="Nunito, 'Segoe UI', 'Microsoft JhengHei', sans-serif" font-weight="900" font-size="26" fill="url(#emSky)" stroke="${NAVY}" stroke-width="4" ${S}>${ch}</text>`;
  const puff = (r) => `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#emCream)" stroke="${NAVY}" stroke-width="2.6"/>`;
  const cloud = (fill = 'url(#emCream)', stroke = NAVY) => `<path d="M14 30 C7 30 3 26 3 21 C3 17 6 14 9.5 13.5 C10.5 8 15 4 20.5 4 C26 4 30 7.5 31 12.5 C35.5 13 39 16.5 39 21 C39 26 35 30 29 30 Z" fill="${fill}" stroke="${stroke}" stroke-width="3" ${S}/><path d="M9 18 C10 15 12.5 13.5 15 13" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>`;
  const dots = (c = NAVY) => `<g fill="${c}"><circle cx="3" cy="3" r="2.6"/><circle cx="11" cy="3" r="2.6"/><circle cx="19" cy="3" r="2.6"/></g>`;
  const wisp = () => `<path d="M6 30 C2 24 10 20 6 12" fill="none" stroke="${NAVY}" stroke-width="6" stroke-linecap="round" opacity=".32"/><path d="M6 30 C2 24 10 20 6 12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
  const scribble = () => `<g fill="none" stroke="${NAVY}" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M2 16 C6 12 8 18 12 14 C16 10 18 16 22 12"/><path d="M4 24 C8 20 10 26 14 22 C18 18 20 24 24 20"/></g>`;

  // 一個零件：放在 (x, y)、縮放 s、動畫 anim、第 i 個（延遲用）；cx/cy 是零件自己的中心（縮放的支點）
  const piece = (svg, { x, y, s = 1, anim = 'float', i = 0, cx = 12, cy = 14 }) =>
    `<g class="em-${anim}" style="--i:${i}; transform-origin:${(x + cx * s).toFixed(1)}px ${(y + cy * s).toFixed(1)}px"><g transform="translate(${x} ${y}) scale(${s})">${svg}</g></g>`;

  // ---- 每種表情由哪些零件組成 ----
  const KINDS = {
    notes: () => [piece(note(), { x: 188, y: 22, s: 1, cx: 16, cy: 16 }), piece(note(), { x: 214, y: 8, s: .78, i: 1, cx: 16, cy: 16 }), piece(note(), { x: 236, y: 30, s: .6, i: 2, cx: 16, cy: 16 })],
    think: () => [piece(puff(3.5), { x: 182, y: 52, s: 1, anim: 'pop', cx: 3.5, cy: 3.5 }), piece(puff(5), { x: 191, y: 39, s: 1, anim: 'pop', i: 1, cx: 5, cy: 5 }), piece(cloud(), { x: 200, y: 2, s: 1, anim: 'pop', i: 2, cx: 21, cy: 17 }), piece(dots(), { x: 211, y: 21, s: 1, anim: 'pop', i: 3, cx: 11, cy: 3 })],
    scribble: () => [piece(scribble(), { x: 206, y: 20, s: 1, anim: 'pop', cx: 13, cy: 18 }), piece(spark(), { x: 236, y: 40, s: .75, anim: 'twinkle', i: 1, cx: 12, cy: 12 })],
    zzz: () => [piece(zee('z'), { x: 186, y: 36, s: .7, cx: 8, cy: 14 }), piece(zee('z'), { x: 206, y: 20, s: .9, i: 1, cx: 8, cy: 14 }), piece(zee('Z'), { x: 230, y: 0, s: 1.1, i: 2, cx: 9, cy: 14 })],
    heart: () => [piece(heart(), { x: 190, y: 18, s: 1, cx: 16, cy: 15 }), piece(heart(), { x: 228, y: 4, s: .6, i: 1, cx: 16, cy: 15 })],
    sigh: () => [piece(cloud('url(#emGrey)', GREY), { x: 182, y: 14, s: .9, anim: 'sink', cx: 21, cy: 17 }), piece(dots(GREY), { x: 193, y: 31, s: 1, anim: 'sink', i: 1, cx: 11, cy: 3 })],
    shine: () => [piece(spark(), { x: 176, y: 14, s: 1, anim: 'twinkle', cx: 12, cy: 12 }), piece(spark(), { x: 212, y: 0, s: 1.3, anim: 'twinkle', i: 1, cx: 12, cy: 12 }), piece(spark(), { x: 244, y: 22, s: .8, anim: 'twinkle', i: 2, cx: 12, cy: 12 }), piece(spark(), { x: 200, y: 44, s: .55, anim: 'twinkle', i: 3, cx: 12, cy: 12 })],
    sparkle: () => [piece(spark(), { x: 236, y: 8, s: 1.1, anim: 'twinkle', cx: 12, cy: 12 }), piece(spark(), { x: 170, y: 24, s: .9, anim: 'twinkle', i: 1, cx: 12, cy: 12 }), piece(spark(), { x: 256, y: 40, s: .65, anim: 'twinkle', i: 2, cx: 12, cy: 12 })],
    twinkle: () => [piece(spark(), { x: 232, y: 18, s: .9, anim: 'twinkle', cx: 12, cy: 12 }), piece(spark(), { x: 258, y: 44, s: .55, anim: 'twinkle', i: 1, cx: 12, cy: 12 })],
    steam: () => [piece(wisp(), { x: 92, y: 138, s: 1, anim: 'rise', cx: 6, cy: 21 }), piece(wisp(), { x: 104, y: 142, s: 1, anim: 'rise', i: 1, cx: 6, cy: 21 }), piece(wisp(), { x: 116, y: 138, s: 1, anim: 'rise', i: 2, cx: 6, cy: 21 })], // 奶茶杯口在 (110, 182) 左右
    sweat: () => [piece(drop(), { x: 196, y: 40, s: 1, anim: 'slide', cx: 12, cy: 14 })],
    // 睡著時頭上的 z z Z（一直循環，到醒來為止）
    doze: () => [piece(zee('z'), { x: 0, y: 30, s: .7, anim: 'zz', cx: 8, cy: 14 }), piece(zee('z'), { x: 10, y: 18, s: .9, anim: 'zz', i: 1, cx: 8, cy: 14 }), piece(zee('Z'), { x: 22, y: 4, s: 1.1, anim: 'zz', i: 2, cx: 9, cy: 14 })],
  };

  // 每個 SVG 的漸層 id 都要不一樣：同一頁有兩個同名 id 時，瀏覽器只認第一個（而且藏起來的那個會讓填色整個消失）
  let uid = 0;
  function svgOf(kind, { w = W, h = H } = {}) {
    const mk = KINDS[kind];
    if (!mk) return '';
    const u = `_${(uid = (uid + 1) % 100000)}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="emote-svg">${DEFS}${mk().join('')}</svg>`.replace(/(em(?:Gold|Rose|Sky|Cream|Grey))(?=[")])/g, `$1${u}`);
  }

  // 在 host 裡飄一個表情，ms 後自己消失（同一時間只有一個；新的會蓋掉舊的）
  function show(host, kind, ms = 2400) {
    clear(host);
    const html = svgOf(kind);
    if (!html) return null;
    const el = document.createElement('div');
    el.className = 'emote';
    el.dataset.kind = kind;
    el.style.setProperty('--ms', `${ms}ms`);
    el.innerHTML = html;
    host.appendChild(el);
    el._timer = setTimeout(() => el.remove(), ms + 400);
    return el;
  }
  function clear(host) {
    for (const el of host.querySelectorAll(':scope > .emote')) { clearTimeout(el._timer); el.remove(); }
  }
  const Emotes = { KINDS: Object.keys(KINDS), svgOf, show, clear };
  if (typeof module !== 'undefined' && module.exports) module.exports = Emotes;
  else root.Emotes = Emotes;
})(typeof window !== 'undefined' ? window : globalThis);
