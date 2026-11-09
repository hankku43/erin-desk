// 🔔 收入撲滿：艾琳腳邊的鈴鐺撲滿，上班時間每隔一段時間掉一枚硬幣進去（+NT$…），下面寫今天賺了多少
//   金額照 income.js 算（月薪 ÷ 240，只算上班時間）；設定面板「🔔 收入撲滿」也在這裡
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
    b.innerHTML = `<span class="ib-art">${bankArt()}</span><span class="ib-total"></span>`;
    b.addEventListener('mousedown', (e) => e.stopPropagation()); // 不算點她、不拖視窗
    b.addEventListener('click', (e) => { e.stopPropagation(); openPanel('income'); });
    $('#npcWrap').appendChild(b);
    return b;
  }

  function tipText(v, t) {
    const lines = ['🔔 收入撲滿'];
    if (t.off) lines.push(v.dayKind === 'leave' ? '今天請假，不算' : `今天${v.dayName || '休假'}，不算`);
    else lines.push(`今天賺了 NT$${Income.fmt(t.earned)}（上班 ${Income.durText(t.worked)}）`);
    lines.push(`時薪 NT$${Income.fmt(Income.hourly(v.monthly))}（月薪 ÷ 240）・${Income.INTERVAL_LABEL[v.interval] || ''}掉一枚`);
    lines.push('（點一下：設定）');
    return lines.join('\n');
  }

  // 每次畫面更新、每一下都叫：顯示／收起、今天的累計
  function sync() {
    const v = state.view && state.view.income;
    const on = !!(v && v.on);
    let b = $('#incomeBank');
    if (!on) { if (b) b.remove(); place(null); stopTimer(); return; }
    b = ensure(); place(b);
    const t = Income.today(v, new Date());
    b.classList.toggle('rest', !t.working);
    const tot = b.querySelector('.ib-total');
    tot.textContent = t.off ? '休假' : `NT$${Income.fmtBy(t.earned, Income.perSec(v.monthly) * v.interval)}`;
    tot.classList.toggle('hidden', !v.showTotal && !t.off);
    b.dataset.tip = tipText(v, t);
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
    if (t.working) drop(Income.perSec(v.monthly) * v.interval);
  }
  function startTimer(sec) { stopTimer(); P.every = sec; P.timer = setInterval(tick, sec * 1000); }
  function stopTimer() { clearInterval(P.timer); P.timer = null; P.every = 0; }
  setInterval(sync, 15000); // 間隔很長時，累計也要一直更新（下班、隔天）
  setTimeout(sync, 300);

  // ---------- 設定面板 ----------
  function preview(f) {
    const r = Income.normalize({ ...f, enabled: true });
    if (!r.ok) return `⚠ ${r.error}`;
    const c = r.cfg, v = state.view.income || {};
    const win = Income.windows({ start: c.start, end: c.end, lunch: v.lunch });
    const day = Income.daySec(win), rate = Income.perSec(c.monthly);
    return `時薪 NT$${Income.fmt(Income.hourly(c.monthly))}・每秒 NT$${Income.fmt(rate)}・${Income.INTERVAL_LABEL[c.interval]} 掉 NT$${Income.fmt(rate * c.interval)}・一天上班 ${Income.durText(day)}，約 NT$${Income.fmt(day * rate)}`;
  }
  function form() {
    const val = (id) => (($(`#${id}`) || {}).value || '').trim();
    return { monthly: val('icMonthly'), start: val('icStart'), end: val('icEnd'), interval: Number(val('icEvery')), countLeave: !!($('#icLeave') || {}).checked, showTotal: !!($('#icTotal') || {}).checked };
  }
  window.renderIncomePanel = function (el, v) {
    const c = v.income || {};
    const lunch = c.lunch ? `${c.lunch[0]}～${c.lunch[1]}` : '沒有設定';
    const opts = Income.INTERVALS.map((s) => `<option value="${s}"${s === (c.interval || 1) ? ' selected' : ''}>${Income.INTERVAL_LABEL[s]}</option>`).join('');
    el.innerHTML = head('🔔 收入撲滿', c.on ? '開著' : '還沒打開', '', '時薪＝月薪 ÷ 240（勞基法的算法：30 天 × 8 小時）。月薪只存在這台電腦的設定檔，不會給 AI 看') + `<div class="panel-body form">
      <p class="hint">上班的時候，${esc(typeof npcNameR === 'function' ? npcNameR() : '艾琳')}腳邊的鈴鐺撲滿會一直「叮」地掉進硬幣，寫著今天賺了多少。午休、下班後、週末和國定假日不算。</p>
      <div class="field">💰 月薪（NT$）<input id="icMonthly" inputmode="numeric" autocomplete="off" placeholder="例如 45000" value="${c.set ? esc(String(c.monthly)) : ''}"></div>
      <div class="field-row"><div class="field">🌅 上班<input id="icStart" type="time" value="${esc(c.start || '09:00')}"></div><div class="field">🌙 下班<input id="icEnd" type="time" value="${esc(c.end || '18:00')}"></div></div>
      <div class="field">🍱 午休<span class="fro">${esc(lunch)}（在「🎓 新手教學 → 作息」改）</span></div>
      <div class="field">⏱ 多久掉一枚硬幣<select id="icEvery">${opts}</select></div>
      <label class="ob-opt"><input type="checkbox" id="icLeave"${c.countLeave ? ' checked' : ''}> 請假那天也算（特休有薪水的話）</label>
      <label class="ob-opt"><input type="checkbox" id="icTotal"${c.showTotal !== false ? ' checked' : ''}> 撲滿下面寫今天賺了多少</label>
      <p class="hint ic-preview" id="icPreview"></p>
    </div>
    <div class="panel-foot">${c.on ? '<button class="btn ghost" id="icOff">收起撲滿</button>' : ''}<span class="spacer"></span><button class="btn ghost" data-close>取消</button><button class="btn gold" id="icSave">🔔 ${c.on ? '改好了' : '放上撲滿'}</button></div>`;
    const p = $('#icPreview'); if (p) p.textContent = $('#icMonthly').value ? preview(form()) : '填了月薪就會算出時薪';
    setTimeout(() => { const i = $('#icMonthly'); if (i && !i.value) i.focus(); }, 30);
  };
  document.addEventListener('input', (e) => {
    if (state.panel !== 'income' || !e.target.closest('#panel')) return;
    const p = $('#icPreview'); if (p) p.textContent = preview(form());
  });
  document.addEventListener('change', (e) => {
    if (state.panel !== 'income' || !e.target.closest('#panel')) return;
    const p = $('#icPreview'); if (p) p.textContent = preview(form());
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
