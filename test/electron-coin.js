// 🪙→SVG 金幣：Windows 10 沒有 Emoji 13 的金幣字，改用 coin.svg。每個會出現金幣的地方都拍一張（xvfb 用，不開 Ollama＝離線）
//   COIN_BEFORE=1：拍舊版用，只拍不檢查
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';
const strict = !process.env.COIN_BEFORE;

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (strict && !c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  // 畫面上沒有 U+1FA99 的字，而且每個 .coin 都真的畫出來了（有大小、背景是 coin.svg）
  const noEmojiCoin = async (where) => {
    assert(!(await js(`document.body.innerText.includes('\\u{1FA99}')`)), where + '：畫面上還有金幣 emoji');
    const bad = await js(`[...document.querySelectorAll('.coin')].filter((c) => c.offsetParent).filter((c) => { const r = c.getBoundingClientRect(); return r.width < 8 || r.height < 8 || !/coin\\.svg/.test(getComputedStyle(c).backgroundImage); }).length`);
    assert(bad === 0, where + '：有 ' + bad + ' 個金幣圖示沒畫出來');
  };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // coin.svg 讀得到
      assert(await js(`new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 0); i.onerror = () => ok(false); i.src = 'coin.svg'; })`), 'coin.svg 載入');
      engine.state.player.gold = 1234;
      wc.send('view:update', { view: engine.view() }); await wait(300);
      // 1. 狀態欄
      assert(await js(`!!document.querySelector('#gold .coin') && document.querySelector('#gold').textContent.trim() === '1234'`), '狀態欄：圖示＋數字');
      await noEmojiCoin('狀態欄');
      await shot('c01_hud');
      // 2. 雜貨舖（禮物價格、標題列的錢）
      await click('#gold'); await wait(700); await flush();
      assert((await js(`document.querySelectorAll('.sp-coin .coin').length`)) >= 9 && (await js(`!!document.querySelector('#panel .panel-head .coin')`)), '雜貨舖價格');
      await noEmojiCoin('雜貨舖');
      await shot('c02_shop');
      // 3. 成就分頁：獎勵金幣、布置櫃台的圖示換成 🎐
      await click('[data-sp-tab="ach"]'); await wait(500);
      assert((await js(`document.querySelectorAll('.co-gold .coin').length`)) >= 20, '成就獎勵');
      assert(await js(`[...document.querySelectorAll('.co-a')].some((a) => a.textContent.includes('布置櫃台') && a.querySelector('.co-medal').textContent === '\\u{1F390}')`), '布置櫃台 🎐');
      await noEmojiCoin('成就');
      await shot('c03_ach');
      await js('closePanel()'); await wait(300);
      // 4. 交付任務的報酬卡
      const q = engine.plan.quests.find((x) => x.objectives.length >= 2);
      for (let i = 0; i < q.objectives.length; i++) await engine.setObjective(q.id, i, true);
      await flush(); wc.send('view:update', { view: engine.view() }); await wait(300);
      await js(`openPanel('submit', ${JSON.stringify(q.id)}); 0`); await wait(500);
      assert(await js(`!!document.querySelector('.reward-card .rc-num .coin')`), '報酬卡');
      await noEmojiCoin('報酬卡');
      await shot('c04_submit');
      await js('closePanel()'); await wait(300);
      // 5. 獎勵飄字、成就跳出來、連續上工提示
      await js(`celebrate({ xp: 24, gold: 12 }); showAchievements([{ icon: '\\u{1F390}', name: '布置櫃台', gold: 10 }]); toast('🔥 連續上工第 3 天　' + (typeof COIN === 'string' ? COIN : '\\u{1FA99} ') + '+5', 4000, { html: true }); 0`);
      await wait(450);
      await js(`[...document.querySelectorAll('.float-reward, .ach-pop')].forEach((x) => x.style.animationPlayState = 'paused'); 0`);
      assert((await js(`document.querySelectorAll('.float-reward .coin, .ach-pop .coin, #toast .coin').length`)) === 3, '飄字、成就、提示');
      await noEmojiCoin('飄字');
      await shot('c05_fx');
      await js(`document.querySelectorAll('.float-reward, .ach-pop').forEach((x) => x.remove()); document.querySelector('#toast').classList.add('hidden'); 0`);
      // 6. 運勢卡
      await js(`showFortuneCard({ tier: 5, date: '2026-10-07', rank: '大吉', advice: '適合把拖了很久的小事一口氣做完', item: '藍色的筆' }, { xp: 10, gold: 8 }); 0`);
      await wait(1600);
      assert(await js(`!!document.querySelector('#fortuneCard .fc-reward .coin')`), '運勢卡');
      await noEmojiCoin('運勢卡');
      await shot('c06_fortune');
      await js('hideFortuneCard()'); await wait(500);
      // 7. 冒險日誌的數字格
      await js(`openJournal(); 0`); await wait(1200); await flush();
      assert(await js(`[...document.querySelectorAll('.jn-tile')].some((t) => t.querySelector('.ji .coin') && t.textContent.includes('金幣'))`), '日誌金幣格');
      await noEmojiCoin('日誌');
      await shot('c07_journal');
      await js('closePanel()'); await wait(300);
      // 8. 占卜（標題列的錢）
      await js(`openPanel('divine'); 0`); await wait(800);
      assert(await js(`!!document.querySelector('.dv-gold .coin')`), '占卜');
      await noEmojiCoin('占卜');
      await shot('c08_divine');
      await js('closePanel()'); await wait(300);
      // 9. 任務板：新手任務標題、交付過的任務、紀錄
      await engine.submit(q.id); await flush();
      engine.startTutorial();
      wc.send('view:update', { view: engine.view() }); await wait(300);
      await js(`openPanel('board'); 0`); await wait(600);
      assert(await js(`!!document.querySelector('.tut-head .coin')`), '新手任務');
      await noEmojiCoin('任務板');
      await shot('c09_board');
      console.log('COIN TEST OK');
    } catch (e) { console.error('COIN TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => app.quit(), 300);
  });
};
