// 🔦 聚光燈教學（新手教學用）：畫面變暗、只亮要按的那個東西，旁邊艾琳的小對話框說下一步做什麼；做完自動往下，隨時可以跳過
//   主視窗和筆記本大視窗共用。主視窗是透明視窗：只把那張卡片（scope）變暗，才不會整塊長方形變黑；擋點擊的那幾塊加 data-hit
//   Coach.run(steps, { face, onEnd(reason), scope, tipWidth })
//   step：{ id, target（選擇器或函式）, scope（變暗的範圍；null＝不變暗；沒寫＝opts.scope 或整個視窗）, text（HTML，自己先 escape）,
//           wait：'next'（按下一步）｜'click'（點到目標）｜函式（回 true 就往下）, block（擋住其他地方，預設：等點目標或等條件時才擋）,
//           enter()、leave()、next（按鈕的字）、pad（洞的留白）、tip: false（這一步不顯示對話框，例如等蓋章動畫演完） }
(function (root) {
  'use strict';
  const C = { steps: null, i: -1, opts: {}, timer: 0, el: null, busy: false, scrolled: '' };
  const pick = (s) => { try { return typeof s === 'function' ? s() : s ? document.querySelector(s) : null; } catch (_) { return null; } };
  const visible = (el) => { if (!el || !el.isConnected) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };

  function mount() {
    if (C.el) return C.el;
    const el = document.createElement('div');
    el.id = 'coach'; el.className = 'coach';
    el.innerHTML = '<div class="co-scope"><div class="co-hole"></div></div><div class="co-ring"></div>'
      + '<div class="co-block" data-hit></div><div class="co-block" data-hit></div><div class="co-block" data-hit></div><div class="co-block" data-hit></div>'
      + '<div class="co-tip" data-hit role="dialog" aria-live="polite"><div class="co-face"></div><div class="co-body"><div class="co-text"></div>'
      + '<div class="co-btns"><button type="button" class="co-skip">跳過教學</button><span class="co-count"></span><span class="co-grow"></span><button type="button" class="co-next">下一步 →</button></div></div></div>';
    document.body.appendChild(el);
    el.querySelector('.co-skip').addEventListener('click', (e) => { e.stopPropagation(); end('skip'); });
    el.querySelector('.co-next').addEventListener('click', (e) => { e.stopPropagation(); next(); });
    // 其他擋住的地方點了：對話框跳一下（提醒要按亮著的那個）
    el.querySelectorAll('.co-block').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); nudge(); }));
    C.el = el;
    return el;
  }
  function nudge() { const t = C.el && C.el.querySelector('.co-tip'); if (!t) return; t.classList.remove('nudge'); void t.offsetWidth; t.classList.add('nudge'); }
  const cur = () => (C.steps && C.steps[C.i]) || null;
  const blocking = (s) => (s.block !== undefined ? !!s.block : !!s.target && s.wait !== 'next');

  // 點到目標：讓原本的按鈕先做完它的事，再往下
  function onClickCapture(e) {
    const s = cur();
    if (!s || s.wait !== 'click' || C.busy) return;
    const t = pick(s.target);
    if (t && t.contains(e.target)) { C.busy = true; setTimeout(() => { C.busy = false; if (cur() === s) next(); }, s.after || 80); }
  }

  function show() {
    const s = cur();
    if (!s) return;
    C.scrolled = '';
    const el = mount();
    // 頭像：face＝圖；faceCrop＝從立繪裁出臉（{ w, h, cx, cy, span }：原圖寬高、臉的中心、要看到多寬）
    const face = C.opts.face, fc = C.opts.faceCrop;
    let img = '<span>🐱</span>';
    if (face && fc) { const k = 42 / fc.span; img = `<img class="crop" src="${face}" alt="" style="width:${(fc.w * k).toFixed(1)}px;height:${(fc.h * k).toFixed(1)}px;left:${(21 - fc.cx * k).toFixed(1)}px;top:${(21 - fc.cy * k).toFixed(1)}px">`; } // 頭像框 46px 扣掉邊框＝42
    else if (face) img = `<img src="${face}" alt="">`;
    el.querySelector('.co-face').innerHTML = img;
    el.querySelector('.co-text').innerHTML = typeof s.text === 'function' ? s.text() : s.text || '';
    const nb = el.querySelector('.co-next');
    nb.textContent = s.next || (C.i === C.steps.length - 1 ? '好 ✓' : '下一步 →');
    nb.classList.toggle('hidden', s.wait !== 'next');
    const shown = C.steps.filter((x) => x.tip !== false), n = C.steps.slice(0, C.i + 1).filter((x) => x.tip !== false).length; // 不顯示對話框的步驟（例如等動畫演完）不算
    el.querySelector('.co-count').textContent = shown.length > 1 ? `${n}／${shown.length}` : '';
    el.querySelector('.co-tip').style.display = s.tip === false ? 'none' : '';
    el.querySelector('.co-skip').textContent = s.skip || C.opts.skipLabel || '跳過教學';
    el.classList.remove('hidden');
    try { if (s.enter) s.enter(); } catch (e) { console.error(e); }
    layout();
  }
  function next() {
    const s = cur();
    if (s && s.leave) { try { s.leave(); } catch (e) { console.error(e); } }
    C.i += 1;
    if (!C.steps || C.i >= C.steps.length) { end('done'); return; }
    if (C.steps[C.i].skipIf && C.steps[C.i].skipIf()) { next(); return; }
    show();
  }
  function end(reason) {
    if (!C.steps) return;
    const opts = C.opts;
    clearInterval(C.timer); C.timer = 0;
    document.removeEventListener('click', onClickCapture, true);
    window.removeEventListener('resize', layout);
    if (C.el) { C.el.remove(); C.el = null; }
    C.steps = null; C.i = -1;
    if (opts.onEnd) { try { opts.onEnd(reason); } catch (e) { console.error(e); } }
  }

  const box = (el, r) => { if (!r) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = `${r.left}px`; el.style.top = `${r.top}px`; el.style.width = `${Math.max(0, r.width)}px`; el.style.height = `${Math.max(0, r.height)}px`; };
  function layout() {
    const s = cur();
    if (!s || !C.el) return;
    const W = window.innerWidth, H = window.innerHeight;
    const t = pick(s.target);
    // 目標在捲動區域外：捲過去（每一步一次）
    if (t && C.scrolled !== s.id && t.scrollIntoView) { C.scrolled = s.id; const r0 = t.getBoundingClientRect(); if (r0.top < 0 || r0.bottom > H) t.scrollIntoView({ block: 'center' }); }
    const tr = visible(t);
    const pad = s.pad === undefined ? 6 : s.pad;
    const hole = tr ? { left: tr.left - pad, top: tr.top - pad, width: tr.width + pad * 2, height: tr.height + pad * 2 } : null;
    // 變暗的範圍：沒寫＝整個視窗；null＝不變暗；指定的卡片不見了（例如面板關掉）＝不變暗也不擋，免得整個視窗點不到
    const scopeSel = s.scope !== undefined ? s.scope : C.opts.scope;
    const whole = { left: 0, top: 0, width: W, height: H };
    const sc = scopeSel === null ? null : scopeSel ? visible(pick(scopeSel)) : whole;
    const scope = C.el.querySelector('.co-scope'), holeEl = C.el.querySelector('.co-hole');
    if (sc && s.dim !== false) {
      box(scope, sc);
      const h = hole || { left: sc.left + sc.width / 2, top: sc.top + sc.height / 2, width: 0, height: 0 };
      box(holeEl, { left: h.left - sc.left, top: h.top - sc.top, width: h.width, height: h.height });
      holeEl.classList.toggle('none', !hole);
    } else scope.style.display = 'none';
    box(C.el.querySelector('.co-ring'), hole);
    // 擋點擊：變暗的範圍扣掉洞（沒變暗的範圍就整個視窗）
    const blocks = C.el.querySelectorAll('.co-block');
    if (blocking(s) && (sc || scopeSel === null)) {
      const a = sc || whole;
      const h = hole || { left: a.left, top: a.top, width: 0, height: 0 };
      const ax2 = a.left + a.width, ay2 = a.top + a.height, hx2 = h.left + h.width, hy2 = h.top + h.height;
      const rects = [
        { left: a.left, top: a.top, width: a.width, height: Math.max(0, h.top - a.top) },
        { left: a.left, top: hy2, width: a.width, height: Math.max(0, ay2 - hy2) },
        { left: a.left, top: h.top, width: Math.max(0, h.left - a.left), height: h.height },
        { left: hx2, top: h.top, width: Math.max(0, ax2 - hx2), height: h.height },
      ];
      blocks.forEach((b, i) => box(b, rects[i]));
    } else blocks.forEach((b) => box(b, null));
    // 對話框：目標下面放得下就放下面，不然放上面；沒有目標就放在範圍中間
    const tip = C.el.querySelector('.co-tip');
    const tw = Math.min(C.opts.tipWidth || 330, W - 16);
    tip.style.width = `${tw}px`;
    const th = tip.offsetHeight || 120;
    let x, y, side = '';
    if (hole) {
      x = hole.left + hole.width / 2 - tw / 2;
      const below = hole.top + hole.height + 12, above = hole.top - th - 12;
      if (s.place === 'above' ? above >= 6 : below + th > H - 6 && above >= 6) { y = above; side = 'up'; } else { y = Math.min(below, H - th - 6); side = 'down'; }
      if (s.place === 'left' && hole.left - tw - 12 >= 6) { x = hole.left - tw - 12; y = Math.max(6, Math.min(H - th - 6, hole.top + hole.height / 2 - th / 2)); side = ''; }
      if (s.place === 'below-scope' && sc && sc.top + sc.height + th + 18 <= H) { x = sc.left + sc.width / 2 - tw / 2; y = sc.top + sc.height + 12; side = ''; } // 表單：對話框放在卡片下面，不擋欄位
    } else {
      const a = sc || { left: 0, top: 0, width: W, height: H };
      x = a.left + a.width / 2 - tw / 2; y = a.top + Math.max(12, a.height / 2 - th / 2);
    }
    x = Math.max(8, Math.min(W - tw - 8, x)); y = Math.max(6, Math.min(H - th - 6, y));
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    tip.dataset.side = side;
    if (hole) tip.style.setProperty('--ax', `${Math.max(16, Math.min(tw - 16, hole.left + hole.width / 2 - x))}px`);
  }
  function tick() {
    const s = cur();
    if (!s) return;
    if (s.ensure) { try { s.ensure(); } catch (e) { console.error(e); } }
    layout();
    if (typeof s.wait === 'function' && !C.busy) {
      let ok = false;
      try { ok = !!s.wait(); } catch (_) { ok = false; }
      if (ok) { C.busy = true; setTimeout(() => { C.busy = false; if (cur() === s) next(); }, s.after || 250); }
    }
  }

  function run(steps, opts = {}) {
    if (C.steps) end('replaced');
    C.steps = steps.filter(Boolean); C.opts = opts; C.i = -1; C.busy = false;
    document.addEventListener('click', onClickCapture, true);
    window.addEventListener('resize', layout);
    C.timer = setInterval(tick, 120);
    next();
  }
  const Coach = { run, end, next, nudge, active: () => !!C.steps, step: () => (cur() ? cur().id : null), relayout: layout };
  root.Coach = Coach;
})(typeof window !== 'undefined' ? window : globalThis);
