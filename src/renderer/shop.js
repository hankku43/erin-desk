// 🛒 雲朵雜貨舖（兔族雙胞胎顧店）＋🏅 成就與星座圖鑑＋櫃台的吊飾／擺設＋主題配色
// （renderer.js、art.js 之後載入；用到 state、api、openPanel、renderPanel、head、run、toast、esc、npcName、Art）

// ---------- 雜貨舖 ----------
function openShop(tab) {
  state.sp = { data: null, tab: tab || (state.sp && state.sp.tab) || 'gift', draw: null };
  openPanel('shop');
  api.shopOpen().then((r) => { if (r && r.ok && state.sp) { state.sp.data = r.shop; if (r.view) applyView(r.view); if (state.panel === 'shop') renderPanel(); } });
}
const spPrice = (p, afford) => `<span class="sp-price ${afford ? '' : 'short'}">🪙 ${p}</span>`;
function renderShop(el) {
  const sp = state.sp || {};
  const d = sp.data;
  const tabs = `<div class="tabs">${[['gift', '禮物'], ['decor', '裝飾'], ['cards', '星座卡']].map(([k, l]) => `<button class="tab ${sp.tab === k ? 'on' : ''}" data-sp-tab="${k}">${l}</button>`).join('')}</div>`;
  if (!d) { el.innerHTML = head('🛒 雲朵雜貨舖', '', tabs) + '<div class="panel-body"><p class="hint">開店中……</p></div>'; return; }
  const name = esc(npcName());
  const tw = d.twins || { who: 'duo', name: '朵朵', text: '歡迎光臨～' };
  const keeper = `<div class="sp-keeper"><div class="sp-face">${Art.twins(tw.who)}</div><div class="sp-say"><b>${esc(tw.name)}</b>${esc(tw.text)}</div></div>`;
  let body = '';
  if (sp.tab === 'gift') {
    body = `<p class="hint sp-hint">買了直接送給${name}。一天的第一份禮物${name}最開心；送過的會記在小卡上。</p><div class="sp-grid">${d.catalog.gifts.map((x) => `
      <div class="sp-item ${x.joke ? 'joke' : ''}" title="${esc(x.desc)}">
        <div class="sp-ico">${Art.gift(x.id)}</div>
        <b>${esc(x.name)}</b><small>${esc(x.from)}</small>
        <p>${esc(x.desc)}</p>
        <button class="btn small ${x.joke ? '' : 'gold'}" data-sp-gift="${x.id}">${spPrice(x.price, x.afford)} 送${x.joke ? '……？' : `給${name}`}</button>
        ${x.given ? `<span class="sp-given">送過 ${x.given} 次</span>` : ''}
      </div>`).join('')}</div>`;
  } else if (sp.tab === 'decor') {
    const btn = (x, slot) => x.equipped
      ? `<span class="chip ok">✓ 使用中</span>${slot !== 'theme' ? `<button class="btn small ghost" data-sp-off="${slot}">拿下</button>` : ''}`
      : x.owned ? `<button class="btn small" data-sp-equip="${slot}:${x.id}">換上</button>`
        : `<button class="btn small gold" data-sp-buy="${x.id}">${spPrice(x.price, x.afford)} 買</button>`;
    body = `<h3 class="sp-h">🎨 主題配色<small>狀態欄、對話框、面板的顏色</small></h3><div class="sp-themes">${d.catalog.themes.map((x) => `
      <div class="sp-theme ${x.equipped ? 'on' : ''}" title="${esc(x.desc)}"><span class="sw">${x.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span><b>${esc(x.name)}</b><span class="act">${btn(x, 'theme')}</span></div>`).join('')}</div>`;
    for (const slot of ['hang', 'desk']) {
      body += `<h3 class="sp-h">${slot === 'hang' ? '🎐 吊飾' : '🪴 擺設'}<small>${slot === 'hang' ? `掛在${name}的左上方` : `放在${name}的腳邊`}，一次放一個</small></h3><div class="sp-grid orn">${d.catalog.ornaments.filter((x) => x.slot === slot).map((x) => `
        <div class="sp-item ${x.equipped ? 'on' : ''}" title="${esc(x.desc)}"><div class="sp-ico ${slot}">${Art.ornament(x.id)}</div><b>${esc(x.name)}</b><p>${esc(x.desc)}</p><div class="act">${btn(x, slot)}</div></div>`).join('')}</div>`;
    }
  } else {
    const c = d.cards;
    const res = sp.draw ? `<div class="sp-draw">${sp.draw.map((x, i) => `<div class="sp-card r${x.r} ${x.isNew ? 'new' : ''}" style="--i:${i}">${Art.card(x)}<b>${esc(x.name)}</b><small>${x.isNew ? 'NEW!' : `+${x.dust} 星屑`}</small></div>`).join('')}</div>` : '';
    body = `<div class="sp-pack"><div class="sp-pack-art">${Art.card({ id: 'pack-front', r: 3, n: 7 })}</div><div class="sp-pack-info">
        <b>露米納星座卡</b><p>卡上是露米納大陸的星座。重複的卡換成星屑，星屑可以到圖鑑換想要的那張。</p>
        <p class="sp-meta">圖鑑 ${c.owned}/${c.total}・星屑 ✦${c.dust}・再 ${c.pityLeft} 抽必出 ★★★★</p>
        <div class="sp-btns"><button class="btn gold" data-sp-draw="1">抽一張 ${spPrice(c.price.one, d.gold >= c.price.one)}</button><button class="btn gold" data-sp-draw="10">抽十張 ${spPrice(c.price.ten, d.gold >= c.price.ten)}</button></div>
        <small class="sp-note">十張的最後一張保底 ★★★ 以上</small></div></div>${res}
      <div class="sp-to-book"><button class="btn small ghost" data-sp-book>📚 打開星座圖鑑</button></div>`;
  }
  el.innerHTML = head('🛒 雲朵雜貨舖', `🪙 ${d.gold}`, tabs) + `<div class="panel-body sp-body">${keeper}${body}</div>`
    + `<div class="panel-foot"><span class="spacer">金幣：完成目標、交付委託、下班回報、專注、連續上工、成就</span><button class="btn small ghost" data-sp-col>🏅 成就與圖鑑</button></div>`;
}
async function shopAct(fn, { talk = false } = {}) {
  const r = await run(fn, { thinking: talk, talk });
  if (r && r.ok && r.shop && state.sp) { state.sp.data = r.shop; if (r.draw) state.sp.draw = r.draw; }
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
  const dr = t.closest('[data-sp-draw]'); if (dr) { sp.draw = null; await shopAct(() => api.shopDraw(Number(dr.dataset.spDraw))); return true; }
  if (t.closest('[data-sp-book]')) { openCollection('cards'); return true; }
  if (t.closest('[data-sp-col]')) { openCollection('ach'); return true; }
  return false;
}

// ---------- 成就與星座圖鑑 ----------
function openCollection(tab) {
  state.col = { data: null, tab: tab || (state.col && state.col.tab) || 'ach' };
  openPanel('collection');
  run(() => api.collectionOpen(), { thinking: false }).then((r) => { if (r && r.ok && state.col) { state.col.data = r.collection; if (state.panel === 'collection') renderPanel(); } });
}
function renderCollection(el) {
  const col = state.col || {};
  const d = col.data;
  const tabs = `<div class="tabs">${[['ach', '成就'], ['cards', '星座圖鑑']].map(([k, l]) => `<button class="tab ${col.tab === k ? 'on' : ''}" data-col-tab="${k}">${l}</button>`).join('')}</div>`;
  if (!d) { el.innerHTML = head('🏅 成就與圖鑑', '', tabs) + '<div class="panel-body"><p class="hint">翻開中……</p></div>'; return; }
  const got = d.achievements.filter((a) => a.got).length;
  const st = d.streak;
  const streak = `<div class="co-streak"><span class="fire">🔥</span><div><b>連續上工 ${st.cur} 天</b><small>最長 ${st.best} 天・一共上工 ${st.days} 天｜一天第一次完成事情就算；週末和計畫裡沒排的日子不會斷</small></div></div>`;
  let body;
  if (col.tab === 'cards') {
    const c = d.cards;
    body = `<p class="hint co-hint">圖鑑 ${c.owned}/${c.total}・星屑 ✦${c.dust}（重複的卡會換成星屑；還沒有的卡可以用星屑換）</p><div class="co-cards">${c.cards.map((x) => `
      <div class="co-card ${x.count ? 'own' : 'miss'} r${x.r}" title="${x.count ? esc(x.desc) : '還沒有'}">${Art.card(x, { owned: !!x.count })}
        <b>${x.count ? esc(x.name) : '？？？'}</b><small>${x.count ? `${x.rarity}${x.count > 1 ? `・×${x.count}` : ''}` : x.rarity}</small>
        ${x.count ? '' : `<button class="btn small ${c.dust >= x.cost ? 'gold' : 'ghost'}" data-co-ex="${x.id}" ${c.dust >= x.cost ? '' : 'disabled'}>✦${x.cost} 換</button>`}</div>`).join('')}</div>`;
  } else {
    body = streak + `<div class="co-ach">${d.achievements.map((a) => `
      <div class="co-a ${a.got ? 'got' : ''} ${a.hidden && !a.got ? 'secret' : ''}"><span class="co-medal">${a.icon}</span>
        <div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${a.progress ? `<div class="co-prog"><i style="width:${Math.round((a.progress.n / a.progress.of) * 100)}%"></i><span>${a.progress.n}/${a.progress.of}</span></div>` : ''}</div>
        <span class="co-gold">${a.got ? '✓' : `🪙${a.gold}`}</span></div>`).join('')}</div>`;
  }
  el.innerHTML = head('🏅 成就與圖鑑', `${got}/${d.achievements.length} 成就・${d.cards.owned}/${d.cards.total} 張卡`, tabs) + `<div class="panel-body co-body">${body}</div>`
    + `<div class="panel-foot"><span class="spacer">達成成就會送金幣</span><button class="btn small ghost" data-co-shop>🛒 雲朵雜貨舖</button></div>`;
}
async function collectionClick(e) {
  const t = e.target;
  const col = state.col || (state.col = { tab: 'ach' });
  if (t.closest('[data-close]')) { closePanel(); return true; }
  const tab = t.closest('[data-col-tab]'); if (tab) { col.tab = tab.dataset.colTab; renderPanel(); const b = document.querySelector('#panel .panel-body'); if (b) b.scrollTop = 0; return true; }
  const ex = t.closest('[data-co-ex]');
  if (ex) {
    const r = await run(() => api.shopExchange(ex.dataset.coEx), { thinking: false });
    if (r && r.ok) { toast(`✦ 換到了「${r.card.name}」`); const r2 = await api.collectionOpen(); if (r2 && r2.ok && state.col) state.col.data = r2.collection; }
    if (state.panel === 'collection') renderPanel();
    return true;
  }
  if (t.closest('[data-co-shop]')) { openShop(); return true; }
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
  list.slice(0, 4).forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'ach-pop';
    el.style.setProperty('--i', i);
    el.innerHTML = `<span class="co-medal">${a.icon}</span><div><small>成就解鎖</small><b>${esc(a.name)}</b></div><span class="g">🪙 +${a.gold}</span>`;
    $('#fx').appendChild(el);
    setTimeout(() => el.remove(), 3600 + i * 300);
  });
}

// 載入的時候畫面可能已經拿到 view 了（renderer.js 的 init 比較早跑完）：補畫一次
if (state.view) applyDecor(state.view);
