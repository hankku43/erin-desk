// 📖 冒險日誌＋工作週報：每週一頁（數據、稱號、每天的回報、艾琳的評語），另一頁是依專案分類的週報草稿
// （renderer.js 之後載入；用到 state、api、openPanel、renderPanel、head、run、toast、esc、rich、npcName）

function openJournal(key, { quiet = false } = {}) {
  state.jn = { data: null, tab: (state.jn && state.jn.tab) || 'log', drafts: (state.jn && state.jn.drafts) || {}, writing: false };
  openPanel('journal');
  run(() => api.journalOpen(key || null, quiet), { thinking: false }).then((r) => {
    if (!r || !r.ok || !state.jn) return;
    state.jn.data = r.journal;
    if (state.panel === 'journal') renderPanel();
    const w = r.journal.week;
    if (w && !w.comment) journalWrite(false); // 還沒有評語：請艾琳寫
  });
}
async function journalGo(key) {
  const r = await api.journalOpen(key, true);
  if (r && r.ok && state.jn) { state.jn.data = r.journal; renderPanel(); journalTop(); const w = r.journal.week; if (w && !w.comment) journalWrite(false); }
}
function journalTop() { const b = document.querySelector('#panel .panel-body'); if (b) b.scrollTop = 0; } // 換分頁、換週：從頁首開始看
async function journalWrite(force) {
  const jn = state.jn; const w = jn && jn.data && jn.data.week;
  if (!w || jn.writing) return;
  jn.writing = true; if (state.panel === 'journal') renderPanel();
  const r = await api.journalComment(w.key, force);
  jn.writing = false;
  if (r && r.ok) { if (state.jn === jn && jn.data.week && jn.data.week.key === w.key) jn.data = r.journal; if (r.view) applyView(r.view); }
  else toast(`⚠ ${(r && r.error) || '評語沒寫成功'}`, 4000);
  if (state.panel === 'journal') renderPanel();
}

const JN_TILES = (s) => [
  ['📜', '交付委託', `${s.quests}<small>/${s.questsTotal}</small>`, s.quests ? `準時 ${s.onTime}${s.late ? `・晚 ${s.late}` : ''}` : ''],
  ['☑', '完成目標', `${s.objectives}<small>/${s.objectivesTotal}</small>`, ''],
  ['⏰', '行程', `${s.rows}<small>/${s.rowsTotal}</small>`, s.rowsTotal ? '格' : '沒有時間表'],
  ['📝', '下班回報', `${s.reports}<small> 天</small>`, ''],
  ['✨', '經驗值', `+${s.xp}`, s.levelEnd > s.levelStart ? `Lv.${s.levelStart} → ${s.levelEnd}` : `Lv.${s.levelEnd}`],
  ['🪙', '金幣', `+${s.gold}`, s.spent ? `花了 ${s.spent}` : ''],
  ['🍅', '專注', `${s.focus}<small> 顆</small>`, s.focus ? `${s.focusMin} 分鐘` : ''],
  ['🔮', '運勢', s.fortunes.length ? esc(s.fortunes[s.fortunes.length - 1]) : '—', s.fortunes.length > 1 ? `抽了 ${s.fortunes.length} 次` : s.divinations ? `占卜 ${s.divinations} 次` : ''],
];
const JN_Q = { done: ['✔', '完成'], progress: ['◐', '進行中'], pending: ['○', '還沒開始'] };
function renderJournal(el) {
  const jn = state.jn || {};
  const d = jn.data;
  const w = d && d.week;
  const name = esc(npcName());
  const tabs = `<div class="tabs"><button class="tab ${jn.tab === 'log' ? 'on' : ''}" data-jn-tab="log">冒險日誌</button><button class="tab ${jn.tab === 'report' ? 'on' : ''}" data-jn-tab="report">工作週報</button></div>`;
  if (!w) {
    el.innerHTML = head('📖 冒險日誌', '', tabs) + `<div class="panel-body"><p class="hint">${d ? '還沒有日誌。先在任務板完成一個目標，這週的冒險就會記在這裡。' : '翻開中……'}</p></div>`;
    return;
  }
  const nav = `<div class="jn-nav"><button class="icon-btn" data-jn-go="${esc(d.prev || '')}" ${d.prev ? '' : 'disabled'} title="上一週">◀</button>
    <div class="jn-week"><b>${esc(w.label)}</b><small>${esc(w.name || w.title)}${w.key === d.current ? '　・這週' : ''}</small></div>
    <button class="icon-btn" data-jn-go="${esc(d.next || '')}" ${d.next ? '' : 'disabled'} title="下一週">▶</button></div>`;
  let body, foot;
  if (jn.tab === 'report') {
    const text = jn.drafts[w.key] !== undefined ? jn.drafts[w.key] : w.report;
    body = nav + `<p class="hint jn-hint">依專案分類（計畫檔任務標題的 <code>#專案</code>，或寫在專案標題底下；沒有的歸在「其他」）。可以直接改，改完按「複製」。</p>
      <textarea class="jn-report" id="jnReport" spellcheck="false">${esc(text)}</textarea>`;
    foot = `<span class="spacer">${jn.drafts[w.key] !== undefined && jn.drafts[w.key] !== w.report ? '✎ 改過了' : '最後一天的「卡點」會掛在對應的任務底下'}</span>
      ${jn.drafts[w.key] !== undefined && jn.drafts[w.key] !== w.report ? '<button class="btn ghost" data-jn-reset>↺ 還原</button>' : ''}
      <button class="btn ghost" data-jn-export>💾 匯出</button><button class="btn gold" data-jn-copy>📋 複製</button>`;
  } else {
    const s = w.stats;
    const b = w.badges || [];
    const top = b[0] ? `<div class="jn-title"><span class="jn-medal">${b[0].icon}</span><div><small>本週稱號</small><b>${esc(b[0].name)}</b><em>${esc(b[0].why)}</em></div>
      ${b.length > 1 ? `<div class="jn-badges">${b.slice(1).map((x) => `<span class="jn-badge" title="${esc(x.why)}">${x.icon} ${esc(x.name)}</span>`).join('')}</div>` : ''}</div>` : '';
    const tiles = `<div class="jn-stats">${JN_TILES(s).map(([i, l, v, sub]) => `<div class="jn-tile"><span class="ji">${i}</span><span class="jl">${l}</span><b>${v}</b><small>${sub}</small></div>`).join('')}</div>`;
    const quests = w.quests.length ? `<h3 class="jn-h">委託</h3><ul class="jn-quests">${[...w.quests].sort((a, b2) => ['done', 'progress', 'pending'].indexOf(a.status) - ['done', 'progress', 'pending'].indexOf(b2.status)).map((q) => {
      const n = q.objectives.filter((o) => o.done).length;
      return `<li class="${q.status}"><span class="jq">${JN_Q[q.status][0]}</span><span class="jt">${rich(q.title)}</span>${q.project ? `<span class="chip proj">${esc(q.project)}</span>` : ''}<small>${q.status === 'done' ? (q.submitted ? (q.submitted.onTime ? '準時交付' : '已交付') : '目標全完成') : `${n}/${q.objectives.length}`}</small></li>`;
    }).join('')}</ul>` : '';
    const wd = (iso) => '日一二三四五六'[new Date(iso + 'T00:00:00').getDay()];
    const days = w.daily.length ? `<h3 class="jn-h">每天的回報</h3><div class="jn-days">${w.daily.map((x) => `<div class="jn-day"><b>${x.date.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/')}<small>（${wd(x.date)}）</small></b><span>${x.done ? `✔ ${esc(x.done)}` : ''}${x.blocker ? `<em>⚠ ${esc(x.blocker)}</em>` : ''}</span></div>`).join('')}</div>` : '';
    let comment;
    if (jn.writing) comment = `<div class="jn-comment writing"><span class="thinking-dots"><span></span><span></span><span></span></span>${name}在寫評語……</div>`;
    else if (w.comment) comment = `<div class="jn-comment"><p>${esc(w.comment)}</p><span class="jn-sign">— ${name}</span>${w.stale ? `<button class="btn small ghost jn-rewrite" data-jn-write title="評語寫好之後數字又變了">✍ 數字有更新，請${name}重寫</button>` : ''}</div>`;
    else comment = `<div class="jn-comment empty"><button class="btn small" data-jn-write>✍ 請${name}寫評語</button></div>`;
    body = nav + top + comment + tiles + quests + days; // 稱號 → 艾琳的評語 → 數字 → 委託 → 每天
    foot = `<span class="spacer">每週最後一天下班回報後，${name}會整理好交給你</span><button class="btn ghost" data-jn-export>💾 匯出 Markdown</button>`;
  }
  // 重畫時保住打到一半的週報（游標位置也留著）
  const ta = el.querySelector('#jnReport');
  const keep = ta && document.activeElement === ta ? { a: ta.selectionStart, b: ta.selectionEnd, top: ta.scrollTop } : null;
  el.innerHTML = head('📖 冒險日誌', '', tabs) + `<div class="panel-body jn-body jn-${jn.tab}">${body}</div><div class="panel-foot">${foot}</div>`;
  if (keep) { const t2 = el.querySelector('#jnReport'); if (t2) { t2.focus(); t2.setSelectionRange(keep.a, keep.b); t2.scrollTop = keep.top; } }
}
async function journalClick(e) {
  const t = e.target;
  const jn = state.jn || (state.jn = { tab: 'log', drafts: {} });
  const w = jn.data && jn.data.week;
  if (t.closest('[data-close]')) { closePanel(); return true; }
  const tab = t.closest('[data-jn-tab]'); if (tab) { jn.tab = tab.dataset.jnTab; renderPanel(); journalTop(); return true; }
  const go = t.closest('[data-jn-go]'); if (go) { if (go.dataset.jnGo) await journalGo(go.dataset.jnGo); return true; }
  if (t.closest('[data-jn-write]')) { journalWrite(true); return true; }
  if (t.closest('[data-jn-reset]') && w) { delete jn.drafts[w.key]; renderPanel(); return true; }
  if (t.closest('[data-jn-copy]') && w) {
    const ta = $('#jnReport');
    const r = await api.journalCopy(ta ? ta.value : w.report);
    toast(r && r.ok ? '📋 週報已複製，可以直接貼上' : `⚠ ${(r && r.error) || '複製失敗'}`);
    return true;
  }
  if (t.closest('[data-jn-export]') && w) {
    const r = await api.journalExport(w.key);
    toast(r && r.ok ? `💾 已匯出到「你的資料夾\\data\\週報」：${r.path.split(/[\\/]/).pop()}` : `⚠ ${(r && r.error) || '匯出失敗'}`, 4000);
    return true;
  }
  return false;
}
// 週報草稿：改的內容先記著（重畫、換頁回來都還在）
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'jnReport' && state.jn && state.jn.data && state.jn.data.week) {
    const k = state.jn.data.week.key;
    const was = state.jn.drafts[k] !== undefined && state.jn.drafts[k] !== state.jn.data.week.report;
    state.jn.drafts[k] = e.target.value;
    const now = e.target.value !== state.jn.data.week.report;
    if (was !== now) renderPanel(); // 「✎ 改過了」「↺ 還原」出現／消失
  }
});
