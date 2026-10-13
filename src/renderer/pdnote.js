// 📓 用聊的寫週計畫（主視窗那一半）：筆記本模式的面板、聊天送去整理、撤銷、攤開大視窗
// （renderer.js 之後載入；用到 state、api、openPanel、closePanel、renderPanel、head、run、toast、esc、rich、logPush、npcNameR）

const pdView = () => (state.view && state.view.planDraft) || null;
const pdActive = () => { const d = pdView(); return !!(d && d.active); };
// 聊天裡說「幫我排這週」「來寫週計畫」：直接打開筆記本
const PD_RE = /^(?:幫我|我們|一起|來|想|要)?\s*(?:來)?\s*(?:寫|排|規劃|安排|整理|列)\s*(?:一下)?\s*(?:個|一份)?\s*(?:這週|本週|下週|下周|這禮拜|下禮拜|這星期|下星期)?\s*(?:的)?\s*(?:週計畫|周計畫|計畫|行程|工作)\s*(?:吧|好了|好嗎)?[!！。?？]*$|^(?:幫我|一起|來)\s*(?:排|寫|規劃)\s*(?:這週|本週|下週|下周|這禮拜|下禮拜)/;

async function openPdNote(which) {
  state.pdConfirmDiscard = false;
  const r = await run(() => api.pdStart(which), { thinking: false });
  if (!r || !r.ok) return;
  state.pdAsk = r.ask || null;
  if (state.panel === 'pdNote') renderPanel(); else openPanel('pdNote');
  $('#dialog').classList.remove('hidden');
  $('#chatRow').classList.remove('hidden');
  pdPlaceholder();
  if (!r.ask) setTimeout(() => $('#chatInput').focus(), 50);
}
// 筆記本模式：聊天框的提示、可以打比較長（整段貼上）
function pdPlaceholder() {
  const inp = $('#chatInput');
  const on = pdActive() && state.panel === 'pdNote';
  inp.placeholder = on ? `跟${npcNameR()}說這週要做什麼…` : CHAT_HINT;
  inp.maxLength = on ? 600 : 300;
  $('#chatRow').classList.toggle('pd-on', on);
}
// 關掉面板（✕、Esc、換到別的面板）＝先存著
function pdOnClose() {
  state.pdAsk = null; state.pdConfirmDiscard = false;
  setTimeout(pdPlaceholder, 0); // 面板關好之後：聊天框變回一般聊天
  if (!pdActive()) return;
  state.view.planDraft.active = false;
  run(() => api.pdPause(), { thinking: false }).then(pdPlaceholder);
}
// 聊天送出：筆記本模式就拿去整理
async function pdSend(text) {
  const r = await run(() => api.pdSay(text), { thinking: false });
  if (!r || !r.ok) return;
  if (r.planDraft) state.view.planDraft = r.planDraft;
  if (state.panel === 'pdNote') { renderPanel(); pdScrollEnd(); }
}
function pdScrollEnd() { const b = document.querySelector('#panel .pd-log'); if (b) b.scrollTop = b.scrollHeight; }

function renderPdNote(el, v) {
  const d = v.planDraft;
  const name = esc((v.npc && v.npc.name) || '艾琳');
  if (state.pdAsk) { // 週四以後：先選哪一週
    el.innerHTML = head('📓 寫週計畫', '要排哪一週？') + `<div class="panel-body pd-ask">${state.pdAsk.map((o) => `<button class="btn ${o.which === 'next' ? 'gold' : ''}" data-pd-week="${o.which}"><b>${esc(o.name)}</b><small>${esc(o.label)}</small></button>`).join('')}</div>`;
    return;
  }
  if (!d) { el.innerHTML = head('📓 寫週計畫', '') + `<div class="panel-body"><p class="hint">筆記本收起來了。</p><button class="btn gold" data-pd-open>📓 打開筆記本</button></div>`; return; }
  const tools = `<button class="tab add" data-pd-review ${d.count ? '' : 'disabled'}>📖 攤開確認</button><button class="tab add" data-pd-pause>💾 先存著</button><button class="tab add" data-pd-discard>🗑 不要了</button>`;
  const confirm = state.pdConfirmDiscard ? `<div class="pd-confirm">整頁撕掉？記的 ${d.count} 筆都會不見<button class="btn small danger" data-pd-discard-yes>撕掉</button><button class="btn small ghost" data-pd-discard-no>不要</button></div>` : '';
  const log = d.log.length ? d.log.map((l) => `<div class="pd-entry ${l.pending ? 'pending' : ''}">
      <div class="pd-said">「${esc(l.said.length > 60 ? `${l.said.slice(0, 60)}…` : l.said).replace(/\n/g, ' ⏎ ')}」</div>
      <div class="pd-got">${l.text ? rich(l.text) : l.pending ? '' : '<span class="hint">（沒有記到東西）</span>'}${l.pending ? `<span class="pd-busy">✏️ ${name}整理中…</span>` : l.by === 'ai' ? '' : '<span class="pd-quick" title="AI 沒開或沒整理出來，用規則速記的">速記</span>'}</div>
      <button class="icon-btn del" data-pd-undo="${esc(l.id)}" title="撤銷這句記下的東西">✕</button></div>`).join('')
    : `<div class="pd-help"><b>可以這樣說：</b><div>・週五前寫完週報</div><div>・週二下午兩點到三點開週會</div><div>・整理月報：收齊數字、寫摘要、寄出</div><div>・提醒我週四下午四點打給廠商</div><div>・週三整天出差</div><div class="hint">一句一件，也可以把信件裡的清單整段貼上。${v.planDraft.ai ? '' : '（AI 沒開：用規則速記，最後在表格裡改）'}</div></div>`;
  const sub = `${esc(d.week.name)} ${esc(d.week.label)}・${esc(d.summary)}${d.pending ? `・整理中 ${d.pending}` : ''}`;
  el.innerHTML = head('📓 寫週計畫', sub, tools, '這段時間在聊天框說的話都會記成週計畫（不當一般聊天）。說完按「📖 攤開確認」，在大表格裡請 AI 改或自己改，最後才寫進計畫檔。') + `<div class="panel-body pd-body">${confirm}<div class="pd-log">${log}</div></div>`;
}

async function pdNoteClick(e) {
  const t = e.target;
  const wk = t.closest('[data-pd-week]'); if (wk) { state.pdAsk = null; await openPdNote(wk.dataset.pdWeek); return true; }
  if (t.closest('[data-pd-open]')) { await openPdNote(); return true; }
  if (t.closest('[data-pd-pause]')) { closePanel(); return true; } // 關面板就會先存著
  if (t.closest('[data-pd-discard]')) { state.pdConfirmDiscard = true; renderPanel(); return true; }
  if (t.closest('[data-pd-discard-no]')) { state.pdConfirmDiscard = false; renderPanel(); return true; }
  if (t.closest('[data-pd-discard-yes]')) { state.pdConfirmDiscard = false; await run(() => api.pdDiscard(), { thinking: false }); closePanel(); pdPlaceholder(); return true; }
  const un = t.closest('[data-pd-undo]'); if (un) { const r = await run(() => api.pdUndoLog(un.dataset.pdUndo), { thinking: false }); if (r && r.ok && state.panel === 'pdNote') renderPanel(); return true; }
  if (t.closest('[data-pd-review]')) { // 攤開大視窗：艾琳的話在那邊說
    const r = await api.pdReview();
    if (!r || !r.ok) toast(`⚠ ${(r && r.error) || '打不開'}`, 3000);
    return true;
  }
  return false;
}
// 聊天框：筆記本模式就記下來；說「幫我排這週」就打開筆記本。有處理回 true
async function pdChat(text) {
  const inp = $('#chatInput');
  if (state.panel === 'pdNote' && pdActive()) {
    inp.value = '';
    logPush('me', text); logRefresh();
    await pdSend(text);
    inp.focus();
    return true;
  }
  if (PD_RE.test(text)) { inp.value = ''; await openPdNote(/下週|下周|下禮拜|下星期/.test(text) ? 'next' : /這週|本週|這禮拜|這星期/.test(text) ? 'this' : undefined); return true; }
  return false;
}
// 從信件、記事本貼上好幾行：單行輸入框會把換行吃掉，所以直接整段記下來
$('#chatInput').addEventListener('paste', (e) => {
  if (!(state.panel === 'pdNote' && pdActive())) return;
  const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
  if (!/\n/.test(txt.trim())) return;
  e.preventDefault();
  const all = `${$('#chatInput').value}${txt}`.trim();
  $('#chatInput').value = '';
  logPush('me', all); logRefresh();
  pdSend(all.slice(0, 1200));
  toast(`📋 貼上的 ${all.split(/\n/).filter((x) => x.trim()).length} 行都交給${npcNameR()}了`, 2400);
});

// AI 在背景整理好一句、或大視窗改了東西：更新筆記本
api.on('pd:update', (p) => {
  if (!state.view) return;
  state.view.planDraft = p.planDraft;
  if (state.panel === 'pdNote') {
    if (!p.planDraft && !state.pdAsk) { closePanel(); return; } // 寫進計畫檔了／整份丟掉
    renderPanel(); pdScrollEnd();
  }
  pdPlaceholder();
});
