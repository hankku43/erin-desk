// 🐾 待機小動作：把 IdleBrain 決定的動作演出來
// 頭旁邊飄表情符號（emotes.js）、小聲說一句（不開對話框）、換動作圖、離開座位時打瞌睡、眨眼、微微看向滑鼠、滑鼠經過時耳朵一抖
// 用到 renderer.js 的 state、$、setEmotion、jump、nowMs、api
(function () {
  'use strict';
  const S = { mem: null, presence: { idleSec: 0, locked: false }, dozing: false, acting: null, actTimer: null, blinkTimer: null, cursor: null, lastHover: 0, preloaded: '' };
  const wrap = $('#npcWrap');
  const img = $('#npcImg');
  const mk = (id, cls, html = '') => { const e = document.createElement('div'); e.id = id; e.className = `${cls} hidden`; e.innerHTML = html; wrap.appendChild(e); return e; };
  const whisper = mk('idleWhisper', 'idle-whisper');
  const zzz = mk('idleZzz', 'idle-zzz', Emotes.svgOf('doze', { w: 60, h: 60 }));
  const view = () => state.view || {};
  const poses = () => (state.character && state.character.poses) || {};
  const enabled = () => view().idleAnim !== false && !!state.character;
  const dialogOpen = () => !$('#dialog').classList.contains('hidden');
  // 她正在說話、剛說完（對話框裡那句的表情還要維持一下）、變身中 → 先不做小動作
  const busy = () => state.typing || state.talking || state.queue.length > 0 || fx.busy || (dialogOpen() && nowMs() - (state.lineDoneAt || 0) < 15000);

  function ctx() {
    const v = view();
    return {
      now: nowMs(), idleSec: S.presence.idleSec, locked: S.presence.locked, enabled: enabled(),
      busy: busy(), mini: state.mini, focus: !!(v.focus && v.focus.active), onboarding: state.panel === 'onboard',
      cold: !!(v.affection && v.affection.cold), fond: !!(v.affection && v.affection.fond), wrap: (v.schedule && v.schedule.wrap) || '',
    };
  }

  // ---- 小零件 ----
  let whisperTimer = null;
  // 飄一個表情符號（音符、愛心、z z Z……）；縮成貓咪時不飄
  function showEmote(kind, ms = 2400) { if (state.mini) return null; return Emotes.show(wrap, kind, ms); }
  function showWhisper(text, ms = 3800) {
    if (state.mini) return;
    clearTimeout(whisperTimer);
    whisper.textContent = text;
    whisper.classList.remove('hidden', 'out'); void whisper.offsetWidth; whisper.classList.add('in');
    whisperTimer = setTimeout(() => { whisper.classList.add('out'); whisperTimer = setTimeout(() => whisper.classList.add('hidden'), 400); }, ms);
  }
  // 暫時換一張圖（動作圖或別的表情），state.emotion 不變，結束時換回來
  function showSrc(src) { if (src && !state.mini && img.getAttribute('src') !== src) img.src = src; }
  function tempEmotion(emo) { const c = state.character; if (c && c.images && c.images[emo]) showSrc(c.images[emo]); }
  function restore() { setEmotion(state.emotion || 'normal'); }
  function preload() {
    const list = Object.values(poses());
    const key = list.join('|');
    if (key === S.preloaded) return;
    S.preloaded = key;
    for (const src of list) { const i = new Image(); i.src = src; } // 第一次換圖才不會閃一下
  }

  // ---- 動作 ----
  function perform(a) {
    endAct();
    S.acting = a;
    const p = poses();
    if (a.pose && p[a.pose]) showSrc(p[a.pose]);
    else if (a.emotion) tempEmotion(a.emotion);
    if (a.anim) img.classList.add(`idle-${a.anim}`);
    if (a.emote) showEmote(a.emote, a.ms || 2400);
    if (a.whisper && !dialogOpen()) showWhisper(a.whisper, Math.max(a.ms || 0, 3800)); // 對話框開著：只冒泡泡，不跟對話框搶
    S.actTimer = setTimeout(endAct, a.ms || 2500);
  }
  function endAct() {
    clearTimeout(S.actTimer);
    const a = S.acting;
    if (!a) return;
    S.acting = null;
    if (a.anim) img.classList.remove(`idle-${a.anim}`);
    Emotes.clear(wrap);
    if (!S.dozing) restore();
  }
  function startDoze() {
    endAct();
    S.dozing = true;
    clearTimeout(whisperTimer); whisper.classList.add('hidden'); // 睡著了：剛剛那句小字先收起來
    document.body.classList.add('dozing');
    const p = poses();
    if (!state.mini && !busy()) showSrc(p.sleep || p.blink);
    zzz.classList.remove('hidden');
    applyLean();
  }
  function stopDoze(a) {
    if (!S.dozing) return;
    S.dozing = false;
    document.body.classList.remove('dozing');
    zzz.classList.add('hidden');
    applyLean();
    if (state.mini) { jump(); return; }
    if (busy()) { restore(); return; }
    tempEmotion('surprised'); jump();
    setTimeout(() => {
      if (S.dozing || busy()) return;
      perform({ type: 'wave', pose: 'wave', emotion: 'happy', emote: 'sparkle', whisper: a && a.whisper, ms: 2400 });
    }, 650);
  }
  function play(a) {
    if (a.type === 'doze') return startDoze();
    if (a.type === 'wake') return stopDoze(a);
    return perform(a);
  }

  function tick() {
    if (!state.character) return;
    preload();
    if (!S.mem) S.mem = IdleBrain.newMemory(nowMs());
    if (!enabled()) { if (S.dozing) stopDoze(null); endAct(); applyLean(); return; }
    if (S.acting && busy()) endAct(); // 她要說話了：小動作先停
    if (S.dozing && (state.typing || state.talking)) { S.dozing = false; document.body.classList.remove('dozing'); zzz.classList.add('hidden'); } // 睡著時有提醒要說：先醒來說話
    const a = IdleBrain.decide(ctx(), S.mem);
    if (a) play(a);
  }

  // ---- 眨眼（有 blink.png 才會）----
  function scheduleBlink() {
    clearTimeout(S.blinkTimer);
    S.blinkTimer = setTimeout(() => { blink(); scheduleBlink(); }, 2500 + Math.random() * 4500);
  }
  function blink(again = true) {
    const p = poses(); const c = state.character;
    if (!p.blink || !c || state.mini || S.dozing || S.acting || !enabled()) return;
    if ((state.emotion || 'normal') !== 'normal' || img.getAttribute('src') !== c.images.normal) return;
    img.src = p.blink;
    setTimeout(() => {
      if (img.getAttribute('src') === p.blink && !S.dozing && !S.acting) img.src = c.images.normal;
      if (again && Math.random() < 0.2) setTimeout(() => blink(false), 160); // 偶爾連眨兩下
    }, 130);
  }

  // ---- 微微看向滑鼠（冷戰時往反方向別過頭）----
  function applyLean() {
    const v = view();
    let lean = 0;
    if (S.cursor && enabled() && !state.mini && !S.dozing) {
      lean = Math.max(-1, Math.min(1, S.cursor.dx / 700)) * 2.2;
      if (v.affection && v.affection.cold) lean = -lean;
    }
    img.style.setProperty('--lean', `${lean.toFixed(2)}deg`);
  }

  // ---- 滑鼠經過：耳朵一抖（25 秒最多一次）----
  wrap.addEventListener('mouseenter', () => {
    const now = nowMs();
    if (!enabled() || state.mini || S.dozing || S.acting || busy() || now - S.lastHover < 25000) return;
    S.lastHover = now;
    const fond = view().affection && view().affection.fond;
    const cold = view().affection && view().affection.cold;
    img.classList.remove('idle-perk'); void img.offsetWidth; img.classList.add('idle-perk');
    setTimeout(() => img.classList.remove('idle-perk'), 600);
    if (!cold) showEmote(fond ? 'heart' : 'twinkle', 1300);
  });
  // 點睡著的她：嚇一跳醒來
  wrap.addEventListener('pointerdown', () => { if (S.dozing) stopDoze(null); }, true);

  api.on('presence', (p) => { S.presence = { idleSec: Number(p.idleSec) || 0, locked: !!p.locked }; tick(); });
  api.on('cursor', (c) => { S.cursor = c; applyLean(); });
  setInterval(tick, 2000);
  scheduleBlink();
  // 測試用
  window.idleDebug = { S, tick, perform, startDoze, stopDoze, showEmote, showWhisper, blink };
})();
