// 變身特效：連拍幾格看動畫
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (c) => wc.executeJavaScript(c);
  const click = () => js(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
  const shot = async (n) => fs.writeFileSync(path.join(OUT, n + '.png'), (await win.capturePage()).toPNG());
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background='#6f8fb3'`);
      await wait(2500);
      console.log('full bounds', JSON.stringify(win.getBounds()));
      await js(`document.querySelector('#dlgMini').click()`);
      await wait(200); await shot('s1_shrink_a'); await wait(250); await shot('s2_shrink_b');
      await wait(900); await shot('s3_mini'); console.log('mini bounds', JSON.stringify(win.getBounds()));
      await click();
      await wait(260); await shot('m1'); await wait(200); await shot('m2'); await wait(220); await shot('m3'); await wait(250); await shot('m4'); await wait(500); await shot('m5');
      console.log('full bounds after', JSON.stringify(win.getBounds()));
      await wait(800);
      console.log('classes:', await js(`document.body.className+' / '+document.querySelector('#npcWrap').className+' / morph='+!!document.querySelector('#morph')`));
      console.log('img:', await js(`document.querySelector('#npcImg').getAttribute('src').split('/').pop()`));
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
