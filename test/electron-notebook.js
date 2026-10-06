// 📒 艾琳的小本子：聊天時記下來（跳提示）、偷看、劃掉一則、全部劃掉、熟了之後最後一頁的畫、關掉再打開（xvfb 用，不開 Ollama＝離線）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.state.notebook = null;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const items = () => js(`[...document.querySelectorAll('.nb-item .nb-text')].map((x) => x.textContent)`);
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 1. 聊天時說了自己的事：跳「記下來了」的提示
      await js(`openDialog(); document.querySelector('#chatRow').classList.remove('hidden'); document.querySelector('#chatInput').value='我超喜歡無糖綠茶'; document.querySelector('#chatSend').click();`);
      for (let i = 0; i < 20 && !(await js(`!document.querySelector('#toast').classList.contains('hidden')`)); i++) await wait(100);
      const tt = await js(`document.querySelector('#toast').textContent`);
      assert(/📒 艾琳記下來了：喜歡無糖綠茶/.test(tt), '跳提示：' + tt);
      await shot('n01_toast'); await flush();
      // 再多說幾件事（直接記進小本子；連續聊太快會被當成洗版）
      for (const s of ['我的生日是10/8', '這週簡報好趕，壓力好大', '我最近在忙新品上市的企劃', '我家養了一隻貓叫麻糬', '我不太喜歡香菜']) engine.noteFrom(s);
      engine.saveState();
      // 2. 從選單打開小本子：分類列出來，艾琳害羞
      await js('closeDialog()');
      wc.send('ui:open', 'notebook'); await wait(700);
      assert(await js(`state.panel === 'notebook' && document.querySelectorAll('.nb-sec').length === 5`), '五種分類都有');
      const list = await items();
      assert(list.length === 6 && list.some((x) => /10\/8（每年）生日/.test(x)) && list.includes('不喜歡香菜'), '列出來了：' + JSON.stringify(list));
      assert(/偷看|工作紀錄|給你看/.test(await js(`document.querySelector('#dlgText').textContent`)) || (await js('state.queue.length')) > 0, '艾琳說了被偷看的話');
      await flush(); await wait(200);
      await shot('n02_peek');
      // 3. 劃掉一則：先畫線再消失
      await js(`document.querySelector('.nb-item:nth-child(1) .nb-del').scrollIntoView(); 0`);
      const first = (await items())[0];
      await js(`document.querySelector('.nb-del').click()`); await wait(200);
      await shot('n03_strike');
      await wait(700); await flush();
      const after = await items();
      assert(after.length === 5 && !after.includes(first), `「${first}」劃掉了`);
      assert(engine.notebookView().count === 5, '主程式也少一則');
      // 4. 全部劃掉：要再確認一次
      await js(`document.querySelector('[data-nb-all]').click()`); await wait(200);
      assert(await js(`!!document.querySelector('[data-nb-all-yes]')`), '先問一次');
      await shot('n04_confirm');
      await js(`document.querySelector('[data-nb-all-no]').click()`); await wait(150);
      assert((await items()).length === 5, '按「不要」就不劃');
      await js(`document.querySelector('[data-nb-all]').click()`); await wait(150);
      await js(`document.querySelector('[data-nb-all-yes]').click()`); await wait(500); await flush();
      assert((await items()).length === 0 && (await js(`!!document.querySelector('.nb-empty')`)), '空白的一頁');
      await shot('n05_empty');
      // 5. 很熟了（第 5 階）：最後一頁的畫
      engine.aff().points = 300; engine.aff().stage = 5;
      for (const s of ['我週末都去爬山', '下週三口試', '我考上研究所了！']) engine.noteFrom(s);
      engine.saveState();
      await js('closePanel()'); wc.send('ui:open', 'notebook'); await wait(700); await flush();
      assert(await js(`!!document.querySelector('.nb-sketch.s2')`), '最後一頁畫了冒險者');
      await shot('n06_sketch');
      // 6. 聊天時小本子開著：安靜更新
      const n0 = (await items()).length;
      engine.state.chat = []; engine.aff().spam = [];
      await js(`openDialog(); document.querySelector('#chatRow').classList.remove('hidden'); document.querySelector('#chatInput').value='我超喜歡烏龍茶'; document.querySelector('#chatSend').click();`); await wait(900); await flush();
      assert((await items()).length === n0 + 1, '開著的小本子多一則');
      // 7. 關掉：顯示「收起來了」，按鈕可以再打開
      engine.setNotebook(false);
      await js('closePanel()'); wc.send('ui:open', 'notebook'); await wait(700); await flush();
      assert(await js(`!!document.querySelector('.nb-off [data-nb-on]')`), '收起來的提示');
      await shot('n07_off');
      await js(`document.querySelector('[data-nb-on]').click()`); await wait(400); await flush();
      assert(engine.nbCfg().enabled === true && !(await js(`!!document.querySelector('.nb-off')`)), '再打開');
      console.log('DONE');
    } catch (e) { console.error('FAIL', e); }
    app.quit();
  });
};
