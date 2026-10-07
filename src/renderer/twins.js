// 🐰 棉棉和朵朵：雜貨舖的攤位招牌（半身）、抽卡演出、自己跑來櫃台（☕ 下午茶外送、🎉 道賀、🔖 許願單）
// 圖：assets/shop/mian_bust.png、duo_bust.png（tools/cut_sheet.py 從 sheet_twins.png 切的，下面已經淡出）
// 跑來櫃台：主程式排好隊（view.twins.waiting），這裡等畫面有空（沒在說話、沒開面板、不是專注／縮小／離開座位）才拿出來演
// 用到 renderer.js 的 state、$、api、esc、applyView、enqueue、openDialog、hideWhisper、Art、openShop
(function () {
  'use strict';
  const NAMES = { mian: '棉棉', duo: '朵朵' };
  const SRC = (who) => `../../assets/shop/${who}_bust.png`;
  const bust = (who, cls = '') => `<img class="tw-bust ${who} ${cls}" src="${SRC(who)}" alt="${NAMES[who]}" draggable="false">`;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const other = (who) => (who === 'mian' ? 'duo' : 'mian');

  // ---------- 攤位招牌：說話的那個站前面、換人或換句話時跳一下 ----------
  let lastStall = '';
  function stall(tw) {
    const who = tw && tw.who === 'mian' ? 'mian' : 'duo';
    const key = `${who}|${tw && tw.text}`;
    const hop = key !== lastStall ? ' hop' : '';
    lastStall = key;
    return `<div class="sp-stall" data-who="${who}">
      <div class="st-busts">${bust(other(who), 'back')}${bust(who, 'on' + hop)}</div>
      <div class="st-counter"></div>
      <div class="st-say${hop ? ' fresh' : ''}"><b>${esc((tw && tw.name) || NAMES[who])}</b><span>${esc((tw && tw.text) || '')}</span></div>
    </div>`;
  }

  // ---------- 抽卡演出：朵朵發牌、一張一張翻開；★★★ 她會跳起來，★★★★ 姊姊也跑來看 ----------
  const BACK = '<svg viewBox="0 0 90 120" class="dr-back-art"><rect x="2" y="2" width="86" height="116" rx="9" fill="#2b3a6e" stroke="#ffd66b" stroke-width="2.6"/><rect x="8" y="8" width="74" height="104" rx="6" fill="none" stroke="#ffd66b" stroke-width="1" opacity=".55"/><path d="M45 38 L50.5 52 L65 53 L54 62.5 L57.5 77 L45 69 L32.5 77 L36 62.5 L25 53 L39.5 52 Z" fill="#ffd66b" opacity=".9"/><circle cx="20" cy="22" r="1.2" fill="#fff"/><circle cx="70" cy="30" r="1" fill="#fff"/><circle cx="66" cy="96" r="1.3" fill="#fff"/><circle cx="24" cy="92" r="1" fill="#fff"/></svg>';
  function drawShow(results, line) {
    return new Promise((resolve) => {
      const panel = $('#panel');
      if (!panel || panel.classList.contains('hidden') || !results || !results.length) { resolve(); return; }
      const r = panel.getBoundingClientRect();
      const best = Math.max(...results.map((c) => c.r));
      const st = document.createElement('div');
      st.className = `dr-stage n${results.length} best${best}`;
      st.dataset.hit = '';
      Object.assign(st.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      st.innerHTML = `<div class="dr-bg"></div>
        ${best >= 4 ? bust('mian', 'dr-mian') : ''}${bust('duo', 'dr-duo')}
        <div class="dr-say"><b>朵朵</b><span>${results.length > 1 ? '十張一起來！朵朵發牌囉～' : '來來來，抽一張！'}</span></div>
        <div class="dr-cards">${results.map((c, i) => `<div class="dr-card r${c.r}${c.r === best && best >= 3 ? ' top' : ''}" style="--i:${i}"><div class="dr-flip"><div class="dr-face dr-back">${BACK}</div><div class="dr-face dr-front">${Art.card(c)}</div></div><b>${esc(c.name)}</b><small>${c.isNew ? 'NEW!' : `✦ +${c.dust}`}</small></div>`).join('')}</div>
        <button class="btn gold dr-ok">收下</button>`;
      document.body.appendChild(st);
      const say = (who, text) => {
        const s = st.querySelector('.dr-say');
        s.querySelector('b').textContent = NAMES[who]; s.querySelector('span').textContent = text;
        s.dataset.who = who; s.classList.remove('fresh'); void s.offsetWidth; s.classList.add('fresh');
        const b = st.querySelector(`.tw-bust.${who}`); if (b) { b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop'); }
      };
      let stage = 0; // 0 發牌中 1 翻牌中 2 翻完
      const timers = [];
      const later = (ms, fn) => timers.push(setTimeout(fn, ms));
      const n = results.length;
      const reveal = () => {
        if (stage >= 2) return; stage = 2;
        timers.forEach(clearTimeout);
        st.classList.add('dealt', 'flipped', 'done');
        if (best >= 4) {
          st.classList.add('mian-in');
          say('duo', '★★★★！！姊姊快看！');
          later(1400, () => say('mian', '……這張，我們擺攤以來第一次看到這麼亮的。'));
        } else if (best === 3) say('duo', '哇！是 ★★★！朵朵的手也跟著發抖了！');
        else if (line && line.text) say(line.who === 'mian' ? 'mian' : 'duo', line.text);
      };
      later(380, () => st.classList.add('dealt'));
      later(380 + n * 70 + 380, () => { stage = 1; st.classList.add('flipped'); });
      later(380 + n * 70 + 380 + n * 150 + 520, reveal);
      const close = () => { timers.forEach(clearTimeout); st.classList.add('bye'); setTimeout(() => { st.remove(); resolve(); }, 260); };
      st.addEventListener('click', (e) => {
        if (stage < 2) { st.classList.add('fast'); reveal(); return; } // 演出中點一下：直接翻開
        if (e.target.closest('.dr-ok') || !e.target.closest('.dr-cards')) close();
      });
    });
  }

  // ---------- 跑來櫃台 ----------
  const V = { busy: false, presence: { idleSec: 0, locked: false } };
  api.on('presence', (p) => { V.presence = { idleSec: Number(p.idleSec) || 0, locked: !!p.locked }; });
  // 畫面有空嗎：冒險者正在看、沒在做別的事
  function free() {
    const v = state.view;
    if (!v || !v.twins || !(v.twins.waiting > 0) || v.twins.enabled === false) return false;
    if (V.busy || state.mini || state.panel || state.typing || state.talking || state.queue.length || state.proposal) return false;
    if ((v.focus && v.focus.active) || (v.onboarding && v.onboarding.needed)) return false;
    if (V.presence.locked || V.presence.idleSec > 120 || document.body.classList.contains('dozing')) return false;
    const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return false;
    const now = Date.now();
    if (!$('#dialog').classList.contains('hidden') && now - (state.lineDoneAt || 0) < 12000) return false; // 剛說完話：讓冒險者看完
    if (now - (state.clickedAt || 0) < 6000 || now - (V.lastPointer || 0) < 2500) return false;
    return true;
  }
  document.addEventListener('pointerdown', () => { V.lastPointer = Date.now(); }, true);

  async function poll() {
    if (!free()) return;
    V.busy = true;
    try {
      const r = await api.twinsTake();
      if (r && r.view) applyView(r.view);
      if (r && r.ok && r.visit) {
        const act = await play(r.visit);
        after(r.visit, act);
      }
      if (r && r.lines && r.lines.length) enqueue(r.lines);
    } catch (e) { console.error(e); }
    V.busy = false;
  }
  setInterval(poll, 4000);

  // 道具：外送的奶茶、道賀的抽卡券、許願單上的東西
  function prop(v) {
    if (v.kind === 'tea') return `<div class="tv-prop cup">${Art.gift('tea')}</div>`;
    if (v.kind === 'congrats') return `<div class="tv-prop ticket"><span>抽卡券</span><b>×${+v.tickets}</b></div>`;
    const it = (v.items || [])[0];
    if (!it) return '';
    const art = Art.GIFT.includes(it.id) ? Art.gift(it.id) : (Art.HANG.includes(it.id) || Art.DESK.includes(it.id)) ? Art.ornament(it.id) : '<span class="tv-swatch"></span>';
    return `<div class="tv-prop item">${art}</div>`;
  }

  function play(v) {
    return new Promise((resolve) => {
      const dlg = $('#dialog');
      const wasOpen = !dlg.classList.contains('hidden');
      dlg.classList.add('hidden'); hideWhisper();
      const first = (v.lines[0] && v.lines[0].who) || 'duo';
      const el = document.createElement('section');
      el.id = 'twinsVisit'; el.className = `card tv-${v.kind}`; el.dataset.hit = '';
      el.innerHTML = `<div class="tv-busts">${bust(other(first), 'back')}${bust(first, 'on')}</div>${prop(v)}
        <div class="tv-body"><b class="tv-name"></b><div class="tv-line"></div>
        <div class="tv-actions hidden">${(v.actions || []).map((a) => `<button class="btn small ${a.gold ? 'gold' : 'ghost'}" data-tv="${esc(a.id)}">${esc(a.label)}</button>`).join('')}</div></div>
        <button class="icon-btn tv-close" data-tv="close" aria-label="關閉">✕</button>`;
      $('#upper').appendChild(el);
      let i = -1, typing = null, autoT = null, done = false, hover = false;
      const lineEl = el.querySelector('.tv-line');
      const finish = (act) => {
        if (done) return; done = true;
        clearInterval(typing); clearTimeout(autoT);
        el.classList.add('bye');
        setTimeout(() => {
          el.remove();
          if (wasOpen && v.kind !== 'tea' && !state.queue.length && act !== 'draw' && act !== 'shop') openDialog(); // 外送之後艾琳在頭旁邊小聲說話，對話框先不打開
          resolve(act || 'ok');
        }, 380);
      };
      const showActions = () => {
        if ((v.actions || []).length) el.querySelector('.tv-actions').classList.remove('hidden');
        else autoT = setTimeout(() => { if (!hover) finish('auto'); else showActions(); }, 2600);
      };
      const next = () => {
        clearTimeout(autoT);
        if (typing) { clearInterval(typing); typing = null; lineEl.textContent = v.lines[i].text; schedule(); return; }
        i += 1;
        if (i >= v.lines.length) { showActions(); return; }
        const l = v.lines[i];
        el.querySelector('.tv-name').textContent = l.name;
        // 換人說話：那個人走到前面、跳一下
        for (const b of el.querySelectorAll('.tw-bust')) {
          const me = b.classList.contains(l.who);
          b.classList.toggle('on', me); b.classList.toggle('back', !me);
          if (me) { b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop'); }
        }
        let k = 0;
        lineEl.textContent = '';
        typing = setInterval(() => {
          k += 1; lineEl.textContent = l.text.slice(0, k);
          if (k >= l.text.length) { clearInterval(typing); typing = null; schedule(); }
        }, 34);
      };
      const schedule = () => {
        if (i >= v.lines.length - 1) { showActions(); return; }
        autoT = setTimeout(() => { if (!hover) next(); else schedule(); }, 2400); // 滑鼠停在上面：等你看完
      };
      el.addEventListener('mouseenter', () => { hover = true; });
      el.addEventListener('mouseleave', () => { hover = false; });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tv]');
        if (b) { finish(b.dataset.tv); return; }
        if (i < v.lines.length - 1 || typing) next();
        else if (!(v.actions || []).length) finish('ok'); // 外送：說完了點一下就走
      });
      setTimeout(next, 420); // 先讓她們跑進來
    });
  }

  // 走了之後：艾琳喝奶茶（動作圖＋小聲說一句）；去抽卡；去看留著的東西
  function after(v, act) {
    if (v.kind === 'tea' && window.Idle) {
      window.Idle.markDone('tea'); // 三點的奶茶動作不要再演一次
      window.Idle.perform({ type: 'tea', pose: 'tea', emotion: 'happy', emote: 'steam', whisper: v.erin && v.erin.text, ms: 6000 });
    }
    if (act === 'draw') openShop('cards');
    if (act === 'shop') { const it = (v.items || [])[0]; openShop(it && Art.GIFT.includes(it.id) ? 'gift' : 'decor'); if (it) focusItem(it.id); }
  }
  // 打開雜貨舖後，找到那一列、捲過去、閃一下
  async function focusItem(id) {
    for (let k = 0; k < 20; k++) {
      await wait(100);
      const row = document.querySelector(`#panel [data-sp-wish="${id}"], #panel [data-sp-gift="${id}"], #panel [data-sp-buy="${id}"]`);
      const tr = row && row.closest('.sp-row');
      if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash'); return; }
    }
  }

  window.Twins = { stall, drawShow, play, poll, free, bust, focusItem, V };
})();
