// 🕘 剛剛的對話：對話框右上角的按鈕打開最近幾則對話（xvfb 用，搭配每次回不同句子的假 Ollama）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true }; // 跳過新手教學
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] }; // 不要讓午餐、下班提醒在測試中間插話
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const rows = () => js(`[...document.querySelectorAll('#panel .log-row')].map((r) => ({ who: r.classList.contains('me') ? 'me' : 'npc', text: r.querySelector('.log-say').textContent }))`);
  const shown = () => js(`document.querySelector('#dlgText').textContent`);
  const say = async (text) => {
    await js(`openDialog(); document.querySelector('#chatRow').classList.remove('hidden'); document.querySelector('#chatInput').value=${JSON.stringify(text)}; document.querySelector('#chatSend').click();`);
    await wait(300); await flush(); await wait(200);
  };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel()');
      // 1. 聊三句
      await say('早安艾琳'); await say('今天要做什麼'); await say('好，我先去倒杯水');
      const now = await shown();
      // 2. 按 🕘：之前的話都在，下方對話框正在說的那句不重複
      await js(`document.querySelector('#dlgLog').click()`); await wait(400);
      await shot('l01_log_open');
      assert(await js(`state.panel === 'log' && document.querySelector('#dlgLog').classList.contains('on')`), '按 🕘 打開紀錄');
      let r = await rows();
      console.log('ROWS', JSON.stringify(r.map((x) => `${x.who}:${x.text.slice(0, 12)}`)));
      assert(r.filter((x) => x.who === 'me').map((x) => x.text).join('|') === '早安艾琳|今天要做什麼|好，我先去倒杯水', '你說的三句都在，而且照順序');
      assert(!r.some((x) => x.text === now), '對話框正在顯示的那句不重複列出：' + now);
      assert(r[r.length - 1].who === 'me', '最下面是你最後說的話（她的回答在下方對話框）');
      assert(await js(`(()=>{const b=document.querySelector('#panel .panel-body'); return b.scrollTop + b.clientHeight >= b.scrollHeight - 8;})()`), '捲在最下面（最新的）');
      // 3. 開著紀錄繼續聊：即時更新，剛剛那句往上移進紀錄
      await say('等等要開會');
      r = await rows();
      assert(r.some((x) => x.text === now), '上一句移進紀錄');
      assert(r[r.length - 1].text === '等等要開會', '新說的話出現在最下面');
      await shot('l02_log_live');
      // 4. 「思考中」的時候，上一句不會兩邊都看不到
      await js(`showThinking()`); await wait(200);
      r = await rows();
      const lastNpc = await js(`state.log.filter((e)=>e.who==='npc').slice(-1)[0].text`);
      assert(r.some((x) => x.text === lastNpc), '思考中：她上一句回到紀錄裡');
      await js(`showLine(state.lastLine)`); await wait(200);
      // 5. 說很多句：最多顯示 10 則
      await js(`enqueue(Array.from({ length: 15 }, (_, i) => ({ text: '提醒 ' + (i + 1), emotion: 'normal' })))`); await flush();
      r = await rows();
      assert(r.length === 10, '最多 10 則：' + r.length);
      assert(r[r.length - 1].text === '提醒 14' && (await shown()) === '提醒 15', '最新的在下方對話框，紀錄停在前一句');
      assert(await js(`state.log.length`) <= 12, '只留 12 則');
      await shot('l03_log_ten');
      // 6. 往上捲在看舊的時候，新的話不會把畫面拉回最下面
      await js(`document.querySelector('#panel .panel-body').scrollTop = 0`);
      await js(`enqueue([{ text: '又一句', emotion: 'normal' }])`); await flush();
      assert(await js(`document.querySelector('#panel .panel-body').scrollTop`) === 0, '往上捲時不跳');
      // 7. 再按一次 🕘 關掉；在對話框上往上滾也能打開
      await js(`document.querySelector('#dlgLog').click()`); await wait(300);
      assert(await js(`state.panel === null && !document.querySelector('#dlgLog').classList.contains('on')`), '再按一次關掉');
      await js(`document.querySelector('#dlgText').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))`); await wait(300);
      assert(await js(`state.panel === 'log'`), '往上滾打開紀錄');
      // 8. 任務板開著的時候往上滾，不會被換掉
      await js(`closePanel(); openPanel('board')`); await wait(300);
      await js(`document.querySelector('#dlgText').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))`); await wait(300);
      assert(await js(`state.panel === 'board'`), '任務板開著時不搶');
      await js(`closePanel()`);
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
