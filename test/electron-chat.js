// 聊天改進度測試
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG());
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background='#6f8fb3'`);
      await wait(2500);
      await js(`document.querySelector('[data-act=chat]').click();document.querySelector('#chatInput').value=${JSON.stringify(process.env.CHAT_TEXT || '新品標示全部弄完了，交付吧')};document.querySelector('#chatSend').click()`);
      await wait(2500); await shot('c1_proposal');
      console.log('items', await js(`[...document.querySelectorAll('.pp-item')].map(x=>x.textContent).join(' | ')`));
      await js(`document.querySelector('#ppYes').click()`); await wait(1500); await shot('c2_confirmed');
      console.log('player', JSON.stringify(engine.view().player), 'active', engine.view().active && engine.view().active.title);
      console.log('md', engine.planText.split('\n').filter(l=>/^- \[x\]/.test(l)).join(' / '));
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
