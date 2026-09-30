// xvfb 下的冒煙測試：截圖各畫面
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => {
    const img = await win.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };
  wc.on('console-message', (_e, level, msg) => console.log('[renderer]', msg));
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.body.style.background='linear-gradient(135deg,#5b7fa6,#9bb7cf)'`);
      await wait(3500);
      await shot('1_greet');
      await js(`document.querySelector('[data-act=board]').click()`); await wait(800);
      await shot('2_board');
      const q1 = await js('state.view.quests[0].id');
      await js(`document.querySelector('input[data-obj="${q1}"][data-idx="0"]').click()`); await wait(2500);
      await shot('3_objective');
      await js(`document.querySelector('input[data-obj="${q1}"][data-idx="1"]').click()`); await wait(1500);
      await js(`document.querySelector('input[data-obj="${q1}"][data-idx="2"]').click()`); await wait(2500);
      await js(`document.querySelector('[data-submit="${q1}"]').click()`); await wait(600);
      await shot('4_submit_form');
      await js(`document.querySelector('#sReport').value='標示補完，申請已寄出';document.querySelector('#sSend').click()`); await wait(900);
      await shot('5_reward');
      await wait(4000);
      await shot('6_after');
      await js(`document.querySelector('[data-act=daily]').click()`); await wait(2500);
      await shot('7_daily');
      await js(`document.querySelector('[data-act=report]').click()`); await wait(800);
      await shot('8_report');
      await js(`document.querySelector('[data-act=chat]').click();document.querySelector('#chatInput').value='今天先做哪個？';document.querySelector('#chatSend').click()`); await wait(2500);
      await shot('9_chat');
      const errs = await js(`window.__errs||[]`);
      console.log('DONE', JSON.stringify(engine.view().player));
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
