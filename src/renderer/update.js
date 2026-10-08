// 🔄 自動更新的卡片：新版本下載好了（安裝版）或有新版本（免安裝版）時，貼在狀態欄上面
//   安裝版：「現在更新（會重新啟動）」／「下次關掉時再裝」（不按也會在關掉艾琳時自動換上）
//   免安裝版：「打開下載頁」／「知道了」
//   按了「下次再說／知道了」的版本不再跳卡片（記在存檔裡），選單「❓ 說明」裡還是看得到
(function () {
  const card = document.createElement('div');
  card.id = 'updCard';
  card.className = 'upd-card hidden';
  card.setAttribute('data-hit', '');
  document.body.appendChild(card);
  let last = null, dismissed = null;

  function render(s) {
    last = s;
    const show = s && (s.status === 'ready' || s.status === 'available') && s.version && s.version !== dismissed;
    card.classList.toggle('hidden', !show);
    if (!show) return;
    const portable = s.status === 'available';
    const notes = (s.notes || []).length
      ? `<details class="upd-notes"><summary>更新了什麼</summary><ul>${s.notes.map((n) => (/^・/.test(n) ? `<li>${esc(n.slice(1))}</li>` : `<li class="h">${esc(n)}</li>`)).join('')}</ul></details>` : '';
    card.innerHTML = `<div class="upd-head"><span class="upd-ic">🎁</span><b>${portable ? '有新版本' : '新版本準備好了'}　${esc(s.version)}</b><button class="icon-btn" data-upd-later title="${portable ? '知道了' : '下次關掉時再裝'}">✕</button></div>
      <div class="upd-sub">${portable
        ? `現在是 ${esc(s.current)}。免安裝版要自己下載新的 zip，解壓縮後蓋過舊的資料夾就好；你的資料在「文件\\艾琳的任務櫃台」，不會不見。`
        : `現在是 ${esc(s.current)}。不用另外下載：下次關掉${esc(npcName())}的時候會自動換上，你的資料都會留著。`}</div>
      ${notes}
      <div class="upd-btns">${portable
        ? '<button class="btn small gold" data-upd-page>打開下載頁</button><button class="btn small ghost" data-upd-later>知道了</button>'
        : `<button class="btn small gold" data-upd-install>現在更新（會重新啟動）</button><button class="btn small ghost" data-upd-later title="下次關掉${esc(npcName())}時會自動換上">下次再裝</button>`}</div>`;
    card.style.bottom = document.body.classList.contains('no-hud') ? '14px' : `${($('#hud') && $('#hud').offsetHeight) + 22}px`;
  }

  card.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-upd-install]')) {
      toast(`🔄 正在更新，${npcName()}馬上回來…`, 4000);
      card.classList.add('hidden');
      const r = await api.updateInstall();
      if (!r || !r.installing) { toast('⚠ 現在沒辦法更新，下次關掉時會自動換上', 4000); render(last); }
      return;
    }
    if (t.closest('[data-upd-page]')) { api.updateOpenPage(); return; }
    if (t.closest('[data-upd-later]') && last) {
      dismissed = last.version;
      api.updateDismiss(last.version);
      card.classList.add('hidden');
      if (last.status === 'ready') toast(`好～下次關掉${npcName()}的時候會自動換上 ${last.version}`, 3500);
    }
  });

  api.on('update:status', (s) => render(s));
  api.updateGet().then((r) => { if (r && r.ok) { dismissed = r.dismissed || null; if (r.status) render(r.status); } });
  window.updateCard = { render, state: () => last }; // 測試用
})();
