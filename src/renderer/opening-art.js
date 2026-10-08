// 🎬 開場用的道具與特效（SVG 字串，舞台座標 960×540）。比例：森林樹洞那層 ≈4.5 px/cm、櫃台艾琳那層 ≈6.7 px/cm
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpeningArt = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  // ── 版面（分鏡 v8 定稿的座標）──
  const L = {
    COUNTER_Y: 367,            // 櫃台上緣：同一張背景切出前景蓋在艾琳前面
    ITEM_Y: 392,               // 櫃台上東西的底（對話框從 398 開始）
    ERIN: { s: 0.33, x: 310, y: 11 }, ERIN_RIGHT: { s: 0.33, x: 520, y: 11 }, // 立繪 1093×1200 縮 0.33，腰對齊櫃台
    HOLLOW: { x: 646, y: 372 },                 // 森林：樹洞底部中心
    KITTEN_H: 77, CLOAK_H: 130, CAT_H: 180,     // 縮成一團的小貓 ≈17cm、裹斗篷 ≈29cm、櫃台上的白貓 ≈27cm
    CAT_X: 480,
  };
  // 去背圖的寬高比（assets/opening/）
  const RATIO = { kitten_wet: 276 / 360, kitten_cloak: 1, cloak_empty: 1, mini_sleep: 449 / 480, mini_startled: 495 / 480 };

  const sparkle = (x, y, r, c = '#ffd66b', o = 1) => `<path transform="translate(${x} ${y})" d="M0,${-r} C${r * .14},${-r * .14} ${r * .14},${-r * .14} ${r},0 C${r * .14},${r * .14} ${r * .14},${r * .14} 0,${r} C${-r * .14},${r * .14} ${-r * .14},${r * .14} ${-r},0 C${-r * .14},${-r * .14} ${-r * .14},${-r * .14} 0,${-r} Z" fill="${c}" opacity="${o}"/>`;
  const drop = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0,-12 C5,-4 8,0 8,4 A8,8 0 0 1 -8,4 C-8,0 -5,-4 0,-12 Z" fill="#9fd3ff" stroke="#fff" stroke-width="1.6"/>`;

  // 奶茶馬克杯（底部中心 x, y）
  const mug = (x, y, { scale = 1.15, steam = true } = {}) => `<g transform="translate(${x} ${y}) scale(${scale})">
    <ellipse cx="0" cy="0" rx="26" ry="6" fill="#000" opacity=".18"/>
    <path d="M-22,-44 L22,-44 L18,-4 Q17,2 10,2 L-10,2 Q-17,2 -18,-4 Z" fill="#f7f1e6" stroke="#8a6a52" stroke-width="2"/>
    <path d="M21,-36 q16,0 15,14 q-1,12 -18,10" fill="none" stroke="#8a6a52" stroke-width="5"/>
    <path d="M21,-36 q16,0 15,14 q-1,12 -18,10" fill="none" stroke="#f7f1e6" stroke-width="2.4"/>
    <ellipse cx="0" cy="-44" rx="22" ry="5.5" fill="#d9b289" stroke="#8a6a52" stroke-width="2"/>
    <ellipse cx="-5" cy="-45" rx="9" ry="2" fill="#ecd0ad"/>
    <path d="M-20,-24 L20,-24" stroke="#4fa8ff" stroke-width="3" opacity=".5"/>
    ${steam ? '<g class="op-steam" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"><path d="M-8,-58 q-6,-8 0,-16 q6,-8 0,-16"/><path d="M6,-60 q-6,-8 0,-16 q6,-8 0,-14"/></g>' : ''}
  </g>`;
  // 登記簿（闔著平放，30cm）
  const book = (x) => `<g transform="translate(${x} ${L.ITEM_Y}) scale(1.8)"><path d="M-56,0 L56,0 L48,-18 L-46,-18 Z" fill="#34437a" stroke="#24305c" stroke-width="2"/><path d="M-56,0 L56,0 L56,5 L-56,5 Z" fill="#f3ead6" stroke="#cdbf9f" stroke-width="1"/><path d="M-12,-14 L12,-14 L13,-4 L-13,-4 Z" fill="#f0b23a"/></g>`;
  // 「三號櫃台」的牌子
  const sign3 = (cx = 885) => `<g transform="translate(${cx} ${L.ITEM_Y}) scale(1.35) translate(-885 -366)">
    <rect x="844" y="356" width="82" height="12" rx="2" fill="#5e3d26"/>
    <rect x="850" y="312" width="70" height="46" rx="7" fill="#7a5236" stroke="#5e3d26" stroke-width="2"/>
    <circle cx="871" cy="335" r="13" fill="#e2b04c" stroke="#a87a22" stroke-width="2"/>
    <text x="871" y="341" text-anchor="middle" font-size="17" font-weight="900" fill="#2a2d4a">3</text>
    <text x="903" y="331" text-anchor="middle" font-size="11" font-weight="800" fill="#fdf1d6">三號</text>
    <text x="903" y="346" text-anchor="middle" font-size="11" font-weight="800" fill="#fdf1d6">櫃台</text>
  </g>`;
  // 地上的小鐵杯（≈9cm）
  const tin = ({ steam = false, empty = false } = {}) => `<g transform="translate(726 388) scale(1.4)">
    <ellipse cx="0" cy="0" rx="20" ry="5" fill="#000" opacity=".3"/>
    <path d="M-16,-22 L16,-22 L13,-2 Q12,2 8,2 L-8,2 Q-12,2 -13,-2 Z" fill="#9aa3bd" stroke="#4b5270" stroke-width="2"/>
    <path d="M15,-18 q10,2 8,10 q-2,6 -10,5" fill="none" stroke="#4b5270" stroke-width="2.5"/>
    <ellipse cx="0" cy="-22" rx="16" ry="4.5" fill="${empty ? '#5d6584' : '#d9b289'}" stroke="#4b5270" stroke-width="2"/>
    ${steam ? '<g class="op-steam" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"><path d="M-6,-30 q-6,-8 0,-16 q6,-8 0,-16"/><path d="M7,-32 q-6,-8 0,-16 q6,-8 0,-14"/></g>' : ''}
  </g>`;
  // 黑暗裡的一雙藍眼睛（小貓的眼距 ≈3cm → 20px，光暈另外放大）
  const eyes = (x = 150, y = 336) => `<defs><radialGradient id="opEg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#8fd0ff" stop-opacity=".55"/><stop offset="1" stop-color="#8fd0ff" stop-opacity="0"/></radialGradient></defs>
    <g class="op-eyes"><ellipse cx="${x + 10}" cy="${y}" rx="46" ry="26" fill="url(#opEg)"/>
    <path d="M${x - 5},${y} q5,-5 10,0 q-5,5 -10,0 z" fill="#b8e6ff"/><ellipse cx="${x}" cy="${y}" rx="1.1" ry="3.4" fill="#0b1630"/>
    <path d="M${x + 15},${y} q5,-5 10,0 q-5,5 -10,0 z" fill="#b8e6ff"/><ellipse cx="${x + 20}" cy="${y}" rx="1.1" ry="3.4" fill="#0b1630"/></g>`;
  const shiver = (x = L.HOLLOW.x, y = L.HOLLOW.y) => `<g class="op-shiver" stroke="#c9d4f5" stroke-width="2" stroke-linecap="round" fill="none" opacity=".9"><path d="M${x - 40},${y - 50} q-4,5 0,10 q4,5 0,10"/><path d="M${x + 40},${y - 50} q4,5 0,10 q-4,5 0,10"/></g>`;
  const zzz = (x = 560, y = 230) => `<g class="op-zzz" font-weight="900" fill="#46578f" stroke="#fff" stroke-width="5" paint-order="stroke"><text x="${x}" y="${y}" font-size="18">z</text><text x="${x + 16}" y="${y - 16}" font-size="23">z</text><text x="${x + 36}" y="${y - 36}" font-size="30">Z</text></g>`;
  const bang = (x, y, s = 1) => `<g class="op-pop" transform="translate(${x} ${y}) scale(${s})"><path d="M0,-34 L8,-14 L28,-20 L16,-2 L30,12 L10,12 L6,32 L-4,14 L-24,24 L-14,4 L-30,-8 L-10,-12 Z" fill="#ffd66b" stroke="#fff" stroke-width="3"/><text x="0" y="12" text-anchor="middle" font-size="30" font-weight="900" fill="#34437a">!</text></g>`;
  const shock = (x, y) => `<g stroke="#46578f" stroke-width="3" stroke-linecap="round"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 22}"/><line x1="${x + 12}" y1="${y - 6}" x2="${x + 12}" y2="${y + 22}"/><line x1="${x + 24}" y1="${y}" x2="${x + 24}" y2="${y + 22}"/></g>`;
  const ring = (cx, cy, rx, ry) => `<g class="op-ring"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#ffd66b" stroke-width="4" opacity=".9"/><ellipse cx="${cx}" cy="${cy}" rx="${rx - 14}" ry="${ry - 5}" fill="none" stroke="#fff3c4" stroke-width="2" stroke-dasharray="6 8" opacity=".9"/></g>`;

  // 登記簿（攤開）：名字欄的位置給 HTML 輸入框用（舞台座標）
  const BOOK = { x: 28, y: 52, field: { x: 278, y: 186, w: 160, h: 46 } };
  function regBook({ name = null, blank = false, glow = false } = {}) {
    const field = name
      ? `<text x="330" y="168" text-anchor="middle" font-family="Noto Serif CJK TC, serif" font-weight="900" font-size="${Array.from(name).length > 6 ? 26 : 36}" fill="#24305c">${esc(name)}</text>`
      : blank ? '<text x="330" y="166" text-anchor="middle" font-size="15" fill="#b9a988">（先空著）</text>' : '';
    return `<g transform="translate(${BOOK.x} ${BOOK.y})">
      <rect x="6" y="10" width="436" height="270" rx="10" fill="#000" opacity=".25"/>
      <rect x="0" y="0" width="440" height="270" rx="10" fill="#6b4a32"/>
      <path d="M12,10 L216,14 L216,262 L12,258 Z" fill="#fbf4e4"/>
      <path d="M224,14 L428,10 L428,258 L224,262 Z" fill="#fdf7ea"/>
      <rect x="214" y="12" width="12" height="252" fill="#e6d8b8"/>
      <text x="114" y="52" text-anchor="middle" font-family="Noto Serif CJK TC, serif" font-weight="900" font-size="22" fill="#34437a">冒險者登記簿</text>
      <text x="114" y="76" text-anchor="middle" font-weight="700" font-size="11" fill="#8a6a2a">星盾公會　晨風鎮分會・三號櫃台</text>
      <g stroke="#e3d6b6" stroke-width="1.5">${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="30" y1="${108 + i * 26}" x2="198" y2="${108 + i * 26}"/>`).join('')}</g>
      ${glow ? '<ellipse cx="330" cy="64" rx="80" ry="26" fill="#ffd66b" opacity=".35"/>' : ''}
      <text x="330" y="74" text-anchor="middle" font-family="Noto Serif CJK TC, serif" font-weight="900" font-size="30" fill="#c98a15">No. 001</text>
      <text x="330" y="118" text-anchor="middle" font-weight="700" font-size="14" fill="#6c6f8e">冒險者的名字</text>
      ${field}
      <line x1="250" y1="186" x2="410" y2="186" stroke="#cdbf9f" stroke-width="1.5"/>
      <text x="330" y="222" text-anchor="middle" font-size="13" fill="#8a6a2a">登記日：${today()}</text>
      ${name || blank ? '<g class="op-pop" transform="translate(398 238) rotate(-12)"><circle r="17" fill="none" stroke="#d8445c" stroke-width="2.5"/><text y="5" text-anchor="middle" font-size="13" font-weight="900" fill="#d8445c">受理</text></g>' : ''}
    </g>`;
  }
  const today = () => { const d = new Date(); return `${d.getMonth() + 1}／${d.getDate()}`; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 每個 prop 的 SVG（依步驟名稱組合）
  function prop(key) {
    switch (key) {
      case 'shiver': return shiver();
      case 'items': return book(150) + mug(316, L.ITEM_Y) + sign3();
      case 'sign': return sign3();
      case 'bookLeft': return book(150);
      case 'mugCenter': return mug(492, L.ITEM_Y, { scale: 1.25 }) + sparkle(462, 300, 9) + sparkle(526, 288, 7) + sparkle(494, 268, 6, '#fff3c4');
      case 'zzz': return zzz();
      case 'bell': return shock(452, 182) + bang(586, 214, 0.9);
      case 'transform': return ring(490, 352, 190, 26) + sparkle(330, 150, 14) + sparkle(660, 110, 11) + drop(612, 70, 1.1);
      case 'sweat': return drop(606, 80, 1.05);
      case 'sparkles': return sparkle(150, 384, 11) + sparkle(92, 382, 7, '#fff6c8') + sparkle(420, 60, 11) + sparkle(640, 90, 8, '#fff6c8');
      case 'tinWarm': return tin({ steam: true });
      case 'tinEmpty': return tin({ empty: true });
      case 'eyes': return eyes();
      default: return '';
    }
  }

  return { L, RATIO, BOOK, prop, regBook, sparkle, mug, book, sign3, tin, eyes, esc };
}));
