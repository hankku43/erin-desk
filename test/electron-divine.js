// ✨ 占卜魔法巡禮（xvfb 用）：魔法陣、報數、此刻起卦、一事不二占、金幣不夠、紀錄、聊天直接開
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})()`);
  const type = (sel, val) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); el.value=${JSON.stringify(val)}; el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const pick = (m) => js(`(()=>{const el=document.querySelector('input[name=dvm][value=${m}]'); el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
  const gold = () => engine.state.player.gold;
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      engine.state.player.gold = 50; wc.send('view:update', { view: engine.view() });
      await wait(2600);
      // 1. 對話選單的 ✨ 占卜 → 寫問題
      await click('[data-act=divine]'); await wait(500);
      await type('#dvQ', '這週的發表會會順利嗎？'); await wait(150); await shot('d01_ask');
      assert(/丙午|年/.test(await text('.dv-methods')), '此刻起卦顯示農曆時間：' + await text('.dv-methods'));
      // 2. 魔法陣：點兩下停下兩圈星環
      await click('#dvStart'); await wait(900); await shot('d02_circle');
      await click('#dvCircle'); await wait(1150); await shot('d03_outer_stopped');
      await click('#dvCircle'); await wait(1150); await shot('d04_both_stopped');
      const [a, b] = await js(`[state.dv.a, state.dv.b]`);
      assert(a >= 1 && a <= 24 && b >= 1 && b <= 16, `星環數字 ${a}、${b}`);
      await wait(1500); await shot('d05_casting');
      await wait(2600); await shot('d06_result');
      assert(gold() === 40, '花了 10 金幣：' + gold());
      const rec = engine.state.divinations[0];
      assert(rec.result.inputs[0] === a && rec.result.inputs[1] === b && rec.method === 'circle', '魔法陣的數字就是起卦的數字');
      assert(new RegExp(rec.result.ben.name).test(await text('#dvReading')), '艾琳的解讀有提到本卦：' + await text('#dvReading'));
      // 3. 解析
      await click('#dvDetail'); await wait(300); await shot('d07_detail');
      assert(/體用/.test(await text('.dv-detail')) && /餘/.test(await text('.dv-detail')), '解析有算式與體用');
      // 4. 換個說法再問同一件事 → 一事不二占，不扣錢
      await click('#dvAgain'); await wait(300);
      await type('#dvQ', '請問這週發表會會順利嗎'); await click('#dvStart'); await wait(1200); await shot('d08_repeat');
      assert(gold() === 40 && /一事不二占/.test(await text('#panel')), '重複問不扣錢');
      // 5. 報數
      await click('#dvAgain'); await wait(300);
      await type('#dvQ', '要不要接下新的專案'); await pick('numbers'); await wait(200);
      await type('#dvA', '3'); await type('#dvB', '8'); await shot('d09_numbers_input');
      await click('#dvStart'); await wait(3800); await shot('d10_numbers_result');
      assert(gold() === 30 && engine.state.divinations[0].result.ben.name === '火地晉', '報數 3、8 → 上離下坤 火地晉：' + engine.state.divinations[0].result.ben.name);
      // 6. 此刻起卦
      await click('#dvAgain'); await wait(300);
      await type('#dvQ', '今天下午適合開會嗎'); await pick('time'); await wait(200);
      await click('#dvStart'); await wait(3800); await shot('d11_time_result');
      assert(engine.state.divinations[0].method === 'time' && gold() === 20, '此刻起卦');
      // 7. 金幣不夠
      engine.state.player.gold = 5; wc.send('view:update', { view: engine.view() }); await wait(200);
      await click('#dvAgain'); await wait(300);
      await type('#dvQ', '午餐要吃什麼'); await click('#dvStart'); await wait(900); await shot('d12_poor');
      assert(/星粉不夠/.test(await text('.dv-notice')) && gold() === 5, '金幣不夠：不扣錢、艾琳提醒');
      // 8. 最近的占卜：點一下再看一次
      await click('[data-dv-recent]'); await wait(2800); await shot('d13_recent');
      assert(/之前的占卜/.test(await text('.panel-head')), '最近的占卜可以再看');
      // 9. 紀錄頁顯示花費
      await click('[data-close]'); await wait(400);
      await js(`openPanel('board'); state.boardTab='hist'; renderPanel();`); await wait(400); await shot('d14_history');
      assert(/−10/.test(await text('.hist')), '紀錄顯示 −10 金幣');
      await js('closePanel()'); await wait(200);
      // 10. 聊天說「幫我占卜…」直接打開
      await js(`openDialog(); document.querySelector('#chatRow').classList.remove('hidden'); document.querySelector('#chatInput').value='幫我占卜明天的面試'; document.querySelector('#chatSend').click();`); await wait(700); await shot('d15_chat_trigger');
      assert(await js(`state.panel === 'divine' && document.querySelector('#dvQ').value === '明天的面試'`), '聊天直接開占卜並帶入問題：' + await js(`document.querySelector('#dvQ') && document.querySelector('#dvQ').value`));
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
