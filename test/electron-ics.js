// 行事曆匯入／匯出的畫面巡禮（xvfb 用）：檔案對話框沒辦法自動點，所以直接呼叫引擎，再把結果推給畫面
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
  const push = (ch, payload) => wc.send(ch, payload);
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2500);
      await click('[data-act=daily]'); await wait(1800); await shot('i01_daily_buttons');
      const ics = fs.readFileSync(path.join(__dirname, 'fixtures', 'calendar_sample.ics'), 'utf8');
      const res = await engine.importICS(ics);
      console.log('import:', res.label, 'skipped', res.skipped);
      push('view:update', { view: res.view, reason: `📥 ${res.label}` });
      push('npc:lines', res.lines);
      await wait(1500); await shot('i02_imported_toast');
      await wait(2500); await shot('i03_imported_line');
      // 看 10/1 那天：把引擎的「現在」撥到那天再重畫
      const realNow = engine.nowFn;
      engine.nowFn = () => new Date(`${new Date().getFullYear()}-10-01T10:30:00`);
      push('view:update', { view: engine.view() });
      await wait(600); await shot('i04_daily_1001');
      engine.nowFn = realNow;
      const ex = engine.exportICS();
      fs.writeFileSync(path.join(OUT, 'export.ics'), ex.text, 'utf8');
      push('view:update', { view: engine.view(), reason: `📤 已匯出 ${ex.count} 個事件 → export.ics` });
      await wait(700); await shot('i05_export_toast');
      console.log('export events:', ex.count);
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
