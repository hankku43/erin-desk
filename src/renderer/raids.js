// 📯 團戰（會議）：清單面板（今天起 7 天）、新增／改時間表單、取消／恢復
// （renderer.js 之後載入；用到 state、api、openPanel、renderPanel、closePanel、head、run、toast、esc、rich、todayISO、nowHHMM、isoToLabel）

const RD_WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const RD_REPEAT = [['once', '只有這次'], ['daily', '每天'], ['weekdays', '平日（一～五）'], ['weekly', '每週']];
const rdDow = (iso) => new Date(`${iso}T00:00:00`).getDay();
const rdPlus = (hm, min) => { const [h, m] = hm.split(':').map(Number); const t = Math.min(23 * 60 + 59, h * 60 + m + min); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
function rdDayLabel(iso) {
  const today = todayISO();
  const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() + 1);
  const tmr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const md = `${isoToLabel(iso)}（${RD_WEEK[rdDow(iso)]}）`;
  return iso === today ? `今天 ${md}` : iso === tmr ? `明天 ${md}` : md;
}
function rdStatusText(o) {
  if (o.holiday && o.canceled) return `放假（${o.holiday}）`;
  if (o.status === 'canceled') return '已取消';
  if (o.status === 'leave') return `你${o.leave || '請假'}，不提醒`;
  if (o.status === 'past') return '已結束';
  if (o.status === 'now') return o.active ? '進行中・專注中' : '進行中';
  const mins = Math.ceil((new Date(`${o.date}T${o.start}:00`).getTime() - Date.parse(state.view.now)) / 60000);
  if (o.status === 'soon') return `${Math.max(1, mins)} 分鐘後`;
  return '';
}
function openRaids() { openPanel('raids'); }
function openRaidForm(key, back) { state.rdScope = 'one'; state.panelBack = back || 'raids'; openPanel('raidForm', key || null); }

function renderRaids(el, v) {
  const R = v.raids || { list: [] };
  const tools = '<button class="tab add" data-rd-new title="登記一場團戰（會議）">＋ 新團戰</button>';
  let body = '';
  if (!R.list.length) {
    body = `<p class="hint">接下來 7 天沒有團戰。</p><div class="rd-help"><b>三種登記方式</b>
      <div>① 按右上角「＋ 新團戰」，可以設每天／平日／每週重複</div>
      <div>② 計畫檔的時間表在時段前加 📯，例如 <code>- 14:00–15:00 📯 週會</code></div>
      <div>③ 從行事曆（.ics）匯入，有時間的事件會自動變成團戰</div></div>`;
  } else {
    let day = '';
    for (const o of R.list) {
      if (o.date !== day) { day = o.date; body += `<div class="rd-day">${esc(rdDayLabel(day))}</div>`; }
      const chips = (o.repeatText ? `<span class="chip">${esc(o.repeatText)}</span>` : '') + (o.source === 'plan' ? '<span class="chip proj" title="寫在計畫檔裡">計畫檔</span>' : '') + (o.moved ? '<span class="chip">改過時間</span>' : '');
      const st = rdStatusText(o);
      let act;
      if (state.rdConfirm === o.key) {
        act = o.source === 'app' && o.repeat !== 'once'
          ? `<button class="btn small danger" data-rd-cancel-yes="${esc(o.key)}" data-scope="one">只取消這次</button><button class="btn small danger" data-rd-cancel-yes="${esc(o.key)}" data-scope="all">整個系列刪掉</button><button class="btn small ghost" data-rd-no>不用</button>`
          : `<button class="btn small danger" data-rd-cancel-yes="${esc(o.key)}" data-scope="one">取消這場</button><button class="btn small ghost" data-rd-no>不用</button>`;
      } else if (o.canceled) act = `<button class="btn small" data-rd-restore="${esc(o.key)}" ${o.holiday ? 'title="國定假日自動跳過；這天還是要開就按這裡"' : ''}>${o.holiday ? '↺ 照開' : '↺ 恢復'}</button>`;
      else if (o.status === 'past') act = '';
      else act = `<button class="btn small" data-rd-edit="${esc(o.key)}">✎ 改時間</button><button class="btn small ghost" data-rd-cancel="${esc(o.key)}">取消</button>`;
      const lock = o.source === 'plan' && !R.planEditable;
      body += `<div class="rd-row ${esc(o.status)} ${o.active ? 'active' : ''}">
        <div class="rd-time"><b>${esc(o.start)}</b><small>${esc(o.end)}</small></div>
        <div class="rd-main"><div class="rd-title">📯 ${rich(o.title)}</div><div class="rd-sub">${st ? `<span class="rd-st">${esc(st)}</span>` : ''}${chips}</div></div>
        <div class="rd-act ${state.rdConfirm === o.key ? 'confirm' : ''}">${lock ? '<small class="hint">舊格式計畫檔不能改</small>' : act}</div>
      </div>`;
    }
  }
  const sub = R.enabled === false ? '提醒關著（config.json 的 raids.enabled）' : `${esc(R.remindText)}提醒${R.autoFocus ? '・開始時自動專注' : ''}`;
  el.innerHTML = head('📯 團戰', sub, tools, '團戰＝會議。開始前提醒你，開始時自動進專注（貓咪縮小、不吵你），結束了有一點星屑和金幣。') + `<div class="panel-body rd-body">${body}</div>`;
}

function renderRaidForm(el, v) {
  const R = v.raids || { list: [] };
  const key = state.panelArg;
  const o = key ? R.list.find((x) => x.key === key) : null;
  if (key && !o) { state.panelBack = null; openPanel('raids'); return; }
  const series = o && o.source === 'app' && o.repeat !== 'once';
  const scope = series ? (state.rdScope || 'one') : 'all';
  const showRepeat = !o || (o.source === 'app' && (scope === 'all' || !series));
  const showDate = !o || !(series && scope === 'all');
  const start = o ? o.start : rdPlus(nowHHMM().slice(0, 3) + '00', 60);
  const end = o ? o.end : rdPlus(start, 60);
  const date = o ? o.date : todayISO();
  const rep = o ? (scope === 'all' ? o.repeat : 'once') : (state.rdRepeat || 'once');
  const days = state.rdDays || (o && o.repeat === 'weekly' && o.days ? o.days : [rdDow(date)]);
  const scopeHtml = series ? `<div class="rd-scope"><button class="btn small ${scope === 'one' ? 'gold' : 'ghost'}" data-rd-scope="one">只改這一次（${esc(isoToLabel(o.date))}）</button><button class="btn small ${scope === 'all' ? 'gold' : 'ghost'}" data-rd-scope="all">整個系列（${esc(o.repeatText)}）</button></div>` : '';
  const repeatHtml = showRepeat ? `<div class="field">🔁 重複<select id="rdRepeat">${RD_REPEAT.map(([k, t]) => `<option value="${k}" ${rep === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="rd-days ${rep === 'weekly' ? '' : 'hidden'}" id="rdDays">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="tp ${days.includes(d) ? 'on' : ''}"><input type="checkbox" name="rdDay" value="${d}" ${days.includes(d) ? 'checked' : ''}>週${RD_WEEK[d]}</label>`).join('')}</div>` : '';
  const note = o && o.source === 'plan' ? '會直接改計畫檔裡的那一行' : '存在程式裡（不會寫進計畫檔），可以設重複';
  el.innerHTML = head(o ? '✎ 改團戰' : '📯 新團戰', o ? rich(o.title) : '登記一場會議', '', note) + `<div class="panel-body form">
      ${scopeHtml}
      <div class="field">📯 名稱<input id="rdTitle" value="${esc(o ? o.title : '')}" placeholder="例如：週會、專案進度會議" maxlength="80"></div>
      <div class="field-row ${showDate ? 'three' : ''}">
        ${showDate ? `<div class="field">📅 日期<input type="date" id="rdDate" value="${date}"></div>` : ''}
        <div class="field">🕘 開始<input type="time" id="rdStart" value="${esc(start)}" data-prev="${esc(start)}"></div>
        <div class="field">🕔 結束<input type="time" id="rdEnd" value="${esc(end)}"></div>
      </div>
      ${repeatHtml}
      <p class="fnote rd-note">${esc(R.remindText || '前 15、5 分鐘和開始時')}提醒；開始時${R.autoFocus === false ? '' : '自動進專注、'}${esc((v.npc && v.npc.name) || '艾琳')}縮成小貓陪你，結束再叫你。</p>
    </div>
    <div class="panel-foot"><span class="spacer"></span><button class="btn ghost" data-back>取消</button><button class="btn gold" data-rd-save>${o ? '💾 儲存' : '📯 登記團戰'}</button></div>`;
  if (!o) setTimeout(() => { const i = $('#rdTitle'); if (i && document.activeElement !== i) i.focus(); }, 30);
}

function rdFormFields() {
  const g = (id) => { const e = $(`#${id}`); return e ? e.value : undefined; };
  const f = { title: (g('rdTitle') || '').trim(), start: g('rdStart'), end: g('rdEnd') || '' };
  if (g('rdDate') !== undefined) f.date = g('rdDate');
  if (g('rdRepeat') !== undefined) {
    f.repeat = g('rdRepeat');
    f.days = [...document.querySelectorAll('input[name="rdDay"]:checked')].map((x) => Number(x.value));
  }
  return f;
}
async function saveRaidForm() {
  const f = rdFormFields();
  if (!f.title) { toast('⚠ 團戰要有名稱'); $('#rdTitle').focus(); return; }
  if (!f.start) { toast('⚠ 請填開始時間'); $('#rdStart').focus(); return; }
  if (f.end && f.end <= f.start) { toast('⚠ 結束時間要在開始之後'); $('#rdEnd').focus(); return; }
  if (f.repeat === 'weekly' && !f.days.length) { toast('⚠ 每週重複要選星期幾'); return; }
  const key = state.panelArg;
  const back = state.panelBack || 'raids';
  const r = await run(() => (key ? api.raidEdit(key, f, state.rdScope || 'one') : api.raidAdd(f)), { thinking: false });
  if (!r || !r.ok) return;
  state.rdRepeat = null; state.rdDays = null; state.panelBack = null;
  openPanel(back);
}

async function raidsClick(e) {
  const t = e.target;
  if (t.closest('[data-rd-new]')) { state.rdRepeat = null; state.rdDays = null; openRaidForm(null, state.panel === 'daily' ? 'daily' : 'raids'); return true; }
  if (t.closest('[data-rd-list]')) { openRaids(); return true; }
  if (t.closest('[data-lv-open]')) { state.panelBack = state.panel === 'daily' ? 'daily' : null; openPanel('leave'); return true; }
  const ed = t.closest('[data-rd-edit]'); if (ed) { state.rdRepeat = null; state.rdDays = null; openRaidForm(ed.dataset.rdEdit, state.panel === 'daily' ? 'daily' : 'raids'); return true; }
  const sc = t.closest('[data-rd-scope]'); if (sc) { state.rdScope = sc.dataset.rdScope; state.rdRepeat = null; state.rdDays = null; renderPanel(); return true; }
  if (t.closest('[data-rd-save]')) { await saveRaidForm(); return true; }
  const cc = t.closest('[data-rd-cancel]'); if (cc) { state.rdConfirm = cc.dataset.rdCancel; renderPanel(); return true; }
  if (t.closest('[data-rd-no]')) { state.rdConfirm = null; renderPanel(); return true; }
  const cy = t.closest('[data-rd-cancel-yes]');
  if (cy) { state.rdConfirm = null; await run(() => api.raidCancel(cy.dataset.rdCancelYes, cy.dataset.scope || 'one'), { thinking: false }); if (state.panel === 'raids') renderPanel(); return true; }
  const rs = t.closest('[data-rd-restore]');
  if (rs) { const r = await run(() => api.raidRestore(rs.dataset.rdRestore), { thinking: false }); if (r && r.ok) toast('↺ 恢復了，提醒也會照常'); return true; }
  return false;
}
function raidsChange(e) {
  const t = e.target;
  if (t.id === 'rdRepeat') {
    state.rdRepeat = t.value;
    const box = $('#rdDays'); if (box) box.classList.toggle('hidden', t.value !== 'weekly');
    return true;
  }
  if (t.name === 'rdDay') { t.closest('.tp').classList.toggle('on', t.checked); state.rdDays = [...document.querySelectorAll('input[name="rdDay"]:checked')].map((x) => Number(x.value)); return true; }
  if (t.id === 'rdStart') { // 開始時間改了：結束時間跟著挪，長度不變（原本沒填結束就當一小時）
    const en = $('#rdEnd');
    if (en && t.value) {
      const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
      const prev = t.dataset.prev;
      const len = en.value && prev && en.value > prev ? mins(en.value) - mins(prev) : 60;
      en.value = rdPlus(t.value, len);
      t.dataset.prev = t.value;
    }
    return true;
  }
  if (t.id === 'rdDate') { // 每週重複預設那一天的星期
    if (!state.rdDays) { const d = rdDow(t.value); document.querySelectorAll('input[name="rdDay"]').forEach((x) => { x.checked = Number(x.value) === d; x.closest('.tp').classList.toggle('on', x.checked); }); }
    return true;
  }
  return false;
}

// 📯 團戰開始（主程式的提醒）：說完那句就縮成小貓，安靜陪著
api.on('ui:raid', (what) => {
  if (what !== 'start') return;
  if (state.panel === 'raids') renderPanel();
  let tries = 0;
  const later = () => { // 等她把那句說完（最多等 30 秒），再過 2.5 秒縮起來
    const f = state.view && state.view.focus;
    if (state.mini || !(f && f.active && f.raid)) return;
    if ((state.typing || state.queue.length) && tries++ < 30) { setTimeout(later, 1000); return; }
    setTimeout(() => { const ff = state.view && state.view.focus; if (!state.mini && ff && ff.active && ff.raid && !FORM_PANELS.has(state.panel)) goMini(); }, 2500);
  };
  setTimeout(later, 1200);
});


// ---------- 🌴 請假與國定假日：請假那天不提醒、團戰不吵、連續上工不斷 ----------
const LV_KINDS = ['特休', '事假', '病假', '補休', '公假', '家庭照顧假'];
function rdMd(iso) { return `${isoToLabel(iso)}（${RD_WEEK[rdDow(iso)]}）`; }
function renderLeave(el, v) {
  const c = v.calendar || { upcoming: [], leave: [], today: {} };
  const t = c.today || {};
  const todayLine = t.kind === 'leave' ? `<div class="lv-today leave">🌴 今天${esc(t.name)}：不提醒、團戰不吵你，連續上工不會斷<button class="btn small ghost" data-lv-off="${esc(t.date)}">取消請假</button></div>`
    : t.kind === 'holiday' ? `<div class="lv-today holiday">🏖 今天是${esc(t.name)}，放假！連續上工不會斷</div>`
      : t.kind === 'weekend' ? '<div class="lv-today holiday">🏖 今天週末，好好休息～</div>'
        : `<div class="lv-today">今天是上班日<button class="btn small" data-lv-today>🌴 今天請假</button></div>`;
  const rows = (c.upcoming || []).map((d) => `<div class="lv-row ${d.kind}"><span class="lv-date">${esc(rdMd(d.date))}</span><span class="lv-name">${d.kind === 'leave' ? '🌴' : '🏖'} ${esc(d.name)}</span>${d.kind === 'leave' ? `<button class="icon-btn del" data-lv-off="${esc(d.date)}" title="取消這天的請假">✕</button>` : '<span class="chip">國定假日</span>'}</div>`).join('');
  const later = (c.leave || []).filter((d) => !(c.upcoming || []).some((u) => u.date === d.date));
  const laterRows = later.map((d) => `<div class="lv-row leave"><span class="lv-date">${esc(rdMd(d.date))}</span><span class="lv-name">🌴 ${esc(d.name)}</span><button class="icon-btn del" data-lv-off="${esc(d.date)}" title="取消這天的請假">✕</button></div>`).join('');
  el.innerHTML = head('🌴 請假與國定假日', '放假的日子連續上工不會斷', '', '國定假日照人事總處的辦公日曆（含補假、補行上班）。公司另外放的假或補班，可以寫在 config.json 的 calendar.holidays／calendar.workdays。') + `<div class="panel-body form">
      ${todayLine}
      ${c.hasData === false ? '<p class="hint">⚠ 今年還沒有國定假日資料，先只算週末（新版會補上）</p>' : ''}
      <div class="field-row">
        <div class="field">📅 哪一天<input type="date" id="lvDate" value="${todayISO()}" min="${todayISO()}"></div>
        <div class="field">🏷 假別<input id="lvNote" list="lvKinds" placeholder="特休" maxlength="20"><datalist id="lvKinds">${LV_KINDS.map((k) => `<option value="${k}">`).join('')}</datalist></div>
      </div>
      <button class="btn gold lv-add" data-lv-add>🌴 標記請假</button>
      <div class="lv-list"><b>接下來三週</b>${rows || '<p class="hint">三週內沒有國定假日或請假。</p>'}${laterRows ? `<b>更後面的請假</b>${laterRows}` : ''}</div>
    </div>`;
}
async function leaveClick(e) {
  const t = e.target;
  const redraw = () => { if (state.panel === 'leave' || state.panel === 'daily') renderPanel(); }; // 請假面板是表單，畫面更新不會自己重畫
  if (t.closest('[data-lv-today]')) { await run(() => api.setLeave(todayISO(), true, ''), { thinking: false }); redraw(); return true; }
  if (t.closest('[data-lv-add]')) {
    const date = $('#lvDate').value, note = $('#lvNote').value.trim();
    if (!date) { toast('⚠ 請選日期'); return true; }
    if (date < todayISO()) { toast('⚠ 日期已經過了'); return true; }
    const r = await run(() => api.setLeave(date, true, note), { thinking: false });
    if (r && r.ok) { toast(`🌴 ${date === todayISO() ? '今天' : isoToLabel(date)} 記成${note || '請假'}了`); redraw(); }
    return true;
  }
  const off = t.closest('[data-lv-off]'); if (off) { await run(() => api.setLeave(off.dataset.lvOff, false), { thinking: false }); redraw(); return true; }
  return false;
}
