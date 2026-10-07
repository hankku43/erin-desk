// 🛒 雲朵雜貨舖：點金幣開店、送艾琳禮物（她的反應＋成就跳出來）、買主題和吊飾／擺設、抽星座卡、成就與圖鑑、星屑換卡、錢不夠、🔥 連續上工（xvfb 用，不開 Ollama＝離線）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  let seed = 11; engine.rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      engine.state.player.gold = 3000;
      wc.send('view:update', { view: engine.view() }); await wait(200);
      // 1. 點狀態欄的金幣 → 雜貨舖（雙胞胎打招呼）
      await click('#gold'); await wait(600);
      assert(await js(`state.panel === 'shop' && !!document.querySelector('.sp-keeper .sp-say')`), '點金幣開店');
      assert((await js(`document.querySelectorAll('.sp-row').length`)) >= 6 && (await js(`[...document.querySelectorAll('.sp-act')].every((b) => b.getBoundingClientRect().height >= 30)`)), '一列一個商品、按鈕夠大');
      assert((await js(`document.querySelector('#panel .panel-body').scrollHeight / document.querySelector('#panel .panel-body').clientHeight`)) < 3, '不用捲太多');
      assert(await js(`document.querySelector('#dialog').classList.contains('hidden')`), '雙胞胎說話時，艾琳的泡泡收起來');
      assert((await js(`document.querySelectorAll('[data-sp-gift]').length`)) === 9, '九種禮物');
      await wait(300);
      assert(await js(`document.querySelectorAll('.sp-ico img.gift').length === 9 && [...document.querySelectorAll('.sp-ico img, .sp-face img')].every((x) => x.complete && x.naturalWidth > 0)`), '禮物和店員是 AI 畫的圖');
      await shot('s01_gifts');
      // 2. 送奶茶：艾琳的反應、成就「一點心意」跳出來
      await click('[data-sp-gift="tea"]');
      for (let i = 0; i < 30 && !(await js(`!!document.querySelector('.ach-pop')`)); i++) await wait(100);
      assert(await js(`!!document.querySelector('.ach-pop')`), '成就跳出來');
      await wait(300); await flush();
      const said = await js(`state.log.map((x) => x.text).join('|')`);
      assert(/奶茶|甜度/.test(said), '艾琳收到奶茶的反應：' + said.slice(-120));
      assert(engine.state.shop.gifts.tea === 1 && engine.state.achievements.gift1, '記下來了');
      await js(`[...document.querySelectorAll('.ach-pop')].forEach((x) => x.style.animationPlayState = 'paused'); 0`);
      await shot('s02_gift');
      // 3. 裝飾：買主題（星夜紫）、吊飾（小銀鈴）、擺設（藍鈴花盆栽）
      await click('[data-sp-tab="decor"]'); await wait(300);
      await click('[data-sp-buy="night"]'); await wait(500); await flush();
      assert(await js(`document.body.dataset.theme === 'night'`), '主題換上了');
      await click('[data-sp-buy="bell"]'); await wait(400); await flush();
      await click('[data-sp-buy="bluebell"]'); await wait(600); await flush();
      assert(await js(`!!document.querySelector('#decor .d-hang.on img') && !!document.querySelector('#decor .d-desk.on img')`), '吊飾、擺設擺上去了');
      await wait(300);
      assert(await js(`[...document.querySelectorAll('#decor img, .sp-ico img, .sp-face img')].every((x) => x.complete && x.naturalWidth > 0)`), 'AI 畫的圖都讀得到');
      await js(`document.querySelector('#panel .panel-body').scrollTop = 0; 0`); await wait(200);
      await shot('s03_decor');
      // 只看艾琳和櫃台
      await js('closePanel(); closeDialog()'); await wait(900);
      await shot('s04_erin_decor');
      // 4. 抽十張星座卡
      wc.send('ui:open', 'shop'); await wait(600);
      await click('[data-sp-tab="cards"]'); await wait(300);
      await click('[data-sp-draw="10"]'); await wait(1600); await flush();
      assert((await js(`document.querySelectorAll('.sp-draw .sp-card').length`)) === 10, '十張');
      assert(await js(`[...document.querySelectorAll('.sp-draw .sp-card')].some((x) => /r[34]/.test(x.className))`), '保底 ★★★');
      await js(`document.querySelector('#panel .panel-body').scrollTop = 0; 0`); await wait(300);
      await shot('s05_draw');
      await click('[data-sp-fold]'); await wait(200);
      assert(await js(`!document.querySelector('.sp-draw') && document.querySelectorAll('.co-card').length === 24`), '收起後就是圖鑑');
      // 5. 錢不夠：雙胞胎說「差一點」（不是錯誤）
      engine.state.player.gold = 3;
      await click('[data-sp-tab="gift"]'); await wait(200);
      await click('[data-sp-gift="seal"]'); await wait(500);
      assert(/差|還不夠|再來/.test(await js(`document.querySelector('.sp-say').textContent`)), '錢不夠的台詞');
      assert(engine.state.player.gold === 3, '沒有扣錢');
      // 6. 成就與圖鑑
      engine.state.streak = { cur: 5, best: 5, last: require('../src/main/game').todayISO(engine.now()), days: 9 };
      wc.send('view:update', { view: engine.view() }); await wait(300);
      assert((await js(`document.querySelectorAll('[data-sp-tab]').length`)) === 3, '雜貨舖只剩禮物、裝飾、星座卡');
      await click('#hudStreak'); await wait(700); // 點狀態欄的 🔥：成就（自己一個面板）
      assert(await js(`state.panel === 'ach' && document.querySelectorAll('.co-a').length > 20`), '成就牆是自己的面板');
      assert(/連續上工 5 天/.test(await js(`document.querySelector('.co-streak').textContent`)), '連續上工');
      assert(await js(`!document.querySelector('#hudStreak').classList.contains('hidden') && document.querySelector('#hudStreak').textContent === '🔥5'`), '狀態欄的 🔥5');
      await shot('s06_achievements');
      engine.state.collection.dust = 500;
      wc.send('ui:open', 'shop'); await wait(700);
      await click('[data-sp-tab="cards"]'); await wait(300);
      const r2 = await js(`api.shopOpen().then((r) => { state.sp.data = r.shop; renderPanel(); return r.shop.cards.owned; })`);
      await js(`document.querySelector('[data-co-ex]:not([disabled])').click(); 0`); await wait(700);
      const owned2 = await js(`state.sp.data.cards.owned`);
      assert(owned2 === r2 + 1, `星屑換卡：${r2} → ${owned2}`);
      await shot('s07_book');
      console.log('DONE');
    } catch (e) { console.error('FAIL', e); }
    app.quit();
  });
};
