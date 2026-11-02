// 💗 好感升階第 5 階「特別的冒險者」（終章）：舞台模式的劇本資料＋稱呼規則（純資料／純函式，終章視窗、main、測試共用）
// 用開場那套舞台（opening.css 的 960×540 舞台、對話框、系統提示），圖在 assets/stageup/
// 故事：點星祭的晚上，描了兩次金邊的星星 → 說破那個雨夜（貓的視角）→ 落榜 → 門鈴那天早上 → 第 4 階的約定 → 第一次叫你的名字（稱呼設定）→ 燈籠的願望 → 燈籠飛上夜空
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinaleScript = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const DEFAULT_CALL = '冒險者';
  const ECHO_SAYS = ['明天會放晴的。', '淋了雨會感冒喔，快回家吧。', '沒關係，慢慢來就好。']; // 跟 opening-script.js 的 ECHOES 同一組（序章對小貓說的那句）

  // 她怎麼叫你：1～8 個字，不能有「我」，不能跟她自己的名字一樣
  function validateCall(raw, { self = '艾琳' } = {}) {
    const call = String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>{}]/g, '').replace(/\s+/g, ' ').trim();
    if (!call) return { ok: false, call: '', error: '請輸入稱呼（或選「維持冒險者」）' };
    if (Array.from(call).length > 8) return { ok: false, call, error: '最多 8 個字' };
    if (/我/.test(call)) return { ok: false, call, error: '稱呼裡不能有「我」' };
    if (call === self) return { ok: false, call, error: `「${self}」是她自己的名字，換一個吧` };
    return { ok: true, call, error: '' };
  }

  // ── 立繪（1024×1536 全畫布去背圖）：ax, ay＝兩眼中間（原圖座標），換姿勢時臉停在同一個位置 ──
  const POSES = {
    brush: { file: 'erin_gold_brush.webp', ax: 543, ay: 357 },     // 踮腳描金邊，舌頭跑出來，臉頰沾到金漆
    point: { file: 'erin_point_star.webp', ax: 502, ay: 372 },     // 指著左下角、回頭、臉紅慌張
    remember: { file: 'erin_remember.webp', ax: 512, ay: 400 },    // 捧著祭典紙燈籠，眼睛往下
    confess: { file: 'erin_confess.webp', ax: 521, ay: 439 },      // 雙手捧臉、頭頂冒煙（煙是程式畫的）
    teary: { file: 'erin_teary.webp', ax: 512, ay: 336 },          // 第 4 階的含淚的笑
    pinky: { file: 'erin_pinky.webp', ax: 553, ay: 410 },          // 第 4 階的打勾勾
    heart: { file: 'erin_heart_flame.webp', ax: 510, ay: 375 },    // 第 4 階的愛心小豆
    starlight: { file: 'erin_starlight.webp', ax: 509, ay: 419 },  // 雙手背在身後、往你這邊傾身
    call: { file: 'erin_call_name.webp', ax: 512, ay: 341 },       // 第一次叫你的名字
    wish: { file: 'erin_lantern_wish.webp', ax: 515, ay: 394 },    // 把燈籠轉過來給你看
  };
  // 鏡頭：s＝縮放、ex/ey＝兩眼中間在舞台上的位置（對話框從 y=398 開始，下半身藏在對話框後面）
  const CAMS = {
    mid: { s: 0.40, ex: 640, ey: 150 },
    wide: { s: 0.30, ex: 700, ey: 100 },   // 拉遠：指星星的手指要露出來
    close: { s: 0.50, ex: 600, ey: 178 },
    low: { s: 0.44, ex: 620, ey: 222 },    // 捧臉冒煙那張：頭頂上要留空間給煙
    right: { s: 0.40, ex: 770, ey: 150 },  // 左邊留給登記簿、系統提示
    lantern: { s: 0.62, ex: 470, ey: 92 }, // 燈籠紙面要大到寫得下願望
  };
  // 原圖上的位置（特效疊在立繪上，跟著鏡頭走）
  const SPOTS = {
    brushTip: [28, 45], cheekGold: [610, 423], finger: [15, 1257],
    steam: [[440, 138], [565, 112], [690, 142]], // 頭頂（呆毛旁邊）
    lanternRemember: [502, 830], lanternWish: [505, 750],
    wishPaper: { x: 452, y: 646, w: 106, h: 206 }, // 燈籠正面空白的紙（兩手中間）
    heartFlame: [175, 420],
  };
  // 背景（1672×941）：mem＝回憶濾鏡、rain＝下雨、soft＝模糊當景深、kb＝慢慢推近、night＝深色半透明對話框
  const SCENES = {
    black: null,
    hall: { img: 'scene_hall_starmap.jpg' },
    hallSoft: { img: 'scene_hall_starmap.jpg', soft: true },
    star: { img: 'cg_star_twice.jpg', kb: true },
    mCloak: { img: 'cg_cat_cloak.jpg', mem: true, rain: true, kb: true },
    mFire: { img: 'cg_cat_fire.jpg', mem: true, rain: true, kb: true },
    mLook: { img: 'cg_cat_lookback.jpg', mem: true, rain: true, kb: true },
    mNotice: { img: 'cg_fail_notice.jpg', mem: true, rain: true, kb: true },
    mGuild: { img: '../opening/guild.jpg', mem: true },
    aurora: { img: 'aurora_dream.jpg', dream: true, kb: true },
    sky: { img: 'cg_sky_lanterns.jpg', kb: true, night: true },
  };
  const STAR = { x: 133, y: 268 }; // 星圖左下角「冒險者的那顆」（舞台座標）
  const FIRE = { x: 525, y: 355 }; // 貓視角那張的指尖小火（舞台座標）

  // ── 劇本 ──
  // erin：'姿勢@鏡頭'；fx：特效；dlg：{ np, text }（np 空＝你的心聲或你說的話）；{name}＝她的名字、{call}＝稱呼、{say}＝序章那句
  // 稱呼設定（callSet）之前她都叫「冒險者」（還沒叫過你的名字）；之後用 {call}
  // keep：稱呼維持「冒險者」時換這句
  const STEPS = [
    { id: 'title', scene: 'black', title: '點星祭的晚上。', wait: { auto: 2600 } },
    { id: 'hall', scene: 'hall', fx: ['glimmer'], loc: ['點星祭的晚上', '星盾公會　晨風鎮分會・大廳'], wait: { auto: 3200 } },
    { id: 'brush', scene: 'hall', erin: 'brush@mid', fx: ['glimmer', 'brushTip'], dlg: { np: '{name}', text: '嗯～……再、一點點……' }, wait: { click: true } },
    { id: 'done', scene: 'hall', erin: 'brush@mid', fx: ['glimmer', 'brushPop'], dlg: { np: '{name}', text: '……好！這顆也閃閃發亮了！' }, wait: { click: true } },
    { id: 'cheek', scene: 'hall', erin: 'brush@mid', fx: ['glimmer', 'cheekGold'], dlg: { text: '（……臉頰上，沾到金漆了。）' }, wait: { click: true } },
    { id: 'point', scene: 'hall', erin: 'point@wide', fx: ['glimmer', 'starRing', 'fingerTrail'], dlg: { np: '{name}', text: '啊、冒險者！你看，左下角那顆——\n那顆，是冒險者的星星喔。' }, wait: { click: true } },
    { id: 'twice', scene: 'star', fx: ['twinkle'], dlg: { text: '（……只有那一顆，金邊描了兩圈。）' }, wait: { click: true } },
    { id: 'deny', scene: 'hall', erin: 'point@mid', fx: ['glimmer', 'sweat'], dlg: { np: '{name}', text: '才、才不是因為特別！\n只是描的時候……手抖了一下而已！', shake: true }, wait: { click: true } },
    { id: 'quiet', scene: 'hallSoft', erin: 'remember@mid', fx: ['lanternGlow'], dlg: { np: '{name}', text: '……吶，冒險者。' }, wait: { click: true } },
    { id: 'remember', scene: 'hallSoft', erin: 'remember@close', fx: ['lanternGlow'], dlg: { np: '{name}', text: '還記得嗎？\n很久以前，一個下雨的晚上……' }, wait: { click: true }, out: 'white' },
    // 回憶：貓的視角（褪色、下雨）
    { id: 'mCloak', scene: 'mCloak', loc: ['很久以前', '晨風鎮外的森林'], dlg: { np: '{name}', text: '那天晚上，好冷好冷。\n……然後，有一件好暖好暖的斗篷，蓋了下來。' }, wait: { click: true } },
    { id: 'mFire', scene: 'mFire', fx: ['fireGlow'], dlg: { text: '「……好，星火溫了。」' }, wait: { click: true } },
    { id: 'mPick', scene: 'mFire', fx: ['fireGlow'], wait: { pick: true } }, // 沒看過開場（或跳過了）：在這裡選那天說的話
    { id: 'mWords', scene: 'mFire', fx: ['fireGlow'], dlg: { text: '「{say}」' }, wait: { click: true } },
    { id: 'mKept', scene: 'mFire', fx: ['fireGlow'], dlg: { np: '{name}', text: '……那句話，艾琳一直記得喔。\n一個字都沒有忘。' }, wait: { click: true } },
    { id: 'mLook', scene: 'mLook', dlg: { np: '{name}', text: '可是那隻小貓，連一聲謝謝都沒說，\n就鑽進雨裡跑掉了。' }, wait: { click: true } },
    { id: 'mNotice', scene: 'mNotice', dlg: { np: '{name}', text: '……因為那天，艾琳剛落榜。\n難過到，連人形都變不回來。' }, wait: { click: true }, out: 'white' },
    { id: 'mBell', scene: 'mGuild', cat: 'startled', fx: ['bell'], loc: ['開張那天的早上', '三號櫃台'], dlg: { np: '{name}', text: '後來，三號櫃台開張的那天早上……\n門鈴一響，艾琳就嚇得變回了人形。' }, wait: { click: true } },
    { id: 'mNap', scene: 'mGuild', cat: 'startled', dlg: { np: '{name}', text: '那、那才不是因為偷睡被抓到喔。' }, wait: { click: true }, out: 'flash' },
    { id: 'confess', scene: 'hallSoft', erin: 'confess@low', fx: ['steam'], dlg: { np: '{name}', text: '……是因為，\n進來的是冒險者。' }, wait: { click: true } },
    { id: 'steamNar', scene: 'hallSoft', erin: 'confess@low', fx: ['steam', 'steamMore'], dlg: { text: '（……頭上冒煙了。）' }, wait: { click: true } },
    { id: 'why', scene: 'hallSoft', erin: 'teary@mid', dlg: { np: '{name}', text: '一直不敢說……怕冒險者早就忘了。\n也怕被一隻貓記那麼久，會覺得很奇怪。' }, wait: { click: true } },
    { id: 'promise', promise: true, wait: { click: true } }, // 第 4 階的約定（PROMISE_STEPS；沒有回答就跳過）
    { id: 'ask', scene: 'hall', erin: 'starlight@mid', fx: ['glimmer'], dlg: { np: '{name}', text: '所以……那個……\n艾琳，可以叫叫看冒險者的名字嗎？' }, wait: { click: true } },
    { id: 'reg', scene: 'hall', erin: 'starlight@right', fx: ['book'], dlg: { np: '{name}', text: '……啊。登記簿上冒險者那一格，一直是空的呢。\n現在，可以告訴艾琳嗎？' }, wait: { register: true } }, // 登記的名字空著才演
    { id: 'callSet', scene: 'hall', erin: 'starlight@right', wait: { call: true } }, // ⚙ 系統提示：稱呼設定（重看不演）
    { id: 'called', scene: 'hall', erin: 'call@close', fx: ['glimmer', 'sparkles', 'warm'], dlg: { np: '{name}', text: '…………{call}。', slow: true }, wait: { click: true } },
    { id: 'called2', scene: 'hall', erin: 'call@close', fx: ['glimmer', 'sparkles', 'warm'], dlg: { np: '{name}', text: '嘿嘿……叫出來了。\n以後，就這樣叫你喔。', keep: '嘿嘿……果然，還是這樣叫最順口了。\n艾琳的冒險者，就是你喔。' }, wait: { click: true } },
    { id: 'wish', scene: 'hall', erin: 'wish@lantern', fx: ['lanternGlow', 'wishText'], dlg: { np: '{name}', text: '這是艾琳的燈籠。上面寫的願望……\n不、不准笑喔！' }, wait: { click: true } },
    { id: 'wishNar', scene: 'hall', erin: 'wish@lantern', fx: ['lanternGlow', 'wishText'], dlg: { text: '（燈籠上寫著：「一直當{call}的接待員。」）' }, wait: { click: true }, out: 'white' },
    { id: 'skyOpen', scene: 'sky', fx: ['rise'], wait: { auto: 3200 } }, // 先安靜看一下（兩個人的背影不被對話框擋住）
    { id: 'sky', scene: 'sky', fx: ['rise'], dlg: { text: '（大家的燈籠一盞一盞飛上夜空，變成了新的星星。）' }, wait: { click: true } },
    { id: 'last', scene: 'sky', fx: ['rise'], dlg: { np: '{name}', text: '以後也請多指教喔，{call}。' }, wait: { click: true } },
    { id: 'finale', scene: 'sky', fx: ['rise'], wait: { finale: true } },
  ];
  // 第 4 階的約定（shows.promise 1～3）
  const PROMISE_STEPS = {
    1: { scene: 'aurora', erin: 'pinky@mid', fx: ['sparkles'], dlg: { np: '{name}', text: '可是冒險者說，要一起去看冰湖的極光。\n……約好了喔！這次，艾琳不會再跑掉了。' } },
    2: { scene: 'hallSoft', erin: 'teary@mid', dlg: { np: '{name}', text: '可是冒險者說，會等艾琳練好。\n……所以艾琳決定了，要一直努力下去。' } },
    3: { scene: 'hallSoft', erin: 'heart@mid', fx: ['heartGlow'], dlg: { np: '{name}', text: '可是冒險者說，要陪艾琳練……\n你看，小豆最近，有大一點點喔！' } },
  };
  // 燈籠上的願望（直書兩行；{call} 太長就把字縮小）
  const wishLines = (call) => [`一直當${call}的`, '接待員。'];

  // 台詞用「艾琳」寫：改過名就換成現在的名字（先換，稱呼、序章那句是冒險者決定的字，不動）
  const fill = (text, v = {}) => (v.name && v.name !== '艾琳' ? String(text || '').split('艾琳').join(v.name) : String(text || ''))
    .replace(/\{name\}/g, v.name || '艾琳')
    .replace(/\{call\}/g, v.call || DEFAULT_CALL)
    .replace(/\{say\}/g, v.say || ECHO_SAYS[0]);

  // 這次要演的步驟：重看不問名字和稱呼；登記的名字有了就不問；第 4 階沒回答就跳過約定
  function plan({ replay = false, playerName = '', promise = 0 } = {}) {
    const out = [];
    for (const s of STEPS) {
      if (s.id === 'reg' && (replay || playerName)) continue;
      if (s.id === 'callSet' && replay) continue;
      if (s.promise) {
        const p = PROMISE_STEPS[promise];
        if (!p) continue;
        out.push({ ...s, ...p, id: 'promise', promise: promise });
        continue;
      }
      out.push(s);
    }
    return out;
  }

  // 她說的每一句（口吻測試用）：三種約定、維持冒險者的版本都展開
  function erinLines({ name = '艾琳', call = DEFAULT_CALL } = {}) {
    const out = [];
    const add = (d) => { if (!d || !d.np) return; for (const t of [d.text, d.keep].filter(Boolean)) out.push(fill(t, { name, call })); };
    for (const s of STEPS) add(s.dlg);
    for (const p of Object.values(PROMISE_STEPS)) add(p.dlg);
    return out;
  }
  // 用到的圖（測試檢查檔案在不在）
  const files = () => [...new Set([...Object.values(POSES).map((p) => p.file), ...Object.values(SCENES).filter(Boolean).map((s) => s.img)])];

  return { DEFAULT_CALL, ECHO_SAYS, validateCall, POSES, CAMS, SPOTS, SCENES, STAR, FIRE, STEPS, PROMISE_STEPS, wishLines, fill, plan, erinLines, files };
}));
