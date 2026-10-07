// 🛒 雲朵雜貨舖（兔族雙胞胎顧店：禮物、裝飾、星座卡）＋🏅 成就（自己一個面板）＋櫃台的吊飾／擺設＋主題配色
// （renderer.js、art.js 之後載入；用到 state、api、openPanel、renderPanel、head、run、toast、esc、npcName、Art）

// ---------- 雜貨舖（一個面板三個分頁：禮物、裝飾、星座卡；每一列一個動作、一個大按鈕） ----------
//   成就是「看自己的紀錄」，不是花錢的地方：搬到自己的面板（首頁的 🏅、狀態欄的 🔥、右鍵選單）
function openShop(tab) {
  const t = tab || (state.sp && state.sp.tab) || 'gift';
  state.sp = { data: null, tab: t === 'ach' ? 'gift' : t, draw: null };
  openPanel('shop');
  api.shopOpen().then((r) => {
    if (!state.sp) return;
    if (r && r.ok) { state.sp.data = r.shop; if (r.view) applyView(r.view); }
    if (state.panel === 'shop') renderPanel();
  });
}
function openCollection(tab) { if (tab === 'cards') openShop('cards'); else openAch(); }
const spCoin = (p, ok) => `<span class="sp-coin ${ok ? '' : 'short'}">${COIN}${p}</span>`;
function renderShop(el) {
  const sp = state.sp || {};
  const d = sp.data;
  const name = esc(npcName());
  const TABS = [['gift', '🎁 禮物'], ['decor', '🎨 裝飾'], ['cards', '🌌 星座卡']];
  const tabs = `<div class="tabs sp-tabs">${TABS.map(([k, l]) => `<button class="tab ${sp.tab === k ? 'on' : ''}" data-sp-tab="${k}">${l}</button>`).join('')}</div>`;
  if (!d) { el.innerHTML = head('🛒 雲朵雜貨舖', '', tabs) + '<div class="panel-body"><p class="hint">開店中……</p></div>'; return; }
  const tw = d.twins || { who: 'duo', name: '朵朵', text: '歡迎光臨～' };
  const keeper = `<div class="sp-keeper"><div class="sp-face">${Art.twins(tw.who)}</div><div class="sp-say"><b>${esc(tw.name)}</b>${esc(tw.text)}</div></div>`;
  let body = '';
  if (sp.tab === 'gift') {
    body = `<div class="sp-list">${d.catalog.gifts.map((x) => `
      <div class="sp-row ${x.joke ? 'joke' : ''}">
        <div class="sp-ico">${Art.gift(x.id)}</div>
        <div class="sp-txt"><b>${esc(x.name)}${x.given ? `<span class="sp-tag">送過 ${x.given} 次</span>` : ''}</b><small>${esc(x.desc)}</small></div>
        <button class="btn sp-act ${x.joke ? 'ghost' : 'gold'}" data-sp-gift="${x.id}" ${x.afford ? '' : 'disabled'}>${x.joke ? '送？' : '送'}${spCoin(x.price, x.afford)}</button>
      </div>`).join('')}</div>`;
  } else if (sp.tab === 'decor') {
    const act = (x, slot) => x.equipped
      ? (slot === 'theme' ? '<span class="sp-on">✓ 使用中</span>' : `<button class="btn sp-act ghost" data-sp-off="${slot}">拿下</button>`)
      : x.owned ? `<button class="btn sp-act" data-sp-equip="${slot}:${x.id}">換上</button>`
        : `<button class="btn sp-act gold" data-sp-buy="${x.id}" ${x.afford ? '' : 'disabled'}>買${spCoin(x.price, x.afford)}</button>`;
    const sec = (title, note, rows) => `<div class="sp-sec"><b>${title}</b><small>${note}</small></div><div class="sp-list">${rows}</div>`;
    body = sec('主題配色', '整個櫃台一起換色', d.catalog.themes.map((x) => `
      <div class="sp-row ${x.equipped ? 'on' : ''}"><span class="sp-sw">${x.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span><div class="sp-txt"><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></div>${act(x, 'theme')}</div>`).join(''));
    for (const slot of ['hang', 'desk']) {
      body += sec(slot === 'hang' ? '吊飾' : '擺設', slot === 'hang' ? `掛在${name}旁邊，點一下會晃` : `放在${name}腳邊`, d.catalog.ornaments.filter((x) => x.slot === slot).map((x) => `
        <div class="sp-row ${x.equipped ? 'on' : ''}"><div class="sp-ico ${slot}">${Art.ornament(x.id)}</div><div class="sp-txt"><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></div>${act(x, slot)}</div>`).join(''));
    }
  } else if (sp.tab === 'cards') {
    const c = d.cards;
    const bar = `<div class="sp-bar"><div class="sp-txt"><b>露米納星座卡 <span class="sp-tag">${c.owned}/${c.total}</span><span class="sp-tag dust">✦ ${c.dust}</span></b><small>重複的變星屑，星屑換還沒有的卡・再 ${c.pityLeft} 抽必出 ★★★★</small></div>
      <button class="btn sp-act gold" data-sp-draw="1" ${d.gold >= c.price.one ? '' : 'disabled'}>抽 1 張${spCoin(c.price.one, d.gold >= c.price.one)}</button>
      <button class="btn sp-act gold" data-sp-draw="10" ${d.gold >= c.price.ten ? '' : 'disabled'} data-tip="最後一張保底 ★★★ 以上">抽 10 張${spCoin(c.price.ten, d.gold >= c.price.ten)}</button></div>`;
    const res = sp.draw ? `<div class="sp-draw"><div class="sp-draw-grid">${sp.draw.map((x, i) => `<div class="sp-card r${x.r} ${x.isNew ? 'new' : ''}" style="--i:${i}">${Art.card(x)}<b>${esc(x.name)}</b><small>${x.isNew ? 'NEW!' : `✦ +${x.dust}`}</small></div>`).join('')}</div><button class="btn small ghost" data-sp-fold>收起</button></div>` : '';
    const own = c.cards.filter((x) => x.count), miss = c.cards.filter((x) => !x.count);
    const ownHtml = own.length ? `<div class="sp-sec"><b>已收集</b><small>${own.length} 張</small></div><div class="co-cards">${own.map((x) => `
      <div class="co-card own r${x.r}" data-tip="${esc(x.desc)}">${Art.card(x, { owned: true })}<b>${esc(x.name)}</b><small>${x.rarity}${x.count > 1 ? ` ×${x.count}` : ''}</small></div>`).join('')}</div>`
      : '<p class="hint co-none">還沒有星座卡。抽一張看看吧！</p>';
    const missHtml = miss.length ? `<div class="sp-sec"><b>還沒遇到</b><small>${miss.length} 張・星屑夠了可以直接換</small></div><div class="co-cards miss">${miss.map((x) => {
      const can = c.dust >= x.cost;
      return `<div class="co-card miss r${x.r}">${Art.card(x, { owned: false })}${can ? `<button class="btn small gold" data-co-ex="${x.id}">✦${x.cost} 換</button>` : `<small class="co-cost">✦${x.cost}</small>`}</div>`;
    }).join('')}</div>` : '';
    body = bar + res + ownHtml + missHtml;
  }
  el.innerHTML = head('🛒 雲朵雜貨舖', `${COIN}${d.gold}`, tabs) + `<div class="panel-body sp-body">${keeper}${body}</div>`;
}
async function shopAct(fn, { talk = false } = {}) {
  const r = await run(fn, { thinking: talk, talk });
  if (r && r.ok && state.sp) {
    if (r.shop) state.sp.data = r.shop;
    if (r.draw) state.sp.draw = r.draw;
  }
  if (state.panel === 'shop') renderPanel();
  return r;
}
async function shopClick(e) {
  const t = e.target;
  const sp = state.sp || (state.sp = { tab: 'gift' });
  if (t.closest('[data-close]')) { closePanel(); return true; }
  const tab = t.closest('[data-sp-tab]'); if (tab) { sp.tab = tab.dataset.spTab; renderPanel(); const b = document.querySelector('#panel .panel-body'); if (b) b.scrollTop = 0; return true; }
  const gift = t.closest('[data-sp-gift]'); if (gift) { await shopAct(() => api.shopGift(gift.dataset.spGift), { talk: true }); return true; }
  const buy = t.closest('[data-sp-buy]'); if (buy) { await shopAct(() => api.shopBuy(buy.dataset.spBuy)); return true; }
  const eq = t.closest('[data-sp-equip]'); if (eq) { const [slot, id] = eq.dataset.spEquip.split(':'); await shopAct(() => api.shopEquip(slot, id)); return true; }
  const off = t.closest('[data-sp-off]'); if (off) { await shopAct(() => api.shopEquip(off.dataset.spOff, null)); return true; }
  const dr = t.closest('[data-sp-draw]'); if (dr) { sp.draw = null; await shopAct(() => api.shopDraw(Number(dr.dataset.spDraw))); const b = document.querySelector('#panel .panel-body'); if (b) b.scrollTop = 0; return true; }
  if (t.closest('[data-sp-fold]')) { sp.draw = null; renderPanel(); return true; }
  const ex = t.closest('[data-co-ex]');
  if (ex) { const r = await shopAct(() => api.shopExchange(ex.dataset.coEx)); if (r && r.ok) toast(`✦ 換到了「${r.card.name}」`); return true; }
  return false;
}

// ---------- 🏅 成就（自己一個面板）：上面是連續上工，下面是成就牆（拿到的排前面） ----------
function openAch() {
  state.co = { col: null };
  openPanel('ach');
  achRefresh();
}
async function achRefresh() {
  const c = await api.collectionOpen();
  if (c && c.ok && state.co) { state.co.col = c.collection; if (state.panel === 'ach') renderPanel(); }
}
function renderAch(el) {
  const col = state.co && state.co.col;
  if (!col) { el.innerHTML = head('🏅 成就', '') + '<div class="panel-body"><p class="hint">翻開中……</p></div>'; return; }
  const st = col.streak;
  const got = col.achievements.filter((a) => a.got).length;
  const list = [...col.achievements].sort((a, b) => (b.got ? 1 : 0) - (a.got ? 1 : 0));
  const body = `<div class="co-streak"><span class="fire">🔥</span><div><b>連續上工 ${st.cur} 天<span class="sp-tag">最長 ${st.best}・共 ${st.days} 天</span></b><small>一天第一次完成事情就算；週末和沒排的日子不會斷</small></div></div>
    <div class="co-ach">${list.map((a) => `
    <div class="co-a ${a.got ? 'got' : ''} ${a.hidden && !a.got ? 'secret' : ''}"><span class="co-medal">${a.icon}</span>
      <div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${a.progress && !a.got ? `<div class="co-progrow"><div class="co-prog"><i style="width:${Math.round((a.progress.n / a.progress.of) * 100)}%"></i></div><span>${a.progress.n}/${a.progress.of}</span></div>` : ''}</div>
      <span class="co-gold">${a.got ? '✓' : `${COIN}${a.gold}`}</span></div>`).join('')}</div>`;
  el.innerHTML = head('🏅 成就', `${got}/${col.achievements.length} 個`, '', '完成目標、交付委託、專注、抽運勢…都會點亮成就，每個都有金幣') + `<div class="panel-body co-body">${body}</div>`;
}
async function achClick(e) {
  if (e.target.closest('[data-close]')) { closePanel(); return true; }
  return false;
}

// ---------- 櫃台的吊飾／擺設、主題配色（每次畫面更新時對一下） ----------
function applyDecor(v) {
  const d = (v && v.decor) || {};
  document.body.dataset.theme = d.theme || 'navy';
  let layer = document.querySelector('#decor');
  if (!layer) {
    layer = document.createElement('div'); layer.id = 'decor';
    layer.innerHTML = '<div class="d-hang"></div><div class="d-desk"></div>';
    $('#npcWrap').appendChild(layer);
    layer.querySelector('.d-hang').addEventListener('click', (e) => { e.stopPropagation(); const h = e.currentTarget; h.classList.remove('ring'); void h.offsetWidth; h.classList.add('ring'); }); // 點吊飾：晃一下
  }
  for (const slot of ['hang', 'desk']) {
    const box = layer.querySelector(`.d-${slot}`);
    if (box.dataset.id === (d[slot] || '')) continue;
    box.dataset.id = d[slot] || '';
    box.innerHTML = d[slot] ? Art.ornament(d[slot]) : '';
    box.classList.toggle('on', !!d[slot]);
    if (d[slot]) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }
}

// ---------- 🏅 成就解鎖：畫面上方跳一個徽章 ----------
function showAchievements(list) {
  if (state.panel === 'ach') achRefresh();
  list.slice(0, 4).forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'ach-pop';
    el.style.setProperty('--i', i);
    el.innerHTML = `<span class="co-medal">${a.icon}</span><div><small>成就解鎖</small><b>${esc(a.name)}</b></div><span class="g">${COIN}+${a.gold}</span>`;
    $('#fx').appendChild(el);
    setTimeout(() => el.remove(), 3600 + i * 300);
  });
}

// 載入的時候畫面可能已經拿到 view 了（renderer.js 的 init 比較早跑完）：補畫一次
if (state.view) applyDecor(state.view);
