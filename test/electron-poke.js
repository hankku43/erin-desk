// 點角色：第一下打招呼，之後是閒聊；連戳會喵
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (c) => wc.executeJavaScript(c);
  const click = () => js(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
  const text = () => js(`document.querySelector('#dlgText').textContent`);
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background='#6f8fb3'`);
      await wait(3000); console.log('startup:', await text());
      await js(`document.querySelector('#dlgClose').click()`); await wait(300);
      await click(); await wait(2500); console.log('click 1:', await text());
      await click(); await wait(2500); console.log('click 2:', await text());
      fs.writeFileSync(path.join(OUT, 'poke.png'), (await win.capturePage()).toPNG());
      for (let i = 0; i < 4; i++) { await click(); await wait(1800); }
      console.log('click 6:', await text());
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
