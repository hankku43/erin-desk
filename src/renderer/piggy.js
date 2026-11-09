// 🔔 收入撲滿：艾琳腳邊的鈴鐺撲滿，上班時間每隔一段時間掉一枚硬幣進去（+NT$…），下面寫今天賺了多少
//   金額照 income.js 算（月薪 ÷（這個月工作天數 × 每天工時），午休不進帳）；設定面板「🔔 收入撲滿」也在這裡
// 用到 renderer.js 的 state、$、esc、head、api、applyView、toast、openPanel、closePanel、run、Art
'use strict';

(function () {
  const P = { timer: null, every: 0, last: '' };
  const coinSrc = 'coin.svg';
  const bankArt = () => (typeof Art !== 'undefined' && Art.ornament ? Art.ornament('piggy') : '🔔');

  // 撲滿放哪裡：櫃台的擺設是別的東西 → 放在它右邊；擺設本來就是鈴鐺撲滿 → 就用那個位置（擺設那個先藏起來）
  function place(bank) {
    const v = state.view || {};
    const desk = (v.decor && v.decor.desk) || '';
    const left = desk && desk !== 'piggy' ? 64 : 0;
    $('#npcWrap').style.setProperty('--bank-left', `${left}px`);
    document.body.classList.toggle('bank-on', !!bank);
    document.body.classList.toggle('bank-is-desk', !!bank && desk === 'piggy');
  }

  function ensure() {
    let b = $('#incomeBank');
    if (b) return b;
    b = document.createElement('button');
    b.id = 'incomeBank'; b.type = 'button';
    b.innerHTML = `<span class="ib-art">${bankArt()}</span><span class="ib-mode" role="button" data-tip="切換：今天的累計／這個月的累計"></span><span class="ib-total"></span>`;
    b.addEventListener('mousedown', (e) => e.stopPropagation()); // 不算點她、不拖視窗
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('.ib-mode')) { toggleMode(); return; } // 撲滿上的「日／月」：切換下面寫的累計
      openPanel('income');
    });
    $('#npcWrap').appendChild(b);
    return b;
  }

  // 「日／月」按鈕：先換畫面，再存設定（下次打開還是這個）
  async function toggleMode() {
    const v = state.view && state.view.income; if (!v) return;
    v.totalMode = v.totalMode === 'month' ? 'day' : 'month';
    sync();
    const b = $('#incomeBank .ib-total'); if (b) { b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip'); }
    try { const r = await api.incomeMode(v.totalMode); if (r && r.ok && r.view) applyView(r.view); } catch (_) { /* 存不了就只換這次 */ }
  }
  function tipText(v, t, mo) {
    const lines = ['🔔 收入撲滿'];
    if (t.off) lines.push(v.dayKind === 'leave' ? '今天請假，不算' : `今天${v.dayName || '休假'}，不算`);
    else lines.push(`今天賺了 NT$${Income.fmt(t.earned)}（上班 ${Income.durText(t.worked)}${t.lunch ? '，午休中不進帳' : ''}）`);
    lines.push(`這個月到現在 NT$${Math.floor(mo).toLocaleString('en-US')}（之前 ${v.monthPastDays || 0} 個工作天＋今天）`);
    lines.push(`時薪 NT$${Income.fmt(Income.hourly(v))}＝月薪 ÷（這個月 ${v.monthDays} 個工作天 × 每天 ${hrText(Income.workSecOf(v))}）`);
    lines.push(`${Income.INTERVAL_LABEL[v.interval] || ''}掉一枚`);
    lines.push('（點一下：設定）');
    return lines.join('\n');
  }

  const hrText = (sec) => (Number.isInteger(sec / 3600) ? `${sec / 3600} 小時` : Income.durText(sec));
  // 每次畫面更新、每一下都叫：顯示／收起、今天的累計
  function sync() {
    const v = state.view && state.view.income;
    const on = !!(v && v.on);
    let b = $('#incomeBank');
    if (!on) { if (b) b.remove(); place(null); stopTimer(); return; }
    b = ensure(); place(b);
    const now = new Date();
    const t = Income.today(v, now);
    t.lunch = !!(v.lunch && !t.off && Income.mm(v.lunch[0]) <= now.getHours() * 60 + now.getMinutes() && now.getHours() * 60 + now.getMinutes() < Income.mm(v.lunch[1]));
    b.classList.toggle('rest', !t.working);
    b.classList.toggle('lunch', t.lunch);
    const tot = b.querySelector('.ib-total');
    const isMonth = v.totalMode === 'month';
    const mo = Income.month(v, now);
    const amt = isMonth ? mo : t.earned;
    // 只寫整數（11/9 使用者要求）；每一枚多少看旁邊飄的「+0.06」。今天休假時「日」寫休假，「月」照樣寫這個月的
    tot.textContent = !isMonth && t.off ? '休假' : `${isMonth ? '本月' : '今日'} NT$${Math.floor(amt).toLocaleString('en-US')}`;
    tot.classList.toggle('month', isMonth);
    tot.classList.toggle('hidden', !v.showTotal && !(t.off && !isMonth));
    const md = b.querySelector('.ib-mode');
    md.textContent = isMonth ? '月' : '日';
    md.classList.toggle('month', isMonth);
    md.classList.toggle('hidden', !v.showTotal);
    b.dataset.tip = tipText(v, t, mo);
    if (P.every !== v.interval) startTimer(v.interval);
  }

  // 掉一枚：硬幣從上面掉進投幣口、撲滿跳一下、旁邊飄「+NT$…」
  function drop(amount) {
    const b = $('#incomeBank'); if (!b || state.mini) return;
    const coin = document.createElement('img');
    coin.className = 'ib-coin'; coin.src = coinSrc; coin.alt = '';
    b.appendChild(coin);
    const plus = document.createElement('span');
    plus.className = 'ib-plus'; plus.textContent = `+${Income.fmt(amount)}`;
    b.appendChild(plus);
    b.classList.remove('ding'); void b.offsetWidth; b.classList.add('ding');
    setTimeout(() => { coin.remove(); plus.remove(); }, 1400);
  }
  function tick() {
    const v = state.view && state.view.income;
    if (!v || !v.on) return;
    const t = Income.today(v, new Date());
    sync();
    if (t.working) drop(Income.perSec(v) * v.interval); // 午休、下班後不掉
  }
  function startTimer(sec) { stopTimer(); P.every = sec; P.timer = setInterval(tick, sec * 1000); }
  function stopTimer() { clearInterval(P.timer); P.timer = null; P.every = 0; }
  setInterval(sync, 15000); // 間隔很長時，累計也要一直更新（下班、隔天）
  setTimeout(sync, 300);

  // ---------- 設定面板 ----------
  function preview(f) {
    const r = Income.normalize({ ...f, enabled: true });
    if (!r.ok) return `⚠ ${r.error}`;
    const c = r.cfg, v0 = state.view.income || {};
    const v = { monthly: c.monthly, start: c.start, end: c.end, lunch: c.lunchStart ? [c.lunchStart, c.lunchEnd] : null, monthDays: v0.monthDays };
    const day = Income.workSecOf(v), rate = Income.perSec(v);
    return `這個月 ${v.monthDays} 個工作天 × 每天 ${hrText(day)}（扣掉午休）→ 時薪 NT$${Income.fmt(Income.hourly(v))}・每秒 NT$${Income.fmt(rate)}・${Income.INTERVAL_LABEL[c.interval]} 掉 NT$${Income.fmt(rate * c.interval)}・一天約 NT$${Income.fmt(day * rate)}`;
  }
  function form() {
    const val = (id) => (($(`#${id}`) || {}).value || '').trim();
    return { monthly: val('icMonthly'), start: val('icStart'), end: val('icEnd'), lunchStart: val('icLunchA'), lunchEnd: val('icLunchB'), interval: Number(val('icEvery')), countLeave: !!($('#icLeave') || {}).checked, showTotal: !!($('#icTotal') || {}).checked };
  }
  window.renderIncomePanel = function (el, v) {
    const c = v.income || {};
    const opts = Income.INTERVALS.map((s) => `<option value="${s}"${s === (c.interval || 1) ? ' selected' : ''}>${Income.INTERVAL_LABEL[s]}</option>`).join('');
    el.innerHTML = head('🔔 收入撲滿', c.on ? '開著' : '還沒打開', '', '時薪＝月薪 ÷（這個月的工作天數 × 每天的工作時數）；工作天數扣掉週末和國定假日，每天的工作時數扣掉午休。月薪只存在這台電腦的設定檔，不會給 AI 看') + `<div class="panel-body form">
      <p class="hint">上班的時候，${esc(typeof npcNameR === 'function' ? npcNameR() : '艾琳')}腳邊的鈴鐺撲滿會一直「叮」地掉進硬幣，寫著今天賺了多少。午休、下班後、週末和國定假日不算。</p>
      <div class="field">💰 月薪（NT$）<input id="icMonthly" inputmode="numeric" autocomplete="off" placeholder="例如 45000" value="${c.set ? esc(String(c.monthly)) : ''}"></div>
      <p class="hint ic-preview" id="icPreview"></p>
      <div class="field-row"><div class="field">🌅 上班<input id="icStart" type="time" value="${esc(c.start || '09:00')}"></div><div class="field">🌙 下班<input id="icEnd" type="time" value="${esc(c.end || '18:00')}"></div></div>
      <div class="field-row"><div class="field">🍱 午休開始<input id="icLunchA" type="time" value="${esc(c.lunchStart === undefined ? '12:00' : c.lunchStart)}"></div><div class="field">🍱 午休結束<input id="icLunchB" type="time" value="${esc(c.lunchEnd === undefined ? '13:00' : c.lunchEnd)}"></div></div>
      <div class="field">⏱ 多久掉一枚硬幣<select id="icEvery">${opts}</select></div>
      <label class="ob-opt"><input type="checkbox" id="icLeave"${c.countLeave ? ' checked' : ''}> 請假那天也算（特休有薪水的話）</label>
      <label class="ob-opt"><input type="checkbox" id="icTotal"${c.showTotal !== false ? ' checked' : ''}> 撲滿下面寫今天賺了多少</label>
    </div>
    <div class="panel-foot">${c.on ? '<button class="btn ghost" id="icOff">收起撲滿</button>' : ''}<span class="spacer"></span><button class="btn ghost" data-close>取消</button><button class="btn gold" id="icSave">🔔 ${c.on ? '改好了' : '放上撲滿'}</button></div>`;
    const p = $('#icPreview'); if (p) p.textContent = $('#icMonthly').value ? preview(form()) : '填了月薪就會算出時薪';
    setTimeout(() => { const i = $('#icMonthly'); if (i && !i.value) i.focus(); }, 30);
  };
  document.addEventListener('input', (e) => {
    if (state.panel !== 'income' || !e.target.closest('#panel')) return;
    const p = $('#icPreview'); if (p) { p.textContent = preview(form()); p.classList.toggle('bad', p.textContent.startsWith('⚠')); }
  });
  document.addEventListener('change', (e) => {
    if (state.panel !== 'income' || !e.target.closest('#panel')) return;
    const p = $('#icPreview'); if (p) { p.textContent = preview(form()); p.classList.toggle('bad', p.textContent.startsWith('⚠')); }
  });
  window.incomeClick = async function (e) {
    const t = e.target;
    if (t.closest('#icSave')) {
      const f = form();
      const r0 = Income.normalize({ ...f, enabled: true });
      if (!r0.ok) { const p = $('#icPreview'); if (p) { p.textContent = `⚠ ${r0.error}`; p.classList.add('bad'); } return true; }
      const r = await api.incomeSet({ ...f, enabled: true });
      if (!r || !r.ok) { toast(`⚠ ${(r && r.error) || '存不了'}`, 4000); return true; }
      applyView(r.view); closePanel(); sync();
      const t2 = Income.today(r.view.income, new Date());
      toast(t2.off ? '🔔 撲滿放好了（今天休假，上班日才會掉硬幣）' : t2.working ? `🔔 撲滿放好了：今天已經賺了 NT$${Income.fmt(t2.earned)}` : `🔔 撲滿放好了（現在不是上班時間；今天賺了 NT$${Income.fmt(t2.earned)}）`, 4200);
      return true;
    }
    if (t.closest('#icOff')) {
      const r = await api.incomeSet({ enabled: false });
      if (r && r.ok) { applyView(r.view); closePanel(); sync(); toast('🔔 撲滿收起來了（月薪留在設定裡，之後打開不用重填）', 3600); }
      return true;
    }
    return false;
  };
  window.Piggy = { sync, drop, tick, P };
})();
