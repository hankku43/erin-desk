// ✨ 魔法（今日運勢／星環占卜）、📒 回憶（小本子／成就／回憶相簿）：主畫面一個入口，點進去再選
// （renderer.js 之後載入；用到 state、head、esc、openPanel、closePanel、drawFortune、openNotebook、openAch、npcNameR）
const HUB_ART = { shop: (n) => `../../assets/shop/${n}`, st: (n) => `../../assets/stageup/${n}` };
function hubCard({ act, img, pos = 'center', title, sub, note = '', disabled = false }) {
  return `<button class="hub-card" data-hub="${act}" ${disabled ? 'disabled' : ''}><span class="hub-img" style="background-image:url('${img}');background-position:${pos}"></span><span class="hub-txt"><b>${title}</b><small>${sub}</small>${note ? `<em>${note}</em>` : ''}</span></button>`;
}
function renderMagic(el, v) {
  const f = v.fortune, dv = v.divination || {};
  el.innerHTML = head('✨ 魔法', '要用哪一種？') + `<div class="panel-body hub-body">
    ${hubCard({ act: 'fortune', img: HUB_ART.shop('starcharm.png'), title: '🔮 今日運勢', sub: '一天抽一次，有小獎勵', note: f ? `今天是「${esc(f.rank)}」（再點一次看卡片）` : '今天還沒抽' })}
    ${hubCard({ act: 'divine', img: HUB_ART.st('erin_lantern.webp'), pos: '50% 62%', title: '🌌 星環占卜', sub: `問一件事，${esc(npcNameR())}用星環起卦`, note: `${dv.cost || 10} 金幣一次` })}
  </div>`;
}
function renderMemories(el, v) {
  const nb = v.notebook || {}, sh = (v.affection && v.affection.shows) || { album: [] };
  el.innerHTML = head('📒 回憶', '跟艾琳一起的點點滴滴'.replace('艾琳', esc(npcNameR()))) + `<div class="panel-body hub-body">
    ${hubCard({ act: 'notebook', img: HUB_ART.st('erin_hug_notebook.webp'), pos: '50% 30%', title: `📒 ${esc(npcNameR())}的小本子`, sub: '她記得你說過的事', note: nb.enabled === false ? '收起來了' : `${nb.count || 0} 則` })}
    ${hubCard({ act: 'ach', img: HUB_ART.shop('sealbox.png'), title: '🏅 成就', sub: '連續上工、成就牆', note: v.streak >= 2 ? `🔥 連續上工 ${v.streak} 天` : '' })}
    ${hubCard({ act: 'album', img: HUB_ART.st('notebook_doodle.jpg'), title: '🎬 回憶相簿', sub: '開場和越來越熟時的漫畫，可以重看', note: `${sh.album.length + 1} 頁` })}
  </div>`;
}
async function hubClick(e) {
  const b = e.target.closest('[data-hub]');
  if (!b) return false;
  const a = b.dataset.hub;
  if (a === 'fortune') { closePanel(); drawFortune(); }
  else if (a === 'divine') openPanel('divine');
  else if (a === 'notebook') openNotebook();
  else if (a === 'ach') openAch();
  else if (a === 'album') openPanel('album');
  return true;
}
