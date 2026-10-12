// 💗 好感升階動畫（漫畫）：好感第一次升到某一階 → 她頭上冒「!」→ 點她 → 主視窗裡一格一格放大看（每格自己的鏡頭），
// 最後拉遠拼成一整頁 → 點一下收回她身上，她小聲說一句、收進「🎬 回憶相簿」
// 分鏡定稿：dist/stageup/erin-stageup2-storyboard-v4.png（10/12）；劇本、台詞在 stageup-script.js
// （renderer.js 之後載入；用到 state、$、api、esc、nmR、setMarker、setEmotion、openDialog、enqueue、toast、openPanel、renderPanel、head、Emotes、idleDebug）
(function () {
  'use strict';
  const SU = StageupScript;
  const VW = 568, VH = 700; // 鏡頭的畫面（漫畫框裡：標題列下面、進度列上面）
  const ART = (n) => `../../assets/stageup/${n}`;
  const CHAR = (n) => `../../assets/character/${n}.png`;

  // ================= 零件（鏡頭座標：568×700）=================
  const svg = (inner, cls = '') => `<svg class="${cls}" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" style="position:absolute;left:0;top:0;overflow:visible">${inner}</svg>`;
  const img = (src, natW, s, fx, fy, x, y, extra = '') => `<img src="${src}" alt="" draggable="false" style="position:absolute;width:${(natW * s).toFixed(1)}px;left:${(x - fx * s).toFixed(1)}px;top:${(y - fy * s).toFixed(1)}px;${extra}">`;
  // 立繪（1093×1200）：原圖 (fx,fy) 放在畫面 (x,y)，倍率 s
  const pose = (name, s, fx, fy, x, y, extra = '') => img(CHAR(name), 1093, s, fx, fy, x, y, extra);
  const bgImg = (file, W, H, k, L, T, extra = '') => `<div style="position:absolute;left:${-L}px;top:${T}px;width:${(W * k).toFixed(1)}px;height:${(H * k).toFixed(1)}px;background:url('${ART(file)}') 0 0/100% 100%;${extra}"></div>`;
  // 第 a 步～第 b 步才看得到（"1"、"0-1"、"1+"）；cls 決定怎麼出現（淡入、滑進來、彈出來）
  const sv = (show, html, cls = '', style = '') => `<div class="sv ${cls}" data-show="${show}" style="${style}">${html}</div>`;
  const pop = (show, html, delay = 0, ox = VW / 2, oy = VH / 2) => `<div class="pop" data-show="${show}" data-delay="${delay}" style="transform-origin:${ox}px ${oy}px">${html}</div>`;

  function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  const sparkle = (x, y, r, c = '#ffd66b') => `<path transform="translate(${x} ${y})" d="M0,${-r} C${r * .14},${-r * .14} ${r * .14},${-r * .14} ${r},0 C${r * .14},${r * .14} ${r * .14},${r * .14} 0,${r} C${-r * .14},${r * .14} ${-r * .14},${r * .14} ${-r},0 C${-r * .14},${-r * .14} ${-r * .14},${-r * .14} 0,${-r} Z" fill="${c}"/>`;
  function focusLines(cx, cy, r0, n, color, seed) {
    const rnd = seeded(seed), R = Math.hypot(VW, VH);
    let out = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.05, r1 = r0 + rnd() * 40, w = 0.6 + rnd() * 2.6;
      const p = (ang, r) => `${(cx + Math.cos(ang) * r).toFixed(1)},${(cy + Math.sin(ang) * r).toFixed(1)}`;
      out += `<path d="M${p(a, r1)} L${p(a - w / R, R)} L${p(a + w / R, R)} Z" fill="${color}" opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`;
    }
    return out;
  }
  function softRays(cx, cy, color, n, o) {
    let s = '';
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = a + Math.PI / n * .55, R = 900; s += `<path d="M${cx},${cy} L${cx + Math.cos(a) * R},${cy + Math.sin(a) * R} L${cx + Math.cos(b) * R},${cy + Math.sin(b) * R} Z" fill="${color}" opacity="${o}"/>`; }
    return s;
  }
  // 少女漫畫的小花和光點
  function blooms(w, h, seed, color) {
    const r = seeded(seed);
    let out = '';
    for (let i = 0; i < 22; i++) {
      const x = r() * w, y = r() * h, k = 6 + r() * 12;
      if (r() < .5) out += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})" opacity=".75">${[0, 72, 144, 216, 288].map((d) => `<ellipse cx="0" cy="${(-k * .55).toFixed(1)}" rx="${(k * .32).toFixed(1)}" ry="${(k * .5).toFixed(1)}" fill="${color}" transform="rotate(${d})"/>`).join('')}<circle r="${(k * .22).toFixed(1)}" fill="#fff6c8"/></g>`;
      else out += sparkle(x.toFixed(0), y.toFixed(0), (k * .6).toFixed(1), '#fff');
    }
    return out;
  }
  const dotsDef = (id, color, size, r) => `<defs><pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}"/></pattern></defs>`;
  const twitch = (x, y, s = 1, flip = false) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${flip ? -s : s} ${s})" stroke="#2a2d4a" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M-14,-6 q-6,-8 0,-16"/><path d="M-24,0 q-8,-10 0,-22"/></g>`;
  const zoomUp = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="#2a2d4a" stroke-width="3" stroke-linecap="round"><line x1="-10" y1="0" x2="-10" y2="-34"/><line x1="0" y1="-6" x2="0" y2="-46"/><line x1="10" y1="0" x2="10" y2="-34"/></g>`;
  const heart = (x, y, s = 1, c = '#ff7aa8') => `<path transform="translate(${x} ${y}) scale(${s})" d="M0,6 C-6,-2 -16,4 -10,12 L0,22 L10,12 C16,4 6,-2 0,6 Z" fill="${c}" stroke="#fff" stroke-width="2.5"/>`;
  const drop = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0,-12 C5,-4 8,0 8,4 A8,8 0 0 1 -8,4 C-8,0 -5,-4 0,-12 Z" fill="#9fd3ff" stroke="#2a2d4a" stroke-width="1.6"/>`;
  // 一整團白煙（只描最外圈）
  function puff(cx, cy, s = 1) {
    const C = [[0, 0, 120], [-130, 30, 90], [130, 26, 96], [-70, -90, 88], [80, -96, 92], [-190, -40, 60], [196, -50, 64], [0, 110, 96], [-120, 120, 70], [130, 118, 74], [0, -150, 70]];
    const cir = (k, f) => C.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + k}" fill="${f}"/>`).join('');
    return `<g transform="translate(${cx} ${cy}) scale(${s})">${cir(4, '#cfc9dc')}${cir(0, '#fff')}<g fill="#f1eef7">${C.slice(0, 6).map(([x, y, r]) => `<circle cx="${x + r * .25}" cy="${y + r * .3}" r="${r * .55}"/>`).join('')}</g>${cir(-14, '#fff')}
      ${sparkle(-60, -40, 16, '#ffe9a8')}${sparkle(90, 40, 12, '#ffe9a8')}${sparkle(30, -120, 9, '#fff')}</g>`;
  }
  // 白瓷馬克杯（程式畫，柔和上色）
  function softMug(x, y, s = 1, rot = 0) {
    const id = `stMug${x}_${y}`;
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9e1d6"/><stop offset=".35" stop-color="#fffdf9"/><stop offset="1" stop-color="#d9cfc2"/></linearGradient></defs>
      <ellipse cx="0" cy="2" rx="44" ry="8" fill="#5a4030" opacity=".18"/>
      <path d="M44,-70 C78,-70 82,-26 46,-24" fill="none" stroke="#e4dbcf" stroke-width="13" stroke-linecap="round"/><path d="M44,-70 C78,-70 82,-26 46,-24" fill="none" stroke="#b9ab9a" stroke-width="1.6" opacity=".7"/>
      <path d="M-42,-96 L42,-96 L38,-8 Q37,0 28,0 L-28,0 Q-37,0 -38,-8 Z" fill="url(#${id})" stroke="#b9ab9a" stroke-width="1.8"/>
      <ellipse cx="0" cy="-96" rx="42" ry="9" fill="#efe7dc" stroke="#b9ab9a" stroke-width="1.8"/>
      <ellipse cx="0" cy="-95" rx="36" ry="6.5" fill="#c89a6c"/><ellipse cx="-8" cy="-96.5" rx="14" ry="2.2" fill="#e8c9a4" opacity=".8"/>
      <path d="M-30,-86 L-30,-16" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".7"/></g>`;
  }
  const steamUp = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"><path d="M-10,0 q-10,-14 0,-28 q10,-14 0,-28"/><path d="M12,-6 q-10,-14 0,-28"/></g>`;

  // 文字：對話框（尾巴指向說話的人）、爆炸框、場景字卡、圓圓的狀聲字、旁白
  function bubble({ x, y, w, text, tail, who = '', size = 16 }) {
    const lines = text.split('\n').length, h = Math.round(lines * size * 1.5 + 20);
    const bx = x + w / 2, by = y + h / 2;
    let t = '';
    if (tail) {
      const [tx, ty] = tail;
      const ang = Math.atan2(ty - by, tx - bx), px = -Math.sin(ang) * 12, py = Math.cos(ang) * 12;
      const k = Math.min((w / 2 - 18) / Math.max(Math.abs(Math.cos(ang)), .01), (h / 2 - 10) / Math.max(Math.abs(Math.sin(ang)), .01));
      const rx = bx + Math.cos(ang) * k, ry = by + Math.sin(ang) * k;
      const P = `${(rx + px).toFixed(1)},${(ry + py).toFixed(1)} ${tx},${ty} ${(rx - px).toFixed(1)},${(ry - py).toFixed(1)}`;
      t = svg(`<polygon points="${P}" fill="#fff"/><polyline points="${P}" fill="none" stroke="#2a2d4a" stroke-width="3" stroke-linejoin="round"/>`);
    }
    return `${t}<div class="st-bub" style="left:${x}px;top:${y}px;width:${w}px;font-size:${size}px">${who ? `<i class="who">${esc(who)}</i>` : ''}${esc(text).replace(/\n/g, '<br>')}</div>`;
  }
  function burst(cx, cy, rx, ry, text, size) {
    let pts = ''; const n = 20;
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; const k = i % 2 ? 0.74 : 1.1 + (i % 4 === 0 ? 0.12 : 0); pts += `${(cx + Math.cos(a) * rx * k).toFixed(1)},${(cy + Math.sin(a) * ry * k).toFixed(1)} `; }
    return svg(`<polygon points="${pts}" fill="#fff" stroke="#2a2d4a" stroke-width="3.2" stroke-linejoin="round"/>`) + `<div class="st-burst" style="left:${cx - rx}px;top:${cy - size * 0.72}px;width:${rx * 2}px;font-size:${size}px">${esc(text)}</div>`;
  }
  const cap = (x, y, t) => `<div class="st-cap" style="left:${x}px;top:${y}px">${esc(t)}</div>`;
  const csfx = (x, y, t, size, rot = 0, color = '#ff7aa8') => `<div class="st-sfx" style="left:${x}px;top:${y}px;font-size:${size}px;transform:rotate(${rot}deg);color:${color}">${esc(t)}</div>`;
  const nar = (x, y, t) => `<div class="st-nar" style="left:${x}px;top:${y}px">${esc(t)}</div>`;
  const toV = (x, y, c) => [VW / 2 + (x - c.x) * c.z, VH / 2 + (y - c.y) * c.z]; // 鏡頭內容座標 → 畫面座標

  // ================= 第 2 階「常客」=================
  // 後門（scene_backdoor 1672×941，高 700）；她坐在最上面那階（照門高 2.1m 換算，0.22 倍）
  const backdoor = () => bgImg('scene_backdoor.jpg', 1672, 941, .7445, 260, 0);
  const erinSit = () => img(ART('erin_sit_tea.webp'), 961, .22, 386, 1040, 300, 520);
  const giantShade = () => '<div style="position:absolute;inset:-200px;background:radial-gradient(ellipse 70% 60% at 92% 18%,rgba(46,34,70,.5),rgba(46,34,70,0) 70%)"></div>';
  const margaHand = () => img(ART('marga_hand.webp'), 1425, .42, 0, 0, 196, -82, 'filter:drop-shadow(0 18px 18px rgba(30,20,50,.35))');
  // 手指（marga_point）：指尖在原圖 (9,445)；rot 順時針角度
  const margaPoint = (x, y, s, rot = 0) => img(ART('marga_point.webp'), 1431, s, 9, 445, x, y, `transform-origin:${(9 * s).toFixed(1)}px ${(445 * s).toFixed(1)}px;transform:rotate(${rot}deg);filter:drop-shadow(0 14px 14px rgba(30,20,50,.3))`);
  // 台階的近景（模糊＝景深）＋毛球
  const stepClose = () => bgImg('scene_backdoor.jpg', 1672, 941, 1.6, 996, -544, 'filter:blur(3px) brightness(1.06) saturate(.92)') +
    '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,244,228,.42),rgba(255,236,214,.12) 70%)"></div>' + svg(blooms(VW, 430, 9, '#ffe2a8'));
  const ball = (file) => img(ART(file), 1101, .3, 550, 1100, 290, 575, 'filter:drop-shadow(0 10px 8px rgba(60,40,30,.22))');
  const tailImg = (x, y, h, rot, cls = '') => `<img class="${cls}" src="${ART('tail.webp')}" alt="" draggable="false" style="position:absolute;left:${x}px;top:${y}px;height:${h}px;transform:rotate(${rot}deg);transform-origin:30% 100%">`;
  const duskBg = (front = false, b = 1) => `<div style="position:absolute;left:0;top:0;width:${VW}px;height:${VH}px;background:url('${ART('scene_guild_dusk.jpg')}') -330px 0/auto 700px;filter:brightness(${b});${front ? 'clip-path:inset(476px 0 0 0)' : ''}"></div>`;
  // 小本子那一頁（notebook_page 1448×1086）：右頁上方寫「冒險者」（照紙的斜度）
  const NB = { k: .645, L: 287 };
  const nbName = (k, L, T, cls = '') => `<div class="st-nbname ${cls}" style="left:${(653 * k - L).toFixed(0)}px;top:${(369 * k - T).toFixed(0)}px">冒險者</div>`;
  const notebookFull = () => bgImg('notebook_page.jpg', 1448, 1086, NB.k, NB.L, 0) + nbName(NB.k, NB.L, 30);
  const notebookMini = (x, y, rot) => `<div class="st-nbmini" style="left:${x}px;top:${y}px;transform:rotate(${rot}deg)"><div style="position:absolute;left:-150px;top:-36px;width:${(1448 * .26).toFixed(0)}px;height:${(1086 * .26).toFixed(0)}px;background:url('${ART('notebook_page.jpg')}') 0 0/100% 100%"></div>${nbName(.26, 150, 48, 's')}</div>`;

  function show2() {
    const L = SU.LINES[2];
    const CAM1 = { x: 338, y: 372, z: 3 };
    const shots = [
      { // 1　午休・公會後門：呼～呼～吹奶茶（臉的特寫）→ 拉遠，大手托著便當伸進來
        start: CAM1,
        steps: [{ cam: CAM1, ms: 0, auto: 2300 }, { cam: { x: 300, y: 330, z: 1.3 }, ms: 2400 }],
        content: backdoor() + sv('1+', giantShade(), 'fade-slow') + erinSit() + svg(`<g class="st-rise">${steamUp(352, 372, .7)}</g>`) +
          sv('1+', margaHand(), 'slide', '--from:translate(340px,-260px)'),
        over: cap(10, 10, '午休・公會後門') +
          pop('0', csfx(40, 470, '呼～呼～', 30, -8, '#c98a15'), 300, 120, 490) +
          pop('0', svg(`<g class="st-blink">${twitch(...toV(298, 300, CAM1), 1.3)}${twitch(...toV(382, 318, CAM1), 1.3, true)}</g>`), 900) +
          pop('0', csfx(420, 96, '咚、咚', 24, 6, '#6c6f8e'), 1200, 460, 110) +
          pop('1', bubble({ x: 14, y: 214, w: 200, text: L.marga1, tail: [300, 150], who: SU.WHO.marga, size: 17 }), 2300, 110, 270),
      },
      { // 2　欸？！：猛推近，耳朵咻地豎直，奶茶差點噴出來
        start: { x: 284, y: 350, z: .98 },
        steps: [{ cam: { x: 290, y: 360, z: 1.08 }, ms: 280, fx: 'shake' }],
        content: svg(`<rect width="${VW}" height="${VH}" fill="#fff8e1"/>${softRays(284, 300, '#ffe9a8', 30, .9)}`) + pose('surprised', 1.12, 536, 368, 300, 330) +
          svg(`${softMug(96, 668, 1.15, -24)}`) + sv('0', svg(`<g fill="#d9b289" stroke="#fff" stroke-width="2">${[[150, 470, 12], [176, 430, 9], [120, 440, 10], [200, 470, 7], [96, 480, 7]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`), 'splash'),
        over: pop('0', svg(`${zoomUp(150, 64, 1.3)}${zoomUp(440, 54, 1.3)}`), 150) + pop('0', burst(170, 150, 110, 52, L.huh, 46), 250, 170, 150) + pop('0', csfx(222, 470, '噗', 40, -10, '#c98a15'), 450, 240, 490),
      },
      { // 3　故作鎮定：嘴上淡定，右下圓框裡尾巴啪噠啪噠
        start: { x: 284, y: 350, z: 1.05 },
        steps: [{ cam: { x: 284, y: 350, z: 1 }, ms: 4200, ready: 1900 }],
        content: svg(`${dotsDef('stD3', '#ffd1e0', 12, 2.6)}<rect width="${VW}" height="${VH}" fill="#fff6fa"/><rect width="${VW}" height="${VH}" fill="url(#stD3)"/>${blooms(VW, VH, 5, '#ffc1d6')}`) + pose('tea', .66, 520, 380, 220, 320) +
          sv('0', svg(drop(326, 254, 1.8)), 'drip'),
        over: pop('0', csfx(30, 60, '咳。', 34, -6, '#6c6f8e'), 200, 70, 80) +
          pop('0', bubble({ x: 300, y: 40, w: 250, text: L.deny, tail: [250, 330], size: 17 }), 700, 420, 90) +
          pop('0', `<div class="st-inset" style="left:318px;top:420px"><div style="position:absolute;inset:0;opacity:.3">${tailImg(86, 18, 200, -16)}</div>${tailImg(86, 18, 200, 14, 'st-swing')}${svg('<g stroke="#ff7aa8" stroke-width="4" fill="none" stroke-linecap="round"><path d="M40,60 q-18,30 0,60"/><path d="M190,40 q22,30 4,64"/><path d="M28,140 q-14,24 4,46"/></g>')}</div>`, 1300, 433, 535) +
          pop('0', csfx(300, 372, '啪噠啪噠', 32, -8), 1500, 380, 390),
      },
      { // 4　……尾巴。：巨大的手指指過來，臉紅到冒煙
        start: { x: 284, y: 350, z: 1 },
        steps: [{ cam: { x: 284, y: 352, z: 1.05 }, ms: 2200, ready: 1900 }],
        content: svg(`<defs><radialGradient id="stG4" cx=".45" cy=".5" r=".75"><stop offset="0" stop-color="#ffd6e2"/><stop offset="1" stop-color="#ff9ab8"/></radialGradient></defs><rect width="${VW}" height="${VH}" fill="url(#stG4)"/>${softRays(250, 360, '#fff', 24, .35)}`) +
          pose('shy', .82, 536, 440, 240, 380) + sv('0', margaPoint(318, 596, .62, -8), 'slide', '--from:translateX(360px)'),
        over: pop('0', bubble({ x: 380, y: 372, w: 150, text: L.tail, tail: [500, 470], who: SU.WHO.marga, size: 18 }), 900, 455, 390) +
          pop('0', svg(puff(250, 104, .36)), 1400, 250, 104) + pop('0', csfx(330, 70, '噗咻——', 34, 6), 1550, 400, 90),
      },
      { // 5　砰！→ 煙散了，台階上一團白毛球，躲在根本藏不住的奶茶杯後面
        start: { x: 284, y: 380, z: 1.12 }, enter: 'flash',
        steps: [{ cam: { x: 284, y: 380, z: 1.12 }, ms: 0, fx: 'shake', auto: 1200 }, { cam: { x: 284, y: 350, z: 1 }, ms: 900 }],
        content: sv('1+', stepClose() + `<div class="st-tremble">${ball('mini_hide.webp')}</div>` + svg(softMug(168, 604, 1.05))) +
          sv('0', svg(`<rect width="${VW}" height="${VH}" fill="#fff"/>${focusLines(284, 380, 150, 140, '#2a2d4a', 21)}<path d="M0,560 L${VW},560 L${VW},${VH} L0,${VH} Z" fill="#d8d2c6"/>${puff(284, 380, 1)}`), 'fade-fast'),
        over: pop('0', csfx(26, 40, '砰！', 76, -8, '#34437a'), 60, 110, 90) + pop('1', csfx(380, 214, L.meow, 30, 6, '#8a7aa8'), 800, 450, 230),
      },
      { // 6　摸摸 → 一隻前腳放下來，偷看（天藍色的眼睛）
        start: { x: 284, y: 350, z: 1 },
        steps: [{ cam: { x: 284, y: 350, z: 1 }, ms: 0, auto: 2700 }, { cam: { x: 318, y: 398, z: 2 }, ms: 1700 }],
        content: stepClose() + sv('0', `<div class="st-squish">${ball('mini_hide.webp')}</div>`, 'fade-x') + sv('1', ball('mini_peek.webp'), 'fade-x') + svg(softMug(168, 604, 1.05)) +
          sv('0', `<div class="st-pat">${margaPoint(306, 268, .5, -70)}</div>`, 'slide leave', '--from:translate(260px,-320px)'),
        over: pop('0', csfx(392, 300, '摸摸', 36, -6, '#6c6f8e'), 500, 430, 320) + pop('0', svg('<g stroke="#2a2d4a" stroke-width="3" fill="none" stroke-linecap="round"><path d="M226,258 q14,-14 28,0"/><path d="M350,250 q14,-14 28,0"/></g>'), 500) +
          pop('0', bubble({ x: 18, y: 50, w: 196, text: L.marga2, tail: [250, 160], who: SU.WHO.marga, size: 18 }), 900, 116, 90) +
          pop('1', svg(`<g class="st-bob">${heart(470, 150, 1.6)}</g>${sparkle(120, 560, 12, '#bfe6ff')}${sparkle(500, 600, 9, '#bfe6ff')}`), 1500, 470, 160) + pop('1', csfx(40, 620, '（偷看）', 22, 0, '#6c6f8e'), 1700, 90, 630),
      },
      { // 7　那天傍晚：小本子畫星 → 對你說 → 小本子藏到身後
        start: { x: 284, y: 350, z: 1.22 },
        steps: [{ cam: { x: 284, y: 350, z: 1.06 }, ms: 2000, auto: 2500 }, { cam: { x: 284, y: 350, z: 1 }, ms: 0 }, { cam: { x: 284, y: 350, z: 1 }, ms: 0 }],
        content: sv('1+', duskBg() + sv('1', pose('write', .5, 464, 380, 300, 230), 'fade-x') + sv('2', img(ART('erin_hide_notebook.webp'), 1024, .395, 511, 400, 282.5, 235), 'fade-x') + duskBg(true, .82), 'fade-x') +
          sv('0', notebookFull(), 'fade-x'),
        over: cap(10, 10, '那天傍晚・三號櫃台') +
          pop('0', svg(`<g class="st-twk">${sparkle(392, 386, 22, '#fff4c2')}</g>${sparkle(430, 350, 10, '#fff')}${sparkle(360, 420, 8, '#fff')}`), 700, 392, 386) + pop('0', csfx(420, 450, '刷刷', 28, -6, '#c98a15'), 300, 450, 465) +
          pop('1', notebookMini(400, 528, -6), 300, 475, 590) + pop('1', bubble({ x: 20, y: 52, w: 300, text: nmR(L.star), tail: [330, 200], size: 17 }), 600, 170, 110) +
          pop('2', svg(`<g class="st-bob">${heart(120, 200, 1.4)}</g>${heart(470, 140, 1)}`), 300, 300, 170) + pop('2', csfx(60, 300, L.hehe, 30, -6, '#ff7aa8'), 450, 100, 318) +
          pop('2', `<div class="st-inset" style="left:334px;top:368px;background:radial-gradient(circle,#ffe6d2 40%,#ffc7a8)"><div style="position:absolute;left:${(115 - 778 * .7).toFixed(1)}px;top:${(115 - 1225 * .7).toFixed(1)}px;width:${(1024 * .7).toFixed(1)}px;height:${(1536 * .7).toFixed(1)}px;background:url('${ART('erin_hide_notebook.webp')}') 0 0/100% 100%"></div>${svg('<g stroke="#ff7aa8" stroke-width="4" fill="none" stroke-linecap="round" class="st-blink"><path d="M188,40 q22,30 4,64"/><path d="M206,120 q18,24 0,50"/></g>' + sparkle(52, 150, 12, '#ffe9a8'))}</div>`, 800, 449, 483) +
          pop('2', csfx(346, 584, '藏好了。', 22, -6, '#c98a15'), 1100, 390, 595) + pop('2', nar(150, 612, L.nar), 1400, 284, 630),
      },
    ];
    const P = SU.PAGE_LINES[2];
    const page = {
      panels: [
        { k: 0, st: 1, box: [11, 42, 552, 160], cam: { x: 340, y: 262, z: .62 } },
        { k: 1, st: 0, box: [11, 210, 206, 140], poly: [[0, 0], [206, 0], [186, 140], [0, 140]], cam: { x: 300, y: 300, z: .5 } },
        { k: 2, st: 0, box: [195, 210, 368, 140], poly: [[22, 0], [368, 0], [368, 140], [2, 140]], cam: { x: 250, y: 330, z: .55 } },
        { k: 3, st: 0, box: [11, 358, 272, 150], cam: { x: 330, y: 400, z: .55 } },
        { k: 4, st: 1, box: [291, 358, 272, 150], cam: { x: 300, y: 452, z: .62 } },
        { k: 5, st: 1, box: [11, 516, 552, 118], cam: { x: 300, y: 436, z: 1.05 } },
        { k: 6, st: 2, box: [11, 642, 552, 128], cam: { x: 284, y: 280, z: .98 } },
      ],
      words: `<div class="st-pcap" style="left:19px;top:50px">午休・公會後門</div>` +
        `<div class="st-pb" style="left:396px;top:52px;width:156px">${esc(P.marga1)}</div>` +
        `<div class="st-pb burstish" style="left:22px;top:218px;width:70px">${esc(L.huh)}</div>` +
        `<div class="st-pb" style="left:370px;top:220px;width:178px">${esc(P.deny)}</div>` +
        `<div class="st-pc" style="left:300px;top:310px">啪噠啪噠</div>` +
        `<div class="st-pb" style="left:190px;top:366px;width:84px">${esc(L.tail)}</div>` +
        `<div class="st-pc" style="left:470px;top:470px;color:#8a7aa8">${esc(L.meow)}</div>` +
        `<div class="st-pb" style="left:410px;top:540px;width:140px">${esc(P.marga2)}</div>` +
        `<div class="st-pcap" style="left:19px;top:650px">那天傍晚・三號櫃台</div>` +
        `<div class="st-pb" style="left:28px;top:690px;width:200px">${esc(P.star)}</div>` +
        `<div class="st-nar small" style="left:300px;top:740px">${esc(L.nar)}</div>`,
    };
    return { shots, page };
  }
  const BUILD = { 2: show2 };

  // ================= 播放器 =================
  let S = null; // { n, data, root, card, vp, si, step, shot, ready, timers, mode, replay, pageOnly, held, skipped }
  const later = (fn, ms) => { const t = setTimeout(fn, ms); if (S) S.timers.push(t); return t; };
  const clearTimers = () => { if (S) { S.timers.forEach(clearTimeout); S.timers = []; } };
  const range = (spec) => { const m = String(spec).match(/^(\d+)(?:-(\d+)|(\+))?$/); if (!m) return [0, 99]; const a = +m[1]; return [a, m[3] ? 99 : m[2] != null ? +m[2] : a]; };
  const camCss = (c) => `translate(${(VW / 2 - c.x * c.z).toFixed(1)}px,${(VH / 2 - c.y * c.z).toFixed(1)}px) scale(${c.z})`;

  function nextShow() {
    const v = state.view;
    const n = v && v.affection && v.affection.shows ? v.affection.shows.next : 0;
    if (!n || !BUILD[n]) return 0;
    if (state.mini || S || (v.affection && v.affection.cold) || (v.focus && v.focus.active) || state.panel === 'onboard') return 0;
    if (!$('#chatRow').classList.contains('hidden')) return 0; // 正在聊天：聊完再冒
    return n;
  }
  // 頭上的「!」：有一階還沒演、而且現在方便（不在專注、聊天、縮成貓、冷戰、新手教學）
  function syncMarker() {
    const m = $('#marker');
    const n = nextShow();
    if (n) { if (m.dataset.kind !== 'story' || m.classList.contains('hidden')) setMarker('story'); else m.dataset.tip = storyTip(); return true; }
    if (m.dataset.kind === 'story') {
      const a = state.view && state.view.active;
      setMarker(state.mini && state.miniAlert ? 'alert' : state.pendingAmbient && state.pendingAmbient.length ? 'alert' : a && a.status === 'ready' && !state.mini ? 'ready' : null);
    }
    return false;
  }
  setInterval(syncMarker, 1500);
  // 點她：頭上是「!」（升階漫畫）就演
  function onNpcClick() {
    const n = nextShow();
    if (!n || $('#marker').dataset.kind !== 'story') return false;
    if (state.typing || state.queue.length) return false; // 她還在說話：先聽完這句
    play(n);
    return true;
  }

  function build() {
    const root = document.createElement('div');
    root.id = 'story'; root.setAttribute('data-hit', '');
    root.innerHTML = `<div class="st-card"><div class="st-ttl"><b>♡</b> <span class="st-title"></span><button class="st-skip" type="button">跳過 ▸▸</button></div>
      <div class="st-vp"><div class="st-flash"></div></div>
      <div class="st-bar"><span class="st-dots"></span><span class="st-hint">點一下 ▼</span></div></div>`;
    document.body.appendChild(root);
    return root;
  }
  function setDots() {
    const d = S.card.querySelector('.st-dots');
    d.innerHTML = S.data.shots.map((_, i) => `<i class="${i < S.si ? 'on' : i === S.si ? 'cur' : ''}"></i>`).join('');
  }
  function hint(on, text = '點一下 ▼') { const h = S.card.querySelector('.st-hint'); h.textContent = text; h.classList.toggle('on', !!on); }

  // 開始演（或從相簿重看）
  function play(n, { replay = false, pageOnly = false } = {}) {
    if (S || !BUILD[n]) return false;
    if (typeof hideTip === 'function') hideTip();
    $('#marker').classList.add('hidden');
    const root = build();
    S = { n, data: BUILD[n](), root, card: root.querySelector('.st-card'), vp: root.querySelector('.st-vp'), si: -1, step: 0, shot: null, ready: false, timers: [], mode: 'shot', replay, pageOnly, held: [], skipped: false };
    S.card.querySelector('.st-title').textContent = SU.title(n);
    // 從她身上展開
    const ir = $('#npcImg').getBoundingClientRect(), cr = S.card.getBoundingClientRect();
    S.card.style.setProperty('--ox', `${Math.round(ir.left + ir.width / 2 - cr.left)}px`);
    S.card.style.setProperty('--oy', `${Math.round(ir.top + ir.height * .3 - cr.top)}px`);
    S.card.classList.add('opening');
    S.card.addEventListener('click', onCardClick);
    S.card.querySelector('.st-skip').addEventListener('click', (e) => { e.stopPropagation(); skip(); });
    window.addEventListener('keydown', onKey, true);
    if (pageOnly) toPage(true);
    else later(() => enterShot(0), 120);
    return true;
  }

  function shotEl(i, { forPage = false } = {}) {
    const def = S.data.shots[i];
    const el = document.createElement('div');
    el.className = 'st-shot';
    el.innerHTML = `<div class="st-cam">${def.content}</div>${forPage ? '' : `<div class="st-ov">${def.over}</div>`}`;
    return el;
  }
  // 第幾步：哪些東西看得到、鏡頭推到哪
  function applyStep(el, def, k, { instant = false } = {}) {
    for (const e of el.querySelectorAll('[data-show]')) {
      const [a, b] = range(e.dataset.show);
      const on = k >= a && k <= b;
      if (e.classList.contains('pop')) e.style.transitionDelay = on && !instant ? `${+e.dataset.delay || 0}ms` : '0ms';
      e.classList.toggle('on', on);
    }
    const cam = el.querySelector('.st-cam');
    const st = def.steps[k];
    cam.style.transition = instant || !st.ms ? 'none' : `transform ${st.ms}ms cubic-bezier(.3,.05,.2,1)`;
    cam.style.transform = camCss(st.cam);
  }
  function enterShot(i) {
    clearTimers();
    const def = S.data.shots[i];
    const old = S.shot;
    S.si = i; S.step = 0; S.ready = false; setDots(); hint(false);
    const el = shotEl(i);
    const cam = el.querySelector('.st-cam');
    cam.style.transform = camCss(def.start || def.steps[0].cam);
    // 畫面本身（不是彈出來、滑進來的東西）跟著這格一起滑進來，不要滑進來才淡入
    for (const e of el.querySelectorAll('.sv:not(.slide)')) { const [a] = range(e.dataset.show); if (a === 0 && !e.closest('.slide')) { e.style.transition = 'none'; e.classList.add('on'); } }
    if (old) el.classList.add('right');
    S.vp.insertBefore(el, S.vp.querySelector('.st-flash'));
    S.shot = el;
    void el.offsetWidth;
    for (const e of el.querySelectorAll('.sv')) e.style.transition = '';
    if (old) { // 換格：上一格往左滑出、這格從右滑進
      if (def.enter === 'flash') { el.classList.remove('right'); old.remove(); } else { el.classList.remove('right'); old.classList.add('left'); later(() => old.remove(), 500); }
    }
    if (def.enter === 'flash') flash();
    later(() => runStep(0), old && def.enter !== 'flash' ? 380 : 40);
  }
  function runStep(k) {
    const def = S.data.shots[S.si];
    const st = def.steps[k];
    S.step = k; S.ready = false; hint(false);
    S.shot.classList.remove('ff');
    applyStep(S.shot, def, k);
    if (st.fx === 'shake') shake();
    const pops = [...S.shot.querySelectorAll('.pop')].filter((e) => e.classList.contains('on')).map((e) => +e.dataset.delay || 0);
    const readyAt = st.ready != null ? st.ready : Math.max(st.ms || 0, pops.length ? Math.max(...pops) + 420 : 0);
    later(() => {
      S.ready = true;
      if (st.auto) later(() => { if (S && S.mode === 'shot' && S.step === k) advance(); }, Math.max(0, st.auto - readyAt));
      else hint(true);
    }, readyAt);
  }
  function fastForward() {
    clearTimers();
    S.shot.classList.add('ff');
    S.ready = true;
    const st = S.data.shots[S.si].steps[S.step];
    if (st.auto) advance(); else hint(true);
  }
  function advance() {
    if (!S || S.mode === 'closing') return;
    if (S.mode === 'page') { if (S.ready) close(); return; }
    if (!S.ready) { fastForward(); return; }
    const def = S.data.shots[S.si];
    if (S.step + 1 < def.steps.length) { clearTimers(); runStep(S.step + 1); return; }
    if (S.si + 1 < S.data.shots.length) { enterShot(S.si + 1); return; }
    toPage(false);
  }
  function flash() { const f = S.vp.querySelector('.st-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  function shake() { S.vp.classList.remove('shake'); void S.vp.offsetWidth; S.vp.classList.add('shake'); }

  // 拉遠：拼成一整頁（也是回憶相簿裡的那一頁）
  function pageEl() {
    const pg = document.createElement('div');
    pg.className = 'st-page';
    const { panels, words } = S.data.page;
    let frames = '';
    pg.innerHTML = `<div class="st-ttl"><b>♡</b> ${esc(SU.title(S.n))}<span class="st-pdots">${S.data.shots.map(() => '<i></i>').join('')}</span><span class="st-foot">點一下收起來 ▼</span></div>`;
    panels.forEach((p, i) => {
      const [x, y, w, h] = p.box;
      const poly = p.poly || [[0, 0], [w, 0], [w, h], [0, h]];
      const pn = document.createElement('div');
      pn.className = 'st-pn'; pn.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;clip-path:polygon(${poly.map(([a, b]) => `${a}px ${b}px`).join(',')});transition-delay:${i === panels.length - 1 ? 0 : 160 + i * 110}ms`;
      const sh = shotEl(p.k, { forPage: true });
      applyStep(sh, S.data.shots[p.k], p.st, { instant: true });
      sh.classList.add('ff');
      const cam = sh.querySelector('.st-cam');
      cam.style.transform = `translate(${(w / 2 - p.cam.x * p.cam.z).toFixed(1)}px,${(h / 2 - p.cam.y * p.cam.z).toFixed(1)}px) scale(${p.cam.z})`;
      sh.style.inset = 'auto'; sh.style.width = `${VW}px`; sh.style.height = `${VH}px`; sh.style.left = '0'; sh.style.top = '0';
      pn.appendChild(sh);
      pg.appendChild(pn);
      frames += `<polygon points="${poly.map(([a, b]) => `${x + a},${y + b}`).join(' ')}" fill="none" stroke="#2a2d4a" stroke-width="3"/>`;
    });
    pg.insertAdjacentHTML('beforeend', `<svg class="st-frames" width="568" height="774">${frames}</svg><div class="st-words">${words}</div>`);
    return pg;
  }
  function toPage(direct) {
    clearTimers();
    S.mode = 'page'; S.ready = false; hint(false);
    const pg = pageEl();
    S.card.appendChild(pg);
    void pg.offsetWidth;
    if (direct) { pg.classList.add('on', 'done'); pg.querySelectorAll('.st-pn').forEach((p) => p.classList.add('on')); later(() => { S.ready = true; }, 250); return; }
    // 最後一格縮回整頁第 7 格的位置（縮的時候蓋在整頁上面），其他格依序落下
    pg.classList.add('on');
    S.vp.style.zIndex = 7;
    S.vp.classList.add('zoomout');
    const pns = [...pg.querySelectorAll('.st-pn')];
    later(() => {
      pns[pns.length - 1].classList.add('on');
      later(() => pns.slice(0, -1).forEach((p) => p.classList.add('on')), 60);
      later(() => { pg.classList.add('done'); S.ready = true; }, 160 + pns.length * 110 + 700);
    }, 380);
  }

  function onCardClick(e) { if (e.target.closest('.st-skip')) return; advance(); }
  function onKey(e) {
    if (!S) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skip(); }
    else if ([' ', 'Enter', 'ArrowRight'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); advance(); }
  }
  function skip() { if (!S || S.mode === 'closing') return; if (S.mode !== 'page') S.skipped = true; close(); }

  // 收起來：縮回她身上 → 存檔（收進回憶相簿）→ 第一次看的話她小聲說一句
  function close() {
    if (!S || S.mode === 'closing') return;
    clearTimers();
    S.mode = 'closing';
    S.card.classList.remove('opening'); S.card.classList.add('closing');
    const cur = S;
    setTimeout(() => finish(cur), 460);
  }
  function teardown(cur) {
    window.removeEventListener('keydown', onKey, true);
    cur.timers.forEach(clearTimeout);
    cur.root.remove();
    if (S === cur) S = null;
    if (typeof lastIgnore !== 'undefined') lastIgnore = null; // 滑鼠穿透重新判斷
  }
  async function finish(cur) {
    teardown(cur);
    let r = null;
    try { r = await api.storyDone(cur.n, { skipped: cur.skipped }); } catch (_) { /* 存不了就算了，下次還會冒「!」 */ }
    if (r && r.view) applyView(r.view);
    if (r && r.first && !cur.replay) {
      setTimeout(() => {
        setEmotion('happy');
        if (typeof idleDebug !== 'undefined') idleDebug.showWhisper(SU.LINES[cur.n].end, 3800);
        if (typeof Emotes !== 'undefined') Emotes.show($('#npcWrap'), 'heart', 2600);
        toast(`🎬 收進回憶相簿：${SU.title(cur.n)}`, 3800);
        setTimeout(() => { if (!state.typing && !state.queue.length && !state.talking && state.emotion === 'happy') setEmotion('normal'); }, 4200);
      }, 260);
    }
    syncMarker();
    if (cur.held.length) setTimeout(() => { openDialog(); enqueue(cur.held.flat()); }, r && r.first ? 1600 : 300);
  }
  // 演到一半縮成貓（從選單）：先收起來，下次再演（不算看過）
  function abort() { if (!S) return; const cur = S; teardown(cur); if (cur.held.length) setTimeout(() => miniNotify(cur.held.flat()), 300); }
  // 演的時候她想說的話：先收著，演完再說
  function hold(lines) { if (!S) return false; S.held.push(lines); return true; }

  // ================= 🎬 回憶相簿（右鍵 ✨ 更多玩法）=================
  function renderAlbum(el, v) {
    const sh = (v.affection && v.affection.shows) || { album: [], next: 0 };
    const opened = v.opening && v.opening.done;
    let cards = `<div class="alb-card"><div class="alb-thumb" style="background-image:url('../../assets/opening/forest.jpg')"></div><div class="alb-info"><b>序章　雨夜的小白貓</b><span>${opened ? '很久以前，某個下雨的晚上。' : '還沒看過的開場。'}</span><div class="alb-btns"><button class="btn small gold" data-alb-opening>▶ ${opened ? '重看' : '看開場'}</button></div></div></div>`;
    for (const a of sh.album) {
      cards += `<div class="alb-card"><div class="alb-thumb" style="background-image:url('${ART(a.thumb)}')"></div><div class="alb-info"><b>♡ ${esc(a.title)}</b><span>${a.at ? `${new Date(a.at).getMonth() + 1}/${new Date(a.at).getDate()} 收進來的` : '之前就到這一階了'}</span><div class="alb-btns"><button class="btn small gold" data-alb-play="${a.n}">▶ 重看</button><button class="btn small" data-alb-page="${a.n}">📖 整頁</button></div></div></div>`;
    }
    if (sh.next) cards += `<div class="alb-card locked"><div class="alb-thumb">!</div><div class="alb-info"><b>♡ ${esc(SU.title(sh.next))}</b><span>${esc(npcNameR())}好像有話想說……點她頭上的「!」</span></div></div>`;
    el.innerHTML = head('🎬 回憶相簿', `${sh.album.length + 1} 頁`) + `<div class="panel-body alb-body">${cards}<p class="hint">跟${esc(npcNameR())}越來越熟的時候，相簿會多一頁。</p></div>`;
  }
  async function albumClick(e) {
    const t = e.target;
    if (t.closest('[data-alb-opening]')) { closePanel(); await api.replayOpening(); return true; }
    const p = t.closest('[data-alb-play]'); if (p) { closePanel(); play(+p.dataset.albPlay, { replay: true }); return true; }
    const g = t.closest('[data-alb-page]'); if (g) { closePanel(); play(+g.dataset.albPage, { replay: true, pageOnly: true }); return true; }
    return false;
  }

  window.Story = {
    play, syncMarker, onNpcClick, hold, abort, renderAlbum, albumClick,
    active: () => !!S,
    // 測試用：現在演到哪、能不能點下一步
    debug: () => (S ? { n: S.n, shot: S.si, step: S.step, mode: S.mode, ready: S.ready, hint: S.card.querySelector('.st-hint').classList.contains('on') } : null),
    click: () => advance(),
  };
})();
