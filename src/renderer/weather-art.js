// ☁ 天候水晶的小圖：一顆水晶，裡面映著現在的天空（晴、夜、雲、霧、雨、雪、雷）
// 只用實色（不用漸層 id，同一頁很多張也不會互相干擾）；跟金幣、表情符號同一套畫風：海軍藍描邊、圓角
// 每個零件包在 <g class="wx-…"> 裡：style.css 讓它們動起來（太陽轉、雲飄、雨滴落、雪花轉、閃電閃）
(function (root) {
  'use strict';
  const NAVY = '#34437a', GOLD = '#f2b93b', GOLD_DEEP = '#c98a15', SKY = '#7ec3ff', BLUE = '#2f6fb0', CLOUD = '#ffffff', GREY = '#9aa0b8';
  const S = 'stroke-linejoin="round" stroke-linecap="round"';
  // 水晶：淡淡的一顆寶石墊在後面（天空的小圖畫大一點，18px 也看得清楚）；tint＝水晶的顏色（白天淡藍、晚上深藍、看不到天空時灰）
  const gem = (tint) => `<path d="M6.5 3 H17.5 L22 8.6 L12 21.6 L2 8.6 Z" fill="${tint}" stroke="${NAVY}" stroke-width="1.3" stroke-opacity=".85" ${S}/><path d="M2.4 8.6 H21.6 M6.5 3 L9.3 8.6 L12 21.6 M17.5 3 L14.7 8.6 L12 21.6" fill="none" stroke="#ffffff" stroke-width=".8" opacity=".6" class="wx-shine" ${S}/>`;
  const sun = (x, y, r = 4.2) => `<g class="wx-rays" stroke="${GOLD_DEEP}" stroke-width="1.5" ${S}><path d="M${x} ${y - r - 3}v1.6M${x} ${y + r + 1.4}v1.6M${x - r - 3} ${y}h1.6M${x + r + 1.4} ${y}h1.6M${x - r - 1.6} ${y - r - 1.6}l1.1 1.1M${x + r + .5} ${y + r + .5}l1.1 1.1M${x + r + 1.6} ${y - r - 1.6}l-1.1 1.1M${x - r - .5} ${y + r + .5}l-1.1 1.1"/></g><g class="wx-sun"><circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" stroke="${GOLD_DEEP}" stroke-width="1.4"/><circle cx="${x - r * .35}" cy="${y - r * .35}" r="${r * .28}" fill="#fff" opacity=".85"/></g>`;
  const moon = (x, y) => `<g class="wx-moon"><path d="M${x + 2} ${y - 6} A6.2 6.2 0 1 0 ${x + 5.6} ${y + 3.6} A4.8 4.8 0 1 1 ${x + 2} ${y - 6} Z" fill="#ffe28a" stroke="${GOLD_DEEP}" stroke-width="1.4" ${S}/></g>`;
  const cloud = (x, y, s = 1, fill = CLOUD) => `<g class="wx-cloud"><path transform="translate(${x} ${y}) scale(${s})" d="M-4.6 2.2 C-6.4 2.2 -6.8 -0.6 -4.8 -1 C-4.6 -3.4 -1.4 -4 -0.4 -2 C0.8 -3.6 3.8 -2.8 3.6 -0.6 C5.6 -0.4 5.6 2.2 3.8 2.2 Z" fill="${fill}" stroke="${NAVY}" stroke-width="${1.5 / s}" ${S}/></g>`;
  const drop = (x, y) => `<g class="wx-drop"><path d="M${x} ${y - 2.4} C${x} ${y - 2.4} ${x - 1.8} ${y} ${x - 1.8} ${y + .9} A1.8 1.8 0 0 0 ${x + 1.8} ${y + .9} C${x + 1.8} ${y} ${x} ${y - 2.4} ${x} ${y - 2.4} Z" fill="${SKY}" stroke="${BLUE}" stroke-width="1"/></g>`;
  const flake = (x, y) => `<g class="wx-flake"><g stroke="${BLUE}" stroke-width="1.8" ${S}><path d="M${x} ${y - 5.5}v11M${x - 4.8} ${y - 2.75}l9.6 5.5M${x - 4.8} ${y + 2.75}l9.6 -5.5"/></g><circle cx="${x}" cy="${y}" r="1.4" fill="${SKY}" stroke="${BLUE}" stroke-width=".8"/></g>`;
  const bolt = (x, y) => `<g class="wx-bolt"><path d="M${x + 1} ${y - 1.5} L${x - 2.2} ${y + 3} H${x + .3} L${x - 1} ${y + 7} L${x + 3.2} ${y + 1.8} H${x + .7} L${x + 2.2} ${y - 1.5} Z" fill="${GOLD}" stroke="${GOLD_DEEP}" stroke-width=".9" ${S}/></g>`;
  const fogLines = (y) => `<g class="wx-fog" stroke="${GREY}" stroke-width="2" ${S}><path d="M5 ${y}h14M7 ${y + 4}h10M5 ${y + 8}h14"/></g>`;

  const INSIDE = {
    clear: () => sun(12, 11, 4.2),
    night: () => moon(11, 11.5),
    partly: () => sun(9, 8.4, 3.4) + cloud(14, 13.4, 1.15),
    cloudy: () => cloud(12, 12, 1.5),
    fog: () => fogLines(7.5),
    drizzle: () => cloud(12, 9.2, 1.3) + drop(12, 17),
    rain: () => cloud(12, 8.8, 1.3) + drop(9, 16.6) + drop(15, 17.4),
    heavy: () => cloud(12, 8.4, 1.3, '#dfe6f5') + drop(7.6, 16.4) + drop(12, 17.6) + drop(16.4, 16.4),
    snow: () => flake(12, 11.6),
    thunder: () => cloud(12, 8.2, 1.3, '#dfe6f5') + bolt(12, 12),
    unknown: () => `<g class="wx-dots" fill="${GREY}"><circle cx="8" cy="10.5" r="1.4"/><circle cx="12" cy="10.5" r="1.4"/><circle cx="16" cy="10.5" r="1.4"/></g>`,
  };
  const TINT = { night: '#b9c8ec', unknown: '#e4e6ee' };

  function svg(kind, { size = 20 } = {}) {
    const k = INSIDE[kind] ? kind : 'unknown';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" class="wx-svg" aria-hidden="true">${gem(TINT[k] || '#dff1ff')}${INSIDE[k]()}</svg>`;
  }

  const WxArt = { svg, KINDS: Object.keys(INSIDE) };
  if (typeof module === 'object' && module.exports) module.exports = WxArt;
  else root.WxArt = WxArt;
})(typeof window !== 'undefined' ? window : globalThis);
