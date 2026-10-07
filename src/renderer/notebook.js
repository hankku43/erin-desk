// 📒 艾琳的小本子：偷看她記了你哪些事，記錯的、不想被記的可以劃掉
// （renderer.js 之後載入；用到 state、api、openPanel、renderPanel、head、run、toast、esc、npcName）

function openNotebook() {
  state.nb = { data: null, confirmAll: false };
  openPanel('notebook');
  run(() => api.notebookPeek(), { thinking: false }).then((r) => {
    if (r && r.ok && state.nb) { state.nb.data = r.notebook; if (state.panel === 'notebook') renderPanel(); }
  });
}
// 聊天時她又記了新的：小本子開著就安靜地更新（不再說「被偷看」的話）
async function notebookRefresh() {
  if (state.panel !== 'notebook' || !state.nb) return;
  const r = await api.notebookPeek(true);
  if (r && r.ok && state.nb) { state.nb.data = r.notebook; if (state.panel === 'notebook') renderPanel(); }
}

const NB_SKETCH = [
  '',
  '最後一頁好像畫了什麼……被一張星星貼紙蓋住了。',
  '最後一頁畫著一個小小的側臉，旁邊寫著「冒險者」，還圈了一顆星星。',
];
function renderNotebook(el) {
  const nb = state.nb || {};
  const d = nb.data;
  const name = esc(npcName());
  let body;
  if (!d) body = '<p class="nb-empty">翻開中……</p>';
  else {
    const off = d.enabled === false
      ? `<div class="nb-off">小本子現在收起來了，${name}不會再記新的事。<button class="btn small gold" data-nb-on>📒 讓${name}繼續記</button></div>` : '';
    const groups = d.groups.map((g) => `<section class="nb-sec"><h3>${g.icon} ${esc(g.label)}</h3><ul>${g.items.map((x) => `
      <li class="nb-item" data-nb-item="${esc(x.id)}">
        <span class="nb-text">${x.when ? `<b class="nb-when">${esc(x.when)}</b>` : ''}${esc(x.text)}</span>
        ${x.followed ? '<span class="nb-tag">問過了</span>' : ''}
        <small class="nb-noted">${esc(x.noted)}</small>
        <button class="nb-del" data-nb-del="${esc(x.id)}" title="劃掉這一則（${name}就會忘記）">✕</button>
      </li>`).join('')}</ul></section>`).join('');
    const empty = d.count ? '' : `<p class="nb-empty">還是空白的一頁。<br>跟${name}聊聊你喜歡的東西、最近發生的事，<br>她就會偷偷記下來喔。</p>`;
    const sketch = NB_SKETCH[d.sketch || 0] ? `<div class="nb-sketch s${d.sketch}"><span class="nb-seal">${d.sketch >= 2 ? '★' : '✦'}</span>${NB_SKETCH[d.sketch]}</div>` : '';
    body = off + groups + empty + sketch;
  }
  const count = d ? (d.count ? `${d.count} 則・偷看中…` : '偷看中…') : '';
  // 頁尾只放按鈕；「只記你說的、記錯可以劃掉」這種固定說明收進標題列的 ⓘ
  const foot = !d || !d.count ? ''
    : nb.confirmAll
      ? `<span class="spacer">真的全部劃掉？${name}會全部忘記喔。</span><button class="btn ghost" data-nb-all-no>不要</button><button class="btn danger" data-nb-all-yes>全部劃掉</button>`
      : '<span class="spacer"></span><button class="btn ghost" data-nb-all>全部劃掉…</button>';
  el.innerHTML = head(`📒 ${name}的小本子`, count, '', `只記你親口說的、關於自己的事。記錯的、不想被記的，滑過那一則按 ✕ 劃掉，${name}就會忘記`) + `<div class="panel-body nb-body"><div class="nb-paper">${body}</div></div>${foot ? `<div class="panel-foot">${foot}</div>` : ''}`;
}
async function notebookClick(e) {
  const t = e.target;
  const nb = state.nb || (state.nb = {});
  if (t.closest('[data-close]')) { closePanel(); return true; }
  const del = t.closest('[data-nb-del]');
  if (del) {
    const li = del.closest('.nb-item');
    if (li) { li.classList.add('striking'); await new Promise((r) => setTimeout(r, 380)); } // 先畫一條線再消失
    const r = await run(() => api.notebookForget(del.dataset.nbDel), { thinking: false });
    if (r && r.ok) nb.data = r.notebook;
    if (state.panel === 'notebook') renderPanel();
    return true;
  }
  if (t.closest('[data-nb-all]')) { nb.confirmAll = true; renderPanel(); return true; }
  if (t.closest('[data-nb-all-no]')) { nb.confirmAll = false; renderPanel(); return true; }
  if (t.closest('[data-nb-all-yes]')) {
    nb.confirmAll = false;
    const r = await run(() => api.notebookClear(), { thinking: false });
    if (r && r.ok) nb.data = r.notebook;
    if (state.panel === 'notebook') renderPanel();
    return true;
  }
  if (t.closest('[data-nb-on]')) {
    const r = await run(() => api.setNotebook(true), { thinking: false });
    if (r && r.ok) nb.data = r.notebook;
    if (state.panel === 'notebook') renderPanel();
    return true;
  }
  return false;
}
