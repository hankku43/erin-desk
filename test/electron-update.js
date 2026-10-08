// 🔄 自動更新的卡片：下載好了（安裝版）、有新版本（免安裝版）、更新內容、下次再說；選單項目（xvfb 用，狀態用假的推過去）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';
const U = require('../src/main/updater');

module.exports = ({ win, engine, app, menuTemplate, updater }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const visible = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0; })()`);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const notes = U.notesText('<h2>0.1.3 更新內容</h2><ul><li>艾琳可以幫你安裝 Ollama</li><li>金幣圖示在 Windows 10 也看得到</li><li>安裝檔會自動更新</li></ul>');
  const ready = { mode: 'auto', current: '0.1.2', status: 'ready', version: '0.1.3', notes, percent: 100, url: U.RELEASES_PAGE };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 0. 從原始碼執行：不檢查，選單說明用 git pull
      assert(updater && updater.mode === 'dev', '開發版');
      const help = menuTemplate().find((m) => /說明/.test(m.label || ''));
      const item = help.submenu[help.submenu.length - 1];
      assert(/git pull/.test(item.label) && item.enabled === false, '選單：' + item.label);
      assert(!(await visible('#updCard')), '一開始沒有卡片');
      // 1. 安裝版：新版本下載好了 → 卡片＋艾琳說一聲
      wc.send('update:status', ready);
      wc.send('npc:lines', [U.line('ready', { v: '0.1.3' })]);
      await wait(600); await flush();
      assert(await visible('#updCard') && /新版本準備好了　0\.1\.3/.test(await text('#updCard .upd-head')), '卡片');
      assert(/下次關掉艾琳的時候會自動換上/.test(await text('#updCard .upd-sub')) && await js(`!!document.querySelector('[data-upd-install]')`), '說明＋現在更新');
      const cardBottom = await js(`document.querySelector('#updCard').getBoundingClientRect().bottom`);
      const hudTop = await js(`document.querySelector('#hud').getBoundingClientRect().top`);
      assert(cardBottom <= hudTop - 4, `卡片在狀態欄上面，不重疊（${cardBottom} / ${hudTop}）`);
      await shot('u01_ready');
      // 2. 更新了什麼
      await js(`document.querySelector('#updCard details').open = true; 0`); await wait(300);
      assert((await js(`document.querySelectorAll('#updCard .upd-notes li:not(.h)').length`)) === 3 && /0\.1\.3 更新內容/.test(await text('#updCard .upd-notes li.h')), '標題＋三行更新內容');
      await shot('u02_notes');
      // 3. 現在更新（開發版沒有真的更新 → 說明會在關掉時換上，卡片回來）
      await click('[data-upd-install]'); await wait(700);
      assert(await visible('#updCard'), '開發版沒辦法更新：卡片留著');
      // 4. 下次關掉時再裝 → 卡片收起來、記住這個版本
      await click('[data-upd-later]'); await wait(500);
      assert(!(await visible('#updCard')) && (engine.state.update || {}).dismissed === '0.1.3', '記住按過的版本');
      wc.send('update:status', ready); await wait(300);
      assert(!(await visible('#updCard')), '同一版不再跳');
      await shot('u03_later');
      // 5. 免安裝版：有新版本 → 打開下載頁
      wc.send('update:status', { mode: 'portable', current: '0.1.2', status: 'available', version: '0.1.4', notes: ['・修了一些小地方'], url: 'https://github.com/hankku43/erin-desk/releases/tag/v0.1.4' });
      await wait(500);
      assert(await visible('#updCard') && /有新版本　0\.1\.4/.test(await text('#updCard .upd-head')) && await js(`!!document.querySelector('[data-upd-page]')`), '免安裝版的卡片');
      assert(/蓋過舊的資料夾/.test(await text('#updCard .upd-sub')), '免安裝版說明');
      await shot('u04_portable');
      // 6. 狀態欄收起來時，卡片貼在下面
      await js(`document.body.classList.add('no-hud'); updateCard.render(updateCard.state()); 0`); await wait(300);
      assert((await js(`getComputedStyle(document.querySelector('#updCard')).bottom`)) === '14px', '沒有狀態欄時貼底');
      console.log('UPDATE TEST OK');
    } catch (e) { console.error('UPDATE TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => app.quit(), 300);
  });
};
