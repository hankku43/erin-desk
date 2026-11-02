// 💗 終章「特別的冒險者」（好感第 5 階）演出引擎（finale.html；劇本在 finale-script.js，登記簿、星星的畫法借 opening-art.js）
// 跟開場一樣一步一步照劇本演：背景（交叉淡入）、立繪（換姿勢淡入、換鏡頭滑過去）、特效、對話（打字機）、等待方式
(() => {
  'use strict';
  const F = window.FinaleScript, A = window.OpeningArt, L = A.L;
  const $ = (id) => document.getElementById(id);
  const body = document.body, stage = $('stage'), bgA = $('bg'), bgB = $('bg2'), warm = $('warm');
  const actors = $('actors'), actors2 = $('actors2'), efx = $('efx'), efxSvg = efx.querySelector('svg');
  const props = $('props'), fx = $('fx'), ui = $('ui'), loc = $('loc'), flash = $('flash'), title = $('title');
  const dlg = $('dlg'), np = $('np'), text = $('text'), skipBtn = $('skip');
  const api = window.finale || { init: async () => ({}), finish: async () => ({}) }; // 直接用瀏覽器打開時也能看
  const IMG = '../../assets/stageup/', OIMG = '../../assets/opening/';
  const esc = A.esc;

  let init = {}, STEPS = [];
  const st = { idx: -1, id: '', scene: '', echo: 0, player: null, blank: false, call: null, skipping: false, finished: false };
  let token = 0, typing = null, onClick = null, keyHandler = null;
  const last = { fx: '', efx: '', cat: '' };

  const later = (ms, fn) => { const my = token; setTimeout(() => { if (my === token && !st.finished) fn(); }, ms); };
  const idxOf = (id) => STEPS.findIndex((s) => s.id === id);
  const callNow = () => st.call || init.call || F.DEFAULT_CALL;
  const fill = (t) => F.fill(t, { name: init.erinName || '艾琳', call: callNow(), say: F.ECHO_SAYS[(st.echo || 1) - 1] });

  // ── 舞台大小：依螢幕縮放 ──
  function fit() {
    const k = Math.min((innerWidth * 0.82) / 960, (innerHeight * 0.82) / 540, 1.6);
    document.documentElement.style.setProperty('--k', k.toFixed(4));
  }
  addEventListener('resize', fit); fit();

  // ── 背景：兩層交叉淡入；同一張圖只換濾鏡（大廳 ↔ 模糊的大廳） ──
  let bgCur = bgA;
  function setScene(name) {
    if (st.scene === name) return;
    st.scene = name;
    const sc = F.SCENES[name] || null;
    stage.classList.toggle('memory', !!(sc && sc.mem));
    stage.classList.toggle('rain', !!(sc && sc.rain));
    stage.classList.toggle('dream', !!(sc && sc.dream));
    const url = sc ? `url("${IMG}${sc.img}")` : 'none';
    let layer = bgCur;
    if (bgCur.dataset.url !== url) {
      layer = bgCur === bgA ? bgB : bgA;
      layer.style.backgroundImage = url; layer.dataset.url = url;
      layer.classList.remove('kb'); void layer.offsetWidth;
      if (sc && sc.kb) layer.classList.add('kb');
      stage.insertBefore(layer, bgCur.nextSibling); // 新的一層疊在舊的上面（還是在人物底下）
      layer.classList.add('on'); const old = bgCur; setTimeout(() => { if (old !== bgCur) old.classList.remove('on'); }, 750);
      bgCur = layer;
    }
    layer.classList.toggle('soft', !!(sc && sc.soft));
    if (name !== 'black') { title.classList.remove('show'); title.textContent = ''; }
  }

  // ── 立繪 ──
  let erinEl = null;
  const boxOf = (pose, cam) => {
    const P = F.POSES[pose], C = F.CAMS[cam] || F.CAMS.mid;
    return { left: C.ex - P.ax * C.s, top: C.ey - P.ay * C.s, w: 1024 * C.s, h: 1536 * C.s, s: C.s };
  };
  const place = (el, b) => { el.style.left = b.left.toFixed(1) + 'px'; el.style.top = b.top.toFixed(1) + 'px'; el.style.width = b.w.toFixed(1) + 'px'; el.style.height = b.h.toFixed(1) + 'px'; };
  let erinBox = null, erinPose = '';
  function setErin(spec) {
    if (!spec) {
      if (erinEl) { const old = erinEl; old.style.opacity = 0; setTimeout(() => old.remove(), 500); erinEl = null; }
      erinBox = null; erinPose = ''; efx.classList.add('off');
      return;
    }
    const [pose, cam = 'mid'] = spec.split('@');
    const b = boxOf(pose, cam);
    if (!erinEl || erinEl.dataset.pose !== pose) {
      const el = document.createElement('img');
      el.className = 'erin'; el.alt = ''; el.src = IMG + F.POSES[pose].file; el.dataset.pose = pose;
      el.style.opacity = '0'; place(el, b);
      actors.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
      if (erinEl) { const old = erinEl; place(old, b); old.style.opacity = '0'; setTimeout(() => old.remove(), 500); }
      erinEl = el;
    } else place(erinEl, b);
    erinEl.dataset.cam = cam;
    erinBox = b; erinPose = pose;
    place(efx, b); efx.classList.remove('off');
  }
  const hop = () => { if (!erinEl) return; erinEl.classList.remove('hop'); void erinEl.offsetWidth; erinEl.classList.add('hop'); };

  // 序章那隻白貓（回憶裡的三號櫃台）
  function setCat(kind) {
    if (kind === last.cat) return;
    last.cat = kind || '';
    if (!kind) { actors2.innerHTML = ''; return; }
    const h = L.CAT_H, w = h * A.RATIO.mini_startled;
    actors2.innerHTML = `<img class="cat-jump fade-in" src="${OIMG}mini_startled.png" style="left:${(L.CAT_X - w / 2).toFixed(1)}px;top:${(L.ITEM_Y - h).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h}px" alt="">`;
  }

  // ── 特效：舞台上的（舞台座標）＋立繪上的（原圖座標，跟著鏡頭走） ──
  const spark = (x, y, r, c = '#ffd66b', d = 0, cls = 'f-tw') => `<g class="${cls}" style="--d:${d}s">${A.sparkle(x, y, r, c)}</g>`;
  const HALL_LANTERNS = [[129, 23], [251, 13], [359, 19], [483, 33], [533, 53], [648, 78], [725, 129], [803, 69], [854, 26], [924, 43]];
  const MAP_STARS = [[191, 53], [149, 94], [194, 119], [87, 128], [248, 150], [268, 181], [325, 220], [289, 94], [462, 104], [397, 182], [462, 249], [505, 288], [371, 265], [413, 205]];
  const RISE = [[60, 14, 11, 0], [140, 10, 14, 3.2], [205, 16, 12, 6.1], [300, 11, 15, 1.4], [390, 18, 13, 7.4], [450, 9, 16, 4.6], [540, 13, 12, 2.2], [610, 17, 14, 8.3], [690, 10, 15, 0.8], [760, 15, 13, 5.5], [840, 12, 16, 3.9], [905, 16, 12, 6.9], [250, 8, 17, 9.6], [575, 9, 17, 10.4]];
  const STAGE_FX = {
    glimmer: () => ({ html: HALL_LANTERNS.map(([x, y], i) => `<div class="glim" style="left:${x}px;top:${y}px;--d:${(i * 0.37) % 2.4}s"></div>`).join(''),
      svg: MAP_STARS.map(([x, y], i) => spark(x, y, 4 + (i % 3) * 1.5, i % 4 ? '#ffe9a8' : '#fff', (i * 0.29) % 1.5)).join('') }),
    starRing: () => ({ svg: `<g class="f-ring"><circle cx="${F.STAR.x}" cy="${F.STAR.y}" r="24" fill="none" stroke="#ffd66b" stroke-width="3"/><circle cx="${F.STAR.x}" cy="${F.STAR.y}" r="16" fill="none" stroke="#fff3c4" stroke-width="1.6" stroke-dasharray="4 5"/></g>${spark(F.STAR.x, F.STAR.y, 12, '#fff6c8', 0)}` }),
    fingerTrail: () => {
      if (!erinBox || erinPose !== 'point') return {};
      const fx0 = erinBox.left + F.SPOTS.finger[0] * erinBox.s, fy0 = erinBox.top + F.SPOTS.finger[1] * erinBox.s;
      const mx = (fx0 + F.STAR.x) / 2, my = Math.min(fy0, F.STAR.y) - 70;
      return { svg: `<path class="f-trail" d="M${fx0.toFixed(1)},${fy0.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${F.STAR.x + 22},${F.STAR.y + 10}" fill="none" stroke="#ffd66b" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 10" opacity=".9"/>` };
    },
    twinkle: () => ({ svg: [[318, 128, 14, 0], [640, 110, 11, .5], [700, 380, 15, .9], [255, 400, 10, 1.2], [480, 76, 9, .3], [790, 250, 12, .7]].map(([x, y, r, d]) => spark(x, y, r, '#fff3c4', d)).join('') }),
    fireGlow: () => ({ svg: `<defs><radialGradient id="fnFire"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".85"/><stop offset=".5" stop-color="#ff9a50" stop-opacity=".3"/><stop offset="1" stop-color="#ff9a50" stop-opacity="0"/></radialGradient></defs><circle class="f-flick" cx="${F.FIRE.x}" cy="${F.FIRE.y}" r="70" fill="url(#fnFire)" style="mix-blend-mode:screen"/>` }),
    bell: () => ({ html: '<div class="sfx navy" style="left:40px;top:90px;font-size:46px;--r:-10deg">叮鈴～</div><div class="sfx" style="left:600px;top:60px;font-size:60px;--r:12deg;animation-delay:.25s">喵！</div>' }),
    book: () => ({ svg: A.regBook({}) }),
    rise: () => ({ html: RISE.map(([x, s, t, d]) => `<div class="rise" style="--x:${x}px;--s:${s};--t:${t}s;--d:-${d}s"></div>`).join('') }),
    warm: () => ({}),
  };
  // 立繪上的（原圖座標 1024×1536）
  const steamPath = 'M0,0 q-22,-30 0,-60 q22,-30 0,-60';
  const ERIN_FX = {
    brushTip: () => spark(F.SPOTS.brushTip[0], F.SPOTS.brushTip[1], 36, '#ffd66b', 0) + spark(84, 10, 18, '#fff3c4', .5) + spark(-14, 96, 14, '#ffe9a8', .9),
    brushPop: () => [[28, 45, 54, 0], [120, -20, 26, .08], [-50, -30, 22, .16], [150, 90, 20, .24], [-60, 130, 18, .32], [60, 170, 16, .4]].map(([x, y, r, d]) => spark(x, y, r, d ? '#fff3c4' : '#ffd66b', d, 'f-pop')).join(''),
    cheekGold: () => `<circle cx="${F.SPOTS.cheekGold[0]}" cy="${F.SPOTS.cheekGold[1]}" r="34" fill="none" stroke="#fff3c4" stroke-width="5" class="f-pop" opacity=".9"/>${spark(F.SPOTS.cheekGold[0] + 34, F.SPOTS.cheekGold[1] - 34, 22, '#ffd66b', .3)}`,
    sweat: () => `<g class="f-sweat"><path transform="translate(735 250) scale(2.6)" d="M0,-12 C5,-4 8,0 8,4 A8,8 0 0 1 -8,4 C-8,0 -5,-4 0,-12 Z" fill="#9fd3ff" stroke="#fff" stroke-width="1.6"/></g>
      <g stroke="#46578f" stroke-width="7" stroke-linecap="round" class="f-pop" style="--d:.1s"><line x1="250" y1="170" x2="215" y2="120"/><line x1="290" y1="150" x2="280" y2="90"/><line x1="210" y1="215" x2="160" y2="190"/></g>`,
    steam: () => `<g class="f-steam" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".92">${F.SPOTS.steam.map(([x, y], i) => `<path transform="translate(${x} ${y})" d="${steamPath}" style="--d:${i * 0.45}s"/>`).join('')}</g>`,
    steamMore: () => `<g class="f-puff" fill="#fff" opacity=".95">${F.SPOTS.steam.map(([x, y], i) => `<circle cx="${x + (i - 1) * 10}" cy="${y - 30}" r="${30 + i * 4}" style="--d:${i * 0.3 + 0.15}s"/>`).join('')}</g>`,
    lanternGlow: (pose) => {
      const [x, y] = pose === 'wish' ? F.SPOTS.lanternWish : F.SPOTS.lanternRemember;
      return `<defs><radialGradient id="fnLan"><stop offset="0" stop-color="#fff0c0" stop-opacity=".75"/><stop offset=".45" stop-color="#ffc66b" stop-opacity=".28"/><stop offset="1" stop-color="#ffb050" stop-opacity="0"/></radialGradient></defs><ellipse class="f-glow" cx="${x}" cy="${y}" rx="300" ry="330" fill="url(#fnLan)" style="mix-blend-mode:screen"/>`;
    },
    wishText: () => {
      const p = F.SPOTS.wishPaper;
      const cols = F.wishLines(callNow()).map((c) => Array.from(c));
      const n = Math.max(...cols.map((c) => c.length));
      const fs = Math.min(30, Math.floor((p.h - 14) / n));
      const x1 = p.x + p.w * 0.66, x2 = p.x + p.w * 0.3; // 直書：右邊一行先
      const col = (chars, x, d0) => chars.map((ch, i) => `<text x="${x.toFixed(1)}" y="${(p.y + 8 + fs * (i + 0.86)).toFixed(1)}" style="--d:${(d0 + i * 0.07).toFixed(2)}s">${esc(ch)}</text>`).join('');
      return `<g class="f-wish" text-anchor="middle" font-family="Noto Serif CJK TC, Noto Serif TC, PMingLiU, serif" font-weight="900" font-size="${fs}" fill="#6a3f1c" opacity=".9">${col(cols[0], x1, 0.2)}${col(cols[1], x2, 0.2 + cols[0].length * 0.07)}</g>`;
    },
    heartGlow: () => `<defs><radialGradient id="fnHeart"><stop offset="0" stop-color="#ffd0e0" stop-opacity=".9"/><stop offset=".5" stop-color="#ff8fb0" stop-opacity=".3"/><stop offset="1" stop-color="#ff8fb0" stop-opacity="0"/></radialGradient></defs><circle class="f-flick" cx="${F.SPOTS.heartFlame[0]}" cy="${F.SPOTS.heartFlame[1]}" r="120" fill="url(#fnHeart)" style="mix-blend-mode:screen"/>`,
    sparkles: (pose) => {
      const P = F.POSES[pose]; if (!P) return '';
      return [[-300, -170, 30, 0], [290, -230, 36, .4], [340, 110, 24, .8], [-340, 170, 26, 1.1], [10, -330, 22, .6], [-200, 380, 18, 1.4]].map(([dx, dy, r, d], i) => spark(P.ax + dx, P.ay + dy, r, i % 2 ? '#fff3c4' : '#ffd66b', d)).join('');
    },
  };
  function setFx(step) {
    const list = step.fx || [];
    const sKey = list.filter((k) => STAGE_FX[k]).join('|') + (list.includes('fingerTrail') && erinBox ? `@${erinBox.left},${erinBox.top}` : '');
    if (sKey !== last.fx) {
      last.fx = sKey;
      const parts = list.filter((k) => STAGE_FX[k]).map((k) => STAGE_FX[k]());
      props.innerHTML = parts.map((p) => p.svg || '').join('');
      fx.innerHTML = parts.map((p) => p.html || '').join('');
    }
    warm.classList.toggle('on', list.includes('warm'));
    const eKey = erinPose + ':' + list.filter((k) => ERIN_FX[k]).join('|') + (list.includes('wishText') ? callNow() : '');
    if (eKey !== last.efx) { last.efx = eKey; efxSvg.innerHTML = erinPose ? list.filter((k) => ERIN_FX[k]).map((k) => ERIN_FX[k](erinPose)).join('') : ''; }
  }

  // ── 對話框（打字機） ──
  function setDialog(step) {
    const d = step.dlg;
    if (!d) { dlg.classList.add('hidden'); typing = null; return; }
    const raw = d.keep && callNow() === F.DEFAULT_CALL ? d.keep : d.text;
    const str = fill(raw), who = d.np ? fill(d.np) : '';
    const sc = F.SCENES[st.scene] || {};
    dlg.classList.remove('hidden', 'done', 'shake');
    dlg.classList.toggle('night', !!(sc.mem || sc.night));
    dlg.classList.toggle('sky', !!sc.night);
    dlg.classList.toggle('thought', !d.np && /^（/.test(raw));
    np.textContent = who;
    typeText(str, d.slow ? 2.6 : 1);
    if (d.shake) { void dlg.offsetWidth; dlg.classList.add('shake'); hop(); }
  }
  function typeText(str, slow) {
    const my = token, chars = Array.from(str);
    let i = 0;
    const done = () => { typing = null; text.textContent = str; dlg.classList.add('done'); };
    text.textContent = '';
    typing = { finish: done };
    const tick = () => {
      if (my !== token || !typing) return;
      if (i >= chars.length) { done(); return; }
      const c = chars[i++];
      text.textContent += c;
      setTimeout(tick, (c === '…' ? 75 : c === '\n' ? 320 : /[，。！？、]/.test(c) ? 130 : 34) * slow);
    };
    tick();
  }
  const finishTyping = () => { if (typing) { typing.finish(); return true; } return false; };

  function setLoc(step) {
    if (step.loc) { loc.innerHTML = `<div class="a">${esc(step.loc[0])}</div><div class="b">${esc(step.loc[1])}</div>`; requestAnimationFrame(() => loc.classList.add('show')); }
    else loc.classList.remove('show');
    if (step.title) { title.textContent = step.title; requestAnimationFrame(() => title.classList.add('show')); }
  }

  // ── 轉場、換步驟 ──
  function playFlash(kind) {
    flash.className = kind === 'white' ? 'white' : '';
    void flash.offsetWidth;
    flash.classList.add('on');
    return kind === 'white' ? 650 : 180;
  }
  function goTo(idx) {
    if (st.finished) return;
    const prev = STEPS[st.idx], to = STEPS[idx];
    const out = prev && idx > st.idx && (prev.out || (st.skipping && to && prev.scene !== to.scene ? 'white' : null));
    if (out) {
      const my = ++token; ui.innerHTML = ''; onClick = null; keyHandler = null;
      setTimeout(() => { if (my === token) show(idx); }, playFlash(out));
    } else show(idx);
  }
  function show(idx) {
    const my = ++token;
    const step = STEPS[idx];
    if (!step) { finish(); return; }
    st.idx = idx; st.id = step.id;
    ui.innerHTML = ''; onClick = null; keyHandler = null;
    body.dataset.step = step.id;
    setScene(step.scene);
    setErin(step.erin);
    setCat(step.cat);
    setFx(step);
    setLoc(step);
    setDialog(step);
    skipBtn.style.display = step.wait.finale ? 'none' : '';
    if (my === token) setupWait(step);
  }
  function next() {
    if (st.finished) return;
    if (st.skipping) { // 跳過：稱呼一定要選，然後直接到結尾
      if (st.call == null && idxOf('callSet') >= 0) return goTo(idxOf('callSet'));
      if (st.id !== 'finale') return goTo(idxOf('finale'));
    }
    goTo(st.idx + 1);
  }

  // ── 等待方式 ──
  function setupWait(step) {
    const w = step.wait;
    if (w.auto) { later(w.auto, next); onClick = () => next(); return; }
    if (w.click) { onClick = () => next(); return; }
    if (w.pick) return pickWait();
    if (w.register) return registerWait();
    if (w.call) return callWait();
    if (w.finale) return finaleWait();
  }

  // 那天對小貓說的話：看過開場就直接說；沒選過的（跳過開場、舊存檔）在這裡選
  function pickWait() {
    if (st.echo) { later(0, next); return; }
    ui.innerHTML = `<div class="choice-dim"></div><div class="choices"><div class="cap">那天，你對牠說了一句話</div>${F.ECHO_SAYS.map((t, i) => `<button type="button" data-i="${i + 1}">${esc(t)}</button>`).join('')}</div>`;
    const pick = (i) => { st.echo = i; next(); };
    ui.querySelectorAll('.choices button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(Number(b.dataset.i)); }));
    keyHandler = (e, up) => { const n = Number(e.key); if (!up && n >= 1 && n <= F.ECHO_SAYS.length) { pick(n); return true; } return false; };
    const first = ui.querySelector('.choices button'); first && setTimeout(() => first.focus({ preventScroll: true }), 50);
  }

  // 登記簿上冒險者那一格（空著才問；可以再空著）
  function registerWait() {
    const f = A.BOOK.field;
    ui.innerHTML = `<input class="regin" id="fnReg" maxlength="24" autocomplete="off" spellcheck="false" placeholder="寫在這裡"
        style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px" value="">
      <div class="regbtns"><button type="button" class="btn" id="fnRegBlank">還是先空著</button><button type="button" class="btn gold" id="fnRegOk">登記 ✓</button></div>`;
    const input = $('fnReg');
    const accept = (raw) => {
      // 跟開場的 cleanPlayerName 一樣：最多 12 個字（存檔時 main 會再清一次）
      const name = Array.from(String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>{}]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('');
      st.player = name || null; st.blank = !name;
      next();
    };
    $('fnRegOk').addEventListener('click', (e) => { e.stopPropagation(); accept(input.value); });
    $('fnRegBlank').addEventListener('click', (e) => { e.stopPropagation(); accept(''); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); accept(input.value); } });
    input.addEventListener('click', (e) => e.stopPropagation());
    setTimeout(() => { finishTyping(); input.focus(); }, 400);
    registerWait.accept = accept;
  }

  // ⚙ 系統提示：她怎麼叫你（登記的名字／維持冒險者／自己取）
  function callWait() {
    const self = init.erinName || '艾琳';
    const player = st.blank ? '' : (st.player || init.playerName || '');
    const v1 = player ? F.validateCall(player, { self }) : null;
    const opts = [];
    if (player) opts.push({ kind: 'player', label: `登記的名字「${player}」`, ok: v1.ok, why: v1.ok ? '' : v1.error, value: v1.call });
    opts.push({ kind: 'keep', label: `維持「${F.DEFAULT_CALL}」`, ok: true, value: F.DEFAULT_CALL });
    const cur = init.callSet && init.callSet !== F.DEFAULT_CALL && init.callSet !== player ? init.callSet : '';
    const pre = cur || (v1 && !v1.ok ? Array.from(v1.call).slice(0, 8).join('').replace(/我/g, '') : '');
    ui.innerHTML = `<div class="choice-dim"></div><div class="sys call" role="dialog" aria-label="系統提示">
        <div class="hd">⚙ 系統提示</div>
        <div class="q">她要怎麼叫你？</div>
        <div class="opts">${opts.map((o, i) => `<button type="button" class="opt" data-k="${o.kind}"${o.ok ? '' : ' disabled'}><b>${i + 1}</b><span>${esc(o.label)}</span>${o.why ? `<small>（${esc(o.why)}）</small>` : ''}</button>`).join('')}
          <div class="opt own"><b>${opts.length + 1}</b><span>自己取：</span><input id="fnCall" maxlength="16" autocomplete="off" spellcheck="false" placeholder="1～8 個字" value="${esc(pre)}"></div></div>
        <div class="err" id="fnCallErr"></div>
        <div class="note">她會用這個稱呼叫你，台詞、聊天都會跟著換。1～8 個字，不能有「我」。<br>之後可以在右鍵「⚙ 設定與資料 → 💬 她怎麼叫你」改</div>
        <div class="row"><button type="button" class="btn gold" id="fnCallOk">用自己取的 ✓</button></div>
      </div>`;
    const input = $('fnCall'), err = $('fnCallErr');
    const accept = (raw) => {
      const r = F.validateCall(raw, { self });
      if (!r.ok) { err.textContent = r.error; input.focus(); return false; }
      st.call = r.call; next(); return true;
    };
    const choose = (k) => { const o = opts.find((x) => x.kind === k); if (o && o.ok) accept(o.value); };
    ui.querySelectorAll('.opt[data-k]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); choose(b.dataset.k); }));
    $('fnCallOk').addEventListener('click', (e) => { e.stopPropagation(); accept(input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); accept(input.value); } });
    input.addEventListener('input', () => { err.textContent = ''; });
    ui.querySelector('.sys').addEventListener('click', (e) => e.stopPropagation());
    keyHandler = (e, up) => {
      if (up || (e.target && e.target.tagName === 'INPUT')) return false;
      const n = Number(e.key);
      if (n >= 1 && n <= opts.length) { choose(opts[n - 1].kind); return true; }
      if (n === opts.length + 1) { input.focus(); return true; }
      return false;
    };
    callWait.accept = accept; callWait.choose = choose;
  }

  // 結尾：舞台縮成一道光飛到右下角（主視窗的她在那裡）
  function finaleWait() {
    dlg.classList.add('hidden');
    later(1400, () => {
      document.documentElement.style.setProperty('--fx', Math.round(innerWidth / 2 - 150) + 'px');
      document.documentElement.style.setProperty('--fy', Math.round(innerHeight / 2 - 180) + 'px');
      body.classList.add('leaving');
      later(1150, finish);
    });
  }

  // ── 跳過 ──
  function skip() {
    if (st.finished) return;
    if (init.replay) { st.skipping = true; finish(); return; } // 重看：到此為止
    st.skipping = true;
    if (st.id === 'reg' || st.id === 'callSet' || st.id === 'finale') return; // 輸入中：填完就接著跳
    next();
  }
  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); skip(); });

  stage.addEventListener('click', (e) => {
    if (e.target.closest('button, input, .sys, .choices')) return;
    if (finishTyping()) return;
    if (onClick) onClick();
  });
  addEventListener('keydown', (e) => {
    if (st.finished) return;
    if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
    if (keyHandler && keyHandler(e, false)) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.repeat) return; if (finishTyping()) return; if (onClick) onClick(); }
  });
  addEventListener('keyup', (e) => { if (keyHandler) keyHandler(e, true); });

  // ── 結束：存檔、關掉視窗、主視窗的她說最後一句 ──
  function finish() {
    if (st.finished) return;
    st.finished = true; token++;
    const r = { call: st.call, player: st.blank ? '' : st.player, blank: st.blank, echo: st.echo, skipped: st.skipping };
    window.__fnResult = r;
    api.finish(r);
  }

  async function start() {
    try { init = (await api.init()) || {}; } catch (_) { init = {}; }
    st.echo = Number(init.echo) || 0;
    STEPS = F.plan({ replay: !!init.replay, playerName: init.playerName || '', promise: Number(init.promise) || 0 });
    for (const f of F.files()) { const im = new Image(); im.src = IMG + f; } // 先載好，換場景不會閃
    if (init.test) window.__fn = testHook();
    body.classList.add('on');
    setTimeout(() => { body.classList.add('opening'); stage.classList.add('open'); stage.classList.remove('closed'); }, 350);
    setTimeout(() => { body.classList.add('opened'); }, 1400);
    show(0);
  }

  function testHook() {
    return {
      step: () => st.id,
      steps: () => STEPS.map((s) => s.id),
      state: () => ({ ...st }),
      click: () => { if (!finishTyping() && onClick) onClick(); },
      choose: (i) => { const b = ui.querySelector(`.choices button[data-i="${i}"]`); b && b.click(); },
      register: (s) => { const inp = $('fnReg'); if (inp) inp.value = s; const ok = $('fnRegOk'); ok && ok.click(); },
      blank: () => { const b = $('fnRegBlank'); b && b.click(); },
      callOpt: (k) => { const b = ui.querySelector(`.opt[data-k="${k}"]`); if (b && !b.disabled) b.click(); return !!b && !b.disabled; },
      callOwn: (s) => { const inp = $('fnCall'); if (inp) inp.value = s; const ok = $('fnCallOk'); ok && ok.click(); return ($('fnCallErr') || {}).textContent || ''; },
      skip,
      text: () => text.textContent,
      np: () => np.textContent,
      typing: () => !!typing,
      erin: () => (erinEl ? { pose: erinEl.dataset.pose, cam: erinEl.dataset.cam, left: parseFloat(erinEl.style.left), top: parseFloat(erinEl.style.top) } : null),
      wish: () => [...efxSvg.querySelectorAll('.f-wish text')].map((t) => t.textContent).join(''),
      result: () => window.__fnResult || null,
    };
  }

  start();
})();
