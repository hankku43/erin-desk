// 🎬 開場「雨夜的小白貓」：劇本資料＋名字規則（純資料／純函式，開場視窗、main、測試共用）
// 分鏡定稿：dist/opening/erin-opening-storyboard-v8.png（10/8）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpeningScript = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const DEFAULT_NAME = '艾琳';

  // 接待員的名字：1～8 個字，不能有 我／你／妳／您，不能叫「冒險者」
  function validateName(raw) {
    const name = String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>{}]/g, '').replace(/\s+/g, ' ').trim();
    if (!name) return { ok: false, name: '', error: '請輸入名字（或按「用預設名字」）' };
    if (Array.from(name).length > 8) return { ok: false, name, error: '最多 8 個字' };
    if (/[我你妳您]/.test(name)) return { ok: false, name, error: '名字裡不能有「我、你、妳、您」' };
    if (name === '冒險者') return { ok: false, name, error: '「冒險者」是她叫你的稱呼，換一個吧' };
    return { ok: true, name, error: '' };
  }
  // 冒險者登記的名字：可以空著，最多 12 個字
  function cleanPlayerName(raw) {
    return Array.from(String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>{}]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('');
  }

  // 序章對小貓說的話（存起來；現在段落她會說回來，第 5 階說破時也會用）
  const ECHOES = [
    { say: '明天會放晴的。', echo: '……今天，放晴了呢。' },
    { say: '淋了雨會感冒喔，快回家吧。', echo: '早晚涼，別感冒了喔。' },
    { say: '沒關係，慢慢來就好。', echo: '第一天，慢慢來就好。' },
  ];
  const GENERIC_ECHO = '嗯哼！'; // 跳過、沒選的時候
  const echoLine = (i) => (ECHOES[i - 1] ? ECHOES[i - 1].echo : GENERIC_ECHO);

  // 溫度條：月光涼 0～0.5、星火溫 0.5～0.7、日焰燙 0.7～1
  const HEAT = { warm: 0.5, hot: 0.7, fillSec: 2.4, coolSec: 3.2 };

  // ── 劇本 ──
  // scene：black（黑底）／forest（序章：雨夜的森林，你的視角，整段褪色）／guild（現在：晴天的三號櫃台）
  // actors：舞台上的人和貓；props：程式畫的道具與特效；wait：怎麼往下（click／auto／action／heat／choice／name／register／finale）
  // dlg：{ np, text }（np 空＝你的心聲，深色對話框）；{name} 會換成接待員的名字、{echo} 換成說回來的那句
  const STEPS = [
    { id: 'title', scene: 'black', title: '很久以前，某個下雨的晚上。', wait: { auto: 2600 } },
    { id: 'forest', scene: 'forest', actors: ['kitten'], props: ['shiver'], loc: ['很久以前', '晨風鎮外的森林'], wait: { auto: 3600 } },
    { id: 'cat', scene: 'forest', actors: ['kitten'], props: ['shiver'], dlg: { text: '（……是貓。全身都濕透了。）' }, wait: { action: '把斗篷蓋在牠身上' } },
    { id: 'cloak', scene: 'forest', actors: ['cloak'], dlg: { text: '（……不抖了。）' }, wait: { action: '倒一杯奶茶給牠' } },
    { id: 'cold', scene: 'forest', actors: ['cloak'], dlg: { text: '（背包裡還有一壺奶茶……可是已經冷掉了。）' }, wait: { action: '用火魔法加熱到星火溫', fire: true } },
    { id: 'heat', scene: 'forest', actors: ['cloak'], props: ['fireCg'], dlg: { text: '（按住，讓指尖的火苗溫一下……）' }, wait: { heat: true } },
    { id: 'warm', scene: 'forest', actors: ['cloak'], props: ['fireCg'], dlg: { text: '「……好，星火溫了。」', voice: 'you' }, wait: { click: true } },
    { id: 'words', scene: 'forest', actors: ['cloak'], props: ['tinWarm'], wait: { choice: ECHOES.map((e) => e.say) } },
    { id: 'gone', scene: 'forest', actors: ['cloakEmpty'], props: ['tinEmpty', 'eyes'], dlg: { text: '（小貓舔了一下你的手指，鑽進雨裡。）' }, wait: { click: true }, out: 'white' },
    { id: 'guild', scene: 'guild', actors: ['catSleep'], props: ['items', 'zzz'], loc: ['星盾公會　晨風鎮分會', '三號櫃台・晴天的早上'], wait: { auto: 3400 } },
    { id: 'bell', scene: 'guild', actors: ['catStartled'], props: ['items', 'bell'], wait: { auto: 2000 }, out: 'flash' },
    { id: 'meow', scene: 'guild', actors: ['erin:surprised'], props: ['items', 'transform'], dlg: { np: '？？？', text: '…………\n……歡、歡迎光臨！' }, wait: { click: true } },
    { id: 'intro', scene: 'guild', actors: ['erin:normal'], props: ['items', 'sweat'], dlg: { np: '？？？', text: '歡、歡迎來到星盾公會晨風鎮分會！\n這裡是今天剛開張的三號櫃台，接待員是——' }, wait: { click: true } },
    { id: 'name', scene: 'guild', actors: ['erin:normal'], props: ['items'], dlg: { np: '？？？', text: '歡、歡迎來到星盾公會晨風鎮分會！\n這裡是今天剛開張的三號櫃台，接待員是——', instant: true }, wait: { name: true } },
    { id: 'named', scene: 'guild', actors: ['erin:happy'], props: ['items', 'sparkles'], dlg: { np: '{name}', text: '——接待員是{name}！\n請多指教！' }, wait: { click: true } },
    { id: 'register', scene: 'guild', actors: ['erin:normal@right'], props: ['sign', 'book'], dlg: { np: '{name}', text: '請在這裡寫下冒險者的名字。' }, wait: { register: true } },
    { id: 'registered', scene: 'guild', actors: ['erin:wave@right'], props: ['sign', 'bookDone'], dlg: { np: '{name}', text: '……嗯哼，記下來了。\n歡迎加入星盾公會！', blank: '……那就先空著吧，想寫的時候再告訴{name}。\n歡迎加入星盾公會！' }, wait: { click: true } },
    { id: 'tea', scene: 'guild', actors: ['erin:tea'], props: ['sign', 'bookLeft', 'mugCenter'], dlg: { np: '{name}', text: '先喝點熱的吧。\n……是星火溫喔。' }, wait: { click: true } },
    { id: 'cheer', scene: 'guild', actors: ['erin:cheer'], props: ['items', 'sparkles'], dlg: { np: '{name}', text: '{echo}\n從今天起，冒險者的每一件工作都是一份委託。交給{name}吧！' }, wait: { click: true } },
    { id: 'finale', scene: 'guild', actors: ['erin:wave'], props: ['items'], wait: { finale: true } },
  ];

  const fill = (text, v = {}) => String(text || '').replace(/\{name\}/g, v.name || DEFAULT_NAME).replace(/\{echo\}/g, v.echo || GENERIC_ECHO);

  // 艾琳說的每一句（口吻測試用）：把三種「說回來的話」和沒選的都展開
  function erinLines(name = DEFAULT_NAME) {
    const out = [];
    for (const s of STEPS) {
      if (!s.dlg || !s.dlg.np) continue;
      for (const t of [s.dlg.text, s.dlg.blank].filter(Boolean)) {
        if (/\{echo\}/.test(t)) [...ECHOES.map((e) => e.echo), GENERIC_ECHO].forEach((echo) => out.push(fill(t, { name, echo })));
        else out.push(fill(t, { name }));
      }
    }
    return out;
  }

  return { DEFAULT_NAME, validateName, cleanPlayerName, ECHOES, GENERIC_ECHO, echoLine, HEAT, STEPS, fill, erinLines };
}));
