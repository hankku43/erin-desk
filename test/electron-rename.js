// ✏️ 幫接待員改名字（右鍵 ⚙ 設定與資料）：表單、規則、改名後她的那句、視窗標題、選單、待機小字、說明小卡、雜貨舖、成就；再改回艾琳（xvfb 用，離線）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app, menuTemplate }) => {
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
  const type = (sel, v) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; })(); 0`);
  const leftover = (s) => String(s).split('艾琳的任務櫃台').join('').includes('艾琳');
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 1. 右鍵 ⚙ 設定與資料 → 幫接待員改名字
      const gear = menuTemplate().find((m) => /設定與資料/.test(m.label));
      const item = gear.submenu.find((m) => /幫接待員改名字/.test(m.label || ''));
      assert(item && /現在叫「艾琳」/.test(item.label), '選單：' + (item && item.label));
      item.click(); await wait(500);
      assert(await js(`state.panel === 'rename' && document.querySelector('#rnName').value === '艾琳'`), '打開改名表單');
      assert(!(await js(`!!document.querySelector('#rnDefault')`)), '已經是艾琳：沒有「改回艾琳」');
      await shot('rn01_form');
      // 2. 不合規則：在表單裡說哪裡不行，不送出
      await type('#rnName', '我是誰'); await click('#rnSave'); await wait(300);
      assert(/我/.test(await js(`document.querySelector('#rnErr').textContent`)) && engine.config.npc.name === '艾琳' && (await js(`state.panel`)) === 'rename', '名字裡有「我」');
      await shot('rn02_error');
      // 3. 改成小雪：她用新名字說一句、名牌、視窗標題、選單都換
      await type('#rnName', '小雪'); await click('#rnSave'); await wait(1200);
      assert(engine.config.npc.name === '小雪' && engine.npc.names().self === '小雪', '改名寫進設定');
      assert((await js(`document.querySelector('#npcName').textContent`)) === '小雪', '名牌');
      assert(win.getTitle().startsWith('小雪的任務櫃台'), '視窗標題：' + win.getTitle());
      assert(/小雪/.test(await js(`document.querySelector('#dlgText').textContent`)), '她說的那句：' + (await js(`document.querySelector('#dlgText').textContent`)));
      await wait(800); await shot('rn03_renamed'); await flush();
      const menuText = JSON.stringify(menuTemplate().map((m) => [m.label, (m.submenu || []).map((x) => x.label)]));
      assert(!leftover(menuText) && /小雪的小本子/.test(menuText), '選單');
      // 4. 說明小卡、待機小字、面板台詞
      const tips = await js(`[...document.querySelectorAll('[data-tip]')].map((e) => e.dataset.tip).join('｜')`);
      assert(!leftover(tips) && /只留小雪/.test(tips) && /偷看小雪的小本子/.test(tips), '說明小卡：' + tips);
      await js(`closeDialog(); idleDebug.showWhisper('艾琳才、才沒有睡著喔。', 4000); 0`); await wait(300);
      assert((await js(`document.querySelector('#idleWhisper').textContent`)) === '小雪才、才沒有睡著喔。', '待機小字');
      await shot('rn04_whisper');
      await js(`openPanel('report'); 0`); await wait(500);
      assert(/小雪會幫你整理/.test(await js(`document.querySelector('#dlgText').textContent`)), '面板台詞');
      await js('closePanel(); closeDialog()'); await wait(200);
      // 5. 雜貨舖、成就：商品說明和雙胞胎的話
      engine.state.player.gold = 500; wc.send('view:update', { view: engine.view() }); await wait(200);
      await js(`openShop('gift'); 0`); await wait(900);
      const shopText = await js(`document.querySelector('#panel').innerText`);
      assert(!leftover(shopText) && /小雪/.test(shopText), '雜貨舖：' + (shopText.match(/.{0,12}艾琳.{0,12}/) || [''])[0]);
      await shot('rn05_shop');
      await js(`openAch(); 0`); await wait(700);
      assert(!leftover(await js(`document.querySelector('#panel').innerText`)), '成就');
      await js('closePanel(); closeDialog()'); await wait(200);
      // 6. 聊天（離線）：罵新名字一樣扣好感
      const p0 = engine.aff().points = 40;
      await js(`document.querySelector('#chatInput').value = '小雪是白痴'; sendChat(); 0`); await wait(1200); await flush();
      assert(engine.aff().points < p0, '罵新名字扣好感');
      await js('closeDialog()');
      // 7. 改回艾琳
      item.click(); await wait(400); // 舊的選單項目一樣能打開表單
      assert(await js(`!!document.querySelector('#rnDefault') && document.querySelector('#rnName').value === '小雪'`), '改回艾琳的按鈕');
      await shot('rn06_form_again');
      await click('#rnDefault'); await wait(1000); await flush();
      assert(engine.config.npc.name === '艾琳' && win.getTitle().startsWith('艾琳的任務櫃台') && (await js(`document.querySelector('#npcName').textContent`)) === '艾琳', '改回艾琳');
      const tips2 = await js(`[...document.querySelectorAll('[data-tip]')].map((e) => e.dataset.tip).join('｜')`);
      assert(/只留艾琳/.test(tips2) && !/小雪/.test(tips2), '說明小卡換回來');
      console.log('RENAME OK');
    } catch (e) {
      console.error('RENAME FAIL', e && e.stack || e);
      try { await shot('rn_fail'); } catch (_) { /* 截不到就算了 */ }
    }
    app.quit();
  });
};
