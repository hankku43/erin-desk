// 🛒 雲朵雜貨舖：兔族雙胞胎「棉棉」「朵朵」在公會大廳擺的小攤（純函式，不碰檔案）
// 賣兩種東西：送艾琳的禮物（買了直接送，一天第一份加好感）、外觀裝飾（主題配色、櫃台吊飾／擺設，買了永久擁有可以換）
// 星座卡在 cards.js；成就、連續上工在 achievements.js
'use strict';

// 店員：雲朵茶舖的兔族雙胞胎（姊姊棉棉穩重、妹妹朵朵活潑），平常在茶舖，上班時間在公會大廳擺攤
const KEEPERS = {
  mian: { name: '棉棉', desc: '姊姊。說話慢慢的、很有禮貌，負責算帳。' },
  duo: { name: '朵朵', desc: '妹妹。很有精神，負責介紹商品和抽卡。' },
};

// 禮物：like＝艾琳有多喜歡（一天第一份的好感），0＝惡作劇
const GIFTS = [
  { id: 'tea', name: '溫奶茶', from: '雲朵茶舖', price: 25, like: 3, desc: '甜度「剛剛好多一點點」。艾琳一天要喝五杯的那種。' },
  { id: 'fish', name: '小魚乾', from: '胖狐狸食堂', price: 20, like: 2, desc: '狐嬸曬的。貓族都喜歡……吧？' },
  { id: 'fishbread', name: '魚形麵包', from: '霜糖麵包坊', price: 35, like: 4, desc: '紅豆餡。艾琳每次都說沒有媽媽的好吃，然後一次買兩個。' },
  { id: 'bubble', name: '珍珠奶茶', from: '雲朵茶舖', price: 45, like: 4, desc: '「有珍珠的魔法奶茶」。聽說艾琳一直很想試試看。' },
  { id: 'flower', name: '藍鈴花束', from: '北門外的坡地', price: 55, like: 3, desc: '春天開滿坡地的藍色小花，聞起來像野餐。' },
  { id: 'envelope', name: '蓋了蠟封章的舊信封', from: '慢慢先生的舊書攤', price: 70, like: 4, desc: '艾琳的寶物大多是在這裡挖到的。' },
  { id: 'ribbon', name: '紅緞帶', from: '鐘樓旁的布行', price: 90, like: 3, desc: '跟艾琳頭上那條很像的紅色緞帶。' },
  { id: 'seal', name: '遠方公會的蠟封章', from: '行商的貓頭鷹', price: 160, like: 5, desc: '艾琳的蠟封章收藏，目前是二十七個。' },
  { id: 'cucumber', name: '黃瓜', from: '菜市場', price: 5, like: 0, joke: true, desc: '……真的要買嗎？' },
];

// 主題配色：狀態欄、對話框、面板標題列
const THEMES = [
  { id: 'navy', name: '公會海軍藍', price: 0, colors: ['#34437a', '#f0b23a', '#fffdf7'], desc: '星盾公會的制服顏色。' },
  { id: 'sakura', name: '藍鈴花祭・櫻粉', price: 300, colors: ['#b2557a', '#ffd0dc', '#fff7fa'], desc: '春天野餐的粉色桌巾。' },
  { id: 'forest', name: '北門坡地・森林綠', price: 300, colors: ['#2f6b55', '#e8c46a', '#f7fbf4'], desc: '坡地上的樹蔭和陽光。' },
  { id: 'latte', name: '雲朵茶舖・奶茶棕', price: 300, colors: ['#7a5236', '#f1c58a', '#fffaf2'], desc: '剛剛好多一點點甜的顏色。' },
  { id: 'night', name: '點星祭・星夜紫', price: 450, colors: ['#3d2f73', '#ffd66b', '#f7f4ff'], desc: '提著燈籠遊街的那個晚上。' },
  { id: 'frost', name: '霜月村・初雪白', price: 600, colors: ['#5a7da6', '#cfe6ff', '#ffffff'], desc: '艾琳的故鄉，下初雪的那一天。' },
];

// 櫃台的吊飾（掛在艾琳左上方）和擺設（放在艾琳腳邊）；畫法在 renderer/art.js
const ORNAMENTS = [
  { id: 'bell', slot: 'hang', name: '小銀鈴', price: 150, desc: '風大的時候會叮叮響。艾琳說那是霜月村在打招呼。' },
  { id: 'chime', slot: 'hang', name: '玻璃風鈴', price: 180, desc: '晨風鎮的風很大，一整天都在唱歌。' },
  { id: 'starcharm', slot: 'hang', name: '星星吊飾', price: 200, desc: '大廳星圖上的金星，小一號的。' },
  { id: 'lantern', slot: 'hang', name: '點星祭燈籠', price: 260, desc: '上面可以寫一個願望。' },
  { id: 'bluebell', slot: 'desk', name: '藍鈴花盆栽', price: 160, desc: '要記得澆水，艾琳會幫忙。' },
  { id: 'pillow', slot: 'desk', name: '魚形麵包抱枕', price: 200, desc: '軟軟的，看起來很好吃，不能吃。' },
  { id: 'piggy', slot: 'desk', name: '鈴鐺撲滿', price: 220, desc: '搖起來的聲音是世界上第二好聽的聲音。' },
  { id: 'pigeon', slot: 'desk', name: '三號鴿子', price: 240, desc: '公會閣樓的傳信鴿。很愛在窗台上睡覺。' },
  { id: 'sealbox', slot: 'desk', name: '蠟封章木盒', price: 300, desc: '放蠟封章收藏的木盒，打開會有一點點蠟的味道。' },
];
const SLOTS = { hang: '吊飾', desk: '擺設' };

const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
const GIFT = byId(GIFTS), THEME = byId(THEMES), ORN = byId(ORNAMENTS);

function blank() {
  return {
    owned: { navy: true }, equip: { theme: 'navy', hang: null, desk: null },
    gifts: {}, giftDay: '', giftsToday: 0, seals: 27, // 艾琳的蠟封章收藏（送一個多一個）
    visits: 0,
  };
}
const giftTier = (stage) => (stage >= 4 ? 'high' : stage >= 3 ? 'mid' : 'low');

// 給畫面看的商品清單
function catalog(sh, gold) {
  const can = (p) => gold >= p;
  return {
    gifts: GIFTS.map((g) => ({ ...g, given: sh.gifts[g.id] || 0, afford: can(g.price) })),
    themes: THEMES.map((t) => ({ ...t, owned: !!sh.owned[t.id], equipped: sh.equip.theme === t.id, afford: can(t.price) })),
    ornaments: ORNAMENTS.map((o) => ({ ...o, owned: !!sh.owned[o.id], equipped: sh.equip[o.slot] === o.id, afford: can(o.price) })),
    slots: SLOTS,
  };
}

// 雙胞胎的台詞（她們不是艾琳，不受艾琳的口吻規則限制；叫對方「客人」）
const TWINS = {
  hello: [['duo', '歡迎光臨雲朵雜貨舖～今天想看點什麼呀？'], ['mian', '歡迎光臨。茶舖那邊的奶茶，這裡也買得到喔。'], ['duo', '客人客人！今天的星座卡，朵朵覺得手感很好喔！']],
  helloBack: [['mian', '又見面了，歡迎回來。'], ['duo', '是常客耶！朵朵記得你～']],
  poor: [['mian', '嗯……金幣好像還差一點點。完成委託之後再來吧。'], ['duo', '差一點點而已！去勾幾個目標就夠了～']],
  owned: [['mian', '這個客人已經有了喔。']],
  gift: [['duo', '要送給艾琳的嗎？朵朵幫你綁個蝴蝶結～'], ['mian', '包好了。艾琳就在櫃台，直接拿給她吧。']],
  giftJoke: [['duo', '黃、黃瓜？客人你是認真的嗎……朵朵不負責喔！'], ['mian', '……我們什麼都沒看到。']],
  buyDecor: [['mian', '謝謝惠顧。要擺在哪裡，可以在「裝飾」那一頁換。'], ['duo', '三號櫃台要變可愛了～']],
  buyTheme: [['duo', '換顏色了！整個櫃台都不一樣了耶～'], ['mian', '很適合喔。']],
  draw: [['duo', '來來來，抽一張！'], ['duo', '星星會選中誰呢～']],
  drawGood: [['duo', '哇！是 ★★★！朵朵的手也跟著發抖了！'], ['mian', '……好運呢。']],
  drawBest: [['duo', '★★★★！！姊姊快看！'], ['mian', '這張……我們擺攤以來第一次看到這麼亮的。']],
  dup: [['mian', '重複的卡會換成星屑。星屑存夠了，可以來換想要的那張。']],
  exchange: [['mian', '星屑收到了。這張是你的。'], ['duo', '圖鑑又多一格了～']],
};
function twinsLine(key, rnd = Math.random) {
  const pool = TWINS[key] || TWINS.hello;
  const [who, text] = pool[Math.floor(rnd() * pool.length) % pool.length];
  return { who, name: KEEPERS[who].name, text };
}

module.exports = { KEEPERS, GIFTS, THEMES, ORNAMENTS, SLOTS, GIFT, THEME, ORN, blank, giftTier, catalog, TWINS, twinsLine };
