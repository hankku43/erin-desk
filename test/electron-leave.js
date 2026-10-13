// 🌴 請假與國定假日巡禮：今日行程的「🌴 請假」、請假面板（接下來三週的國定假日）、標記某天／今天請假、團戰遇到國定假日跳過
// xvfb 用；QUEST_NPC_HOME＝準備好的資料夾（config.json、plans/raid.md、data/save.json 已經做完新手教學）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, menuTemplate }) => {
  const T = new Date('2026-10-08T10:00:00').getTime(); // 週四，隔天國慶日補假
  engine.nowFn = () => new Date(T);
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})(); 0`);
  const setVal = (sel, val) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); el.value=${JSON.stringify(val)}; el.dispatchEvent(new Event('input',{bubbles:true}));})(); 0`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.queue.length > 0 || state.typing'))) break; await js('advance()'); await wait(120); } };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2500); await flush();
      // 週五的每週團戰：10/9 是國慶日補假 → 自動跳過
      await engine.addRaid({ title: '週五回顧', date: '2026-10-09', start: '16:00', end: '16:30', repeat: 'weekly', days: [5] });
      wc.send('view:update', { view: engine.view() }); await wait(300);
      // 選單
      const sub = menuTemplate().find((m) => /^🗓 行程/.test(m.label || ''));
      assert(sub.submenu.some((m) => /今天請假/.test(m.label || '')) && sub.submenu.some((m) => /請假與國定假日/.test(m.label || '')), '選單有請假');
      // 1. 今日行程 → 🌴 請假
      await js(`closeDialog(); openPanel('daily'); 0`); await wait(500);
      assert(!!(await js(`!!document.querySelector('[data-lv-open]')`)), '今日行程有請假按鈕');
      await click('[data-lv-open]'); await wait(400);
      assert(/今天是上班日/.test(await text('.lv-today')), '今天上班');
      assert(/國慶日補假/.test(await text('.lv-list')) && /光復節/.test(await text('.lv-list')), '列出接下來的國定假日：' + await text('.lv-list'));
      await shot('l01_leave_panel');
      // 2. 標記 10/13 特休
      await setVal('#lvDate', '2026-10-13'); await setVal('#lvNote', '特休');
      await click('[data-lv-add]'); await wait(900); await flush();
      assert(engine.state.leave['2026-10-13'] === '特休', '存了請假：' + JSON.stringify(engine.state.leave));
      assert(/特休/.test(await text('.lv-list')), '清單有特休');
      await shot('l02_leave_added');
      // 3. 今天請假
      await click('[data-lv-today]'); await wait(900); await flush();
      assert(engine.state.leave['2026-10-08'] === '請假' && /今天請假/.test(await text('.lv-today')), '今天請假');
      await shot('l03_today_leave');
      // 4. 今日行程：上面有請假提示
      await click('[data-close]'); await wait(300);
      await js(`openPanel('daily'); 0`); await wait(500);
      assert(/今天請假/.test(await text('.panel-body .lv-today')), '今日行程顯示請假');
      await shot('l04_daily_leave');
      // 5. 團戰清單：10/9 的週五回顧放假跳過，可以照開
      await js(`openPanel('raids'); 0`); await wait(500);
      assert(/放假（國慶日補假）/.test(await text('.rd-body')) && /照開/.test(await text('.rd-body')), '團戰遇到國定假日：' + await text('.rd-body'));
      await shot('l05_raids_holiday');
      // 6. 取消今天的請假
      await js(`openPanel('leave'); 0`); await wait(400);
      await click(`.lv-today [data-lv-off]`); await wait(900);
      assert(!engine.state.leave['2026-10-08'], '取消今天的請假');
      console.log('LEAVE OK');
      setTimeout(() => process.exit(0), 300);
    } catch (e) { console.error('TEST FAIL', e); await shot('l_fail').catch(() => {}); process.exit(1); }
  });
};
