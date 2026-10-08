// 🧠 聰明艾琳開關（xvfb 用）：透過畫面的 api 開關、打開右鍵選單，檢查狀態與台詞
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background='linear-gradient(135deg,#5b7fa6,#9bb7cf)'`);
      await wait(2500);
      const on = await js(`api.setSmart(true).then((r) => { applyView(r.view); toast(r.reason, 5000); enqueue(r.lines); return { ok: r.ok, status: r.status, reason: r.reason, text: r.lines[0].text }; })`);
      console.log('ON:', JSON.stringify(on));
      console.log('menu status:', engine.lore.statusText(), '| config:', JSON.stringify(engine.config.lore.embeddings));
      await wait(2600); await shot('s01_smart_on');
      await js(`api.openMenu()`); await wait(600); console.log('menu opened ok');
      const off = await js(`api.setSmart(false).then((r) => { applyView(r.view); toast(r.reason, 5000); enqueue(r.lines); return { ok: r.ok, status: r.status, reason: r.reason, text: r.lines[0].text }; })`);
      console.log('OFF:', JSON.stringify(off));
      await wait(2600); await shot('s02_smart_off');
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
