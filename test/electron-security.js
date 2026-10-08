// 🔒 資安防護（xvfb 用）：畫面開不了新視窗、跳不到別的網頁、權限要求一律拒絕；renderer 有 sandbox、拿不到 Node
const { BrowserWindow } = require('electron');

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code, true); // true＝當作使用者按的（彈窗、權限要求才會真的送出去）
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await wait(500);
      const home = wc.getURL();
      assert(/^file:.*index\.html$/.test(home), '載入自己的頁面：' + home);
      // 1. sandbox、contextIsolation、沒有 Node
      const prefs = wc.getLastWebPreferences();
      assert(prefs.sandbox === true && prefs.contextIsolation === true && !prefs.nodeIntegration, 'webPreferences：' + JSON.stringify({ sandbox: prefs.sandbox, ci: prefs.contextIsolation, ni: prefs.nodeIntegration }));
      assert(await js(`typeof require === 'undefined' && typeof process === 'undefined'`), '畫面裡沒有 require／process');
      assert(await js(`typeof window.api === 'object' && typeof window.api.getView === 'function'`), 'preload 的 api 還在');
      // 2. 不開新視窗
      const n0 = BrowserWindow.getAllWindows().length;
      assert(await js(`window.open('https://example.com/') === null`), 'window.open 被擋（回傳 null）');
      await wait(400);
      assert(BrowserWindow.getAllWindows().length === n0, '沒有多出視窗');
      // 3. 不跳到別的網頁（改網址、點連結都一樣）
      await js(`location.href = 'https://example.com/'; 0`); await wait(800);
      assert(wc.getURL() === home, '改網址被擋：' + wc.getURL());
      await js(`(() => { const a = document.createElement('a'); a.href = 'https://example.com/'; document.body.appendChild(a); a.click(); a.remove(); })(); 0`); await wait(800);
      assert(wc.getURL() === home, '點連結被擋：' + wc.getURL());
      await js(`(() => { const a = document.createElement('a'); a.href = 'file:///etc/passwd'; document.body.appendChild(a); a.click(); a.remove(); })(); 0`); await wait(800);
      assert(wc.getURL() === home, '連到別的本機檔案也被擋：' + wc.getURL());
      // 4. 權限要求一律拒絕（Electron 預設是全部允許）
      const perm = await js(`Notification.requestPermission()`);
      assert(perm === 'denied', '通知權限被拒絕：' + perm);
      // 5. 擋完之後畫面照常能用
      assert(await js(`!!document.querySelector('#npcWrap')`), '艾琳還在');
      const v = await js(`window.api.getView().then((r) => !!(r && r.ok && r.view && r.view.player))`);
      assert(v, 'IPC 照常');
      console.log('SECURITY TEST OK');
    } catch (e) { console.error('SECURITY TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => app.quit(), 300);
  });
};
