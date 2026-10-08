// 縮小化測試
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log(name, JSON.stringify(win.getBounds())); };
  wc.on('console-message', (e) => console.log('[renderer]', e.message));
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background='#6f8fb3'`);
      await wait(2500); await shot('m1_full');
      await js(`document.querySelector('#dlgMini').click()`); await wait(1200); await shot('m2_mini');
      wc.send('npc:lines', [{ text: '決策時間到了！', emotion: 'thinking', event: 'reminder' }]); await wait(800); await shot('m3_alert');
      console.log('saved ui', JSON.stringify(engine.state.ui));
      await js(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,screenX:5,screenY:5}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,screenX:5,screenY:5}));})()`);
      await wait(2500); await shot('m4_expanded');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
