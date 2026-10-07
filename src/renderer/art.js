// 🎨 雜貨舖的小圖：櫃台吊飾／擺設、禮物圖示、兔族雙胞胎的頭像、星座卡的卡面
// 禮物、吊飾、擺設、雙胞胎頭像：用 AI 畫的圖（assets/shop/<id>.png，跟艾琳立繪同一種畫風；
//   提示詞在 assets/shop/PROMPTS.md，原圖 assets/raw/shop/，tools/cut_sheet.py 去背切割）。
//   PNG 清單裡沒有的 id 用下面的 SVG（跟 emotes.js 同一套畫風：粗圓的海軍藍描邊、柔和漸層），星座卡也是 SVG
// UMD：畫面用 window.Art，測試可以 require
(function (root) {
  'use strict';
  const NAVY = '#34437a';
  const S = 'stroke-linejoin="round" stroke-linecap="round" style="paint-order:stroke"';
  const GRADS = {
    Gold: ['#fff3c2', '#f2b93b'], Rose: ['#ffe8ee', '#ff9fb8'], Sky: ['#eaf6ff', '#7ec3ff'], Cream: ['#fffdf7', '#f3e6c4'],
    Grey: ['#f6f7fb', '#b9bfd3'], Green: ['#e3f7d8', '#6dbb6a'], Brown: ['#f3d2a8', '#b9783f'], Red: ['#ff9a9a', '#d8445c'],
    Blue: ['#e3ecff', '#6f8ff0'], Bread: ['#ffe2a8', '#d98d3a'], Glass: ['#ffffff', '#cfeaff'], Wood: ['#e7b98a', '#9a5f33'],
    Cuke: ['#c9f0a8', '#4f9a45'],
  };
  let uid = 0;
  // 每張 SVG 的漸層 id 都加後綴（同一頁有同名 id 時，瀏覽器只認第一個）
  function wrap(w, h, body, cls = '') {
    const u = `_${(uid = (uid + 1) % 100000)}`;
    const defs = Object.entries(GRADS).map(([k, [a, b]]) => `<linearGradient id="ar${k}${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('');
    const str = `<linearGradient id="arStr${u}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="34"><stop offset="0" stop-color="${NAVY}" stop-opacity="0"/><stop offset="1" stop-color="${NAVY}" stop-opacity=".8"/></linearGradient>`; // 吊飾的線：上面淡掉（不會像從半空中垂下來）
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" class="art ${cls}"><defs>${defs}${str}</defs>${body.replace(/url\(#ar(\w+)\)/g, `url(#ar$1${u})`)}</svg>`;
  }
  const g = (k) => `url(#ar${k})`;
  const shine = (x, y, r = 2.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".85"/>`;
  const string = (y2) => `<path d="M30 0 L30 ${y2}" stroke="url(#arStr)" stroke-width="1.6"/>`;

  // ---------- 吊飾（60×110，從上面垂下來；整個會輕輕擺動）----------
  const HANG = {
    bell: () => `${string(34)}
      <path d="M24 36 C24 33 36 33 36 36 L35 40 L25 40 Z" fill="${g('Red')}" stroke="${NAVY}" stroke-width="2" ${S}/>
      <path d="M30 40 C20 40 17 50 17 60 C17 66 15 69 12 72 L48 72 C45 69 43 66 43 60 C43 50 40 40 30 40 Z" fill="${g('Grey')}" stroke="${NAVY}" stroke-width="2.6" ${S}/>
      <circle cx="30" cy="76" r="4.5" fill="${g('Gold')}" stroke="${NAVY}" stroke-width="2"/>
      <path d="M22 50 C21 55 21 60 21.5 64" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>`,
    chime: () => `${string(30)}
      <path d="M14 50 C14 38 21 30 30 30 C39 30 46 38 46 50 Z" fill="${g('Glass')}" stroke="${NAVY}" stroke-width="2.4" ${S}/>
      <path d="M19 44 C21 38 25 35 29 34" stroke="#7ec3ff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <circle cx="24" cy="41" r="2.4" fill="#ff9fb8"/><circle cx="36" cy="40" r="2" fill="#f2b93b"/>
      <path d="M30 50 L30 60" stroke="${NAVY}" stroke-width="1.4"/>
      <path d="M24 60 L36 60 L37 90 L23 90 Z" fill="${g('Cream')}" stroke="${NAVY}" stroke-width="2" ${S}/>
      <path d="M27 68 L33 68 M27 74 L33 74 M27 80 L32 80" stroke="#7ec3ff" stroke-width="1.6" stroke-linecap="round"/>`,
    starcharm: () => `${string(30)}
      <path d="M30 30 L35 41 L47 42 L38 50 L41 62 L30 56 L19 62 L22 50 L13 42 L25 41 Z" fill="${g('Gold')}" stroke="${NAVY}" stroke-width="2.4" ${S}/>
      ${shine(26, 42, 2.4)}
      <path d="M30 60 L30 76" stroke="${NAVY}" stroke-width="1.4" opacity=".7"/>
      <path d="M30 76 L33 82 L39 83 L34.5 87 L36 93 L30 90 L24 93 L25.5 87 L21 83 L27 82 Z" fill="${g('Gold')}" stroke="${NAVY}" stroke-width="2" ${S}/>`,
    lantern: () => `${string(28)}
      <rect x="20" y="28" width="20" height="6" rx="2" fill="${g('Wood')}" stroke="${NAVY}" stroke-width="2"/>
      <path d="M16 36 C12 46 12 60 16 70 L44 70 C48 60 48 46 44 36 Z" fill="${g('Rose')}" stroke="${NAVY}" stroke-width="2.6" ${S}/>
      <path d="M24 37 C22 46 22 60 24 69 M36 37 C38 46 38 60 36 69" stroke="#e0567a" stroke-width="1.6" fill="none" opacity=".7"/>
      <ellipse cx="30" cy="53" rx="7" ry="9" fill="#fff6c8" opacity=".9"/>
      <rect x="20" y="70" width="20" height="6" rx="2" fill="${g('Wood')}" stroke="${NAVY}" stroke-width="2"/>
      <path d="M27 76 L27 96 L33 96 L33 76" fill="${g('Cream')}" stroke="${NAVY}" stroke-width="1.8" ${S}/>
      <path d="M29 82 L31 82 M29 87 L31 87" stroke="${NAVY}" stroke-width="1.4" stroke-linecap="round"/>`,
  };

  // ---------- 擺設（72×72，放在艾琳腳邊）----------
  const DESK = {
    bluebell: () => `
      <path d="M36 44 C30 30 24 24 18 20 M36 44 C38 30 42 22 48 16 M36 44 C36 34 34 26 32 18" stroke="#4f9a45" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M22 34 C14 30 12 24 16 22 C22 24 24 30 22 34 Z M50 30 C58 26 60 20 56 18 C50 20 48 26 50 30 Z" fill="${g('Green')}" stroke="${NAVY}" stroke-width="2" ${S}/>
      ${[[18, 20], [48, 16], [32, 16], [26, 26]].map(([x, y]) => `<path d="M${x - 6} ${y} C${x - 6} ${y - 7} ${x + 6} ${y - 7} ${x + 6} ${y} L${x + 4} ${y + 3} L${x + 2} ${y} L${x} ${y + 3} L${x - 2} ${y} L${x - 4} ${y + 3} Z" fill="${g('Blue')}" stroke="${NAVY}" stroke-width="1.8" ${S}/>`).join('')}
      <path d="M20 44 L52 44 L48 68 L24 68 Z" fill="${g('Brown')}" stroke="${NAVY}" stroke-width="2.6" ${S}/>
      <rect x="18" y="42" width="36" height="7" rx="3" fill="${g('Wood')}" stroke="${NAVY}" stroke-width="2.4"/>
      <path d="M27 52 L29 63" stroke="#fff" stroke-width="2" opacity=".55" stroke-linecap="round"/>`,
    pillow: () => `
      <path d="M8 40 C8 28 20 20 36 20 C48 20 56 26 60 32 L68 24 C70 30 70 40 68 48 L60 42 C56 50 46 58 34 58 C18 58 8 50 8 40 Z" fill="${g('Bread')}" stroke="${NAVY}" stroke-width="2.8" ${S}/>
      <path d="M26 26 C30 32 30 46 26 52 M36 24 C40 32 40 48 36 54 M46 27 C49 34 49 45 46 51" stroke="#b9783f" stroke-width="2" fill="none" opacity=".55" stroke-linecap="round"/>
      <circle cx="18" cy="36" r="3" fill="${NAVY}"/>${shine(17, 35, 1)}
      <path d="M12 44 C15 46 18 46 20 44" stroke="${NAVY}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="22" cy="44" rx="3" ry="2" fill="#ff9fb8" opacity=".7"/>
      <path d="M20 58 C30 62 46 62 56 58" stroke="${NAVY}" stroke-width="2" opacity=".25" fill="none"/>`,
    piggy: () => `
      <path d="M36 14 C24 14 18 24 18 36 C18 44 14 50 10 56 L62 56 C58 50 54 44 54 36 C54 24 48 14 36 14 Z" fill="${g('Gold')}" stroke="${NAVY}" stroke-width="2.8" ${S}/>
      <rect x="29" y="22" width="14" height="4" rx="2" fill="${NAVY}"/>
      <path d="M8 56 L64 56 L62 64 L10 64 Z" fill="${g('Wood')}" stroke="${NAVY}" stroke-width="2.4" ${S}/>
      <path d="M30 14 C30 8 42 8 42 14" fill="none" stroke="${g('Red')}" stroke-width="4" stroke-linecap="round"/>
      <path d="M24 30 C23 36 23 42 24 47" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
      <circle cx="44" cy="44" r="4" fill="#fff3c2" stroke="${NAVY}" stroke-width="1.6"/><path d="M44 42 L44 46" stroke="${NAVY}" stroke-width="1.4"/>`,
    pigeon: () => `
      <ellipse cx="38" cy="44" rx="24" ry="17" fill="${g('Grey')}" stroke="${NAVY}" stroke-width="2.8"/>
      <circle cx="20" cy="30" r="12" fill="${g('Grey')}" stroke="${NAVY}" stroke-width="2.8"/>
      <path d="M22 36 C26 40 30 40 34 38" stroke="#9fd0b8" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M8 31 L2 33 L8 35 Z" fill="${g('Gold')}" stroke="${NAVY}" stroke-width="1.8" ${S}/>
      <path d="M13 28 C15 30 18 30 20 28" stroke="${NAVY}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M36 34 C46 30 56 34 60 42 C52 42 44 44 36 46 Z" fill="${g('Cream')}" stroke="${NAVY}" stroke-width="2" ${S} opacity=".9"/>
      <path d="M30 60 L30 64 M42 60 L42 64" stroke="#e0567a" stroke-width="2.6" stroke-linecap="round"/>
      <text x="44" y="22" font-family="Nunito, 'Segoe UI', sans-serif" font-weight="900" font-size="11" fill="#7ec3ff" stroke="${NAVY}" stroke-width="2.2" ${S}>z</text>
      <text x="52" y="14" font-family="Nunito, 'Segoe UI', sans-serif" font-weight="900" font-size="14" fill="#7ec3ff" stroke="${NAVY}" stroke-width="2.4" ${S}>Z</text>`,
    sealbox: () => `
      <path d="M8 30 L64 30 L62 64 L10 64 Z" fill="${g('Wood')}" stroke="${NAVY}" stroke-width="2.8" ${S}/>
      <path d="M6 22 L66 22 L64 30 L8 30 Z" fill="${g('Brown')}" stroke="${NAVY}" stroke-width="2.6" ${S} transform="rotate(-6 8 30)"/>
      <path d="M14 40 L58 40" stroke="#7a4a20" stroke-width="1.6" opacity=".5"/>
      <circle cx="36" cy="49" r="8" fill="${g('Red')}" stroke="${NAVY}" stroke-width="2.2"/>
      <path d="M36 44 L37.5 47.5 L41 48 L38.5 50.3 L39.2 54 L36 52.2 L32.8 54 L33.5 50.3 L31 48 L34.5 47.5 Z" fill="#ffd6dc" opacity=".9"/>
      <circle cx="22" cy="22" r="4" fill="${g('Red')}" stroke="${NAVY}" stroke-width="1.6" transform="rotate(-6 8 30)"/><circle cx="48" cy="18" r="4" fill="${g('Gold')}" stroke="${NAVY}" stroke-width="1.6" transform="rotate(-6 8 30)"/>`,
  };

  // ---------- 禮物圖示（48×48）----------
  const GIFT = {
    tea: () => `<path d="M12 18 L36 18 L33 42 L15 42 Z" fill="${g('Cream')}" stroke="${NAVY}" stroke-width="2.6" ${S}/><path d="M13 24 L35 24 L34 32 L14 32 Z" fill="${g('Brown')}" opacity=".85"/><path d="M14 18 L17 11 L20 18 M28 18 L31 11 L34 18" fill="#fff" stroke="${NAVY}" stroke-width="2" ${S}/><path d="M36 22 C42 22 42 30 35 31" fill="none" stroke="${NAVY}" stroke-width="2.4"/><path d="M20 8 C18 5 22 3 20 0" stroke="${NAVY}" stroke-width="1.6" fill="none" opacity=".4"/>`,
    fish: () => `<path d="M6 24 C12 15 26 14 34 20 L42 14 L42 34 L34 28 C26 34 12 33 6 24 Z" fill="${g('Brown')}" stroke="${NAVY}" stroke-width="2.6" ${S}/><circle cx="13" cy="22" r="2" fill="${NAVY}"/><path d="M20 19 L22 29 M26 19 L28 29" stroke="#7a4a20" stroke-width="1.6" opacity=".6"/>`,
    fishbread: () => `<path d="M5 25 C5 16 14 11 24 11 C32 11 36 14 39 18 L45 13 C46 18 46 29 45 34 L39 29 C36 35 31 38 23 38 C13 38 5 33 5 25 Z" fill="${g('Bread')}" stroke="${NAVY}" stroke-width="2.6" ${S}/><circle cx="13" cy="22" r="2.2" fill="${NAVY}"/><path d="M19 16 C22 21 22 30 19 34 M27 15 C30 21 30 31 27 35" stroke="#b9783f" stroke-width="1.8" fill="none" opacity=".6"/>`,
    bubble: () => `<path d="M30 2 L26 16" stroke="#ff9fb8" stroke-width="3.4" stroke-linecap="round"/><path d="M12 14 L36 14 L32 45 L16 45 Z" fill="${g('Cream')}" stroke="${NAVY}" stroke-width="2.6" ${S}/><path d="M13 22 L35 22 L32.5 44 L15.5 44 Z" fill="${g('Brown')}" opacity=".7"/>${[[19, 38], [24, 40], [29, 38], [21, 34], [27, 35]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${NAVY}"/>`).join('')}<rect x="10" y="11" width="28" height="5" rx="2" fill="${g('Sky')}" stroke="${NAVY}" stroke-width="2"/>`,
    flower: () => `<path d="M24 46 L18 26 M24 46 L24 22 M24 46 L31 24" stroke="#4f9a45" stroke-width="2.6" stroke-linecap="round"/>${[[16, 20], [24, 14], [32, 19]].map(([x, y]) => `<path d="M${x - 6} ${y} C${x - 6} ${y - 8} ${x + 6} ${y - 8} ${x + 6} ${y} L${x + 4} ${y + 3} L${x + 2} ${y} L${x} ${y + 3} L${x - 2} ${y} L${x - 4} ${y + 3} Z" fill="${g('Blue')}" stroke="${NAVY}" stroke-width="1.8" ${S}/>`).join('')}<path d="M16 36 L32 36 L28 44 L20 44 Z" fill="${g('Rose')}" stroke="${NAVY}" stroke-width="2" ${S}/>`,
    envelope: () => `<rect x="5" y="12" width="38" height="26" rx="2" fill="${g('Cream')}" stroke="${NAVY}" stroke-width="2.6"/><path d="M5 13 L24 28 L43 13" fill="none" stroke="${NAVY}" stroke-width="2.2"/><circle cx="24" cy="28" r="6" fill="${g('Red')}" stroke="${NAVY}" stroke-width="2"/><path d="M24 24.5 L25 27 L27.5 27.3 L25.6 29 L26.1 31.5 L24 30.2 L21.9 31.5 L22.4 29 L20.5 27.3 L23 27 Z" fill="#ffd6dc"/>`,
    ribbon: () => `<path d="M24 24 C16 14 6 14 6 22 C6 30 16 30 24 24 C32 30 42 30 42 22 C42 14 32 14 24 24 Z" fill="${g('Red')}" stroke="${NAVY}" stroke-width="2.6" ${S}/><path d="M22 26 L16 42 L21 39 L24 44 L26 27 Z M26 26 L32 42 L27 39 L24 44" fill="${g('Red')}" stroke="${NAVY}" stroke-width="2.2" ${S}/><circle cx="24" cy="24" r="4" fill="${g('Red')}" stroke="${NAVY}" stroke-width="2"/>`,
    seal: () => `<path d="M19 6 C19 2 29 2 29 6 L28 22 L20 22 Z" fill="${g('Wood')}" stroke="${NAVY}" stroke-width="2.4" ${S}/><rect x="15" y="21" width="18" height="6" rx="2" fill="${g('Gold')}" stroke="${NAVY}" stroke-width="2"/><circle cx="24" cy="38" r="9" fill="${g('Red')}" stroke="${NAVY}" stroke-width="2.4"/><path d="M24 32.5 L25.6 36 L29.3 36.4 L26.5 38.8 L27.3 42.5 L24 40.6 L20.7 42.5 L21.5 38.8 L18.7 36.4 L22.4 36 Z" fill="#ffd6dc"/>`,
    cucumber: () => `<path d="M8 36 C6 30 14 18 28 10 C36 6 42 8 41 13 C40 20 30 30 18 38 C13 41 9 40 8 36 Z" fill="${g('Cuke')}" stroke="${NAVY}" stroke-width="2.6" ${S}/>${[[16, 30], [22, 24], [29, 18], [34, 13]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#2f6b2a"/>`).join('')}<path d="M38 9 L42 5" stroke="#4f9a45" stroke-width="2.4" stroke-linecap="round"/>`,
  };

  // ---------- 兔族雙胞胎（棉棉：垂耳、奶油白頭髮；朵朵：立耳、奶茶色頭髮）----------
  function twins(speaker) {
    const head = (x, hair, ears, eyes, on) => `<g opacity="${on ? 1 : 0.55}">
      ${ears}
      <circle cx="${x}" cy="40" r="17" fill="#fff6ee" stroke="${NAVY}" stroke-width="2.4"/>
      <path d="M${x - 17} 38 C${x - 16} 24 ${x + 16} 24 ${x + 17} 38 C${x + 10} 32 ${x - 6} 30 ${x - 17} 38 Z" fill="${hair}" stroke="${NAVY}" stroke-width="2.2" ${S}/>
      ${eyes}
      <ellipse cx="${x - 9}" cy="47" rx="3.4" ry="2" fill="#ff9fb8" opacity=".7"/><ellipse cx="${x + 9}" cy="47" rx="3.4" ry="2" fill="#ff9fb8" opacity=".7"/>
      <path d="M${x - 2} 49 Q${x} 51 ${x + 2} 49" stroke="${NAVY}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M${x - 7} 24 C${x - 3} 20 ${x + 3} 20 ${x + 7} 24 C${x + 2} 22 ${x - 2} 22 ${x - 7} 24" fill="#fff" stroke="#7ec3ff" stroke-width="1.6"/></g>`;
    const mian = head(30, '#fff3dc',
      `<path d="M20 27 C8 27 1 44 5 61 C9 64 14 58 16 49 C18 41 20 34 23 29 Z M40 27 C52 27 59 44 55 61 C51 64 46 58 44 49 C42 41 40 34 37 29 Z" fill="#fff6ee" stroke="${NAVY}" stroke-width="2.4" ${S}/><path d="M14 35 C9 43 8 52 9 57 M46 35 C51 43 52 52 51 57" stroke="#ffc6d4" stroke-width="3.4" stroke-linecap="round" fill="none"/>`,
      `<path d="M21 42 Q24 39.5 27 42 M33 42 Q36 39.5 39 42" stroke="${NAVY}" stroke-width="2" fill="none" stroke-linecap="round"/>`, speaker !== 'duo');
    const duo = head(90, '#e6b98a',
      `<path d="M80 26 C74 12 76 0 82 0 C88 2 88 14 86 25 Z M96 25 C96 12 100 0 106 2 C110 6 104 18 100 27 Z" fill="#fff6ee" stroke="${NAVY}" stroke-width="2.4" ${S}/><path d="M82 6 C81 12 82 18 84 22 M103 7 C101 13 100 18 99 22" stroke="#ffc6d4" stroke-width="3" stroke-linecap="round"/>`,
      `<circle cx="84" cy="41" r="3" fill="${NAVY}"/><circle cx="96" cy="41" r="3" fill="${NAVY}"/><circle cx="85" cy="40" r="1" fill="#fff"/><circle cx="97" cy="40" r="1" fill="#fff"/>`, speaker !== 'mian');
    return wrap(120, 62, mian + duo, 'twins');
  }

  // ---------- 星座卡（90×120）：星星位置用卡片 id 算，同一張卡每次都一樣 ----------
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function constellation(id, n) {
    const rnd = seeded(id);
    const pts = [];
    for (let tries = 0; pts.length < n && tries < 400; tries++) {
      const p = { x: 14 + rnd() * 62, y: 14 + rnd() * 66, s: 1.4 + rnd() * 1.8 };
      if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 13)) pts.push(p);
    }
    // 連線：從最左邊的星開始，每次接最近的下一顆（像人畫星座那樣一筆畫）
    const order = [pts.sort((a, b) => a.x - b.x)[0]];
    const left = pts.slice(1);
    while (left.length) {
      const last = order[order.length - 1];
      left.sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y));
      order.push(left.shift());
    }
    return order;
  }
  const RBG = { 1: ['#2b3a6e', '#1a2246'], 2: ['#1f5a6e', '#123444'], 3: ['#4a2f7a', '#26174a'], 4: ['#7a5a12', '#2e2208'] };
  function card(c, { owned = true } = {}) {
    if (!owned) return wrap(90, 120, `<rect x="2" y="2" width="86" height="116" rx="9" fill="#3a3f58" stroke="#6c6f8e" stroke-width="2" stroke-dasharray="5 4"/><text x="45" y="70" text-anchor="middle" font-size="34" font-weight="900" fill="#6c6f8e" font-family="Nunito, 'Segoe UI', sans-serif">?</text>`, 'card-art locked');
    const pts = constellation(c.id, c.n || 6);
    const [a, b] = RBG[c.r] || RBG[1];
    const u = `cg${c.id}${(uid = (uid + 1) % 100000)}`;
    const frame = c.r >= 4 ? '#ffd66b' : c.r === 3 ? '#c9a7ff' : c.r === 2 ? '#8fe0e8' : '#9fb3e6';
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const dust = Array.from({ length: 14 }, (_, i) => { const r2 = seeded(c.id + i)(); const r3 = seeded(i + c.id)(); return `<circle cx="${(6 + r2 * 78).toFixed(1)}" cy="${(6 + r3 * 90).toFixed(1)}" r=".7" fill="#fff" opacity="${(0.25 + (r2 * r3)).toFixed(2)}"/>`; }).join('');
    const body = `<defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect x="2" y="2" width="86" height="116" rx="9" fill="url(#${u})" stroke="${frame}" stroke-width="2.6"/>
      ${c.r >= 4 ? `<rect x="6" y="6" width="78" height="108" rx="6" fill="none" stroke="#ffd66b" stroke-width="1" opacity=".6"/>` : ''}
      ${dust}
      <path d="${line}" stroke="${frame}" stroke-width="1.4" fill="none" opacity=".75" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.s.toFixed(1)}" fill="#fff" class="cstar" style="--d:${(i * 0.37) % 2}s"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(p.s * 2.6).toFixed(1)}" fill="${frame}" opacity=".18"/>`).join('')}
      <text x="45" y="106" text-anchor="middle" font-size="9" fill="${frame}" font-family="Nunito, 'Segoe UI', sans-serif" letter-spacing="1">${'★'.repeat(c.r)}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120" class="art card-art r${c.r}">${body}</svg>`;
  }

  // ---------- AI 畫的圖：有 PNG 就用 PNG ----------
  // 路徑相對 src/renderer/index.html；打包後在 app.asar 裡一樣找得到（package.json build.files 有 assets/shop）
  const PNG = new Set(['tea', 'fish', 'fishbread', 'bubble', 'cucumber', 'flower', 'envelope', 'ribbon', 'seal',
    'bell', 'chime', 'starcharm', 'lantern', 'bluebell', 'pillow', 'piggy', 'pigeon', 'sealbox', 'mian', 'duo']);
  const PNG_DIR = '../../assets/shop/';
  const img = (id, cls) => `<img class="art ${cls}" src="${PNG_DIR}${id}.png" alt="" draggable="false">`;
  const svg = {
    hang: (id) => (HANG[id] ? wrap(60, 110, HANG[id](), `hang ${id}`) : ''),
    desk: (id) => (DESK[id] ? wrap(72, 72, DESK[id](), `desk ${id}`) : ''),
    gift: (id) => (GIFT[id] ? wrap(48, 48, GIFT[id](), `gift ${id}`) : ''),
    twins,
  };
  const Art = {
    HANG: Object.keys(HANG), DESK: Object.keys(DESK), GIFT: Object.keys(GIFT), PNG, PNG_DIR, svg,
    hang: (id) => (PNG.has(id) ? img(id, `hang ${id}`) : svg.hang(id)),
    desk: (id) => (PNG.has(id) ? img(id, `desk ${id}`) : svg.desk(id)),
    ornament: (id) => (HANG[id] ? Art.hang(id) : DESK[id] ? Art.desk(id) : ''),
    gift: (id) => (PNG.has(id) ? img(id, `gift ${id}`) : svg.gift(id)),
    // 店員頭像：說話的那個在前面、亮的；另一個在後面、淡一點
    twins: (speaker) => (PNG.has('mian') && PNG.has('duo')
      ? `<span class="tw-pair">${['mian', 'duo'].map((w) => img(w, `tw ${w} ${(w === 'duo') === (speaker === 'duo') ? 'on' : ''}`)).join('')}</span>`
      : svg.twins(speaker)),
    card, constellation,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  else root.Art = Art;
})(typeof window !== 'undefined' ? window : globalThis);
