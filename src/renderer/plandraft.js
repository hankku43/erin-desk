// 📓 艾琳的筆記本：兩本書——📜 委託簿（依截止日排的委託）、🕘 時刻簿（一天一頁的時間軸，可以切一週總覽）
// 原本的＝墨水，這次加的、改的＝鉛筆，按「寫進計畫檔」才寫；勾目標、交付、勾時段立刻生效
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
// 委託的顏色（時刻簿的方塊、委託簿的小標籤用同一個顏色，看得出哪幾格屬於哪個委託）
const QCOLORS = ['#ffd0dc', '#cfe8ff', '#d7f2d0', '#ffe2b8', '#e6d8ff', '#cdeeee', '#fff0a6', '#f6d6c8'];
const S = { d: null, faces: {}, name: '艾琳', hl: new Set(), pop: null, confirm: false, menu: false, book: 'quests', day: null, unit: 30, bump: { quests: 0, time: 0 }, scrolled: '', focus: null, clockOffset: 0, notice: null };

// ---- 日期、時間小工具 ----
const dt = (iso) => new Date(`${iso}T00:00:00`);
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const x = dt(s); x.setDate(x.getDate() + n); return iso(x); };
const md = (s) => { const x = dt(s); return `${x.getMonth() + 1}/${x.getDate()}`; };
const dayLabel = (s) => `週${WD[dt(s).getDay()]} ${md(s)}`;
const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(S.d.week.start, i));
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const endOf = (r) => (r.end && r.end > r.start ? r.end : hm(toMin(r.start) + 30));

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
function sayLine(lines) { const l = (lines || []).find(Boolean); if (l) say(l.text, l.emotion || 'normal'); }
function thinking(text) { $('#say').textContent = text; $('.bubble').classList.add('busy'); face('write'); }
function floatReward(rw) {
  if (!rw || !rw.xp) return;
  const el = document.createElement('div');
  el.className = 'float-reward';
  el.textContent = `✨ +${rw.xp} XP　金幣 +${rw.gold || 0}${rw.levelUp ? `　LEVEL UP! Lv.${rw.levelUp.level}` : ''}`;
  $('#fx').appendChild(el); setTimeout(() => el.remove(), 2100);
}

// ---- 共用 ----
const liveQuests = () => S.d.quests.filter((q) => q.st !== 'del');
// 顏色跟著委託的名稱（不會因為新增、寫進計畫檔換順序就變色）
const qColor = (qid) => { const q = S.d.quests.find((x) => x.id === qid); if (!q) return '#eee'; let h = 0; for (const ch of q.title) h = (h * 31 + ch.codePointAt(0)) >>> 0; return QCOLORS[h % QCOLORS.length]; };
const warnIds = () => new Set(S.d.checks.flatMap((c) => c.ids || []));
const stCls = (st) => (st ? ` st-${st}` : '');
const cls = (id, base, st, warn) => `${base}${stCls(st)}${warn.has(id) ? ' warn' : ''}${S.hl.has(id) ? ' hl' : ''}`;
const restoreBtn = (id) => `<button class="restore" data-restore="${esc(id)}" data-tip="不刪了">↺ 復原</button>`;
function findIt(id) { for (const k of ['quests', 'rows', 'reminders', 'unsure']) { const x = S.d[k].find((i) => i.id === id); if (x) return x; } return null; }
// 時刻簿預設看哪一天：上次看的那天（還在這週）→ 今天（在這週）→ 週一
function pickDay() {
  const days = S.d.days.map((x) => x.date);
  if (S.day === 'week' || days.includes(S.day)) return;
  S.day = days.includes(S.d.bookDay) || S.d.bookDay === 'week' ? S.d.bookDay : days.includes(S.d.today) ? S.d.today : days[0];
}

// ---- 畫面 ----
function render() {
  const d = S.d;
  if (!d) return;
  pickDay();
  const time = S.book === 'time';
  $('#book').dataset.book = S.book;
  document.body.classList.toggle('hand', d.handFont !== false);
  $('#fontState').textContent = d.handFont !== false ? '開' : '關';
  $('#ttl').textContent = `${S.name}的筆記本`;
  $('#ttlSub').textContent = time ? '時刻簿' : '委託簿';
  $('#ttlIco').textContent = time ? '🕘' : '📓';
  // 摘要（幾個委託、幾格行程）放在這週那顆分頁的說明小卡裡，頂欄就不擠（10/13 H）
  const sum = `${d.summary}${d.pending ? `・${S.name}還在整理 ${d.pending} 句` : ''}`;
  $('#weeks').innerHTML = (d.weeks || []).map((w) => `<button role="tab" class="${w.start === d.week.start ? 'on' : ''}" data-week="${w.which}" data-tip="${esc(`${w.name}（${w.label}）${w.start === d.week.start ? `：${sum}` : ''}${w.changes ? `・${w.changes} 處還沒寫進計畫檔` : ''}`)}">${esc(w.name)}<small>${esc(w.label)}</small>${w.changes && w.start !== d.week.start ? `<span class="dot">${w.changes}</span>` : ''}</button>`).join('');
  $('#changes').innerHTML = d.changes ? `✏️ ${d.changes}<span class="lg"> 處還沒寫進計畫檔</span>` : ''; // 視窗窄時只留「✏️N」（10/14 A）
  $('#changes').dataset.tip = '鉛筆的（新加、改過、劃掉的）都還只是草稿，櫃台的週任務板、今日行程看不到；按「✔ 寫進計畫檔」才算數。勾步驟、勾時段、交付不用等，已經寫進去了';
  $('#changes').classList.toggle('hidden', !d.changes);
  $('#bUndo').disabled = !d.canUndo;
  $('#bCommit').disabled = !d.changes;
  $('#bCommit').dataset.tip = d.target ? (d.target.kind === 'new' ? `這一週還沒有計畫檔：寫的時候選要存在哪裡（建議 ${d.target.dir}\\${d.target.name}）` : `寫進「${d.target.name}」（寫之前會先備份）`) : '';
  $('#pageQuests').classList.toggle('hidden', time);
  $('#pageTime').classList.toggle('hidden', !time);
  // 提示短一點（10/13 M）；完整的例子滑過輸入框就看得到
  $('#sayInput').placeholder = time ? `跟${S.name}說時段，例：週二下午兩點到三點開會` : `跟${S.name}說要加什麼、改什麼，例：週五前寫完週報`;
  $('#sayInput').dataset.tip = time ? '可以這樣說：週二下午兩點到三點開會／週三 9:00–10:00 回信／提醒我週四四點打給廠商／週三、週四出差（整段貼上也可以）' : '可以這樣說：週五前寫完週報／這個任務的步驟有先 A 再 B／把週會移到週四／整理月報：收齊數字、寫摘要（整段貼上也可以）';
  renderTabs(); renderWarns(); renderUnsure();
  if (time) renderTime(); else renderQuests();
  renderLog(); renderConfirm();
}
function renderTabs() {
  document.querySelectorAll('#tabs [data-book]').forEach((b) => {
    const k = b.dataset.book;
    b.classList.toggle('on', k === S.book);
    b.setAttribute('aria-selected', k === S.book ? 'true' : 'false');
    const n = S.bump[k] || 0;
    const em = b.querySelector('.bump');
    em.textContent = n ? `+${n}` : '';
    em.classList.toggle('hidden', !n);
    b.dataset.tip = k === 'quests' ? '📜 委託簿：這週的任務（計畫檔裡叫委託）和步驟，依截止日排' : '🕘 時刻簿：每天幾點做什麼（一天一頁）';
  });
}
function renderWarns() {
  const lines = S.d.checks.map((c, i) => `<button type="button" data-warn="${i}" data-tip="點一下翻到那一格">${esc(c.text)}</button>`);
  $('#warns').innerHTML = lines.join('');
  $('#warns').classList.toggle('hidden', !lines.length);
}
// 紅筆警告點一下：翻到那一本（時段→時刻簿那天、委託→委託簿），亮一下、捲到看得到的地方
function jumpTo(ids) {
  const items = (ids || []).map((id) => ({ id, it: findIt(id) })).filter((x) => x.it);
  if (!items.length) return;
  const row = items.find((x) => S.d.rows.includes(x.it) || S.d.reminders.includes(x.it));
  const target = row || items[0];
  const toTime = !!row;
  const day = toTime && target.it.date && S.d.days.some((x) => x.date === target.it.date) ? target.it.date : undefined;
  S.hl = new Set(items.map((x) => x.id)); clearTimeout(S.hlT); S.hlT = setTimeout(() => { S.hl = new Set(); render(); }, 4000);
  setBook(toTime ? 'time' : 'quests', toTime && S.day !== 'week' ? day : undefined);
  const el = document.querySelector(`.pop:not(.hidden) .hl, #main .hl`);
  if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
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

// ---- 📜 委託簿 ----
function questBadges(q) {
  const b = [];
  if (q.st === 'new') b.push('<span class="badge new">✏️ 新的</span>');
  if (q.st === 'dirty') b.push(`<span class="badge dirty" data-tip="${esc(q.was ? `原本：${q.was.title}${q.was.due ? `，${dayLabel(q.was.due)}前` : ''}` : '')}">✏️ 改過</span>`);
  if (q.play && q.play.active && q.play.status !== 'done') b.push('<span class="badge active">▶ 進行中</span>');
  if (q.play && q.play.total) b.push(`<span class="badge play">${q.play.doneCount}/${q.play.total}</span>`);
  return b.join('');
}
function stickyHtml(q, i) {
  const d = S.d, warn = warnIds();
  const can = d.canPlay && q.key && q.st !== 'del' && !(q.play && q.play.status === 'done');
  const steps = q.steps.map((s) => {
    const fresh = s.done === undefined; // 這次才加的步驟：寫進去之後才能勾
    const box = can && !fresh ? `<span class="box can" data-check="${esc(q.id)}" data-step="${esc(s.text)}" data-done="${s.done ? 1 : 0}" data-tip="${s.done ? '取消勾選（立刻寫回計畫檔）' : '做完了（立刻寫進計畫檔、給獎勵）'}">${s.done ? '✓' : ''}</span>` : `<span class="box">${s.done ? '✓' : ''}</span>`;
    return `<li class="${s.done ? 'done' : ''}${fresh && q.key ? ' new' : ''}">${box}<span>${esc(s.text)}</span></li>`;
  }).join('');
  const self = q.implicit && can ? `<ul><li class="${q.doneSelf ? 'done' : ''}"><span class="box can" data-check="${esc(q.id)}" data-step="${esc(q.title)}" data-done="${q.doneSelf ? 1 : 0}">${q.doneSelf ? '✓' : ''}</span><span>做完了</span></li></ul>` : '';
  const live = q.st !== 'del' && !(q.play && q.play.status === 'done');
  const slots = q.slots ? `<button class="slots" data-goto-day="${esc(q.slotDates[0])}" style="--qc:${qColor(q.id)}" data-tip="${esc(`排在時刻簿：${q.slotDates.map((x) => dayLabel(x)).join('、')}（點一下翻過去）`)}">🕘 ${q.slots} 格</button>` : '';
  return `<div class="${cls(q.id, `sticky ${q.tier}`, q.st, warn)}" style="--rot:${ROT[i % ROT.length]}deg" data-edit="${esc(q.id)}" data-kind="quest" tabindex="0">
    <div class="tier">${TIER[q.tier] || ''}${q.project ? `<span class="proj">${esc(q.project)}</span>` : ''}${questBadges(q)}${q.st === 'del' ? restoreBtn(q.id) : ''}</div>
    <div class="t">${esc(q.title)}</div>
    ${q.reason ? `<div class="reason">${esc(q.reason)}</div>` : ''}
    ${steps ? `<ul>${steps}</ul>` : self}
    <div class="sfoot">${live ? `<button class="split" data-split="${esc(q.id)}" data-tip="選一段時間，把這個委託的步驟拆成一格一格的時段">🕘 排進時刻簿</button>` : ''}${slots}</div>
    ${q.play && q.play.status === 'ready' && q.st !== 'del' ? `<button class="submit" data-submit="${esc(q.id)}">🏆 交付</button>` : ''}
    ${q.play && q.play.status === 'done' ? '<div class="done-stamp">已交付</div>' : ''}
  </div>`;
}
function renderQuests() {
  const d = S.d;
  const inWeek = new Set(d.days.map((x) => x.date));
  const cols = d.days.map((day) => ({ key: day.date, day, qs: d.quests.filter((q) => q.due === day.date) }));
  cols.push({ key: 'none', qs: d.quests.filter((q) => !q.due) });
  const other = d.quests.filter((q) => q.due && !inWeek.has(q.due));
  if (other.length) cols.push({ key: 'other', qs: other });
  let n = 0;
  $('#dueCols').style.gridTemplateColumns = cols.map((c) => (c.qs.length ? 'minmax(190px, 1fr)' : 'minmax(116px, .5fr)')).join(' '); // 沒有委託的那天窄一點
  $('#dueCols').innerHTML = cols.map((c) => {
    const day = c.day;
    const head = day ? (() => { const [w, date] = day.label.split(' '); return `<div class="dh"><b>${esc(w)}</b><span class="date">${esc(date || '')}</span></div>${day.off ? `<span class="offtag">🏖 ${esc(day.off)}</span>` : ''}`; })()
      : `<div class="dh"><b>${c.key === 'none' ? '沒有截止日' : '其他日子'}</b><span class="date">${c.key === 'none' ? '這週內' : ''}</span></div>`;
    const body = c.qs.map((q) => stickyHtml(q, n++)).join('') || (c.key === 'none' && !d.quests.length ? `<div class="empty">這一週還沒有委託。<br>在下面跟${esc(S.name)}說「週五前寫完週報」，或說「這個任務的步驟有先 A 再 B」補步驟。</div>` : '');
    return `<div class="dcol${day && day.off ? ' off' : ''}${day && day.date === d.today ? ' today' : ''}${c.key === 'none' ? ' none' : ''}" data-col="${esc(c.key)}">
      ${head}<div class="dbody">${body}</div>
      ${c.key !== 'other' ? `<button class="add" data-add="quest" data-due="${c.key === 'none' ? '' : esc(c.key)}" aria-label="加委託">＋</button>` : ''}
    </div>`;
  }).join('');
}

// ---- 🕘 時刻簿 ----
// 時間軸：整週一起算（換天時不會跳），至少 08:00–19:00
function axisRange() {
  const d = S.d;
  const ts = [...d.rows.filter((r) => r.start), ...(d.raids || [])].flatMap((r) => [toMin(r.start), toMin(endOf(r))]).concat(d.reminders.map((m) => toMin(m.time)));
  const lo = Math.min(8 * 60, ...ts.map((t) => Math.floor(t / 60) * 60));
  const hi = Math.max(19 * 60, ...ts.map((t) => Math.ceil(t / 60) * 60));
  return { lo, hi };
}
function renderDayTabs() {
  const d = S.d;
  $('#dayTabs').innerHTML = d.days.map((day) => {
    const n = d.rows.filter((r) => r.date === day.date && r.st !== 'del').length + (d.raids || []).filter((r) => r.date === day.date).length;
    const [w, date] = day.label.split(' ');
    return `<button role="tab" class="${S.day === day.date ? 'on' : ''}${day.date === d.today ? ' today' : ''}${day.off ? ' off' : ''}" data-day="${esc(day.date)}" data-tip="${esc(`${day.label}${day.off ? `（${day.off}）` : ''}${n ? `：${n} 格` : ''}`)}">${esc(w)}<small>${esc(date)}</small>${n ? `<span class="n">${n}</span>` : ''}</button>`;
  }).join('');
  $('#bWeekView').classList.toggle('on', S.day === 'week');
  $('#unitSel').value = String(S.unit);
}
function blockHtml(r, { ppm, lo, compact = false, ext = false }) {
  const warn = warnIds();
  const top = (toMin(r.start) - lo) * ppm;
  const h = Math.max(compact ? 15 : 24, (toMin(endOf(r)) - toMin(r.start)) * ppm - 2);
  const pos = `top:${top.toFixed(1)}px;height:${h.toFixed(1)}px;left:calc(${(r.lane / r.lanes) * 100}% + 2px);width:calc(${100 / r.lanes}% - 4px)`;
  if (ext) return `<div class="blk ext raid" style="${pos}" data-tip="${esc(`📯 ${r.start}–${r.end} ${r.title}（自己建的團戰：在今日行程的「📯 團戰」改）`)}"><div class="bx">📯 ${esc(r.title)}</div>${compact ? '' : `<div class="tm">${esc(r.start)}–${esc(r.end)}</div>`}</div>`;
  const L = r.link;
  const can = S.d.canPlay && r.st !== 'new' && r.st !== 'del' && !r.canceled;
  const box = can ? `<span class="rbox can" data-rowdone="${esc(r.id)}" data-done="${r.done ? 1 : 0}" data-tip="${r.done ? '取消勾選（立刻寫回計畫檔）' : L && L.hasStep && !L.stepDone ? `做完了（立刻寫進計畫檔；「${L.quest}」的「${L.step}」也會一起勾）` : '做完了（立刻寫進計畫檔、給獎勵）'}">${r.done ? '✓' : ''}</span>` : '';
  const main = L ? (L.step || L.quest) : r.title;
  const sub = L ? `<div class="bq">📜 ${esc(L.quest)}${L.stepDone ? ' <i class="ok">✓</i>' : ''}</div>` : '';
  const w0 = r.st === 'dirty' && r.was ? [r.was.date !== r.date ? dayLabel(r.was.date) : '', r.was.start !== r.start ? r.was.start : '', r.was.title !== r.title ? `「${r.was.title}」` : ''].filter(Boolean).join(' ') : '';
  const tip = `${r.start}${r.end ? `–${r.end}` : ''} ${r.raid ? '📯 ' : ''}${r.title}${w0 ? `（原本 ${w0}）` : ''}`;
  const short = h < 40 && !compact;
  const drag = r.st !== 'del'; // 🖐 拖著換時間、換天；拉下緣改結束時間
  return `<div class="${cls(r.id, `blk${r.raid ? ' raid' : ''}${L ? ' linked' : ''}${r.done ? ' done' : ''}${r.canceled ? ' canceled' : ''}${short ? ' short' : ''}${compact ? ' compact' : ''}${drag ? ' dr' : ''}`, r.st, warn)}" style="${pos};${L ? `--qc:${qColor(L.qid)}` : ''}" data-edit="${esc(r.id)}" data-kind="row" ${drag ? `data-drag="${esc(r.id)}"` : ''} tabindex="0" data-tip="${esc(`${tip}${drag ? '（拖著換時間、拉下緣改結束）' : ''}`)}">
    ${compact ? '' : `<div class="bt">${box}<span class="tm">${esc(r.start)}${r.end ? `–${esc(r.end)}` : ''}</span></div>`}
    <div class="bx">${r.raid ? '📯 ' : ''}${esc(main)}</div>${compact ? '' : sub}
    ${!compact && w0 ? `<div class="was">原本 ${esc(w0)}</div>` : ''}
    ${r.st === 'del' ? restoreBtn(r.id) : ''}
    ${drag && !compact ? `<i class="rz" data-rz="${esc(r.id)}" aria-hidden="true"></i>` : ''}
  </div>`;
}
function laneCol(date, { ppm, lo, hi, compact }) {
  const d = S.d;
  const rows = d.rows.filter((r) => r.date === date && r.start);
  const ext = (d.raids || []).filter((r) => r.date === date);
  const rems = d.reminders.filter((m) => m.date === date);
  const lines = [];
  for (let m = lo; m <= hi; m += 30) lines.push(`<i class="hl-line${m % 60 ? ' half' : ''}" style="top:${((m - lo) * ppm).toFixed(1)}px"></i>`);
  const now = date === d.today && d.nowHM && toMin(d.nowHM) >= lo && toMin(d.nowHM) <= hi ? `<div class="now" style="top:${((toMin(d.nowHM) - lo) * ppm).toFixed(1)}px"><span>${compact ? '' : `現在 ${esc(d.nowHM)}`}</span></div>` : '';
  const flags = rems.map((m) => `<div class="${cls(m.id, 'flag', m.st, warnIds())}" style="top:${((toMin(m.time) - lo) * ppm).toFixed(1)}px" data-edit="${esc(m.id)}" data-kind="reminder" data-tip="${esc(`⏰ ${m.time} ${m.title}`)}"><span>⏰ ${compact ? esc(m.time) : `${esc(m.time)} ${esc(m.title)}`}</span>${m.st === 'del' ? restoreBtn(m.id) : ''}</div>`).join('');
  // 同時段太多件：最多並排 3 欄（一週總覽 2 欄），其他的收成「+N」點開看
  const MAX = compact ? 2 : 3;
  const all = [...rows.map((r) => ({ r, ext: false })), ...ext.map((r) => ({ r, ext: true }))];
  const blocks = [];
  const groups = {};
  for (const x of all) (groups[x.r.g === undefined ? `s${x.r.id}` : x.r.g] = groups[x.r.g === undefined ? `s${x.r.id}` : x.r.g] || []).push(x);
  for (const [g, xs] of Object.entries(groups)) {
    const n = xs[0].r.lanes || 1;
    if (n <= MAX) { for (const x of xs) blocks.push(blockHtml(x.r, { ppm, lo, compact, ext: x.ext })); continue; }
    const shown = xs.filter((x) => x.r.lane < MAX - 1), hidden = xs.filter((x) => x.r.lane >= MAX - 1);
    for (const x of shown) blocks.push(blockHtml({ ...x.r, lanes: MAX }, { ppm, lo, compact, ext: x.ext }));
    const s0 = Math.min(...hidden.map((x) => toMin(x.r.start))), e0 = Math.max(...hidden.map((x) => toMin(endOf(x.r))));
    const pos = `top:${((s0 - lo) * ppm).toFixed(1)}px;height:${Math.max(compact ? 15 : 24, (e0 - s0) * ppm - 2).toFixed(1)}px;left:calc(${((MAX - 1) / MAX) * 100}% + 2px);width:calc(${100 / MAX}% - 4px)`;
    blocks.push(`<button class="blk more" style="${pos}" data-more="${esc(date)}|${esc(g)}" data-tip="${esc(`這段時間還有 ${hidden.length} 件：${hidden.map((x) => x.r.title).join('、')}`)}">+${hidden.length}${compact ? '' : ' 件'}</button>`);
  }
  return `<div class="lanes${compact ? ' compact' : ''}" data-lanes="${esc(date)}" style="height:${((hi - lo) * ppm).toFixed(0)}px">${lines.join('')}${blocks.join('')}${flags}${now}</div>`;
}
// 「+N」點開：這一群全部列出來
function groupItems(date, g) {
  const d = S.d;
  return [...d.rows.filter((r) => r.date === date && r.start && String(r.g) === g).map((r) => ({ r, ext: false })), ...(d.raids || []).filter((r) => r.date === date && String(r.g) === g).map((r) => ({ r, ext: true }))]
    .sort((a, b) => a.r.start.localeCompare(b.r.start));
}
// 📜 委託匣（時刻簿右邊）：把委託或某個步驟拖進時間軸，排一格
function trayHtml() {
  const d = S.d;
  const sched = new Set(d.rows.filter((r) => r.st !== 'del' && r.link && r.link.step).map((r) => `${r.link.qid}|${r.link.step}`));
  const qs = d.quests.filter((q) => q.st !== 'del' && !(q.play && q.play.status === 'done'));
  const list = qs.map((q) => {
    const left = q.steps.filter((x) => !x.done);
    const next = left.find((x) => !sched.has(`${q.id}|${x.text}`));
    return `<div class="tq" style="--qc:${qColor(q.id)}">
      <div class="tq-t" data-tq="${esc(q.id)}" data-tip="${esc(`拖到時間軸排一格${next ? `（下一步：${next.text}）` : ''}`)}">${esc(q.title)}${q.due ? `<small>${esc(dayLabel(q.due))}前</small>` : ''}</div>
      ${left.length ? `<div class="tq-steps">${left.map((x) => `<span class="ts${sched.has(`${q.id}|${x.text}`) ? ' sched' : ''}" data-ts="${esc(q.id)}" data-step="${esc(x.text)}" data-tip="${esc(sched.has(`${q.id}|${x.text}`) ? `「${x.text}」已經排了，再拖一次會再排一格` : `把「${x.text}」拖到時間軸`)}">${esc(x.text)}</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
  return `<aside class="tray" aria-label="委託匣"><div class="tray-h">📜 委託<small>拖進時間軸排一格</small></div>${list || '<div class="tray-empty">這週還沒有委託</div>'}</aside>`;
}
function axisHtml(lo, hi, ppm) {
  const out = [];
  for (let m = lo; m <= hi; m += 60) out.push(`<span style="top:${((m - lo) * ppm).toFixed(1)}px">${hm(m)}</span>`);
  return `<div class="axis" style="height:${((hi - lo) * ppm).toFixed(0)}px">${out.join('')}</div>`;
}
function dayInfoHtml(day) {
  const d = S.d;
  const dues = d.quests.filter((q) => q.due === day.date && q.st !== 'del');
  const tid = `t:${day.date}`;
  const theme = day.themeSt === 'del' ? `<span class="theme st-del" data-edit="${esc(tid)}" data-kind="theme">🗓 ${esc(day.themeWas)}${restoreBtn(tid)}</span>`
    : day.theme ? `<span class="theme${stCls(day.themeSt)}${S.hl.has(tid) ? ' hl' : ''}" data-edit="${esc(tid)}" data-kind="theme" tabindex="0">🗓 ${esc(day.theme)}</span>` : '';
  return `${day.off ? `<span class="offtag">🏖 ${esc(day.off)}</span>` : ''}${theme}${dues.map((q) => `<span class="duechip" data-edit="${esc(q.id)}" data-kind="quest" style="--qc:${qColor(q.id)}">📌 截止：${esc(q.title)}</span>`).join('')}`;
}
function renderTime() {
  const d = S.d;
  renderDayTabs();
  const { lo, hi } = axisRange();
  const area = $('#timeArea');
  const keep = area.scrollTop;
  if (S.day === 'week') {
    const ppm = 0.8;
    const days = d.days;
    area.innerHTML = `<div class="tlay"><div class="tmain"><div class="wk" style="--n:${days.length}">
      <div class="wk-head"><span class="ax-sp"></span>${days.map((day) => { const [w, date] = day.label.split(' '); return `<button class="wk-dh${day.date === d.today ? ' today' : ''}${day.off ? ' off' : ''}" data-day="${esc(day.date)}" data-tip="翻到這一天"><b>${esc(w)}</b> <small>${esc(date)}</small>${day.theme ? `<em>🗓 ${esc(day.theme)}</em>` : ''}${day.off ? `<em>🏖 ${esc(day.off)}</em>` : ''}</button>`; }).join('')}</div>
      <div class="wk-body">${axisHtml(lo, hi, ppm)}${days.map((day) => `<div class="wk-col${day.off ? ' off' : ''}">${laneCol(day.date, { ppm, lo, hi, compact: true })}</div>`).join('')}</div>
    </div></div>${trayHtml()}</div>`;
  } else {
    const ppm = 1.25;
    const day = d.days.find((x) => x.date === S.day) || d.days[0];
    const n = d.rows.filter((r) => r.date === day.date && r.st !== 'del').length;
    area.innerHTML = `<div class="tlay"><div class="tmain"><div class="dpage${day.off ? ' off' : ''}">
      <div class="dinfo"><b class="dl">${esc(day.label)}</b>${day.date === d.today ? '<span class="todaytag">今天</span>' : ''}${dayInfoHtml(day)}<span class="grow"></span><button class="add" data-add-day="${esc(day.date)}" data-tip="這天加時段、團戰、提醒、整天的事">＋ 這天加…</button></div>
      <div class="dgrid">${axisHtml(lo, hi, ppm)}${laneCol(day.date, { ppm, lo, hi, compact: false })}</div>
      ${n ? '' : `<div class="dempty">這天還空空的：點時間軸的空白處加一格、把右邊的委託拖進來，或在委託簿按「🕘 排進時刻簿」。</div>`}
    </div></div>${trayHtml()}</div>`;
  }
  // 換天、換本才捲：捲到現在、或這天第一格（不然留在原本的位置）
  const key = `${S.book}|${S.day}|${d.week.start}`;
  if (S.scrolled !== key) {
    S.scrolled = key;
    const ppm = S.day === 'week' ? 0.8 : 1.25;
    const first = S.day === 'week' ? null : d.rows.filter((r) => r.date === S.day && r.start).map((r) => toMin(r.start)).sort((a, b) => a - b)[0];
    const target = S.day === d.today && d.nowHM ? toMin(d.nowHM) - 60 : first !== undefined && first !== null ? first - 30 : 8 * 60 + 30;
    area.scrollTop = Math.max(0, (target - lo) * ppm);
  } else area.scrollTop = keep;
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

// ---- 翻書 ----
function setBook(book, day) {
  const changed = book !== S.book || (day !== undefined && day !== S.day);
  S.book = book;
  if (day !== undefined) S.day = day;
  S.bump[book] = 0;
  if (changed) { const pg = book === 'time' ? $('#pageTime') : $('#pageQuests'); pg.classList.remove('flip'); void pg.offsetWidth; pg.classList.add('flip'); }
  render();
  window.pd.book(S.book, S.book === 'time' ? S.day : undefined);
}
// 剛記下的東西在另一本：那本的書籤跳一下＋「+N」
function bumpOther(ids) {
  if (!ids || !ids.length || !S.d) return;
  const timeN = ids.filter((id) => S.d.rows.some((r) => r.id === id) || S.d.reminders.some((m) => m.id === id) || id.startsWith('t:')).length;
  const questN = ids.filter((id) => S.d.quests.some((q) => q.id === id)).length;
  const other = S.book === 'time' ? 'quests' : 'time';
  const n = other === 'time' ? timeN : questN;
  if (!n) return;
  S.bump[other] += n;
  renderTabs();
  const b = document.querySelector(`#tabs [data-book="${other}"]`);
  b.classList.remove('wiggle'); void b.offsetWidth; b.classList.add('wiggle');
  if (other === 'time') { const r = S.d.rows.find((x) => ids.includes(x.id)); if (r && S.d.days.some((x) => x.date === r.date)) S.day = S.day === 'week' ? 'week' : r.date; }
}

// ---- 點一下改：小卡 ----
const dayOptions = (sel, { none = false } = {}) => `${none ? `<option value="" ${sel ? '' : 'selected'}>（沒有）</option>` : ''}${weekDays().map((x) => `<option value="${x}" ${x === sel ? 'selected' : ''}>${dayLabel(x)}</option>`).join('')}${sel && !weekDays().includes(sel) ? `<option value="${esc(sel)}" selected>${esc(dayLabel(sel))}</option>` : ''}`;
function openPop(p) { S.pop = p; renderPop(); }
function closePop() { S.pop = null; clearTimeout(S.prevT); $('#pop').classList.add('hidden'); $('#pop').innerHTML = ''; }
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
    body = `<label class="f">委託<select id="fQuest">${liveQuests().map((q) => `<option value="${esc(q.id)}">${esc(q.title)}</option>`).join('')}</select></label>`;
  } else if (p.kind === 'quest') {
    title = p.id ? '改委託' : '新委託';
    if (x.st === '' || x.st === 'dirty') note = '原本就在計畫檔裡：改的地方按「寫進計畫檔」才會寫進去';
    body = `<label class="f">名稱<input id="fTitle" maxlength="60" value="${esc(x.title || '')}"></label>
      <div class="fr"><label class="f">類型<select id="fTier">${Object.entries(TIER).map(([k, n]) => `<option value="${k}" ${(x.tier || 'major') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">截止<select id="fDue">${dayOptions(x.due || p.date || '', { none: true })}</select></label></div>
      <label class="f">專案（選填）<input id="fProj" maxlength="30" value="${esc(x.project || '')}"></label>
      <label class="f">步驟（一行一個）<textarea id="fSteps" rows="4">${esc((x.steps || []).map((s) => s.text).join('\n'))}</textarea></label>
      ${p.id && x.slots ? `<div class="note">🕘 時刻簿裡有 ${x.slots} 格是這個委託的：改名稱的話那幾格會跟著改</div>` : ''}`;
  } else if (p.kind === 'row') {
    const g = p.guess || {}, F = p.f || {}; // F＝換委託前已經填的欄位
    const L = x.link || null;
    const qid = p.quest !== undefined ? p.quest : L ? L.qid : '';
    const q = qid && liveQuests().find((y) => y.id === qid);
    const text = p.text !== undefined ? p.text : L ? L.step : (x.title || g.title || '');
    title = p.resolve ? '變成時段' : p.id ? '改時段' : (p.raid ? '新團戰' : '新時段');
    body = `<label class="f">屬於哪個委託（選了的話，做完這格會一起勾那個步驟）<select id="fLinkQ"><option value="">（不屬於委託）</option>${liveQuests().map((y) => `<option value="${esc(y.id)}" ${y.id === qid ? 'selected' : ''}>${esc(y.title)}</option>`).join('')}</select></label>
      <label class="f">${q ? '哪個步驟（可以空著＝整段做這個委託）' : '要做什麼'}<input id="fTitle" maxlength="60" list="stepList" value="${esc(text)}"><datalist id="stepList">${q ? q.steps.map((s) => `<option value="${esc(s.text)}">`).join('') : ''}</datalist></label>
      <div class="fr"><label class="f">哪一天<select id="fDate">${dayOptions(F.date || x.date || g.date || p.date || S.d.week.start)}</select></label>
      <label class="f">開始<input id="fStart" type="time" value="${esc(F.start || x.start || g.start || p.start || '09:00')}"></label>
      <label class="f">結束<input id="fEnd" type="time" value="${esc(F.end !== undefined ? F.end : x.end || g.end || p.end || '')}"></label></div>
      <label class="f chk"><input id="fRaid" type="checkbox" ${(F.raid !== undefined ? F.raid : p.id && !p.resolve ? x.raid : p.raid || g.raid) ? 'checked' : ''}>📯 團戰（會議：開始前提醒、開始時自動專注）</label>`;
  } else if (p.kind === 'reminder') {
    title = p.id ? '改提醒' : '新提醒';
    body = `<label class="f">提醒什麼<input id="fTitle" maxlength="60" value="${esc(x.title || '')}"></label>
      <div class="fr"><label class="f">哪一天<select id="fDate">${dayOptions(x.date || p.date || S.d.week.start)}</select></label>
      <label class="f">幾點<input id="fTime" type="time" value="${esc(x.time || p.start || '16:00')}"></label></div>`;
  } else if (p.kind === 'theme') {
    const date = p.id ? p.id.slice(2) : p.date;
    title = `${dayLabel(date)} 整天`;
    body = `<label class="f">這天在做什麼（例如：出差、教育訓練；留空＝拿掉）<input id="fTitle" maxlength="40" value="${esc(S.d.themes[date] || '')}"></label>`;
  } else if (p.kind === 'more') {
    const items = groupItems(p.date, p.g);
    title = `${dayLabel(p.date)} 同一段時間的 ${items.length} 件`;
    body = `<div class="more-list">${items.map((x) => (x.ext ? `<div class="ml ext"><b>${esc(x.r.start)}–${esc(x.r.end)}</b>📯 ${esc(x.r.title)}<small>自己建的團戰</small></div>`
      : `<button class="ml${x.r.st === 'del' ? ' del' : ''}" data-edit="${esc(x.r.id)}" data-kind="row" style="${x.r.link ? `--qc:${qColor(x.r.link.qid)}` : ''}"><b>${esc(x.r.start)}${x.r.end ? `–${esc(x.r.end)}` : ''}</b>${x.r.raid ? '📯 ' : ''}${esc(x.r.title)}${x.r.done ? ' ✓' : ''}</button>`)).join('')}</div>`;
  } else if (p.kind === 'split') return renderSplit();
  const del = p.id && !['pick', 'confirm', 'pickQuest', 'more'].includes(p.kind) && !p.resolve && x.st !== 'del' ? '<button class="tb danger" data-pdel>🗑 刪掉</button>' : '';
  const save = p.kind === 'pick' || p.kind === 'more' ? '' : `<button class="tb gold" data-psave>${p.kind === 'confirm' ? esc(p.ok || '確定') : '✔ 好了'}</button>`;
  el.innerHTML = `<div class="card"><h3><span>${esc(title)}</span></h3>${note ? `<div class="note">${esc(note)}</div>` : ''}${body}<div class="err" id="fErr"></div><div class="acts2">${del}<span class="grow"></span><button class="tb" data-pcancel>${p.kind === 'more' ? '關起來' : '取消'}</button>${save}</div></div>`;
  el.classList.remove('hidden');
  const first = el.querySelector('input:not([type=checkbox]), select');
  if (first && !p.keepFocus) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
}

// ---- 🕘 排進時刻簿：委託拆成時段 ----
function openSplit(qid) {
  const q = findIt(qid);
  if (!q) return;
  const days = S.d.days.filter((x) => !x.off && dt(x.date).getDay() % 6 !== 0).map((x) => x.date);
  const first = days.includes(S.d.today) ? S.d.today : days.find((x) => x >= S.d.today) || days[0];
  const steps = q.steps.filter((s) => !s.done).map((s) => s.text).join('\n');
  openPop({ kind: 'split', id: qid, dates: first ? [first] : [], from: '09:00', to: '12:00', unit: '60', steps, fill: 'spread', overflow: 'next', skip: true, prev: null, err: '' });
  preview();
}
function splitOpts() {
  const p = S.pop;
  return { dates: p.dates, from: p.from, to: p.to, unit: p.unit === 'est' ? 'est' : Number(p.unit), stepsText: p.steps, fill: p.fill, overflow: p.overflow, skipBusy: p.skip };
}
function readSplit() {
  const p = S.pop;
  if (!p || p.kind !== 'split') return;
  p.from = val('sFrom') || p.from; p.to = val('sTo') || p.to; p.unit = val('sUnit') || p.unit;
  p.steps = $('#sSteps') ? $('#sSteps').value : p.steps;
  p.fill = val('sFill') || p.fill; p.overflow = val('sOver') || p.overflow;
  p.skip = $('#sSkip') ? $('#sSkip').checked : p.skip;
}
function preview() {
  clearTimeout(S.prevT);
  S.prevT = setTimeout(async () => {
    const p = S.pop;
    if (!p || p.kind !== 'split') return;
    const r = await window.pd.splitPreview(p.id, splitOpts());
    if (S.pop !== p) return;
    p.prev = r && r.ok ? r.preview : null; p.err = r && r.ok ? '' : (r && r.error) || '排不出來';
    renderSplitPreview();
  }, 120);
}
function renderSplitPreview() {
  const p = S.pop, box = $('#sPrev');
  if (!box || !p) return;
  if (p.err) { box.innerHTML = `<div class="pv-err">⚠ ${esc(p.err)}</div>`; $('#sOk').disabled = true; return; }
  const pv = p.prev;
  if (!pv) { box.innerHTML = '<div class="pv-note">預覽中…</div>'; return; }
  const by = {};
  for (const r of pv.rows) (by[r.date] = by[r.date] || []).push(r);
  const list = Object.entries(by).map(([date, rows]) => `<div class="pv-day"><b>${esc(dayLabel(date))}</b>${rows.map((r) => `<span class="pv-row"><span class="tm">${esc(r.start)}–${esc(r.end)}</span>${esc(r.step || '（整段做這個委託）')}</span>`).join('')}</div>`).join('');
  const notes = [];
  if (pv.extDays.length) notes.push(`排不下的延到 ${pv.extDays.map((x) => dayLabel(x).split(' ')[0]).join('、')}`);
  if (pv.stacked) notes.push(`有 ${pv.stacked} 格擠在同一個時間（同時段好幾件）`);
  if (pv.skipped.length) notes.push(`跳過團戰：${pv.skipped.join('、')}`);
  if (pv.overlap) notes.push(`有 ${pv.overlap} 格和原本的時段同時（可以，只是說一聲）`);
  if (pv.leftover.length) notes.push(`⚠ 排不下：${pv.leftover.join('、')}（時間再拉長，或改成「延到下一天」）`);
  box.innerHTML = `${list || '<div class="pv-note">（沒有排到任何時段）</div>'}${notes.map((n) => `<div class="pv-note">${esc(n)}</div>`).join('')}`;
  $('#sOk').disabled = !pv.rows.length;
  $('#sOk').textContent = pv.rows.length ? `✔ 排進去（${pv.rows.length} 格）` : '✔ 排進去';
}
function renderSplit() {
  const p = S.pop, el = $('#pop');
  const q = findIt(p.id) || {};
  const days = S.d.days;
  const units = [['15', '15 分'], ['30', '30 分'], ['45', '45 分'], ['60', '1 小時'], ['90', '1.5 小時'], ['120', '2 小時'], ['est', '照每個步驟寫的時間']];
  el.innerHTML = `<div class="card wide split-card"><h3><span>🕘 把「${esc(q.title)}」排進時刻簿</span></h3>
    <div class="f">哪幾天<div class="daychips">${days.map((x) => { const [w, date] = x.label.split(' '); return `<button type="button" class="dchip${p.dates.includes(x.date) ? ' on' : ''}${x.off ? ' off' : ''}${x.date === S.d.today ? ' today' : ''}" data-sday="${esc(x.date)}" ${x.off ? `data-tip="${esc(x.off)}"` : ''}>${esc(w)}<small>${esc(date)}</small></button>`; }).join('')}</div></div>
    <div class="fr"><label class="f">從<input id="sFrom" type="time" value="${esc(p.from)}"></label><label class="f">到<input id="sTo" type="time" value="${esc(p.to)}"></label>
      <label class="f">每一格<select id="sUnit">${units.map(([v, n]) => `<option value="${v}" ${String(p.unit) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <label class="f">步驟（一行一個，照順序；後面可以寫要多久，例如「收資料 30」「寫初稿 1.5 小時」）<textarea id="sSteps" rows="5" placeholder="沒有步驟也可以：整段時間就是做這個委託">${esc(p.steps)}</textarea></label>
    <div class="sugg">${S.d.ai ? `<button type="button" class="mini" data-suggest ${p.busy ? 'disabled' : ''}>${p.busy ? `✏️ ${esc(S.name)}想步驟中…` : `✨ 請${esc(S.name)}建議步驟`}</button><small>本機 AI 大約要等 10～30 秒，想好的先給你看、可以改</small>` : '<small>AI 現在沒開：自己寫步驟，或空著＝整段做這個委託</small>'}</div>
    <div class="fr"><label class="f">格子比步驟多<select id="sFill" ${p.unit === 'est' ? 'disabled' : ''}><option value="spread" ${p.fill === 'spread' ? 'selected' : ''}>平均分（一個步驟佔好幾格）</option><option value="one" ${p.fill === 'one' ? 'selected' : ''}>一步一格，剩下的空著</option></select></label>
      <label class="f">步驟比格子多<select id="sOver"><option value="next" ${p.overflow === 'next' ? 'selected' : ''}>延到下一天</option><option value="stack" ${p.overflow === 'stack' ? 'selected' : ''}>擠在同一格（同時段好幾件）</option></select></label></div>
    <label class="f chk"><input id="sSkip" type="checkbox" ${p.skip ? 'checked' : ''}>📯 跳過團戰（會議）的時間</label>
    <div class="pv" id="sPrev"></div>
    <div class="err" id="fErr"></div>
    <div class="acts2"><span class="grow"></span><button class="tb" data-pcancel>取消</button><button class="tb gold" id="sOk" data-split-go>✔ 排進去</button></div></div>`;
  el.classList.remove('hidden');
  renderSplitPreview();
}
async function suggestSteps() {
  const p = S.pop;
  readSplit();
  p.busy = true; renderSplit();
  const total = p.dates.length * Math.max(0, toMin(p.to) - toMin(p.from));
  const r = await window.pd.suggest(p.id, { minutes: total });
  if (S.pop !== p) return;
  p.busy = false;
  if (r && r.ok && r.steps && r.steps.length) { p.steps = r.steps.map((s) => `${s.text} ${s.min}`).join('\n'); if (p.unit !== 'est') p.unit = 'est'; say(`${S.name}想了 ${r.steps.length} 個步驟，後面的數字是大概要幾分鐘，不對就直接改～`, 'happy'); }
  else say(`⚠ ${(r && r.error) || '想不出來'}`, 'worried');
  renderSplit(); preview();
}

const val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : undefined; };
async function savePop() {
  const p = S.pop;
  let r;
  if (p.kind === 'confirm') { closePop(); await p.run(); return; }
  if (p.kind === 'split') { await doSplit(); return; }
  if (p.kind === 'pickQuest') r = await window.pd.resolve(p.id, 'steps', { quest: val('fQuest') });
  else if (p.kind === 'quest') {
    const f = { title: val('fTitle'), tier: val('fTier'), due: val('fDue'), project: val('fProj'), steps: val('fSteps').split('\n').map((s) => s.trim()).filter(Boolean) };
    r = p.id ? await window.pd.edit(p.id, f) : await window.pd.add('quest', f);
  } else if (p.kind === 'row') {
    const qid = val('fLinkQ'), q = qid && liveQuests().find((y) => y.id === qid);
    const text = val('fTitle');
    const title = q ? (text ? `${q.title}：${text}` : q.title) : text; // 屬於委託：「委託名稱：步驟」
    const f = { title, date: val('fDate'), start: val('fStart'), end: val('fEnd'), raid: $('#fRaid').checked };
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
async function doSplit() {
  const p = S.pop;
  readSplit();
  const r = await window.pd.split(p.id, splitOpts());
  if (!r || !r.ok) { $('#fErr').textContent = `⚠ ${(r && r.error) || '排不進去'}`; return; }
  closePop();
  S.d = r.planDraft;
  setBook('time', r.planDraft.bookDay || S.day);
  apply(r);
  sayLine(r.lines);
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
  if (r.linked) say(`這格做完了，「${r.linked.quest}」的「${r.linked.step}」也幫你勾起來了～`, 'happy');
  else if (r.lines && r.lines.length) sayLine(r.lines);
}

// ---- 點時間軸的空白：加一格（對齊單位） ----
function gridClick(e, lanesEl) {
  const date = lanesEl.dataset.lanes;
  const { lo } = axisRange();
  const ppm = lanesEl.classList.contains('compact') ? 0.8 : 1.25;
  const y = e.clientY - lanesEl.getBoundingClientRect().top;
  const unit = S.unit;
  const m = Math.max(0, Math.floor((lo + y / ppm) / unit) * unit);
  openPop({ kind: 'row', date, start: hm(Math.min(23 * 60 + 30, m)), end: hm(Math.min(23 * 60 + 59, m + unit)) });
}

// ---- 事件 ----
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (S.dragEnd && Date.now() - S.dragEnd < 400) return; // 剛拖完放開：不要當成點一下
  if (!t.closest('.more')) { S.menu = false; $('#moreMenu').classList.add('hidden'); }
  if (t.closest('#pop')) {
    if (t === $('#pop') || t.closest('[data-pcancel]')) { closePop(); return; }
    const pe = t.closest('[data-edit]'); if (pe && S.pop && S.pop.kind === 'more') { openPop({ kind: pe.dataset.kind, id: pe.dataset.edit }); return; }
    const pk = t.closest('[data-pick]');
    if (pk) { const k = pk.dataset.pick; const date = S.pop.date; openPop(k === 'raid' ? { kind: 'row', date, raid: true } : { kind: k, date }); return; }
    const sd = t.closest('[data-sday]');
    if (sd) { readSplit(); const p = S.pop, x = sd.dataset.sday; p.dates = p.dates.includes(x) ? p.dates.filter((y) => y !== x) : [...p.dates, x].sort(); renderSplit(); preview(); return; }
    if (t.closest('[data-suggest]')) { await suggestSteps(); return; }
    if (t.closest('[data-split-go]')) { await doSplit(); return; }
    if (t.closest('[data-psave]')) { await savePop(); return; }
    if (t.closest('[data-pdel]')) { const r = await window.pd.remove(S.pop.id); if (!r || !r.ok) { $('#fErr').textContent = `⚠ ${(r && r.error) || '刪不掉'}`; return; } closePop(); apply(r); return; }
    return;
  }
  const bk = t.closest('#tabs [data-book]'); if (bk) { setBook(bk.dataset.book); return; }
  const wn = t.closest('[data-warn]'); if (wn) { const c = S.d.checks[Number(wn.dataset.warn)]; if (c) jumpTo(c.ids); return; }
  const mo = t.closest('[data-more]'); if (mo) { const [date, g] = mo.dataset.more.split('|'); openPop({ kind: 'more', date, g }); return; }
  if (t.closest('#bMore')) { S.menu = !S.menu; $('#moreMenu').classList.toggle('hidden', !S.menu); return; }
  if (t.closest('[data-font]')) { S.menu = false; $('#moreMenu').classList.add('hidden'); const on = S.d.handFont === false; const r = await act(() => window.pd.setFont(on)); if (r) { S.d.handFont = on; render(); say(on ? '換成手寫的字了～' : '換回一般的字。', 'normal'); } return; }
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
  const wk = t.closest('[data-week]'); if (wk) { const r = await act(() => window.pd.switchWeek(wk.dataset.week)); if (r) { S.day = null; apply(r); say(`翻到${r.planDraft.week.name}（${r.planDraft.week.label}）了～`, 'normal'); } return; }
  const dy = t.closest('[data-day]'); if (dy && !t.closest('[data-edit]')) { setBook('time', dy.dataset.day); return; }
  if (t.closest('#bWeekView')) { setBook('time', S.day === 'week' ? (S.d.days.some((x) => x.date === S.d.today) ? S.d.today : S.d.days[0].date) : 'week'); return; }
  const gd = t.closest('[data-goto-day]'); if (gd) { e.stopPropagation(); setBook('time', gd.dataset.gotoDay); return; }
  const ul = t.closest('[data-undo-log]'); if (ul) { const r = await act(() => window.pd.undoLog(ul.dataset.undoLog)); if (r) { apply(r); say('那句撤銷了～', 'normal'); } return; }
  const rs = t.closest('[data-restore]'); if (rs) { e.stopPropagation(); const r = await act(() => window.pd.restore(rs.dataset.restore)); if (r) apply(r); return; }
  const ck = t.closest('[data-check]'); if (ck) { e.stopPropagation(); await play(() => window.pd.check(ck.dataset.check, ck.dataset.step, ck.dataset.done !== '1')); return; }
  const sb = t.closest('[data-submit]'); if (sb) { e.stopPropagation(); thinking(`${S.name}幫你登記交付…`); await play(() => window.pd.submit(sb.dataset.submit)); return; }
  const rd = t.closest('[data-rowdone]'); if (rd) { e.stopPropagation(); await play(() => window.pd.rowDone(rd.dataset.rowdone, rd.dataset.done !== '1')); return; }
  const sp = t.closest('[data-split]'); if (sp) { e.stopPropagation(); openSplit(sp.dataset.split); return; }
  const ed = t.closest('[data-edit]');
  if (ed) { const x = findIt(ed.dataset.edit); if (x && x.st === 'del') return; openPop({ kind: ed.dataset.kind, id: ed.dataset.edit }); return; }
  const ad = t.closest('[data-add]'); if (ad) { openPop({ kind: ad.dataset.add, date: ad.dataset.due || undefined }); return; }
  const day = t.closest('[data-add-day]'); if (day) { openPop({ kind: 'pick', date: day.dataset.addDay }); return; }
  const rq = t.closest('[data-res-quest]'); if (rq) { const r = await act(() => window.pd.resolve(rq.dataset.resQuest, 'quest', {})); if (r) apply(r); return; }
  const rr = t.closest('[data-res-row]'); if (rr) { const u = findIt(rr.dataset.resRow) || {}; openPop({ kind: 'row', id: u.id, resolve: true, guess: u.guess || {} }); return; }
  const rst = t.closest('[data-res-steps]'); if (rst) { openPop({ kind: 'pickQuest', id: rst.dataset.resSteps }); return; }
  const dl = t.closest('[data-del]'); if (dl) { const r = await act(() => window.pd.remove(dl.dataset.del)); if (r) apply(r); return; }
  const ln = t.closest('.lanes'); if (ln && !t.closest('.blk, .flag')) { gridClick(e, ln); }
});
// 小卡裡的欄位一改就重新預覽／換委託時換步驟清單
document.addEventListener('input', (e) => {
  if (!S.pop) return;
  if (S.pop.kind === 'split' && e.target.closest('#pop')) {
    readSplit();
    if (e.target.id === 'sUnit') { const f = $('#sFill'); if (f) f.disabled = S.pop.unit === 'est'; }
    preview();
  }
});
document.addEventListener('change', (e) => {
  if (S.pop && S.pop.kind === 'row' && e.target.id === 'fLinkQ') { // 換委託：標籤和步驟清單跟著換（輸入的字留著）
    const keep = { date: val('fDate'), start: val('fStart'), end: val('fEnd'), raid: $('#fRaid').checked };
    S.pop = { ...S.pop, quest: e.target.value, text: val('fTitle'), keepFocus: true, f: keep };
    renderPop();
    const it = $('#fTitle'); if (it) it.focus();
  }
  if (e.target.id === 'unitSel') S.unit = Number(e.target.value) || 30;
});
// ---- 🖐 拖拉：方塊拖著換時間／換天（拖到上面的日子分頁＝搬到那天）、拉下緣改結束；右邊委託匣拖進時間軸排一格 ----
const DROP_LEN = 60; // 從委託匣拖進來：先排一小時，之後拉下緣改
const ppmOf = (ln) => (ln.classList.contains('compact') ? 0.8 : 1.25);
const snapM = (m) => Math.round(m / S.unit) * S.unit;
const at = (x, y, sel) => { const el = document.elementFromPoint(x, y); return el ? el.closest(sel) : null; };
// 委託的下一個步驟：還沒做完、還沒排進時刻簿的第一個
function nextStep(qid) {
  const q = S.d.quests.find((x) => x.id === qid);
  if (!q) return '';
  const sched = new Set(S.d.rows.filter((r) => r.st !== 'del' && r.link && r.link.qid === qid).map((r) => r.link.step));
  const s = q.steps.find((x) => !x.done && !sched.has(x.text));
  return s ? s.text : '';
}
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || S.pop || !S.d || S.book !== 'time') return;
  const t = e.target;
  if (t.closest('.rbox, .restore')) return;
  const rz = t.closest('[data-rz]'), blk = t.closest('[data-drag]'), ts = t.closest('[data-ts]'), tq = t.closest('[data-tq]');
  let dr = null;
  if (rz) dr = { kind: 'resize', id: rz.dataset.rz };
  else if (blk) dr = { kind: 'move', id: blk.dataset.drag };
  else if (ts) dr = { kind: 'new', qid: ts.dataset.ts, step: ts.dataset.step };
  else if (tq) dr = { kind: 'new', qid: tq.dataset.tq, step: nextStep(tq.dataset.tq) };
  if (!dr) return;
  if (dr.kind !== 'new') {
    const r = S.d.rows.find((x) => x.id === dr.id);
    if (!r || !r.start) return;
    const el = (rz || blk).closest('.blk'), ln = el.closest('.lanes');
    dr = { ...dr, r, el, ln, dur: toMin(endOf(r)) - toMin(r.start), hadEnd: !!r.end, grab: (e.clientY - ln.getBoundingClientRect().top) / ppmOf(ln) + axisRange().lo - toMin(r.start) };
  } else {
    const q = S.d.quests.find((x) => x.id === dr.qid);
    if (!q) return;
    dr.title = dr.step ? `${q.title}：${dr.step}` : q.title;
  }
  S.drag = { ...dr, x0: e.clientX, y0: e.clientY, started: false };
});
function startDrag(dr) {
  dr.started = true;
  document.body.classList.add('dragging');
  $('#tip').classList.add('hidden');
  if (dr.el) dr.el.classList.add('drag-src');
  dr.pv = document.createElement('div'); dr.pv.className = 'drop-pv';
  if (dr.kind === 'new') { dr.ghost = document.createElement('div'); dr.ghost.className = 'drag-ghost'; dr.ghost.textContent = `📜 ${dr.title}`; document.body.appendChild(dr.ghost); }
}
function moveDrag(dr, e) {
  const x = e.clientX, y = e.clientY;
  if (dr.ghost) { dr.ghost.style.left = `${x + 14}px`; dr.ghost.style.top = `${y + 10}px`; }
  const area = $('#timeArea').getBoundingClientRect();
  if (y < area.top + 30) $('#timeArea').scrollTop -= 16; else if (y > area.bottom - 30) $('#timeArea').scrollTop += 16; // 拖到邊邊：自動捲
  document.querySelectorAll('.drop-on').forEach((el) => el.classList.remove('drop-on'));
  const { lo, hi } = axisRange();
  const tab = dr.kind === 'move' ? at(x, y, '#dayTabs [data-day], .wk-dh[data-day]') : null;
  if (tab) { // 拖到日子分頁：搬到那天、時間不變
    tab.classList.add('drop-on'); dr.pv.remove();
    const s0 = toMin(dr.r.start);
    dr.target = { date: tab.dataset.day, start: hm(s0), end: hm(s0 + dr.dur), tab: true };
    return;
  }
  const ln = dr.kind === 'resize' ? dr.ln : at(x, y, '.lanes');
  if (!ln) { dr.pv.remove(); dr.target = null; return; }
  const ppm = ppmOf(ln), m = lo + (y - ln.getBoundingClientRect().top) / ppm;
  let s0, e0;
  if (dr.kind === 'move') { s0 = Math.max(lo, Math.min(hi - dr.dur, snapM(m - dr.grab))); e0 = s0 + dr.dur; }
  else if (dr.kind === 'new') { s0 = Math.max(lo, Math.min(hi - DROP_LEN, Math.floor(m / S.unit) * S.unit)); e0 = s0 + DROP_LEN; }
  else { s0 = toMin(dr.r.start); e0 = Math.min(hi, Math.max(s0 + S.unit, snapM(m))); }
  dr.target = { date: ln.dataset.lanes, start: hm(s0), end: hm(Math.min(23 * 60 + 59, e0)) };
  if (dr.pv.parentNode !== ln) ln.appendChild(dr.pv);
  dr.pv.style.top = `${((s0 - lo) * ppm).toFixed(1)}px`; dr.pv.style.height = `${Math.max(14, (e0 - s0) * ppm - 2).toFixed(1)}px`;
  dr.pv.textContent = `${ln.classList.contains('compact') ? '' : `${dayLabel(dr.target.date)} `}${dr.target.start}–${dr.target.end}`;
}
function cleanupDrag(dr) {
  document.body.classList.remove('dragging');
  document.querySelectorAll('.drop-on').forEach((el) => el.classList.remove('drop-on'));
  if (dr.el) dr.el.classList.remove('drag-src');
  if (dr.pv) dr.pv.remove();
  if (dr.ghost) dr.ghost.remove();
}
async function endDrag(dr) {
  cleanupDrag(dr);
  const t = dr.target;
  if (!t) return;
  let r = null, msg = '';
  if (dr.kind === 'move') {
    if (t.date === dr.r.date && t.start === dr.r.start) return;
    r = await act(() => window.pd.edit(dr.id, { date: t.date, start: t.start, end: dr.hadEnd ? t.end : '' }));
    msg = `「${dr.r.title}」搬到 ${dayLabel(t.date)} ${t.start} 了（↶ 可以復原）`;
  } else if (dr.kind === 'resize') {
    if (t.end === dr.r.end) return;
    r = await act(() => window.pd.edit(dr.id, { end: t.end }));
    msg = `改成 ${dr.r.start}–${t.end} 了`;
  } else {
    r = await act(() => window.pd.add('row', { date: t.date, start: t.start, end: t.end, title: dr.title, raid: false }));
    msg = `排了一格：${dayLabel(t.date)} ${t.start}–${t.end}「${dr.title}」。拉下緣可以改長短～`;
  }
  if (!r) return;
  if (t.tab && S.day !== 'week') S.day = t.date; // 拖到別天的分頁：跟著翻過去
  apply(r);
  say(msg, 'happy');
}
document.addEventListener('pointermove', (e) => {
  const dr = S.drag;
  if (!dr) return;
  if (!dr.started) { if (Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0) < 5) return; startDrag(dr); }
  e.preventDefault();
  moveDrag(dr, e);
});
document.addEventListener('pointerup', (e) => {
  const dr = S.drag;
  if (!dr) return;
  S.drag = null;
  if (!dr.started) return;
  S.dragEnd = Date.now();
  moveDrag(dr, e);
  endDrag(dr);
});
document.addEventListener('pointercancel', () => { if (S.drag && S.drag.started) cleanupDrag(S.drag); S.drag = null; });
// Esc：拖到一半不要了
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.drag) { if (S.drag.started) { cleanupDrag(S.drag); S.dragEnd = Date.now(); } S.drag = null; e.stopImmediatePropagation(); } }, true);

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
  const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !S.pop && !typing) { e.preventDefault(); $('#bUndo').click(); }
  // 時刻簿：← → 換一天
  if (!S.pop && !typing && S.book === 'time' && S.day !== 'week' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const days = S.d.days.map((x) => x.date), i = days.indexOf(S.day);
    const j = i + (e.key === 'ArrowLeft' ? -1 : 1);
    if (j >= 0 && j < days.length) { e.preventDefault(); setBook('time', days[j]); }
  }
});
$('#bUndo').addEventListener('click', async () => { const r = await act(() => window.pd.undo()); if (r) { apply(r); say('退回上一步了～', 'normal'); } });
$('#bClose').addEventListener('click', () => window.pd.close());
$('#bCommit').addEventListener('click', () => { S.confirm = true; renderConfirm(); });
// 說一句：加的東西規則馬上畫上去；要改的規則改不了就請 AI（等一下下）
async function sendSay(text) {
  const r = await window.pd.say(text);
  if (!r || !r.ok) { say(`⚠ ${(r && r.error) || '沒聽清楚'}`, 'worried'); return; }
  const L = r.planDraft && r.planDraft.log.find((l) => l.id === r.logId);
  const ids = L ? L.ids || [] : [];
  S.d = r.planDraft;
  bumpOther(ids);
  apply({ planDraft: r.planDraft, changed: ids });
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
// ---- ⏰ 艾琳的提醒、📯 團戰倒數（主視窗藏著的時候也看得到）----
// ambient（她主動找話聊）的在筆記本不插話，主視窗那邊會亮 ! 等你回去；deferred（勾步驟、交付之後的回話）只進泡泡；其他（整點提醒、團戰、收工）進泡泡＋上面的提醒條
function setFocus(f, now) {
  if (!f) return;
  S.focus = f;
  if (now) S.clockOffset = now - Date.now();
  renderNotice();
}
function focusLabel() {
  const f = S.focus;
  if (!f || !f.active) return '';
  const left = Math.max(0, Math.ceil((f.endAt - (Date.now() + (S.clockOffset || 0))) / 60000));
  return f.raid ? `📯 ${f.raid.title}・還剩 ${left} 分（到 ${f.raid.end}）` : `🍅 專注中・還剩 ${left} 分`;
}
function renderNotice() {
  const fl = focusLabel();
  const n = S.notice;
  $('#noticeFocus').textContent = fl; $('#noticeFocus').classList.toggle('hidden', !fl);
  $('#noticeText').textContent = n ? n.text : '';
  $('#noticeClose').classList.toggle('hidden', !n);
  $('#notice').classList.toggle('hidden', !fl && !n);
}
function notify(p) {
  if (p.focus) setFocus(p.focus, p.now);
  const lines = (p.lines || []).filter((l) => l && l.text && !l.ambient);
  if (!lines.length) return;
  const busy = $('.bubble').classList.contains('busy');
  const last = lines[lines.length - 1];
  if (!busy) say(last.text, last.emotion || 'normal');
  const keep = lines.filter((l) => !l.deferred);
  if (keep.length) { S.notice = { text: keep[keep.length - 1].text, at: Date.now() }; renderNotice(); }
}
$('#noticeClose').addEventListener('click', () => { S.notice = null; renderNotice(); });
setInterval(() => { if (S.focus && S.focus.active) renderNotice(); }, 15000);
window.pd.onNotify(notify);
window.pd.onUpdate((p) => {
  if (!p.planDraft) return;
  S.d = p.planDraft;
  if (S.pop && S.pop.id && !S.pop.id.startsWith('t:') && !['pick', 'confirm', 'split'].includes(S.pop.kind) && !findIt(S.pop.id)) closePop(); // 正在改的那筆被 AI 換掉了
  if (p.changed && p.changed.length) { bumpOther(p.changed); S.hl = new Set(p.changed); clearTimeout(S.hlT); S.hlT = setTimeout(() => { S.hl = new Set(); }, 4000); }
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
  S.book = S.d.book === 'time' ? 'time' : 'quests';
  document.title = `${S.name}的筆記本`;
  face('listen');
  render();
  setFocus(r.focus, r.now); // 打開時已經在團戰／專注中：倒數照樣顯示
  if (r.lines && r.lines.length) sayLine(r.lines); else say(`這週的計畫長這樣，要加、要改都跟${S.name}說～`, 'happy');
  if (S.d && !S.d.ai) setTimeout(() => { $('#say').textContent += '（AI 現在沒開：用規則記，也可以點每一項自己改）'; }, 50);
  setTimeout(() => $('#sayInput').focus(), 300);
})();
