// 📓 艾琳的筆記本（委託）：這週／下週的計畫。原本的＝墨水，這次加的、改的＝鉛筆，按「寫進計畫檔」才寫；勾目標、交付立刻生效
// 只透過 window.pd（plandraft-preload.js）跟主程式說話
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = '日一二三四五六';
const TIER = { main: '⭐ 主線', major: '🔧 重要', side: '🌿 有空再做' };
const ROT = [-1.4, 0.9, -0.5, 1.3, -1, 0.6];
const ART = (n) => `../../assets/stageup/${n}`;
// 艾琳的樣子：聽你說＝邊哼歌邊寫；開心＝抱著筆記本；看不懂＝用筆記本遮臉；寫進去＝蓋章
const POSE = { listen: ART('erin_write_hum.webp'), happy: ART('erin_hug_notebook.webp'), shy: ART('erin_hide_notebook.webp'), stamp: ART('erin_stamp.webp') };
const S = { d: null, faces: {}, name: '艾琳', hl: new Set(), pop: null, confirm: false, menu: false };

// ---- 日期小工具 ----
const dt = (iso) => new Date(`${iso}T00:00:00`);
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const x = dt(s); x.setDate(x.getDate() + n); return iso(x); };
const md = (s) => { const x = dt(s); return `${x.getMonth() + 1}/${x.getDate()}`; };
const dayLabel = (s) => `週${WD[dt(s).getDay()]} ${md(s)}`;
const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(S.d.week.start, i));

// ---- 艾琳說話 ----
function face(kind) {
  const src = POSE[kind] || S.faces[kind] || POSE.listen;
  if ($('#face').getAttribute('src') !== src) $('#face').src = src;
}
function say(text, emotion = 'normal') {
  $('#say').textContent = text || '';
  $('.bubble').classList.remove('busy');
  face(emotion === 'happy' || emotion === 'cheer' ? 'happy' : emotion === 'worried' || emotion === 'thinking' || emotion === 'shy' ? 'shy' : 'listen');
}
function sayLine(lines) { const l = lines && lines[0]; if (l) say(l.text, l.emotion || 'normal'); }
function thinking(text) { $('#say').textContent = text; $('.bubble').classList.add('busy'); face('write'); }
function floatReward(rw) {
  if (!rw || !rw.xp) return;
  const el = document.createElement('div');
  el.className = 'float-reward';
  el.textContent = `✨ +${rw.xp} XP　金幣 +${rw.gold || 0}${rw.levelUp ? `　LEVEL UP! Lv.${rw.levelUp.level}` : ''}`;
  $('#fx').appendChild(el); setTimeout(() => el.remove(), 2100);
}

// ---- 畫面 ----
function render() {
  const d = S.d;
  if (!d) return;
  $('#ttl').textContent = `${S.name}的筆記本`;
  $('#weeks').innerHTML = (d.weeks || []).map((w) => `<button role="tab" class="${w.start === d.week.start ? 'on' : ''}" data-week="${w.which}" data-tip="${esc(`${w.name}（${w.label}）${w.changes ? `：${w.changes} 處還沒寫進計畫檔` : ''}`)}">${esc(w.name)}<small>${esc(w.label)}</small>${w.changes && w.start !== d.week.start ? `<span class="dot">${w.changes}</span>` : ''}</button>`).join('');
  $('#sum').textContent = `${d.summary}${d.pending ? `・${S.name}還在整理 ${d.pending} 句` : ''}`;
  $('#changes').textContent = d.changes ? `✏️ ${d.changes} 處還沒寫進計畫檔` : '';
  $('#changes').classList.toggle('hidden', !d.changes);
  $('#bUndo').disabled = !d.canUndo;
  $('#bCommit').disabled = !d.changes;
  $('#bCommit').dataset.tip = d.target ? (d.target.kind === 'new' ? `這一週還沒有計畫檔：寫的時候選要存在哪裡（建議 ${d.target.dir}\\${d.target.name}）` : `寫進「${d.target.name}」（寫之前會先備份）`) : '';
  renderWarns(); renderQuests(); renderUnsure(); renderDays(); renderLog(); renderConfirm();
}
const warnIds = () => new Set(S.d.checks.flatMap((c) => c.ids || []));
function renderWarns() {
  const lines = S.d.checks.map((c) => `<div>${esc(c.text)}</div>`);
  $('#warns').innerHTML = lines.join('');
  $('#warns').classList.toggle('hidden', !lines.length);
}
const stCls = (st) => (st ? ` st-${st}` : '');
const cls = (id, base, st, warn) => `${base}${stCls(st)}${warn.has(id) ? ' warn' : ''}${S.hl.has(id) ? ' hl' : ''}`;
const restoreBtn = (id) => `<button class="restore" data-restore="${esc(id)}" data-tip="不刪了">↺ 復原</button>`;
function questBadges(q) {
  const b = [];
  if (q.st === 'new') b.push('<span class="badge new">✏️ 新的</span>');
  if (q.st === 'dirty') b.push(`<span class="badge dirty" data-tip="${esc(q.was ? `原本：${q.was.title}${q.was.due ? `，${dayLabel(q.was.due)}前` : ''}` : '')}">✏️ 改過</span>`);
  if (q.play && q.play.active && q.play.status !== 'done') b.push('<span class="badge active">▶ 進行中</span>');
  if (q.play && q.play.total) b.push(`<span class="badge play">${q.play.doneCount}/${q.play.total}</span>`);
  return b.join('');
}
function renderQuests() {
  const d = S.d, warn = warnIds();
  const can = (q) => d.canPlay && q.key && q.st !== 'del' && !(q.play && q.play.status === 'done');
  $('#quests').innerHTML = d.quests.length ? d.quests.map((q, i) => {
    const steps = q.steps.map((s) => {
      const fresh = s.done === undefined; // 這次才加的步驟：寫進去之後才能勾
      const box = can(q) && !fresh ? `<span class="box can" data-check="${esc(q.id)}" data-step="${esc(s.text)}" data-done="${s.done ? 1 : 0}" data-tip="${s.done ? '取消勾選' : '做完了'}">${s.done ? '✓' : ''}</span>` : `<span class="box">${s.done ? '✓' : ''}</span>`;
      return `<li class="${s.done ? 'done' : ''}${fresh && q.key ? ' new' : ''}">${box}<span>${esc(s.text)}</span></li>`;
    }).join('');
    const self = q.implicit && can(q) ? `<ul><li class="${q.doneSelf ? 'done' : ''}"><span class="box can" data-check="${esc(q.id)}" data-step="${esc(q.title)}" data-done="${q.doneSelf ? 1 : 0}">${q.doneSelf ? '✓' : ''}</span><span>做完了</span></li></ul>` : '';
    return `<div class="${cls(q.id, `sticky ${q.tier}`, q.st, warn)}" style="--rot:${ROT[i % ROT.length]}deg" data-edit="${esc(q.id)}" data-kind="quest" tabindex="0">
      <div class="tier">${TIER[q.tier] || ''}${q.project ? `<span class="proj">${esc(q.project)}</span>` : ''}${questBadges(q)}${q.st === 'del' ? restoreBtn(q.id) : ''}</div>
      <div class="t">${esc(q.title)}</div>
      <div class="due ${q.due ? '' : 'none'}">${q.due ? `📅 ${esc(dayLabel(q.due))} 前` : '（沒有截止日）'}</div>
      ${q.reason ? `<div class="reason">${esc(q.reason)}</div>` : ''}
      ${steps ? `<ul>${steps}</ul>` : self}
      ${q.play && q.play.status === 'ready' && q.st !== 'del' ? `<button class="submit" data-submit="${esc(q.id)}">🏆 交付</button>` : ''}
      ${q.play && q.play.status === 'done' ? '<div class="done-stamp">已交付</div>' : ''}
    </div>`;
  }).join('') : `<div class="empty">這一週還沒有委託。<br>在下面跟${esc(S.name)}說「週五前寫完週報」，<br>或說「這個任務的步驟有先 A 再 B」補步驟。</div>`;
}
function renderUnsure() {
  const d = S.d;
  $('#unsureBox').classList.toggle('hidden', !d.unsure.length);
  $('#unsure').innerHTML = d.unsure.map((u) => {
    const steps = u.guess && u.guess.kind === 'steps';
    return `<div class="uns${S.hl.has(u.id) ? ' hl' : ''}">
      <div class="t">${esc(u.title)}</div><div class="q">${esc(u.question || '')}</div>
      <div class="acts">${steps ? `<button class="mini" data-res-steps="${esc(u.id)}">加到委託…</button>` : `<button class="mini" data-res-row="${esc(u.id)}">變成時段</button>`}<button class="mini" data-res-quest="${esc(u.id)}">變成委託</button><button class="mini del" data-del="${esc(u.id)}">刪掉</button></div>
    </div>`;
  }).join('');
}
function renderDays() {
  const d = S.d, warn = warnIds();
  $('#days').style.setProperty('--n', d.days.length);
  $('#days').innerHTML = d.days.map((day) => {
    const rows = d.rows.filter((r) => r.date === day.date);
    const rems = d.reminders.filter((m) => m.date === day.date);
    const dues = d.quests.filter((q) => q.due === day.date && q.st !== 'del');
    const ext = (d.raids || []).filter((r) => r.date === day.date);
    const items = [
      ...rows.map((r) => {
        const box = d.canPlay && r.st !== 'new' && r.st !== 'del' && !r.canceled ? `<span class="rbox can" data-rowdone="${esc(r.id)}" data-done="${r.done ? 1 : 0}" data-tip="${r.done ? '取消勾選' : '做完了'}">${r.done ? '✓' : ''}</span>` : '';
        const w0 = r.st === 'dirty' && r.was ? [r.was.date !== r.date ? dayLabel(r.was.date) : '', r.was.start !== r.start ? r.was.start : '', r.was.title !== r.title ? `「${r.was.title}」` : ''].filter(Boolean).join(' ') : '';
        const was = w0 ? `<span class="was">原本 ${esc(w0)}</span>` : '';
        return { at: r.start, html: `<div class="${cls(r.id, `item ${r.raid ? 'raid' : ''}${r.done ? ' done' : ''}${r.canceled ? ' canceled' : ''}`, r.st, warn)}" data-edit="${esc(r.id)}" data-kind="row" tabindex="0">${box}<span class="col"><span class="tm">${esc(r.start)}${r.end ? `–${esc(r.end)}` : ''}</span><span class="tx">${r.raid ? '📯 ' : ''}${esc(r.title)}${was}</span></span>${r.st === 'del' ? restoreBtn(r.id) : ''}</div>` };
      }),
      ...rems.map((m) => ({ at: m.time, html: `<div class="${cls(m.id, 'item rem', m.st, warn)}" data-edit="${esc(m.id)}" data-kind="reminder" tabindex="0"><span class="col"><span class="tm">⏰ ${esc(m.time)}</span><span class="tx">${esc(m.title)}</span></span>${m.st === 'del' ? restoreBtn(m.id) : ''}</div>` })),
      ...ext.map((x) => ({ at: x.start, html: `<div class="item ext" data-tip="自己建的團戰：在今日行程的「📯 團戰」改"><span class="col"><span class="tm">${esc(x.start)}</span><span class="tx">📯 ${esc(x.title)}</span></span></div>` })),
    ].sort((a, b) => a.at.localeCompare(b.at)).map((x) => x.html);
    const dueHtml = dues.map((q) => `<div class="item due" data-edit="${esc(q.id)}" data-kind="quest" tabindex="0"><span class="tx">📌 截止：${esc(q.title)}</span></div>`).join('');
    const tid = `t:${day.date}`;
    const theme = day.themeSt === 'del' ? `<div class="theme st-del" data-edit="${esc(tid)}" data-kind="theme"><span class="tx">🗓 ${esc(day.themeWas)}</span>${restoreBtn(tid)}</div>`
      : day.theme ? `<div class="theme${stCls(day.themeSt)}${S.hl.has(tid) ? ' hl' : ''}" data-edit="${esc(tid)}" data-kind="theme" tabindex="0">🗓 ${esc(day.theme)}</div>` : '';
    const [w, date] = day.label.split(' ');
    return `<div class="day${day.off ? ' off' : ''}${day.date === d.today ? ' today' : ''}" data-day="${esc(day.date)}">
      <div class="dh"><b>${esc(w)}</b><span class="date">${esc(date || '')}</span></div>
      ${day.off ? `<span class="offtag">🏖 ${esc(day.off)}</span>` : ''}
      ${theme}${items.join('')}${dueHtml}
      <button class="add" data-add-day="${esc(day.date)}" aria-label="這天加東西">＋</button>
    </div>`;
  }).join('');
}
function renderLog() {
  const L = (S.d.log || []).slice(-4);
  $('#log').innerHTML = L.map((l) => `<span class="chip" data-tip="${esc(`「${l.said}」${l.text ? ` → ${l.text}` : ''}`)}"><span class="said">「${esc(l.said.replace(/\n/g, ' '))}」</span>${l.pending ? `<span class="busy">✏️ ${esc(S.name)}${l.edit ? '想怎麼改' : '整理中'}…</span>` : `<span class="got">${esc(l.text || '（沒有記到東西）')}</span>`}<button class="x" data-undo-log="${esc(l.id)}" aria-label="撤銷這句" data-tip="撤銷這句">✕</button></span>`).join('');
}
function renderConfirm() {
  const el = $('#confirm');
  if (!S.confirm) { el.classList.add('hidden'); return; }
  const d = S.d, t = d.target || {};
  const msg = t.kind === 'new' ? `這一週還沒有計畫檔：要寫成新檔嗎？（下一步選要存在哪裡，建議 ${t.dir}\\${t.name}）` : `把 ${d.changes} 處修改寫進「${t.name}」？（寫之前會先備份）`;
  const more = [];
  if (d.checks.length) more.push(`還有 ${d.checks.length} 個紅筆圈起來的地方`);
  if (d.unsure.length) more.push(`${d.unsure.length} 件不確定的不會寫進去`);
  if (d.pending) more.push(`還有 ${d.pending} 句在整理，寫進去就不等了`);
  el.innerHTML = `<span>📝 ${esc(msg)}${more.length ? `<br><small>${esc(more.join('；'))}</small>` : ''}</span><span class="grow"></span><button class="tb gold" data-go>✔ 寫進去</button><button class="tb" data-nogo>再看看</button>`;
  el.classList.remove('hidden');
}

// ---- 點一下改：小卡 ----
const dayOptions = (sel, { none = false } = {}) => `${none ? `<option value="" ${sel ? '' : 'selected'}>（沒有）</option>` : ''}${weekDays().map((x) => `<option value="${x}" ${x === sel ? 'selected' : ''}>${dayLabel(x)}</option>`).join('')}${sel && !weekDays().includes(sel) ? `<option value="${esc(sel)}" selected>${esc(dayLabel(sel))}</option>` : ''}`;
function findIt(id) { for (const k of ['quests', 'rows', 'reminders', 'unsure']) { const x = S.d[k].find((i) => i.id === id); if (x) return x; } return null; }
function openPop(p) { S.pop = p; renderPop(); }
function closePop() { S.pop = null; $('#pop').classList.add('hidden'); $('#pop').innerHTML = ''; }
function renderPop() {
  const p = S.pop, el = $('#pop');
  if (!p) { closePop(); return; }
  const x = p.id && !p.id.startsWith('t:') && !p.resolve ? findIt(p.id) || {} : {};
  let title = '', body = '', note = '';
  if (p.kind === 'confirm') { title = p.title; body = `<p>${esc(p.text)}</p>`; }
  else if (p.kind === 'pick') {
    title = `${dayLabel(p.date)} 加…`;
    body = `<div class="kinds"><button class="tb" data-pick="row">🕘 時段</button><button class="tb" data-pick="raid">📯 團戰</button><button class="tb" data-pick="reminder">⏰ 提醒</button>${S.d.themes[p.date] ? '' : '<button class="tb" data-pick="theme">🗓 整天</button>'}<button class="tb" data-pick="quest">📜 這天截止的委託</button></div>`;
  } else if (p.kind === 'pickQuest') {
    title = '這些步驟要加在哪個委託？';
    body = `<label class="f">委託<select id="fQuest">${S.d.quests.filter((q) => q.st !== 'del').map((q) => `<option value="${esc(q.id)}">${esc(q.title)}</option>`).join('')}</select></label>`;
  } else if (p.kind === 'quest') {
    title = p.id ? '改委託' : '新委託';
    if (x.st === '' || x.st === 'dirty') note = '原本就在計畫檔裡：改的地方按「寫進計畫檔」才會寫進去';
    body = `<label class="f">名稱<input id="fTitle" maxlength="60" value="${esc(x.title || '')}"></label>
      <div class="fr"><label class="f">類型<select id="fTier">${Object.entries(TIER).map(([k, n]) => `<option value="${k}" ${(x.tier || 'major') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">截止<select id="fDue">${dayOptions(x.due || p.date || '', { none: true })}</select></label></div>
      <label class="f">專案（選填）<input id="fProj" maxlength="30" value="${esc(x.project || '')}"></label>
      <label class="f">步驟（一行一個）<textarea id="fSteps" rows="4">${esc((x.steps || []).map((s) => s.text).join('\n'))}</textarea></label>`;
  } else if (p.kind === 'row') {
    const g = p.guess || {};
    title = p.resolve ? '變成時段' : p.id ? '改時段' : (p.raid ? '新團戰' : '新時段');
    body = `<label class="f">要做什麼<input id="fTitle" maxlength="60" value="${esc(x.title || g.title || '')}"></label>
      <div class="fr"><label class="f">哪一天<select id="fDate">${dayOptions(x.date || g.date || p.date || S.d.week.start)}</select></label>
      <label class="f">開始<input id="fStart" type="time" value="${esc(x.start || g.start || '09:00')}"></label>
      <label class="f">結束<input id="fEnd" type="time" value="${esc(x.end || g.end || '')}"></label></div>
      <label class="f chk"><input id="fRaid" type="checkbox" ${(p.id && !p.resolve ? x.raid : p.raid || g.raid) ? 'checked' : ''}>📯 團戰（會議：開始前提醒、開始時自動專注）</label>`;
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
  const del = p.id && !['pick', 'confirm', 'pickQuest'].includes(p.kind) && !p.resolve && x.st !== 'del' ? '<button class="tb danger" data-pdel>🗑 刪掉</button>' : '';
  const save = p.kind === 'pick' ? '' : `<button class="tb gold" data-psave>${p.kind === 'confirm' ? esc(p.ok || '確定') : '✔ 好了'}</button>`;
  el.innerHTML = `<div class="card"><h3><span>${esc(title)}</span></h3>${note ? `<div class="note">${esc(note)}</div>` : ''}${body}<div class="err" id="fErr"></div><div class="acts2">${del}<span class="grow"></span><button class="tb" data-pcancel>取消</button>${save}</div></div>`;
  el.classList.remove('hidden');
  const first = el.querySelector('input:not([type=checkbox]), select');
  if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
}
const val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : undefined; };
async function savePop() {
  const p = S.pop;
  let r;
  if (p.kind === 'confirm') { closePop(); await p.run(); return; }
  if (p.kind === 'pickQuest') r = await window.pd.resolve(p.id, 'steps', { quest: val('fQuest') });
  else if (p.kind === 'quest') {
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
  if (r && r.planDraft !== undefined && r.planDraft) S.d = r.planDraft;
  if (r && r.changed && r.changed.length) { S.hl = new Set(r.changed); clearTimeout(S.hlT); S.hlT = setTimeout(() => { S.hl = new Set(); }, 4000); }
  render();
}
async function act(fn) {
  const r = await fn();
  if (!r || !r.ok) { say(`⚠ ${(r && r.error) || '沒辦法'}`, 'worried'); return null; }
  return r;
}
// 完成委託：勾目標、交付、勾時段（立刻寫進計畫檔、給獎勵）
async function play(fn) {
  const r = await act(fn);
  if (!r) return;
  apply(r);
  if (r.reward) floatReward(r.reward);
  if (r.lines && r.lines.length) sayLine(r.lines);
}

// ---- 事件 ----
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!t.closest('.more')) { S.menu = false; $('#moreMenu').classList.add('hidden'); }
  if (t.closest('#pop')) {
    if (t === $('#pop') || t.closest('[data-pcancel]')) { closePop(); return; }
    const pk = t.closest('[data-pick]');
    if (pk) { const k = pk.dataset.pick; const date = S.pop.date; openPop(k === 'raid' ? { kind: 'row', date, raid: true } : { kind: k, date }); return; }
    if (t.closest('[data-psave]')) { await savePop(); return; }
    if (t.closest('[data-pdel]')) { const r = await window.pd.remove(S.pop.id); if (!r || !r.ok) { $('#fErr').textContent = `⚠ ${(r && r.error) || '刪不掉'}`; return; } closePop(); apply(r); return; }
    return;
  }
  if (t.closest('#bMore')) { S.menu = !S.menu; $('#moreMenu').classList.toggle('hidden', !S.menu); return; }
  if (t.closest('[data-wipe]')) { S.menu = false; $('#moreMenu').classList.add('hidden'); const r = await act(() => window.pd.wipe()); if (r) { apply(r); say(`原本的都先劃掉了。重新跟${S.name}說要做什麼吧～（↶ 可以復原）`, 'normal'); } return; }
  if (t.closest('[data-discard]')) { S.menu = false; $('#moreMenu').classList.add('hidden'); openPop({ kind: 'confirm', title: '放棄這一頁的修改？', text: `還沒寫進計畫檔的 ${S.d.changes} 處修改都會擦掉，回到計畫檔原本的樣子（不能復原）。`, ok: '擦掉', run: async () => { const r = await act(() => window.pd.discard()); if (r) { apply(r); sayLine(r.lines); } } }); return; }
  if (t.closest('[data-go]')) {
    S.confirm = false; renderConfirm();
    thinking(`${S.name}寫進計畫檔裡…`);
    const r = await window.pd.commit();
    if (r && r.canceled) { say('好，先不存～想好了再按一次「寫進計畫檔」。', 'normal'); return; }
    if (!r || !r.ok) { say(`嗯……寫不進去：${(r && r.error) || '不知道為什麼'}。筆記本還在，再試一次看看？`, 'worried'); return; }
    stampFx();
    apply(r);
    setTimeout(() => { sayLine(r.lines); face('happy'); if (r.reward) floatReward(r.reward); }, 900);
    return;
  }
  if (t.closest('[data-nogo]')) { S.confirm = false; renderConfirm(); return; }
  const wk = t.closest('[data-week]'); if (wk) { const r = await act(() => window.pd.switchWeek(wk.dataset.week)); if (r) { apply(r); say(`翻到${r.planDraft.week.name}（${r.planDraft.week.label}）了～`, 'normal'); } return; }
  const ul = t.closest('[data-undo-log]'); if (ul) { const r = await act(() => window.pd.undoLog(ul.dataset.undoLog)); if (r) { apply(r); say('那句撤銷了～', 'normal'); } return; }
  const rs = t.closest('[data-restore]'); if (rs) { e.stopPropagation(); const r = await act(() => window.pd.restore(rs.dataset.restore)); if (r) apply(r); return; }
  const ck = t.closest('[data-check]'); if (ck) { e.stopPropagation(); await play(() => window.pd.check(ck.dataset.check, ck.dataset.step, ck.dataset.done !== '1')); return; }
  const sb = t.closest('[data-submit]'); if (sb) { e.stopPropagation(); thinking(`${S.name}幫你登記交付…`); await play(() => window.pd.submit(sb.dataset.submit)); return; }
  const rd = t.closest('[data-rowdone]'); if (rd) { e.stopPropagation(); await play(() => window.pd.rowDone(rd.dataset.rowdone, rd.dataset.done !== '1')); return; }
  const ed = t.closest('[data-edit]');
  if (ed) { const x = findIt(ed.dataset.edit); if (x && x.st === 'del') return; openPop({ kind: ed.dataset.kind, id: ed.dataset.edit }); return; }
  const ad = t.closest('[data-add]'); if (ad) { openPop({ kind: ad.dataset.add }); return; }
  const day = t.closest('[data-add-day]'); if (day) { openPop({ kind: 'pick', date: day.dataset.addDay }); return; }
  const rq = t.closest('[data-res-quest]'); if (rq) { const r = await act(() => window.pd.resolve(rq.dataset.resQuest, 'quest', {})); if (r) apply(r); return; }
  const rr = t.closest('[data-res-row]'); if (rr) { const u = findIt(rr.dataset.resRow) || {}; openPop({ kind: 'row', id: u.id, resolve: true, guess: u.guess || {} }); return; }
  const rst = t.closest('[data-res-steps]'); if (rst) { openPop({ kind: 'pickQuest', id: rst.dataset.resSteps }); return; }
  const dl = t.closest('[data-del]'); if (dl) { const r = await act(() => window.pd.remove(dl.dataset.del)); if (r) apply(r); return; }
});
function stampFx() {
  const el = $('#stamp');
  $('#stampErin').src = POSE.stamp; $('#stampSeal').src = '../../assets/shop/seal.png';
  el.classList.remove('hidden');
  el.querySelectorAll('img').forEach((i) => { i.style.animation = 'none'; void i.offsetWidth; i.style.animation = ''; });
  face('stamp');
  clearTimeout(S.stampT); S.stampT = setTimeout(() => el.classList.add('hidden'), 2000);
}
document.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Escape') { if (S.pop) closePop(); else if (S.confirm) { S.confirm = false; renderConfirm(); } else if (S.menu) { S.menu = false; $('#moreMenu').classList.add('hidden'); } return; }
  if (e.key === 'Enter' && S.pop && e.target.tagName !== 'TEXTAREA' && !e.target.closest('button')) { e.preventDefault(); if (S.pop.kind !== 'pick') savePop(); return; }
  const ed = e.target.closest && e.target.closest('[data-edit]');
  if ((e.key === 'Enter' || e.key === ' ') && ed && !S.pop) { e.preventDefault(); ed.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !S.pop && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); $('#bUndo').click(); }
});
$('#bUndo').addEventListener('click', async () => { const r = await act(() => window.pd.undo()); if (r) { apply(r); say('退回上一步了～', 'normal'); } });
$('#bClose').addEventListener('click', () => window.pd.close());
$('#bCommit').addEventListener('click', () => { S.confirm = true; renderConfirm(); });
// 說一句：加的東西規則馬上畫上去；要改的規則改不了就請 AI（等一下下）
async function sendSay(text) {
  const r = await window.pd.say(text);
  if (!r || !r.ok) { say(`⚠ ${(r && r.error) || '沒聽清楚'}`, 'worried'); return; }
  const L = r.planDraft && r.planDraft.log.find((l) => l.id === r.logId);
  apply({ planDraft: r.planDraft, changed: L ? (r.planDraft.quests.concat(r.planDraft.rows, r.planDraft.reminders).filter((x) => x.log === r.logId).map((x) => x.id)) : [] });
  if (r.aiEdit) thinking(`嗯……${S.name}想一下要怎麼改（本機 AI 要等一下下）`);
  else if (r.lines && r.lines.length) sayLine(r.lines);
}
$('#sayForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('#sayInput');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  await sendSay(text);
  inp.focus();
});
// 從信件、記事本貼上好幾行：直接整段記下來（單行輸入框會把換行吃掉）
$('#sayInput').addEventListener('paste', (e) => {
  const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
  if (!/\n/.test(txt.trim())) return;
  e.preventDefault();
  const all = `${$('#sayInput').value}${txt}`.trim();
  $('#sayInput').value = '';
  sendSay(all.slice(0, 1200));
});
window.pd.onUpdate((p) => {
  if (!p.planDraft) return;
  S.d = p.planDraft;
  if (S.pop && S.pop.id && !S.pop.id.startsWith('t:') && !['pick', 'confirm'].includes(S.pop.kind) && !findIt(S.pop.id)) closePop(); // 正在改的那筆被 AI 換掉了
  if (p.changed && p.changed.length) { S.hl = new Set(p.changed); clearTimeout(S.hlT); S.hlT = setTimeout(() => { S.hl = new Set(); }, 4000); }
  render();
  if (p.lines && p.lines.length) sayLine(p.lines);
  else if (p.refined && $('.bubble').classList.contains('busy')) say('整理好了～', 'happy');
});
// 說明小卡
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  const tip = $('#tip');
  if (!el || !el.dataset.tip) { tip.classList.add('hidden'); return; }
  tip.textContent = el.dataset.tip; tip.classList.remove('hidden');
  const b = el.getBoundingClientRect();
  tip.style.left = `${Math.max(6, Math.min(window.innerWidth - tip.offsetWidth - 6, b.left + b.width / 2 - tip.offsetWidth / 2))}px`;
  tip.style.top = `${b.bottom + 6 + tip.offsetHeight > window.innerHeight ? b.top - tip.offsetHeight - 6 : b.bottom + 6}px`;
});

(async function init() {
  // 打開的過場：手按著筆記本 → 翻開
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $('#intro1').src = ART('notebook_slam.jpg'); $('#intro2').src = ART('notebook_first_page.jpg');
    $('#intro').classList.remove('hidden');
    setTimeout(() => $('#intro').classList.add('hidden'), 1800);
  }
  const r = await window.pd.get();
  if (!r || !r.ok) { say(`⚠ ${(r && r.error) || '筆記本打不開'}`, 'worried'); return; }
  S.d = r.planDraft; S.faces = r.faces || {}; S.name = r.name || '艾琳';
  document.title = `${S.name}的筆記本・委託`;
  $('#sayInput').placeholder = `跟${S.name}說要加什麼、改什麼…（例：週五前寫完週報／這個任務的步驟有先 A 再 B／把週會移到週四）`;
  face('listen');
  render();
  if (r.lines && r.lines.length) sayLine(r.lines); else say(`這週的計畫長這樣，要加、要改都跟${S.name}說～`, 'happy');
  if (S.d && !S.d.ai) setTimeout(() => { $('#say').textContent += '（AI 現在沒開：用規則記，也可以點每一項自己改）'; }, 50);
  setTimeout(() => $('#sayInput').focus(), 300);
})();
