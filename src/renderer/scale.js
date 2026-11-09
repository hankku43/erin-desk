// 🔍 介面大小：滑桿面板（右鍵 ⚙ → 🔍 介面大小 → 🎚 用滑桿調…）＋改了大小時的小提示
//   滑桿拖的時候只換數字，放開才套用（一邊拖一邊縮放的話，滑桿會從滑鼠底下跑掉）
(function () {
  'use strict';
  const S = { info: null };
  const pct = (s) => `${Math.round(s * 100)}%`;

  async function load() {
    try { const r = await api.scaleGet(); if (r && r.ok) S.info = r.info; } catch (_) { /* 拿不到就用 100% */ }
    if (state.panel === 'scale') renderPanel();
  }

  window.renderScalePanel = function (el) {
    const i = S.info || { scale: 1, eff: 1, max: 1.5, min: 0.7, presets: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5] };
    if (!S.info) load();
    const name = esc(typeof npcNameR === 'function' ? npcNameR() : '艾琳');
    const lo = Math.round(i.min * 100), hi = Math.round(i.max * 100), cur = Math.round(i.eff * 100);
    const presets = [0.8, 0.9, 1, 1.1, 1.2, 1.3].map((p) => `<button class="btn small sc-pre${Math.abs(p - i.eff) < 0.001 ? ' on' : ''}" data-sc="${p}"${p > i.max ? ' disabled data-tip="這個螢幕放不下"' : ''}>${pct(p)}</button>`).join('');
    el.innerHTML = head('🔍 介面大小', `現在 ${pct(i.eff)}`, '', `${name}、小貓、狀態欄、對話框和這些面板一起放大縮小；📓 筆記本是另一個視窗，不受影響。設定存在 config.json 的 window.scale`) + `<div class="panel-body form">
      <p class="hint">拖滑桿，放開就套用。也可以把滑鼠放在${name}身上，按住 <b>Ctrl</b> 滾滾輪。</p>
      <div class="sc-row"><span class="sc-a" aria-hidden="true">A</span><input type="range" id="scRange" min="${lo}" max="${hi}" step="5" value="${cur}" aria-label="介面大小"><span class="sc-A" aria-hidden="true">A</span><b id="scVal">${cur}%</b></div>
      <div class="sc-presets">${presets}</div>
      ${i.max < 1.5 ? `<p class="hint sc-max">這個螢幕最大到 ${pct(i.max)}（再大會超出畫面）。</p>` : ''}
      ${i.eff < i.scale - 0.001 ? `<p class="hint sc-max">設定是 ${pct(i.scale)}，這個螢幕放不下，先用 ${pct(i.eff)}。</p>` : ''}
    </div>
    <div class="panel-foot">${Math.abs(i.eff - 1) > 0.001 ? '<button class="btn ghost" id="scReset">回到 100%</button>' : ''}<span class="spacer"></span><button class="btn gold" data-close>完成</button></div>`;
  };

  async function set(v) {
    try { const r = await api.scaleSet(v); if (r && r.ok) S.info = r.info; } catch (e) { toast(`⚠ ${e.message || e}`); }
    if (state.panel === 'scale') renderPanel();
  }
  window.scaleClick = async function (e) {
    const t = e.target;
    const p = t.closest('[data-sc]'); if (p && !p.disabled) { await set(Number(p.dataset.sc)); return true; }
    if (t.closest('#scReset')) { await set(1); return true; }
    return false;
  };
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'scRange') { const v = $('#scVal'); if (v) v.textContent = `${e.target.value}%`; } });
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'scRange') set(Number(e.target.value) / 100); });

  // 大小改了（選單、Ctrl＋滾輪、滑桿、換螢幕）：記下來、說一聲
  api.on('ui:scale', (info) => {
    if (!info) return;
    S.info = info;
    if (state.panel === 'scale') renderPanel();
    if (!info.changed) return;
    if (info.quiet && info.eff < info.scale - 0.001) toast(`🔍 這個螢幕放不下 ${pct(info.scale)}，先用 ${pct(info.eff)}`, 3200);
    else if (!info.quiet && state.panel !== 'scale') toast(`🔍 介面大小 ${pct(info.eff)}`, 1400); // 滑桿面板上已經寫著了
  });
})();
