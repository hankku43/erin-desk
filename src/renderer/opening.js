// 🎬 開場「雨夜的小白貓」演出引擎（opening.html；劇本在 opening-script.js、道具在 opening-art.js）
// 一步一步照 STEPS 演：背景、人物、道具、對話（打字機）、等待方式（點一下／自動／動作按鈕／按住加熱／三選一／系統提示輸入名字／登記簿／結尾）
(() => {
  'use strict';
  const S = window.OpeningScript, A = window.OpeningArt, L = A.L;
  const $ = (id) => document.getElementById(id);
  const body = document.body, stage = $('stage'), bg = $('bg'), actors = $('actors'), actors2 = $('actors2'), front = $('front');
  const props = $('props'), fx = $('fx'), ui = $('ui'), loc = $('loc'), flash = $('flash'), title = $('title');
  const dlg = $('dlg'), np = $('np'), text = $('text'), skipBtn = $('skip');
  const api = window.opening || { init: async () => ({}), finish: async () => ({}) }; // 直接用瀏覽器打開時也能看
  const IMG = '../../assets/opening/';
  const BG = { forest: IMG + 'forest.jpg', guild: IMG + 'guild.jpg' };
  const ERIN_W = Math.round(1093 * L.ERIN.s), ERIN_H = Math.round(1200 * L.ERIN.s);
  const esc = A.esc;

  let init = {};
  const st = { idx: -1, id: '', scene: '', name: null, player: null, blank: false, echo: 0, skipping: false, finished: false, heat: 0 };
  let token = 0;          // 換步驟就加一：舊的計時器不會跑到新的步驟
  let typing = null;      // 打字中：{ finish() }
  let onClick = null;     // 這一步「點一下」要做的事
  let keyHandler = null;  // 這一步自己的按鍵（1～3、空白鍵加熱…）
  let lastKeys = { actors: '', props: '', fx: '' };

  const later = (ms, fn) => { const my = token; setTimeout(() => { if (my === token && !st.finished) fn(); }, ms); };
  const stepById = (id) => S.STEPS.findIndex((s) => s.id === id);
  const fill = (t) => S.fill(t, { name: st.name || init.erinName || S.DEFAULT_NAME, echo: S.echoLine(st.echo) });

  // ── 舞台大小：依螢幕縮放 ──
  function fit() {
    const k = Math.min((innerWidth * 0.82) / 960, (innerHeight * 0.82) / 540, 1.6);
    document.documentElement.style.setProperty('--k', k.toFixed(4));
  }
  addEventListener('resize', fit); fit();

  // ── 場景 ──
  function setScene(name) {
    if (st.scene === name) return;
    st.scene = name;
    stage.classList.toggle('memory', name === 'forest');
    stage.classList.toggle('rain', name === 'forest');
    bg.style.backgroundImage = BG[name] ? `url("${BG[name]}")` : 'none';
    front.style.backgroundImage = name === 'guild' ? `url("${BG.guild}")` : 'none';
    front.style.display = name === 'guild' ? '' : 'none';
    if (name !== 'black') { title.classList.remove('show'); title.textContent = ''; } // 跳過時不會留在新場景上
  }

  // ── 人物：艾琳（櫃台後面）、小貓和白貓（櫃台前面） ──
  const catImg = (file, cx, by, h, ratio, cls = '') => {
    const w = h * ratio;
    return `<img class="${cls} fade-in" src="${IMG}${file}" style="left:${(cx - w / 2).toFixed(1)}px;top:${(by - h).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h}px" alt="">`;
  };
  const CATS = {
    kitten: () => catImg('kitten_wet.png', L.HOLLOW.x, L.HOLLOW.y + 2, L.KITTEN_H, A.RATIO.kitten_wet, 'night'),
    cloak: () => catImg('kitten_cloak.png', L.HOLLOW.x, L.HOLLOW.y + 8, L.CLOAK_H, A.RATIO.kitten_cloak, 'night'),
    cloakEmpty: () => catImg('cloak_empty.png', L.HOLLOW.x, L.HOLLOW.y + 8, L.CLOAK_H, A.RATIO.cloak_empty, 'night'),
    catSleep: () => catImg('mini_sleep.png', L.CAT_X, L.ITEM_Y, L.CAT_H, A.RATIO.mini_sleep),
    catStartled: () => catImg('mini_startled.png', L.CAT_X, L.ITEM_Y, L.CAT_H, A.RATIO.mini_startled, 'cat-jump'),
  };
  let erinEl = null;
  function erinSrc(pose) {
    const im = init.images || {};
    const alt = { wave: 'happy', tea: 'happy', cheer: 'happy', surprised: 'normal', happy: 'normal' };
    return im[pose] || im[alt[pose]] || im.normal || '';
  }
  function setActors(list = []) {
    const key = list.join('|');
    if (key === lastKeys.actors) return;
    lastKeys.actors = key;
    const erin = list.find((a) => a.startsWith('erin:'));
    const cats = list.filter((a) => !a.startsWith('erin:'));
    actors2.innerHTML = cats.map((c) => (CATS[c] ? CATS[c]() : '')).join('');
    if (!erin) { if (erinEl) { erinEl.remove(); erinEl = null; } return; }
    const [pose, at] = erin.slice(5).split('@');
    const pos = at === 'right' ? L.ERIN_RIGHT : L.ERIN;
    const src = erinSrc(pose);
    if (!erinEl) {
      erinEl = document.createElement('img');
      erinEl.className = 'erin fade-in'; erinEl.alt = '';
      Object.assign(erinEl.style, { width: ERIN_W + 'px', height: ERIN_H + 'px', objectFit: 'contain', objectPosition: '50% 100%', transition: 'left .6s cubic-bezier(.4,0,.2,1), opacity .45s' });
      actors.appendChild(erinEl);
    }
    if (src && erinEl.getAttribute('src') !== src) erinEl.src = src;
    erinEl.style.left = pos.x + 'px'; erinEl.style.top = pos.y + 'px';
    erinEl.dataset.pose = pose; erinEl.dataset.at = at || 'center';
  }

  // ── 道具（SVG）＋ HTML 特效（火的特寫格、狀聲字） ──
  function propSvg(key) {
    if (key === 'book') return A.regBook({});
    if (key === 'bookDone') return A.regBook({ name: st.blank ? null : st.player, blank: st.blank || !st.player, glow: true });
    if (key === 'fireCg') return '';
    return A.prop(key);
  }
  const SFX = {
    bell: '<div class="sfx navy" style="left:34px;top:96px;font-size:48px;--r:-10deg">叮鈴～</div>',
    meow: '<div class="sfx" style="left:236px;top:40px;font-size:70px;--r:-12deg">喵！</div>',
    gone: '<div class="mew" style="left:118px;top:288px">……喵。</div>',
  };
  const FIRE_CG = `<div class="cg"><img src="${IMG}fire_tea.jpg" alt=""><div class="glow"></div></div>`;
  function setProps(step) {
    const list = step.props || [];
    const key = list.join('|') + (list.includes('bookDone') ? `:${st.player}:${st.blank}` : '');
    if (key !== lastKeys.props) { lastKeys.props = key; props.innerHTML = list.map(propSvg).join(''); }
    const fxKey = (list.includes('fireCg') ? 'cg|' : '') + (SFX[step.id] ? step.id : '');
    if (fxKey !== lastKeys.fx) { lastKeys.fx = fxKey; fx.innerHTML = (list.includes('fireCg') ? FIRE_CG : '') + (SFX[step.id] || ''); }
  }

  // ── 對話框（打字機） ──
  let lastNp = '';
  function setDialog(step) {
    if (!step.dlg) { dlg.classList.add('hidden'); typing = null; lastNp = ''; return; }
    const d = step.dlg;
    const raw = st.blank && d.blank ? d.blank : d.text;
    const str = fill(raw);
    const who = d.np ? fill(d.np) : '';
    dlg.classList.remove('hidden', 'done', 'shake');
    dlg.classList.toggle('night', st.scene === 'forest');
    dlg.classList.toggle('thought', !d.np && /^（/.test(raw));
    if (who !== lastNp) {
      np.textContent = who;
      if (lastNp === '？？？' && who && who !== '？？？') { np.classList.remove('flip'); void np.offsetWidth; np.classList.add('flip'); }
      lastNp = who;
    }
    typeText(str, !!d.instant, step);
  }
  function typeText(str, instant, step) {
    const my = token;
    const chars = Array.from(str);
    let i = 0;
    const done = () => {
      typing = null; text.textContent = str; dlg.classList.add('done');
      if (step.id === 'intro') { dlg.classList.remove('shake'); void dlg.offsetWidth; dlg.classList.add('shake'); } // 說到「——」停住，對話框輕輕一震
    };
    if (instant) { done(); return; }
    text.textContent = '';
    typing = { finish: done };
    const tick = () => {
      if (my !== token || !typing) return;
      if (i >= chars.length) { done(); return; }
      const c = chars[i++];
      text.textContent += c;
      setTimeout(tick, c === '…' ? 75 : c === '\n' ? 320 : /[，。！？、]/.test(c) ? 130 : 32);
    };
    tick();
  }
  const finishTyping = () => { if (typing) { typing.finish(); return true; } return false; };

  // ── 地點卡、黑底字 ──
  function setLoc(step) {
    if (step.loc) { loc.innerHTML = `<div class="a">${esc(step.loc[0])}</div><div class="b">${esc(step.loc[1])}</div>`; requestAnimationFrame(() => loc.classList.add('show')); }
    else loc.classList.remove('show');
    if (step.title) { title.textContent = step.title; requestAnimationFrame(() => title.classList.add('show')); }
  }

  // ── 轉場 ──
  function playFlash(kind) {
    flash.className = kind === 'white' ? 'white' : '';
    void flash.offsetWidth;
    flash.classList.add('on');
    return kind === 'white' ? 650 : 180; // 畫面最亮的時候換場景
  }

  // ── 換到第 idx 步 ──
  function goTo(idx) {
    if (st.finished) return;
    const prev = S.STEPS[st.idx], to = S.STEPS[idx];
    // 照劇本的轉場（序章結束的白光、門鈴的閃光）；跳過時換場景也用白光帶過去
    const out = prev && idx > st.idx && (prev.out || (st.skipping && to && prev.scene !== to.scene ? 'white' : null));
    if (out) {
      const my = ++token; ui.innerHTML = ''; onClick = null; keyHandler = null;
      setTimeout(() => { if (my === token) show(idx); }, playFlash(out));
    } else show(idx);
  }
  function show(idx) {
    const my = ++token;
    const step = S.STEPS[idx];
    if (!step) { finish(); return; }
    st.idx = idx; st.id = step.id;
    ui.innerHTML = ''; onClick = null; keyHandler = null;
    body.dataset.step = step.id;
    setScene(step.scene);
    setActors(step.actors);
    setProps(step);
    setLoc(step);
    setDialog(step);
    skipBtn.style.display = step.wait.finale ? 'none' : '';
    if (my === token) setupWait(step);
  }
  function next() {
    if (st.finished) return;
    if (st.skipping) { // 跳過：名字一定要有，登記簿可以空著，然後直接結尾
      if (!st.name) return goTo(stepById('name'));
      if (st.player == null && !st.blank) return goTo(stepById('register'));
      return goTo(stepById('finale'));
    }
    goTo(st.idx + 1);
  }

  // ── 等待方式 ──
  function setupWait(step) {
    const w = step.wait;
    if (w.auto) { later(w.auto, next); onClick = () => next(); return; }
    if (w.click) { onClick = () => next(); return; }
    if (w.action) return actionWait(w);
    if (w.heat) return heatWait();
    if (w.choice) return choiceWait(w.choice);
    if (w.name) return nameWait();
    if (w.register) return registerWait();
    if (w.finale) return finaleWait();
  }

  function actionWait(w) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'act' + (w.fire ? ' fire' : ''); b.textContent = '▶ ' + w.action;
    b.addEventListener('click', (e) => { e.stopPropagation(); finishTyping(); next(); });
    ui.appendChild(b);
    keyHandler = (e, up) => { if (!up && e.key === 'Enter' && !e.repeat) { e.preventDefault(); finishTyping(); next(); return true; } return false; };
  }

  // 按住加熱：月光涼 → 星火溫（放開）→ 日焰燙（等它涼回來，不會失敗）
  function heatWait() {
    const H = S.HEAT;
    ui.innerHTML = `<div class="gauge">
        <div class="hd"><span>🔥 火魔法</span><b>按住加熱，到「星火溫」放開</b></div>
        <div class="track"><i style="flex:${H.warm * 10};background:linear-gradient(90deg,#4f78c8,#8fb3ea)"></i><i style="flex:${(H.hot - H.warm) * 10};background:#ffd66b"></i><i style="flex:${(1 - H.hot) * 10};background:linear-gradient(90deg,#ff9a5c,#e0445c)"></i><div class="needle" style="left:0%"></div></div>
        <div class="lb"><span style="flex:${H.warm * 10}">🌙 月光涼</span><span style="flex:${(H.hot - H.warm) * 10};color:#ffd66b;text-align:center;white-space:nowrap">星火溫</span><span style="flex:${(1 - H.hot) * 10};text-align:right">日焰燙 ☀</span></div>
        <div class="hint"></div>
      </div>
      <div class="hold" role="button" tabindex="0">🔥 按住這裡（或空白鍵）加熱</div>`;
    const needle = ui.querySelector('.needle'), hint = ui.querySelector('.hint'), hold = ui.querySelector('.hold');
    const cg = fx.querySelector('.cg');
    let v = 0, holding = false, cooling = false, done = false, last = performance.now();
    const my = token;
    const draw = () => { needle.style.left = (v * 100).toFixed(1) + '%'; };
    const succeed = (msg) => {
      if (done) return; done = true; holding = false;
      hold.classList.remove('on'); cg && cg.classList.remove('heating');
      hint.textContent = msg || '✨ 星火溫！'; needle.style.boxShadow = '0 0 10px 4px #ffd66b';
      later(650, next);
    };
    const release = () => {
      if (!holding || done) return;
      holding = false; hold.classList.remove('on'); cg && cg.classList.remove('heating');
      if (v >= H.warm && v <= H.hot) succeed();
      else if (v > H.hot) { cooling = true; hint.textContent = '日焰燙……太燙了，等它涼一下。'; }
      else hint.textContent = '還是月光涼，再按久一點。';
    };
    const press = () => { if (done) return; finishTyping(); holding = true; cooling = false; hold.classList.add('on'); cg && cg.classList.add('heating'); hint.textContent = ''; };
    const loop = (t) => {
      if (my !== token || done) return;
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      if (holding) v = Math.min(1, v + dt / H.fillSec);
      else if (cooling) { v = Math.max(0, v - dt / H.coolSec); if (v <= H.hot - 0.04) { cooling = false; v = Math.max(v, H.warm + 0.02); draw(); succeed('✨ 涼回星火溫了。'); return; } }
      st.heat = v; draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    hold.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { hold.setPointerCapture(e.pointerId); } catch (_) { /* 合成的事件沒有指標 */ } press(); });
    hold.addEventListener('pointerup', (e) => { e.stopPropagation(); release(); });
    hold.addEventListener('pointercancel', release);
    hold.addEventListener('click', (e) => e.stopPropagation());
    keyHandler = (e, up) => {
      if (e.code !== 'Space' && e.key !== ' ') return false;
      e.preventDefault();
      if (up) release(); else if (!e.repeat) press();
      return true;
    };
    // 測試用：直接設定溫度再放開
    heatWait.test = (val) => { v = Math.max(0, Math.min(1, Number(val) || 0)); holding = true; release(); draw(); };
  }

  function choiceWait(list) {
    ui.innerHTML = `<div class="choice-dim"></div><div class="choices"><div class="cap">對牠說一句話</div>${list.map((t, i) => `<button type="button" data-i="${i + 1}">${esc(t)}</button>`).join('')}</div>`;
    const pick = (i) => { st.echo = i; next(); };
    ui.querySelectorAll('.choices button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(Number(b.dataset.i)); }));
    keyHandler = (e, up) => { const n = Number(e.key); if (!up && n >= 1 && n <= list.length) { pick(n); return true; } return false; };
    const first = ui.querySelector('.choices button'); first && setTimeout(() => first.focus({ preventScroll: true }), 50);
  }

  // 系統提示：接待員的名字（劇情裡沒有人幫她取名，這是遊戲的取名畫面）
  function nameWait() {
    const cur = st.name || init.erinName || S.DEFAULT_NAME;
    ui.innerHTML = `<div class="choice-dim"></div><div class="sys" role="dialog" aria-label="系統提示">
        <div class="hd">⚙ 系統提示</div>
        <div class="q">請輸入接待員的名字</div>
        <input id="opName" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(cur)}">
        <div class="err" id="opNameErr"></div>
        <div class="note">她會用這個名字自我介紹，也會這樣稱呼自己。<br>1～8 個字・之後可以從右鍵選單「❓ 說明 → 🎬 重看開場」再改</div>
        <div class="row"><button type="button" class="btn ghost" id="opNameDef">用預設名字</button><button type="button" class="btn gold" id="opNameOk">決定 ✓</button></div>
      </div>`;
    const input = $('opName'), err = $('opNameErr');
    const accept = (raw) => {
      const r = S.validateName(raw);
      if (!r.ok) { err.textContent = r.error; input.focus(); return false; }
      st.name = r.name; next(); return true;
    };
    $('opNameOk').addEventListener('click', (e) => { e.stopPropagation(); accept(input.value); });
    $('opNameDef').addEventListener('click', (e) => { e.stopPropagation(); accept(S.DEFAULT_NAME); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); accept(input.value); } });
    input.addEventListener('input', () => { err.textContent = ''; });
    ui.querySelector('.sys').addEventListener('click', (e) => e.stopPropagation());
    setTimeout(() => { input.focus(); input.select(); }, 60);
    nameWait.accept = accept;
  }

  // 登記簿：冒險者的名字（可以先空著）
  function registerWait() {
    const f = A.BOOK.field;
    ui.innerHTML = `<input class="regin" id="opReg" maxlength="24" autocomplete="off" spellcheck="false" placeholder="寫在這裡"
        style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px" value="${esc(st.player || init.playerName || '')}">
      <div class="regbtns"><button type="button" class="btn" id="opRegBlank">先空著</button><button type="button" class="btn gold" id="opRegOk">登記 ✓</button></div>`;
    const input = $('opReg');
    const accept = (raw) => {
      const n = S.cleanPlayerName(raw);
      st.player = n || null; st.blank = !n;
      next();
    };
    $('opRegOk').addEventListener('click', (e) => { e.stopPropagation(); accept(input.value); });
    $('opRegBlank').addEventListener('click', (e) => { e.stopPropagation(); accept(''); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); accept(input.value); } });
    input.addEventListener('click', (e) => e.stopPropagation());
    setTimeout(() => { finishTyping(); input.focus(); }, 400);
    registerWait.accept = accept;
  }

  // 結尾：舞台縮成一道光飛到右下角（主視窗的艾琳在那裡）
  function finaleWait() {
    dlg.classList.add('hidden');
    later(900, () => {
      document.documentElement.style.setProperty('--fx', Math.round(innerWidth / 2 - 150) + 'px');
      document.documentElement.style.setProperty('--fy', Math.round(innerHeight / 2 - 180) + 'px');
      body.classList.add('leaving');
      later(1150, finish);
    });
  }

  // ── 跳過 ──
  function skip() {
    if (st.finished) return;
    if (init.replay) { // 重看：到此為止，已經決定的（名字、那句話）留著，其他不動
      finish(!st.name && st.player == null && !st.blank && !st.echo ? { keep: true } : {});
      return;
    }
    st.skipping = true;
    const id = st.id;
    if (id === 'name' || id === 'register' || id === 'finale') return; // 輸入中：填完就接著跳
    next();
  }
  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); skip(); });

  // ── 點一下、按鍵 ──
  stage.addEventListener('click', (e) => {
    if (e.target.closest('button, input, .hold, .sys, .choices')) return;
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

  // ── 結束：存檔、關掉開場視窗、主視窗接新手教學 ──
  function finish(extra = {}) {
    if (st.finished) return;
    st.finished = true; token++;
    const r = extra.keep ? { keep: true } : { name: st.name, player: st.blank ? '' : st.player, blank: st.blank, echo: st.echo, skipped: st.skipping };
    window.__opResult = r;
    api.finish(r);
  }

  // ── 開始：桌面變暗，冷色光縫往上下拉開 ──
  async function start() {
    try { init = (await api.init()) || {}; } catch (_) { init = {}; }
    if (init.test) window.__op = testHook();
    body.classList.add('on');
    setTimeout(() => { body.classList.add('opening'); stage.classList.add('open'); stage.classList.remove('closed'); }, 350);
    setTimeout(() => { body.classList.add('opened'); }, 1400);
    show(0);
  }

  function testHook() {
    return {
      step: () => st.id,
      state: () => ({ ...st }),
      click: () => { if (!finishTyping() && onClick) onClick(); },
      act: () => { const b = ui.querySelector('.act'); b && b.click(); },
      heat: (v) => heatWait.test && heatWait.test(v),
      heatLevel: () => st.heat,
      choose: (i) => { const b = ui.querySelector(`.choices button[data-i="${i}"]`); b && b.click(); },
      name: (s) => { const inp = $('opName'); if (inp) inp.value = s; const ok = $('opNameOk'); ok && ok.click(); return ($('opNameErr') || {}).textContent || ''; },
      useDefault: () => { const b = $('opNameDef'); b && b.click(); },
      register: (s) => { const inp = $('opReg'); if (inp) inp.value = s; const ok = $('opRegOk'); ok && ok.click(); },
      blank: () => { const b = $('opRegBlank'); b && b.click(); },
      skip,
      text: () => text.textContent,
      np: () => np.textContent,
      typing: () => !!typing,
      result: () => window.__opResult || null,
    };
  }

  start();
})();
