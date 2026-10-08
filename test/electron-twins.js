// 🐰 棉棉和朵朵出場：攤位招牌（半身）、許願單、抽卡演出（★★★★ 姊姊也跑來）、抽卡券、
//    跑來櫃台（☕ 下午茶外送 → 艾琳喝奶茶、🎉 升級道賀 → 去抽卡、🔖 許願單的東西買得起了 → 去看看）（xvfb 用，不開 Ollama）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [], weekdaysOnly: true };
  engine.config.window.idleChatterMinutes = 0;
  const wed = new Date(); wed.setHours(10, 20, 0, 0); while (wed.getDay() !== 3) wed.setDate(wed.getDate() + 1);
  let t = wed.getTime();
  engine.nowFn = () => new Date(t);
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  const until = async (code, ms = 8000, msg = code) => { for (let i = 0; i < ms / 100; i++) { if (await js(code)) return; await wait(100); } throw new Error('ASSERT 等不到 ' + msg); };
  const update = () => wc.send('view:update', { view: engine.view() });
  const loaded = (sel) => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].length > 0 && [...document.querySelectorAll(${JSON.stringify(sel)})].every((x) => x.complete && x.naturalWidth > 0)`);
  // 抽卡用的亂數：前九張普通，最後一張 ★★★★（rollRarity、pickCard 輪流用）
  const rolls = [0.1, 0.2, 0.5, 0.6, 0.2, 0.9, 0.7, 0.3, 0.3, 0.1, 0.92, 0.5, 0.4, 0.7, 0.6, 0.2, 0.8, 0.9, 0.999, 0.4];
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      engine.state.player.gold = 3000; update(); await wait(200);
      // 1. 攤位招牌：半身的兩個人，說話的站前面
      await click('#gold'); await wait(900);
      await until(`!!document.querySelector('.sp-stall .tw-bust.on')`);
      assert(await loaded('.sp-stall .tw-bust'), '半身圖讀得到');
      const h = await js(`document.querySelector('.sp-stall .tw-bust.on').getBoundingClientRect().height`);
      assert(h >= 120, '半身夠大：' + h);
      await shot('t01_stall');
      // 2. 許願單：錢不夠的東西旁邊有 🔖；留著之後上面列出還差多少
      engine.state.player.gold = 50; update(); await wait(300);
      await js(`openShop('gift')`); await wait(700);
      await click('[data-sp-wish="ribbon"]'); await wait(500);
      assert(await js(`document.querySelector('[data-sp-wish="ribbon"]').classList.contains('on') && /紅緞帶/.test(document.querySelector('.sp-wishes').textContent) && /差 40/.test(document.querySelector('.sp-wishes').textContent)`), '留著紅緞帶、差 40');
      assert(/留著/.test(await js(`document.querySelector('.st-say').textContent`)), '朵朵說幫你留著');
      await shot('t02_wish_set');
      // 3. 抽十張：朵朵發牌、翻牌；★★★★ 姊姊從右下探出頭
      engine.state.player.gold = 3000; update(); await wait(200);
      let k = 0; engine.rand = () => rolls[(k++) % rolls.length];
      engine.state.collection.sinceTop = require('../src/main/cards').PITY - 10; // 第十張剛好保底 ★★★★
      await js(`openShop('cards')`); await wait(700); // 金幣變了：重新開店拿新的價錢
      await click('[data-sp-draw="10"]');
      await until(`!!document.querySelector('.dr-stage.dealt')`, 4000, '發牌');
      await wait(450); await shot('t03_dealing');
      await until(`!!document.querySelector('.dr-stage.done')`, 8000, '翻完');
      assert(await js(`document.querySelector('.dr-stage').classList.contains('best4') && document.querySelector('.dr-stage').classList.contains('mian-in')`), '★★★★ 姊姊也來');
      assert(await loaded('.dr-stage .tw-bust'), '演出裡的半身讀得到');
      await wait(1700); await shot('t04_reveal_best');
      assert(await js(`(() => { const f = document.querySelector('.dr-card.top .dr-flip'); return getComputedStyle(f).transform !== 'none'; })()`), '最亮的那張翻過來了');
      await click('.dr-ok'); await until(`!document.querySelector('.dr-stage')`, 2000, '收下');
      assert((await js(`document.querySelectorAll('.sp-draw .sp-card').length`)) === 10, '收下之後看到結果');
      // 4. 抽卡券：一張抽一次、不花金幣；演出途中點一下直接翻開
      engine.state.collection.tickets = 2; update(); await wait(300);
      await js(`openShop('cards')`); await wait(700);
      assert(await js(`!!document.querySelector('[data-sp-ticket]') && /×2/.test(document.querySelector('[data-sp-ticket]').textContent)`), '抽卡券按鈕');
      const g0 = engine.state.player.gold;
      await click('[data-sp-ticket]');
      await until(`!!document.querySelector('.dr-stage.n1')`, 3000, '一張的演出');
      await wait(300); await js(`document.querySelector('.dr-stage').click(); 0`); await wait(500);
      assert(await js(`document.querySelector('.dr-stage').classList.contains('done')`), '點一下跳過');
      await shot('t05_ticket');
      await click('.dr-ok'); await wait(400);
      assert(engine.state.collection.tickets === 1 && engine.state.player.gold === g0, '用掉一張、沒花錢');
      await js('closePanel(); closeDialog()'); await wait(300);
      // 5. 下午茶外送：三點多 → 排隊 → 畫面有空就跑來（說完之後艾琳喝奶茶、頭旁邊小聲說話）
      t = wed.getTime() + (15 * 60 - 10 * 60 - 20 + 5) * 60000; // 15:05
      engine.state.twins.teaDay = '';
      assert(engine.state.twins.queue.some((v) => v.kind === 'wish'), '剛剛金幣變多：許願單的紅緞帶已經排隊了');
      engine.state.twins.queue = []; // 先清掉，下面一個一個看
      await engine.tick(); update();
      assert(engine.view().twins.waiting === 1, '排好了');
      await until(`!!document.querySelector('#twinsVisit.tv-tea')`, 9000, '外送來了');
      assert(await js(`document.querySelector('#dialog').classList.contains('hidden')`), '來的時候對話框收起來');
      await wait(1900); await shot('t06_tea');
      assert(await loaded('#twinsVisit .tw-bust') && await loaded('#twinsVisit .tv-prop img'), '外送的圖讀得到');
      await until(`!document.querySelector('#twinsVisit')`, 15000, '外送走了');
      await until(`!document.querySelector('#idleWhisper').classList.contains('hidden')`, 3000, '艾琳小聲說話');
      await wait(600); await shot('t07_erin_tea');
      assert(engine.view().twins.waiting === 0, '演完了');
      // 6. 升級道賀：抽卡券，按「去抽卡」打開雜貨舖的星座卡
      await wait(5000); // 艾琳的奶茶動作演完
      const before = engine.state.collection.tickets;
      require('../src/main/game').grant(engine.state, { xp: 300, gold: 0 }, '測試升級', engine.config.rewards, engine.now());
      const r = engine.settle({ lines: [] }); update();
      assert(r && engine.view().twins.waiting === 1, '道賀排好了');
      await until(`!!document.querySelector('#twinsVisit.tv-congrats')`, 9000, '道賀來了');
      await until(`!document.querySelector('#twinsVisit .tv-actions').classList.contains('hidden')`, 12000, '說完出現按鈕');
      await shot('t08_congrats');
      assert(engine.state.collection.tickets > before, '抽卡券給了');
      await click('#twinsVisit [data-tv="draw"]');
      await until(`state.panel === 'shop' && !!document.querySelector('[data-sp-ticket]')`, 4000, '去抽卡');
      await wait(500); await shot('t09_go_draw');
      await js('closePanel(); closeDialog()'); await wait(300);
      // 7. 許願單：存夠了跑來說 → 去看看（打開那一頁、那一列閃一下）
      engine.state.player.gold = 10; engine.settle({ lines: [] }); // 錢變少：之後再存夠會再說一次
      engine.state.player.gold = 95; engine.settle({ lines: [] }); update();
      await until(`!!document.querySelector('#twinsVisit.tv-wish')`, 9000, '許願單');
      await until(`!document.querySelector('#twinsVisit .tv-actions').classList.contains('hidden')`, 12000, '說完出現按鈕');
      assert(/紅緞帶/.test(await js(`document.querySelector('#twinsVisit').textContent`)), '說是紅緞帶');
      await shot('t10_wish_ready');
      await click('#twinsVisit [data-tv="shop"]');
      await until(`state.panel === 'shop' && !!document.querySelector('.sp-row.flash')`, 4000, '那一列閃一下');
      await wait(200); await shot('t11_wish_go');
      console.log('DONE');
      setTimeout(() => process.exit(0), 200);
    } catch (e) { console.error(e); await shot('t_fail').catch(() => {}); process.exit(1); }
  });
};
