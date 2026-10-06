// 🌌 星座卡圖鑑：露米納大陸的星座（大多是 lore 裡出現過的東西），用金幣抽、重複的換成星屑、星屑可以換想要的那張
// 純函式；卡面的星星位置由 renderer/art.js 用卡片 id 算（同一張卡每次都長一樣）
'use strict';

const RARITY = {
  1: { name: '★', weight: 62, dust: 2, cost: 20 },
  2: { name: '★★', weight: 28, dust: 5, cost: 50 },
  3: { name: '★★★', weight: 8.5, dust: 15, cost: 120 },
  4: { name: '★★★★', weight: 1.5, dust: 40, cost: 300 },
};
const PRICE = { one: 30, ten: 270 }; // 十抽：最後一張保底 ★★★ 以上
const PITY = 50; // 連續 50 抽沒有 ★★★★，下一張一定是

const CARDS = [
  // ★
  { id: 'bluebell', r: 1, n: 6, name: '藍鈴花座', desc: '春天坡地開花的時候，它剛好在北門的正上方。' },
  { id: 'kite', r: 1, n: 5, name: '風箏座', desc: '風箏日那天，大家說星星也被風吹歪了一點。' },
  { id: 'clock', r: 1, n: 6, name: '鐘樓座', desc: '總是比其他星座慢五分鐘升起——晨風鎮的人都這麼說。' },
  { id: 'milktea', r: 1, n: 5, name: '奶茶杯座', desc: '一天看到五次會有好事。艾琳說的。' },
  { id: 'pigeon', r: 1, n: 6, name: '傳信鴿座', desc: '翅膀張開的方向，就是信要送去的方向。' },
  { id: 'stew', r: 1, n: 5, name: '燉肉鍋座', desc: '狐嬸說，看到它就知道晚餐要開了。' },
  { id: 'bookstall', r: 1, n: 4, name: '半開書攤座', desc: '只有一半亮著，另一半明天才開。' },
  { id: 'glasses', r: 1, n: 6, name: '眼鏡座', desc: '巴特爺爺找了四十年，原來在天上。' },
  { id: 'silverbell', r: 1, n: 5, name: '小銀鈴座', desc: '霜月村的窗台上，每一家都掛著一顆。' },
  { id: 'piggy', r: 1, n: 5, name: '撲滿座', desc: '存夠一整年的星光，就能換一個願望。' },
  // ★★
  { id: 'lantern', r: 2, n: 7, name: '旅人的提燈', desc: '迷路的冒險者看著它，就找得到回公會的路。' },
  { id: 'owleyes', r: 2, n: 2, name: '梟眼雙星', desc: '大家都說很像梟長的眼睛。梟長否認。' },
  { id: 'shield', r: 2, n: 7, name: '金盾座', desc: '星盾公會的徽章，就是照著它畫的。' },
  { id: 'giant', r: 2, n: 7, name: '巨人之手座', desc: '瑪格大姐說，小時候以為那是奶奶在揮手。' },
  { id: 'twins', r: 2, n: 6, name: '雙兔座', desc: '兩顆一樣亮的星，誰也不讓誰。棉棉和朵朵最喜歡的星座。' },
  { id: 'sealstar', r: 2, n: 6, name: '蠟封章座', desc: '圓圓的一圈，中間一顆特別亮——像剛蓋好的章。' },
  { id: 'paperlamp', r: 2, n: 6, name: '點星燈籠座', desc: '點星祭的晚上，它會比平常亮一點。' },
  { id: 'ribbon', r: 2, n: 6, name: '紅緞帶座', desc: '霜月村的媽媽們，會照著它幫女兒綁頭髮。' },
  // ★★★
  { id: 'greatbell', r: 3, n: 8, name: '大鈴星', desc: '霜月村的守護星。下雪的夜裡，它會輕輕地響。' },
  { id: 'fishbread', r: 3, n: 7, name: '魚形麵包座', desc: '艾琳自己取的名字。只有她看得出形狀。' },
  { id: 'starring', r: 3, n: 9, name: '星環座', desc: '奶奶教的星環占，就是從這一圈星開始數。' },
  { id: 'firstsnow', r: 3, n: 7, name: '初雪座', desc: '每年初雪那天最亮。那天也是艾琳的生日。' },
  // ★★★★
  { id: 'meteor', r: 4, n: 3, name: '流星', desc: '有人剛完成了一件很重要的委託。看到的時候，小聲說「辛苦啦」。' },
  { id: 'adventurer', r: 4, n: 9, name: '冒險者之星', desc: '三號櫃台貼的第一顆星。描了兩次金邊。' },
];
const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));

function blank() { return { cards: {}, dust: 0, draws: 0, sinceTop: 0, firstAt: {} }; }

// 抽一張的稀有度：保底優先；rnd 是 0～1
function rollRarity(rnd, { atLeast = 1, top = false } = {}) {
  if (top) return 4;
  const rs = [1, 2, 3, 4].filter((r) => r >= atLeast);
  const total = rs.reduce((n, r) => n + RARITY[r].weight, 0);
  let x = rnd() * total;
  for (const r of rs) { x -= RARITY[r].weight; if (x < 0) return r; }
  return rs[rs.length - 1];
}
function pickCard(rnd, r) {
  const pool = CARDS.filter((c) => c.r === r);
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}
// 抽 n 張（n=10 時最後一張保底 ★★★）；回傳 [{ card, isNew, dust }]
function draw(col, n, rnd, now = Date.now()) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const guarantee = n >= 10 && i === n - 1 && !out.some((x) => x.card.r >= 3);
    const r = rollRarity(rnd, { atLeast: guarantee ? 3 : 1, top: col.sinceTop + 1 >= PITY });
    const card = pickCard(rnd, r);
    const isNew = !col.cards[card.id];
    col.cards[card.id] = (col.cards[card.id] || 0) + 1;
    if (isNew) col.firstAt[card.id] = now;
    const dust = isNew ? 0 : RARITY[r].dust;
    col.dust += dust;
    col.draws += 1;
    col.sinceTop = r === 4 ? 0 : col.sinceTop + 1;
    out.push({ card, isNew, dust });
  }
  return out;
}
// 用星屑換一張還沒有的卡
function exchange(col, id, now = Date.now()) {
  const c = CARD[id];
  if (!c) throw new Error('沒有這張卡');
  if (col.cards[id]) throw new Error('這張已經有了');
  const cost = RARITY[c.r].cost;
  if (col.dust < cost) throw new Error(`星屑不夠（要 ${cost}，現在 ${col.dust}）`);
  col.dust -= cost;
  col.cards[id] = 1; col.firstAt[id] = now;
  return { card: c, cost };
}
function view(col) {
  const owned = (id) => col.cards[id] || 0;
  return {
    cards: CARDS.map((c) => ({ ...c, rarity: RARITY[c.r].name, count: owned(c.id), cost: RARITY[c.r].cost })),
    owned: CARDS.filter((c) => owned(c.id)).length, total: CARDS.length,
    dust: col.dust, draws: col.draws, pityLeft: PITY - col.sinceTop, price: PRICE,
  };
}

module.exports = { RARITY, PRICE, PITY, CARDS, CARD, blank, rollRarity, draw, exchange, view };
