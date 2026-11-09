// 🔍 介面大小（11/9）：放大縮小整個主畫面（艾琳、小貓、狀態欄、對話框、面板）；右下角不動；螢幕放不下的不給選；
//   Ctrl＋滾輪；滑桿面板；變小貓也跟著；拖曳搬視窗的距離不受影響；📓 筆記本不受影響
//   xvfb 1600×1000（工作區域高 1000 → 最大 125%）；QUEST_NPC_HOME＝空資料夾
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, menuTemplate, pdWin, pdOpen, scale }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.twins = { ...(engine.config.twins || {}), enabled: false }; // 截圖時不要下午茶外送插進來
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const until = async (fn, msg, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await wait(100); } throw new Error('ASSERT 等不到：' + msg); };
  const flush = async () => { for (let i = 0; i < 30; i++) { if (!(await js('state.queue.length > 0 || state.typing'))) break; await js('advance()'); await wait(150); } };
  const corner = () => { const b = win.getBounds(); return { r: b.x + b.width, b: b.y + b.height, w: b.width, h: b.height, x: b.x, y: b.y }; };
  const near = (a, b, d = 2) => Math.abs(a - b) <= d;
  const findMenu = (re) => { const walk = (items) => { for (const it of items || []) { if (re.test(it.label || '')) return it; const f = walk(it.submenu); if (f) return f; } return null; }; return walk(menuTemplate()); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });

  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1500); await flush();
      await js('closePanel(); closeDialog(); 0'); await wait(300);
      // 1. 原本：610×800、zoom 1
      const c0 = corner();
      assert(c0.w === 610 && c0.h === 800 && wc.getZoomFactor() === 1, '原本 100%：' + JSON.stringify(c0));
      await shot('s01_100');
      // 2. 選單：🔍 介面大小（現在 100%），這個螢幕最大 125% → 130%、150% 不能選
      const m = findMenu(/^🔍 介面大小（現在 100%）/);
      assert(m && m.submenu, '選單有介面大小');
      const it = (p) => m.submenu.find((x) => (x.label || '').startsWith(p));
      assert(it('100%').checked && it('120%').enabled && !it('130%').enabled && /放不下/.test(it('150%').label), '放不下的不給選：' + m.submenu.map((x) => `${x.label}${x.enabled === false ? '✗' : ''}`).join('｜'));
      // 3. 選 120%：視窗 732×960、zoom 1.2、網頁裡還是 610 寬；右下角不動；存進設定；跳小提示
      it('120%').click();
      await until(() => wc.getZoomFactor() > 1.19, 'zoom 1.2');
      await wait(400);
      const c1 = corner();
      assert(c1.w === 732 && c1.h === 960 && near(c1.r, c0.r) && near(c1.b, c0.b), '120%：視窗大小、右下角不動：' + JSON.stringify({ c0, c1 }));
      assert(near(await js('innerWidth'), 610, 1) && near(await js('innerHeight'), 800, 1), '網頁裡的座標不變');
      assert(engine.config.window.scale === 1.2, '存進 config：' + engine.config.window.scale);
      assert(/介面大小 120%/.test(await js(`document.querySelector('#toast').textContent`)), '小提示');
      await js('closeDialog(); 0'); await wait(200);
      await shot('s02_120');
      // 4. Ctrl＋滾輪：放大到 125% 就停（螢幕放不下）；縮小一格 10%
      wc.emit('zoom-changed', {}, 'in'); await wait(500);
      assert(engine.config.window.scale === 1.25 && near(wc.getZoomFactor(), 1.25, 0.001), '滾輪放大：最多到 125%：' + engine.config.window.scale);
      wc.emit('zoom-changed', {}, 'in'); await wait(500);
      assert(engine.config.window.scale === 1.25 && corner().h === 1000, '再放大也不會超出螢幕');
      wc.emit('zoom-changed', {}, 'out'); wc.emit('zoom-changed', {}, 'out'); await wait(500); // 150ms 內兩下只算一下（觸控板捏合會連發）
      assert(engine.config.window.scale === 1.15, '滾輪縮小一格：' + engine.config.window.scale);
      assert(near(corner().r, c0.r) && near(corner().b, c0.b), '右下角一直不動');
      // 5. 滑桿面板：最大 125%、拖的時候只換數字、放開才套用
      wc.send('ui:open', 'scale'); await until(() => js(`state.panel === 'scale' && !!document.querySelector('#scRange')`), '滑桿面板');
      await wait(300);
      assert((await js(`document.querySelector('#scRange').max`)) === '125' && (await js(`document.querySelector('#scRange').value`)) === '115', '滑桿：範圍到 125、現在 115');
      assert(await js(`document.querySelector('.sc-pre[data-sc="1.3"]').disabled`), '放不下的預設按鈕不能按');
      await shot('s03_panel_115');
      await js(`(()=>{const r=document.querySelector('#scRange'); r.value='90'; r.dispatchEvent(new Event('input',{bubbles:true})); return 0;})()`); await wait(200);
      assert((await js(`document.querySelector('#scVal').textContent`)) === '90%' && engine.config.window.scale === 1.15, '拖的時候：只換數字');
      await js(`document.querySelector('#scRange').dispatchEvent(new Event('change',{bubbles:true})); 0`);
      await until(() => near(wc.getZoomFactor(), 0.9, 0.001), '放開：90%');
      await wait(400);
      const c2 = corner();
      assert(c2.w === 549 && c2.h === 720 && near(c2.r, c0.r) && near(c2.b, c0.b), '90%：視窗變小、右下角不動：' + JSON.stringify(c2));
      assert(await js(`state.panel === 'scale' && document.querySelector('.panel-head .sub').textContent === '現在 90%'`), '面板跟著更新');
      await shot('s04_panel_90');
      await js(`document.querySelector('.sc-pre[data-sc="1"]').click(); 0`);
      await until(() => wc.getZoomFactor() === 1 && corner().w === 610, '按 100%');
      assert(!(await js(`!!document.querySelector('#scReset')`)), '100% 時沒有「回到 100%」');
      await js('closePanel(); 0'); await wait(200);
      // 6. 變小貓也跟著：120% → 168×168；變回來右下角還在原地
      scale.set(1.2); await wait(500);
      const c3 = corner();
      await js('api.setMini(true); 0'); await until(() => corner().w === 168, '小貓 168');
      await wait(700);
      assert(corner().h === 168 && near(wc.getZoomFactor(), 1.2, 0.001), '小貓也放大：' + JSON.stringify(corner()));
      await shot('s05_mini_120');
      await js('api.setMini(false); 0'); await until(() => corner().w === 732, '變回來 732');
      await wait(700);
      assert(near(corner().r, c3.r) && near(corner().b, c3.b), '變回來右下角不動：' + JSON.stringify({ c3, now: corner() }));
      // 7. 拖曳搬視窗：滑鼠移 60px，視窗就移 60px（不會因為放大變成 72 或 50）
      //    事件的 screenX 是螢幕座標、不受 zoom 影響（clientX 才會）；搬視窗用的就是 screenX 的差
      //    （xvfb 真正的滑鼠停在螢幕中間，視窗移動後 Chromium 會用它補一個假的 mousemove，所以這裡只看事件、不看整段拖完的位置）
      await flush(); await js('closeDialog(); 0'); await wait(300);
      await js('window.__ev=[]; ["mousedown","mousemove"].forEach((t)=>window.addEventListener(t,(e)=>window.__ev.push([t,e.screenX,e.screenY,e.clientX]),true)); 0');
      const z = wc.getZoomFactor();
      const p = await js(`(()=>{const r=document.querySelector('#npcImg').getBoundingClientRect(); return {x:r.left+r.width*0.5, y:r.top+r.height*0.62};})()`);
      const b0 = win.getBounds();
      const wx = Math.round(p.x * z), wy = Math.round(p.y * z);
      wc.sendInputEvent({ type: 'mouseMove', x: wx, y: wy, globalX: b0.x + wx, globalY: b0.y + wy }); await wait(80);
      wc.sendInputEvent({ type: 'mouseMove', x: wx - 60, y: wy - 20, globalX: b0.x + wx - 60, globalY: b0.y + wy - 20 }); await wait(150);
      const ev = JSON.parse(await js('JSON.stringify(window.__ev)'));
      assert(ev.length >= 2 && ev[1][1] - ev[0][1] === -60 && ev[1][2] - ev[0][2] === -20 && near(ev[1][3] - ev[0][3], -50, 1), '120% 時滑鼠移 60px：screenX 差 60（clientX 差 50）：' + JSON.stringify(ev));
      await js('api.moveWindow(-60, -20); 0'); await wait(300);
      const b1 = win.getBounds();
      assert(b1.x - b0.x === -60 && b1.y - b0.y === -20 && b1.width === 732, '搬視窗照螢幕的距離：' + JSON.stringify({ b0, b1 }));
      await js('api.dragEnd(); 0'); await wait(300);
      // 搬過的位置記起來：之後再改大小，以新的右下角為準
      scale.set(1); await until(() => corner().w === 610, '回到 100%');
      await wait(400);
      assert(near(corner().r, b1.x + b1.width) && near(corner().b, b1.y + b1.height), '改大小以新位置的右下角為準');
      // 8. 📓 筆記本不受影響
      scale.set(1.2); await wait(500);
      pdOpen();
      await until(() => !!(pdWin() && !pdWin().isDestroyed()), '筆記本');
      const pw = pdWin();
      await until(async () => { try { return await pw.webContents.executeJavaScript('document.readyState === "complete"'); } catch (_) { return false; } }, '筆記本載入');
      await wait(500);
      const pb = pw.getContentBounds();
      assert(pw.webContents.getZoomFactor() === 1 && near(await pw.webContents.executeJavaScript('innerWidth'), pb.width, 1), '筆記本還是 100%：' + pw.webContents.getZoomFactor());
      pw.close(); await until(() => win.isVisible(), '主視窗回來'); await wait(500);
      assert(near(wc.getZoomFactor(), 1.2, 0.001) && corner().w === 732, '筆記本關掉後主畫面還是 120%');
      // 9. 亂填的設定：當成 100%
      engine.saveConfigPatch({ window: { scale: 'abc' } }); scale.rescale(); await wait(400);
      assert(wc.getZoomFactor() === 1 && corner().w === 610, '亂填＝100%');
      engine.saveConfigPatch({ window: { scale: 3 } }); scale.rescale(); await wait(400);
      assert(near(wc.getZoomFactor(), 1.25, 0.001), '太大＝縮到螢幕放得下：' + wc.getZoomFactor());
      console.log('SCALE OK');
      setTimeout(() => process.exit(0), 200);
    } catch (err) { console.error(err); await shot('s_fail').catch(() => {}); process.exit(1); }
  });
};
