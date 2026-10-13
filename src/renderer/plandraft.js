// 📓 攤開的筆記本：塗鴉風格的週計畫表。先請艾琳（AI）改，也可以點每一項自己改，最後寫進計畫檔
// 只透過 window.pd（plandraft-preload.js）跟主程式說話
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = '日一二三四五六';
const TIER = { main: '⭐ 主線', major: '🔧 重要', side: '🌿 有空再做' };
const ROT = [-1.4, 0.9, -0.5, 1.3, -1, 0.6];
const S = { d: null, faces: {}, name: '艾琳', hl: new Set(), pop: null, confirm: false, busy: false };

// ---- 日期小工具 ----
const dt = (iso) => new Date(`${iso}T00:00:00`);
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const x = dt(s); x.setDate(x.getDate() + n); return iso(x); };
const md = (s) => { const x = dt(s); return `${x.getMonth() + 1}/${x.getDate()}`; };
const dayLabel = (s) => `週${WD[dt(s).getDay()]} ${md(s)}`;
const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(S.d.week.start, i));

// ---- 艾琳說話 ----
function say(text, emotion = 'normal') {
  $('#say').textContent = text || '';
  $('.bubble').classList.toggle('busy', false);
  const f = S.faces[emotion] || S.faces.normal;
  if (f) $('#face').src = f;
}
function sayLine(lines) { const l = lines && lines[0]; if (l) say(l.text, l.emotion || 'normal'); }
function thinking(text) { say(text, 'write'); $('.bubble').classList.add('busy'); }

// ---- 畫面 ----
function render() {
  const d = S.d;
  if (!d) return;
  $('#ttl').textContent = `${S.name}的筆記本`;
  $('#wk').textContent = `${d.week.name} ${d.week.label}`;
  $('#sum').textContent = `${d.summary}${d.pending ? `・還有 ${d.pending} 句在整理` : ''}`;
  renderTarget();
  $('#bUndo').disabled = !d.canUndo;
  $('#bCommit').disabled = !d.count;
  renderWarns();
  renderQuests();
  renderUnsure();
  renderDays();
  renderConfirm();
}
function renderTarget() {
  const d = S.d, t = d.target;
  if (!t) { $('#target').innerHTML = ''; return; }
  if (t.kind === 'current') {
    $('#target').innerHTML = `寫進 <b>${esc(t.name)}</b><span class="seg"><label><input type="radio" name="mode" value="merge" ${d.mode !== 'rewrite' ? 'checked' : ''}><span>合併</span></label><label><input type="radio" name="mode" value="rewrite" ${d.mode === 'rewrite' ? 'checked' : ''}><span>整份重寫</span></label></span>`;
  } else $('#target').innerHTML = `寫成新檔 <b>${esc(t.name)}</b>${t.switchNow ? '' : `・${md(d.week.start)} 自動換上`}`;
}
const warnIds = () => new Set(S.d.checks.flatMap((c) => c.ids || []));
const overIds = () => new Set(S.d.mode === 'rewrite' ? [] : S.d.conflicts.map((c) => c.id));
function renderWarns() {
  const d = S.d;
  const lines = d.checks.map((c) => `<div class="w">${esc(c.text)}</div>`);
  if (d.mode !== 'rewrite' && d.conflicts.length) lines.push(`<div class="c">合併時會蓋掉計畫檔裡的：${esc(d.conflicts.map((c) => c.text).join('、'))}</div>`);
  if (d.mode === 'rewrite' && d.target && d.target.kind === 'current') lines.push('<div class="c">整份重寫：計畫檔原本的內容會換成這一份（寫之前會先備份）</div>');
  $('#warns').innerHTML = lines.join('');
  $('#warns').classList.toggle('hidden', !lines.length);
}
const cls = (id, base, warn, over) => `${base}${warn.has(id) ? ' warn' : ''}${over.has(id) ? ' over' : ''}${S.hl.has(id) ? ' hl' : ''}`;
function renderQuests() {
  const d = S.d, warn = warnIds(), over = overIds();
  $('#quests').innerHTML = d.quests.length ? d.quests.map((q, i) => `<div class="${cls(q.id, `sticky ${q.tier}`, warn, over)}" style="--rot:${ROT[i % ROT.length]}deg" data-edit="${esc(q.id)}" data-kind="quest" tabindex="0">
      <div class="tier">${TIER[q.tier] || ''}${q.project ? `<span class="proj">${esc(q.project)}</span>` : ''}</div>
      <div class="t">${esc(q.title)}</div>
      <div class="due ${q.due ? '' : 'none'}">${q.due ? `📅 ${esc(dayLabel(q.due))} 前` : '（沒有截止日）'}</div>
      ${q.steps.length ? `<ul>${q.steps.map((s) => `<li>${esc(s.text)}</li>`).join('')}</ul>` : ''}
    </div>`).join('') : `<div class="empty">還沒有委託。回去跟${esc(S.name)}說「週五前寫完週報」，或按「＋ 委託」。</div>`;
}
function renderUnsure() {
  const d = S.d;
  $('#unsureBox').classList.toggle('hidden', !d.unsure.length);
  $('#unsure').innerHTML = d.unsure.map((u) => `<div class="uns${S.hl.has(u.id) ? ' hl' : ''}">
      <div class="t">${esc(u.title)}</div><div class="q">${esc(u.question || '')}</div>
      <div class="acts"><button class="mini" data-res-quest="${esc(u.id)}">變成委託</button><button class="mini" data-res-row="${esc(u.id)}">變成時段</button><button class="mini del" data-del="${esc(u.id)}">刪掉</button></div>
    </div>`).join('');
}
function renderDays() {
  const d = S.d, warn = warnIds(), over = overIds();
  $('#days').style.setProperty('--n', d.days.length);
  $('#days').innerHTML = d.days.map((day) => {
    const rows = d.rows.filter((r) => r.date === day.date);
    const rems = d.reminders.filter((m) => m.date === day.date);
    const dues = d.quests.filter((q) => q.due === day.date);
    const items = [
      ...rows.map((r) => ({ at: r.start, html: `<div class="${cls(r.id, `item ${r.raid ? 'raid' : ''}`, warn, over)}" data-edit="${esc(r.id)}" data-kind="row" tabindex="0"><span class="tm">${esc(r.start)}${r.end ? `–${esc(r.end)}` : ''}</span><span class="tx">${r.raid ? '📯 ' : ''}${esc(r.title)}</span></div>` })),
      ...rems.map((m) => ({ at: m.time, html: `<div class="${cls(m.id, 'item rem', warn, over)}" data-edit="${esc(m.id)}" data-kind="reminder" tabindex="0"><span class="tm">⏰ ${esc(m.time)}</span><span class="tx">${esc(m.title)}</span></div>` })),
    ].sort((a, b) => a.at.localeCompare(b.at)).map((x) => x.html);
    const dueHtml = dues.map((q) => `<div class="item due" data-edit="${esc(q.id)}" data-kind="quest" tabindex="0"><span class="tx">📌 截止：${esc(q.title)}</span></div>`).join('');
    const tid = `t:${day.date}`;
    const theme = day.theme ? `<div class="theme${S.hl.has(tid) ? ' hl' : ''}" data-edit="${esc(tid)}" data-kind="theme" tabindex="0">🗓 ${esc(day.theme)}</div>` : '';
    const [w, date] = day.label.split(' ');
    return `<div class="day${day.off ? ' off' : ''}${day.date === d.today ? ' today' : ''}" data-day="${esc(day.date)}">
      <div class="dh"><b>${esc(w)}</b><span class="date">${esc(date || '')}</span></div>
      ${day.off ? `<span class="offtag">🏖 ${esc(day.off)}</span>` : ''}
      ${theme}${items.join('')}${dueHtml}
      <button class="add" data-add-day="${esc(day.date)}">＋</button>
    </div>`;
  }).join('');
}
function renderConfirm() {
  const el = $('#confirm');
  if (!S.confirm) { el.classList.add('hidden'); return; }
  const d = S.d, t = d.target || {};
  let msg = t.kind === 'current'
    ? (d.mode === 'rewrite' ? `整份重寫「${t.name}」？原本的內容會換成這一份。` : `合併進「${t.name}」？一樣的會蓋掉，其他的保留。`)
    : `寫成新檔「${t.name}」？${t.switchNow ? '寫好就換成這週的計畫。' : `${md(d.week.start)} 那天會自動換上。`}`;
  const more = [];
  if (d.checks.length) more.push(`還有 ${d.checks.length} 個紅筆圈起來的地方`);
  if (d.unsure.length) more.push(`${d.unsure.length} 件不確定的不會寫進去`);
  if (d.pending) more.push(`還有 ${d.pending} 句在整理，寫進去就不等了`);
  el.innerHTML = `<span>📝 ${esc(msg)}${t.kind === 'current' ? '（寫之前會先備份）' : ''}${more.length ? `<br><small>${esc(more.join('；'))}</small>` : ''}</span><span class="grow"></span><button class="tb gold" data-go>✔ 寫進去</button><button class="tb" data-nogo>再看看</button>`;
  el.classList.remove('hidden');
}

// ---- 點一下改：小卡 ----
const dayOptions = (sel, { none = false } = {}) => `${none ? `<option value="" ${sel ? '' : 'selected'}>（沒有）</option>` : ''}${weekDays().map((x) => `<option value="${x}" ${x === sel ? 'selected' : ''}>${dayLabel(x)}</option>`).join('')}${sel && !weekDays().includes(sel) ? `<option value="${esc(sel)}" selected>${esc(dayLabel(sel))}</option>` : ''}`;
function findIt(id) {
  const d = S.d;
  for (const k of ['quests', 'rows', 'reminders', 'unsure']) { const x = d[k].find((i) => i.id === id); if (x) return x; }
  return null;
}
function openPop(p) { S.pop = p; renderPop(); }
function closePop() { S.pop = null; $('#pop').classList.add('hidden'); $('#pop').innerHTML = ''; }
function renderPop() {
  const p = S.pop, el = $('#pop');
  if (!p) { closePop(); return; }
  const x = p.id && !p.id.startsWith('t:') && !p.resolve ? findIt(p.id) || {} : {};
  let title = '', body = '';
  if (p.kind === 'pick') { // 某一天的「＋」：要加什麼
    title = `${dayLabel(p.date)} 加…`;
    body = `<div class="kinds"><button class="tb" data-pick="row">🕘 時段</button><button class="tb" data-pick="raid">📯 團戰</button><button class="tb" data-pick="reminder">⏰ 提醒</button>${S.d.themes[p.date] ? '' : '<button class="tb" data-pick="theme">🗓 整天</button>'}</div>`;
  } else if (p.kind === 'quest') {
    title = p.id ? '改委託' : '新委託';
    body = `<label class="f">名稱<input id="fTitle" maxlength="60" value="${esc(x.title || '')}"></label>
      <div class="fr"><label class="f">類型<select id="fTier">${Object.entries(TIER).map(([k, n]) => `<option value="${k}" ${(x.tier || 'major') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">截止<select id="fDue">${dayOptions(x.due || p.date || '', { none: true })}</select></label></div>
      <label class="f">專案（選填）<input id="fProj" maxlength="30" value="${esc(x.project || '')}"></label>
      <label class="f">步驟（一行一個）<textarea id="fSteps" rows="3">${esc((x.steps || []).map((s) => s.text).join('\n'))}</textarea></label>`;
  } else if (p.kind === 'row') {
    const g = p.guess || {};
    title = p.resolve ? '變成時段' : p.id ? '改時段' : (p.raid ? '新團戰' : '新時段');
    body = `<label class="f">要做什麼<input id="fTitle" maxlength="60" value="${esc(x.title || g.title || '')}"></label>
      <div class="fr"><label class="f">哪一天<select id="fDate">${dayOptions(x.date || g.date || p.date || S.d.week.start)}</select></label>
      <label class="f">開始<input id="fStart" type="time" value="${esc(x.start || g.start || '09:00')}"></label>
      <label class="f">結束<input id="fEnd" type="time" value="${esc(x.end || g.end || '')}"></label></div>
      <label class="f chk"><input id="fRaid" type="checkbox" ${(p.id ? x.raid : p.raid || g.raid) ? 'checked' : ''}>📯 團戰（會議：開始前提醒、開始時自動專注）</label>`;
  } else if (p.kind === 'reminder') {
    title = p.id ? '改提醒' : '新提醒';
    body = `<label class="f">提醒什麼<input id="fTitle" maxlength="60" value="${esc(x.title || '')}"></label>
      <div class="fr"><label class="f">哪一天<select id="fDate">${dayOptions(x.date || p.date || S.d.week.start)}</select></label>
      <label class="f">幾點<input id="fTime" type="time" value="${esc(x.time || '16:00')}"></label></div>`;
  } else if (p.kind === 'theme') {
    const date = p.id ? p.id.slice(2) : p.date;
    title = `${dayLabel(date)} 整天`;
    body = `<label class="f">這天在做什麼（例如：出差、教育訓練；留空＝拿掉）<input id="fTitle" maxlength="40" value="${esc(S.d.themes[date] || '')}"></label>`;
  }
  const del = p.id && p.kind !== 'pick' && !p.resolve ? '<button class="tb danger" data-pdel>🗑 刪掉</button>' : '';
  const save = p.kind === 'pick' ? '' : '<button class="tb gold" data-psave>✔ 好了</button>';
  el.innerHTML = `<div class="card"><h3><span>${esc(title)}</span></h3>${body}<div class="err" id="fErr"></div><div class="acts2">${del}<span class="grow"></span><button class="tb" data-pcancel>取消</button>${save}</div></div>`;
  el.classList.remove('hidden');
  const first = el.querySelector('input:not([type=checkbox]), select');
  if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
}
const val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : undefined; };
async function savePop() {
  const p = S.pop;
  let r;
  if (p.kind === 'quest') {
    const f = { title: val('fTitle'), tier: val('fTier'), due: val('fDue'), project: val('fProj'), steps: val('fSteps').split('\n').map((s) => s.trim()).filter(Boolean) };
    r = p.id ? await window.pd.edit(p.id, f) : await window.pd.add('quest', f);
  } else if (p.kind === 'row') {
    const f = { title: val('fTitle'), date: val('fDate'), start: val('fStart'), end: val('fEnd'), raid: $('#fRaid').checked };
    if (!f.start) { $('#fErr').textContent = '要有開始時間'; return; }
    r = p.resolve ? await window.pd.resolve(p.id, 'row', f) : p.id ? await window.pd.edit(p.id, f) : await window.pd.add('row', f);
  } else if (p.kind === 'reminder') {
    const f = { title: val('fTitle'), date: val('fDate'), time: val('fTime') };
    if (!f.time) { $('#fErr').textContent = '要有時間'; return; }
    r = p.id ? await window.pd.edit(p.id, f) : await window.pd.add('reminder', f);
  } else if (p.kind === 'theme') {
    const id = p.id || `t:${p.date}`;
    r = await window.pd.edit(id, { title: val('fTitle') });
    if (r && r.ok) r.changed = [id];
  }
  if (!r || !r.ok) { $('#fErr').textContent = `⚠ ${(r && r.error) || '改不了'}`; return; }
  closePop();
  apply(r);
}
function apply(r) {
  if (r.planDraft !== undefined) S.d = r.planDraft;
  if (r.changed && r.changed.length) { S.hl = new Set(r.changed); clearTimeout(S.hlT); S.hlT = setTimeout(() => { S.hl = new Set(); }, 4000); }
  render();
}

// ---- 事件 ----
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.closest('#pop')) {
    if (t === $('#pop') || t.closest('[data-pcancel]')) { closePop(); return; }
    const pk = t.closest('[data-pick]');
    if (pk) { const k = pk.dataset.pick; const date = S.pop.date; openPop(k === 'raid' ? { kind: 'row', date, raid: true } : { kind: k, date }); return; }
    if (t.closest('[data-psave]')) { await savePop(); return; }
    if (t.closest('[data-pdel]')) { const r = await window.pd.remove(S.pop.id); if (!r || !r.ok) { $('#fErr').textContent = `⚠ ${(r && r.error) || '刪不掉'}`; return; } closePop(); apply(r); return; }
    return;
  }
  if (t.closest('[data-go]')) {
    S.confirm = false; renderConfirm();
    thinking(`${S.name}寫進計畫檔裡…`);
    const r = await window.pd.commit();
    if (!r || !r.ok) say(`嗯……寫不進去：${(r && r.error) || '不知道為什麼'}。表格還在，再試一次看看？`, 'worried');
    return; // 寫好了主程式會把視窗關掉
  }
  if (t.closest('[data-nogo]')) { S.confirm = false; renderConfirm(); return; }
  const ed = t.closest('[data-edit]');
  if (ed) { openPop({ kind: ed.dataset.kind, id: ed.dataset.edit }); return; }
  const ad = t.closest('[data-add]'); if (ad) { openPop({ kind: ad.dataset.add }); return; }
  const day = t.closest('[data-add-day]'); if (day) { openPop({ kind: 'pick', date: day.dataset.addDay }); return; }
  const rq = t.closest('[data-res-quest]'); if (rq) { apply(await act(() => window.pd.resolve(rq.dataset.resQuest, 'quest', {}))); return; }
  const rr = t.closest('[data-res-row]'); if (rr) { const u = findIt(rr.dataset.resRow) || {}; openPop({ kind: 'row', id: u.id, resolve: true, guess: u.guess || {} }); return; }
  const dl = t.closest('[data-del]'); if (dl) { apply(await act(() => window.pd.remove(dl.dataset.del))); return; }
});
async function act(fn) {
  const r = await fn();
  if (!r || !r.ok) { say(`⚠ ${(r && r.error) || '沒辦法'}`, 'worried'); return {}; }
  return r;
}
document.addEventListener('change', async (e) => {
  if (e.target.name === 'mode') apply(await act(() => window.pd.mode(e.target.value)));
});
document.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Escape') { if (S.pop) closePop(); else if (S.confirm) { S.confirm = false; renderConfirm(); } return; }
  if (e.key === 'Enter' && S.pop && e.target.tagName !== 'TEXTAREA' && !e.target.closest('button')) { e.preventDefault(); if (S.pop.kind !== 'pick') savePop(); return; }
  const ed = e.target.closest && e.target.closest('[data-edit]');
  if ((e.key === 'Enter' || e.key === ' ') && ed && !S.pop) { e.preventDefault(); ed.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !S.pop && e.target.tagName !== 'INPUT') { e.preventDefault(); $('#bUndo').click(); }
});
$('#bUndo').addEventListener('click', async () => { const r = await act(() => window.pd.undo()); if (r.ok) { apply(r); say('退回上一步了～', 'normal'); } });
$('#bBack').addEventListener('click', () => window.pd.back());
$('#bClose').addEventListener('click', () => window.pd.pause());
$('#bCommit').addEventListener('click', () => { S.confirm = true; renderConfirm(); });
$('#aiForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('#aiInput');
  const text = inp.value.trim();
  if (!text || S.busy) return;
  S.busy = true; inp.disabled = true; $('#aiSend').disabled = true;
  thinking(S.d && S.d.ai ? `嗯……${S.name}想一下要怎麼改（本機 AI 要等一下下）` : `${S.name}看看…`);
  const r = await window.pd.aiEdit(text);
  S.busy = false; inp.disabled = false; $('#aiSend').disabled = false;
  if (!r || !r.ok) { say(`⚠ ${(r && r.error) || '改不了'}`, 'worried'); inp.focus(); return; }
  if (r.changed && r.changed.length) inp.value = '';
  apply(r); sayLine(r.lines);
  inp.focus();
});
window.pd.onUpdate((p) => {
  if (!p.planDraft) return; // 寫進去／丟掉了：視窗等一下就關
  S.d = p.planDraft;
  if (S.pop && S.pop.id && !S.pop.id.startsWith('t:') && !findIt(S.pop.id)) closePop(); // 正在改的那筆被 AI 換掉了
  render();
});
// 說明小卡
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  const tip = $('#tip');
  if (!el) { tip.classList.add('hidden'); return; }
  tip.textContent = el.dataset.tip; tip.classList.remove('hidden');
  const b = el.getBoundingClientRect();
  tip.style.left = `${Math.max(6, Math.min(window.innerWidth - tip.offsetWidth - 6, b.left + b.width / 2 - tip.offsetWidth / 2))}px`;
  tip.style.top = `${b.bottom + 6}px`;
});

(async function init() {
  const r = await window.pd.get();
  if (!r || !r.ok) { say(`⚠ ${(r && r.error) || '筆記本打不開'}`, 'worried'); return; }
  S.d = r.planDraft; S.faces = r.faces || {}; S.name = r.name || '艾琳';
  document.title = `${S.name}的筆記本・週計畫`;
  $('#aiInput').placeholder = `跟${S.name}說要怎麼改…（例：把週報移到週五、站會改十點）`;
  render();
  if (r.lines && r.lines.length) sayLine(r.lines); else say(`這週的計畫長這樣，要改哪裡就說～`, 'happy');
  if (!S.d || !S.d.ai) setTimeout(() => { if (!S.busy) say(`${$('#say').textContent}（AI 現在沒開：點表格裡的每一項就能自己改）`, 'normal'); }, 50);
})();
