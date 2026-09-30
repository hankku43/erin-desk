// 縮小後點貓咪展開：圖片要立刻換成貓娘（沒有累積提醒的情況）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (c) => wc.executeJavaScript(c);
  const click = () => js(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
  const img = () => js(`(document.querySelector('#npcImg').getAttribute('src')||'').split('/').pop()+' | body='+document.body.className+' | mini='+String(!!document.body.classList.contains('mini'))`);
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background='#6f8fb3'`);
      await wait(2500);
      await js(`document.querySelector('#dlgMini').click()`); await wait(1000);
      console.log('mini:', await img());
      await click(); await wait(600);
      console.log('right after expand click:', await img());
      fs.writeFileSync(path.join(OUT, 'expand.png'), (await win.capturePage()).toPNG());
      await wait(2500);
      console.log('after greet:', await img(), '| text:', await js(`document.querySelector('#dlgText').textContent.slice(0,30)`));
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
