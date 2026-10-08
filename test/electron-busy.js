// 等 AI 的時候介面照常可以用：連續勾選不會被晚到的回話蓋掉；右鍵選單分組（xvfb 用，搭配慢的假 Ollama）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, engine, app, menuTemplate }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const tick = (qid, i) => js(`(()=>{const el=document.querySelector('input[data-obj="${qid}"][data-idx="${i}"]'); el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await wait(1500);
      // 1. 右鍵選單：第一層只剩常用的，其他在子選單
      const tpl = menuTemplate();
      const top = tpl.filter((m) => m.type !== 'separator');
      console.log('MENU', top.map((m) => m.label + (m.submenu ? ' ▸' : '')).join(' | '));
      assert(top.length <= 12, '第一層最多 12 項：' + top.length);
      assert(tpl.some((m) => /週計畫/.test(m.label) && m.submenu) && tpl.some((m) => /^🤖 AI/.test(m.label) && m.submenu), '有分組');
      // 2. 等 AI（每句 4 秒）的時候連勾兩個目標
      await js(`closeDialog(); openPanel('board')`); await wait(400);
      const q = engine.plan.quests.find((x) => x.active) || engine.plan.quests[0];
      const t0 = Date.now();
      await tick(q.id, 0); await wait(300); await tick(q.id, 1); await wait(600);
      await shot('b01_ticked_while_waiting');
      const done = () => engine.plan.quests.find((x) => x.id === q.id).objectives.slice(0, 2).map((o) => o.done);
      assert(done().every(Boolean), '兩個都已經寫進計畫檔：' + JSON.stringify(done()));
      assert(Date.now() - t0 < 2500, '不用等 AI');
      assert(await js(`[...document.querySelectorAll('input[data-obj="${q.id}"]')].slice(0,2).every((x)=>x.checked)`), '畫面上兩個都是勾的');
      // 3. 等 AI 說完：畫面沒有被舊的回應蓋掉
      await wait(9000); await shot('b02_after_reply');
      assert(await js(`[...document.querySelectorAll('input[data-obj="${q.id}"]')].slice(0,2).every((x)=>x.checked)`), 'AI 回話後還是兩個都勾著');
      assert(/好的|交給艾琳|嗯哼/.test(await js(`document.querySelector('#dlgText').textContent`)), '艾琳的話晚一點出現：' + await js(`document.querySelector('#dlgText').textContent`));
      // 4. 聊天在等回覆的時候，也能勾目標
      await js(`openDialog(); document.querySelector('#chatRow').classList.remove('hidden'); document.querySelector('#chatInput').value='今天好嗎'; document.querySelector('#chatSend').click();`);
      await wait(500); await tick(q.id, 2); await wait(600);
      assert(engine.plan.quests.find((x) => x.id === q.id).objectives[2].done, '聊天等回覆時也能勾');
      await shot('b03_tick_during_chat');
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
