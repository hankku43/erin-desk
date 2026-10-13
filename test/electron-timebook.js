// 🕘 時刻簿：手寫字型、委託匣拖進時間軸、方塊拖著換時間、拉下緣改結束、拖到日子分頁搬到那天、同時段太多件收成「+N」、一次說好幾天
// xvfb 用；QUEST_NPC_HOME＝準備好的資料夾（plans/week.md：寫完週報（收資料 ✓、寫初稿）、整理客戶名單；週一寫報告、週二讀文件）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';

module.exports = ({ win, engine, pdWin, pdOpen }) => {
  const T = new Date('2026-10-13T10:00:00').getTime(); // 週二
  engine.nowFn = () => new Date(T);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name, w) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const view = () => engine.pdView();
  const row = (title) => view().rows.find((r) => r.title === title);
  win.webContents.once('did-finish-load', async () => {
    let bw = null;
    try {
      await wait(1500);
      pdOpen('this', { book: 'time', day: '2026-10-13' });
      for (let i = 0; i < 40 && !(bw = pdWin()); i++) await wait(150);
      assert(bw, '筆記本打開');
      bw.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
      await new Promise((r) => (bw.webContents.isLoading() ? bw.webContents.once('did-finish-load', r) : r()));
      await wait(2300);
      const B = bw.webContents;
      const js = (code) => B.executeJavaScript(code);
      const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
      const say = async (t) => { await js(`(()=>{const i=document.querySelector('#sayInput'); i.value=${JSON.stringify(t)}; document.querySelector('#sayForm').requestSubmit();})(); 0`); await wait(500); };
      // 拖拉：在頁面裡送 pointer 事件（座標是真的版面）
      await js(`window.__drag = async (el, x0, y0, x1, y1, steps = 8) => {
        const o = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true });
        el.dispatchEvent(new PointerEvent('pointerdown', o(x0, y0)));
        for (let i = 1; i <= steps; i++) { const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps; (document.elementFromPoint(x, y) || document).dispatchEvent(new PointerEvent('pointermove', o(x, y))); await new Promise((r) => setTimeout(r, 20)); }
        (document.elementFromPoint(x1, y1) || document).dispatchEvent(new PointerEvent('pointerup', o(x1, y1)));
        return 0;
      }; 0`);
      // 某個時間在時間軸上的 y（ppm 1.25、軸從 08:00 開始）
      const yOf = (hhmm) => js(`(()=>{ const ln=document.querySelector('.lanes'); const [h,m]=${JSON.stringify(hhmm)}.split(':').map(Number); return ln.getBoundingClientRect().top + ((h*60+m) - 8*60) * 1.25; })()`);
      const center = (sel) => js(`(()=>{ const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()`);
      // 1. 手寫字型
      assert((await js(`document.body.classList.contains('hand')`)) && (await js(`document.fonts.ready.then(() => document.fonts.check('16px Iansui', '委託簿時刻簿'))`)), '手寫字型載入');
      assert((await js(`document.querySelector('#book').dataset.book`)) === 'time' && /二/.test(await text('#dayTabs .on')), '時刻簿・週二');
      assert(/寫完週報/.test(await text('.tray')) && /寫初稿/.test(await text('.tray .ts')), '右邊委託匣：委託＋還沒做的步驟');
      await shot('tb01_open', bw);
      // 2. 委託匣：把「寫完週報」拖到 14:00 → 排下一個還沒排的步驟「寫初稿」一小時
      await js(`document.querySelector('#timeArea').scrollTop = 300; 0`); await wait(200);
      const [tx, ty] = await center('.tq-t[data-tq]');
      const lx = await js(`(()=>{ const r=document.querySelector('.lanes').getBoundingClientRect(); return r.left + r.width*0.4; })()`);
      const y14 = await yOf('14:00');
      await js(`__drag(document.querySelector('.tq-t[data-tq]'), ${tx}, ${ty}, ${lx}, ${y14 + 10})`); await wait(700);
      let r = row('寫完週報：寫初稿');
      assert(r && r.date === '2026-10-13' && r.start === '14:00' && r.end === '15:00', '拖進來排一格：' + JSON.stringify(r));
      assert(/排了一格/.test(await text('#say')), '艾琳說：' + await text('#say'));
      await shot('tb02_dropped', bw);
      // 3. 方塊往下拖一小時 → 15:00–16:00（長度不變）
      const bsel = `.blk[data-drag="${r.id}"]`;
      let [bx, by] = await center(bsel);
      await js(`__drag(document.querySelector('${bsel} .bx'), ${bx}, ${by}, ${bx}, ${by + 75})`); await wait(700);
      r = row('寫完週報：寫初稿');
      assert(r.start === '15:00' && r.end === '16:00', '拖著換時間：' + JSON.stringify(r));
      // 4. 拉下緣 +30 分 → 16:30
      const rz = await js(`(()=>{ const b=document.querySelector('${bsel}').getBoundingClientRect(); return [b.left + b.width/2, b.bottom - 2]; })()`);
      await js(`__drag(document.querySelector('${bsel} .rz'), ${rz[0]}, ${rz[1]}, ${rz[0]}, ${rz[1] + 38})`); await wait(700);
      r = row('寫完週報：寫初稿');
      assert(r.start === '15:00' && r.end === '16:30', '拉下緣改結束：' + JSON.stringify(r));
      await shot('tb03_resized', bw);
      // 5. ↶ 復原、再做一次
      await js(`document.querySelector('#bUndo').click(); 0`); await wait(500);
      assert(row('寫完週報：寫初稿').end === '16:00', '↶ 復原拉長');
      // 6. 拖到上面的「週四」分頁 → 搬到週四、時間不變、跟著翻過去
      [bx, by] = await center(bsel);
      const [dx, dy] = await center('#dayTabs [data-day="2026-10-15"]');
      await js(`__drag(document.querySelector('${bsel} .bx'), ${bx}, ${by}, ${dx}, ${dy})`); await wait(800);
      r = row('寫完週報：寫初稿');
      assert(r.date === '2026-10-15' && r.start === '15:00', '拖到日子分頁：搬到週四：' + JSON.stringify(r));
      assert(/四/.test(await text('#dayTabs .on')), '跟著翻到週四');
      // 7. 點一下（沒拖）還是打開小卡
      [bx, by] = await center(`.blk[data-drag="${r.id}"]`);
      await js(`(()=>{ const el=document.querySelector('.blk[data-drag="${r.id}"] .bx'); const o={bubbles:true,clientX:${bx},clientY:${by},pointerId:1,button:0}; el.dispatchEvent(new PointerEvent('pointerdown',o)); document.dispatchEvent(new PointerEvent('pointerup',o)); el.click(); })(); 0`);
      await wait(300);
      assert(/改時段/.test(await text('#pop h3')), '點一下打開小卡');
      await js(`document.querySelector('[data-pcancel]').click(); 0`); await wait(200);
      // 8. 同一段時間四件 → 並排三欄、收成「+2」，點開看全部
      for (const t of ['回信', '寫測試', '整理桌面', '看文件']) await say(`週三 9:00-10:00 ${t}`);
      await js(`document.querySelector('#dayTabs [data-day="2026-10-14"]').click(); 0`); await wait(400);
      await js(`document.querySelector('#timeArea').scrollTop = 0; 0`); await wait(200);
      assert(/\+2/.test(await text('.blk.more')) && (await js(`document.querySelectorAll('.lanes .blk[data-drag]').length`)) === 2, '四件：兩件＋「+2」：' + await text('.lanes'));
      await shot('tb04_more', bw);
      await js(`document.querySelector('.blk.more').click(); 0`); await wait(300);
      assert((await js(`document.querySelectorAll('#pop .ml').length`)) === 4, '點開：四件都在');
      await shot('tb05_more_open', bw);
      await js(`document.querySelector('#pop .ml').click(); 0`); await wait(300);
      assert(/改時段/.test(await text('#pop h3')), '清單點一件：打開那件的小卡');
      await js(`document.querySelector('[data-pcancel]').click(); 0`); await wait(200);
      // 9. 一次說好幾天
      await say('週三、週四出差');
      assert(view().themes['2026-10-14'] === '出差' && view().themes['2026-10-15'] === '出差', '週三、週四出差：兩天都記');
      // 10. 一週總覽：委託匣也在、拖進週五
      await js(`document.querySelector('#bWeekView').click(); 0`); await wait(500);
      const fri = await js(`(()=>{ const ln=document.querySelector('.lanes[data-lanes="2026-10-16"]'); const r=ln.getBoundingClientRect(); return [r.left + r.width/2, r.top + (11*60 - 8*60) * 0.8 + 4]; })()`);
      await js(`document.querySelector('#timeArea').scrollTop = 0; 0`); await wait(200);
      const ts = await center('.ts[data-step]');
      await js(`__drag(document.querySelector('.ts[data-step]'), ${ts[0]}, ${ts[1]}, ${fri[0]}, ${fri[1]})`); await wait(700);
      assert(view().rows.some((x) => x.date === '2026-10-16' && x.start === '11:00' && /^寫完週報：/.test(x.title)), '一週總覽：拖到週五 11:00');
      await shot('tb06_week', bw);
      // 11. 手寫字型可以關
      await js(`document.querySelector('#bMore').click(); 0`); await wait(150);
      await js(`document.querySelector('[data-font]').click(); 0`); await wait(500);
      assert(!(await js(`document.body.classList.contains('hand')`)) && engine.config.planDraft && engine.config.planDraft.handFont === false, '關掉手寫字型（存進設定）');
      await shot('tb07_plainfont', bw);
      await js(`document.querySelector('#bMore').click(); 0`); await wait(150);
      await js(`document.querySelector('[data-font]').click(); 0`); await wait(400);
      assert(await js(`document.body.classList.contains('hand')`), '再打開');
      // 12. 10/13 主視窗藏著的時候，艾琳的提醒也送到筆記本：泡泡＋上面的提醒條；團戰開始 → 倒數
      const noticeOn = () => js(`!document.querySelector('#notice').classList.contains('hidden')`);
      assert(!(await noticeOn()), '一開始沒有提醒條');
      engine.onSpeech([{ text: '📯 再 5 分鐘「週會」就開始了', emotion: 'normal', event: 'raid_soon_last' }]); await wait(300);
      assert((await noticeOn()) && /再 5 分鐘/.test(await text('#noticeText')) && /再 5 分鐘/.test(await text('#say')), '提醒進泡泡＋提醒條：' + await text('#noticeText'));
      assert(await js(`document.querySelector('#noticeFocus').classList.contains('hidden')`), '還沒開始：沒有倒數');
      engine.state.focus = { startAt: T, endAt: T + 30 * 60000, minutes: 30, raid: { key: 'k', title: '週會', date: '2026-10-13', start: '10:00', end: '10:30', source: 'app' } };
      engine.onSpeech([{ text: '📯 「週會」開始了，專注到 10:30！', emotion: 'cheer', event: 'raid_start' }]); await wait(300);
      assert(/週會・還剩 30 分（到 10:30）/.test(await text('#noticeFocus')), '團戰倒數：' + await text('#noticeFocus'));
      await shot('tb08_notice', bw);
      await js(`document.querySelector('#noticeClose').click(); 0`); await wait(200);
      assert((await noticeOn()) && !(await text('#noticeText')) && /還剩 30 分/.test(await text('#noticeFocus')), '✕ 只收掉提醒的字，倒數留著');
      engine.onSpeech([{ text: '（她自己找話聊）', emotion: 'normal', ambient: true }]); await wait(200);
      assert(!/找話聊/.test(await text('#say')) && !(await text('#noticeText')), 'ambient 的話筆記本不插嘴');
      engine.state.focus = null;
      engine.onSpeech([{ text: '這格做完了～', emotion: 'happy', deferred: true }]); await wait(200);
      assert(/做完了/.test(await text('#say')) && !(await noticeOn()), 'deferred 的回話只進泡泡；專注結束後倒數收起來');
      console.log('TIMEBOOK OK');
      setTimeout(() => process.exit(0), 300);
    } catch (e) {
      console.error('TEST FAIL', e);
      if (bw) await shot('tb_fail', bw).catch(() => {});
      process.exit(1);
    }
  });
};
