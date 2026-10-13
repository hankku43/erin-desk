// 📯 團戰（會議）巡禮：清單、新增（每週重複）、只改這一次、取消／恢復、今日行程、前 15 分鐘提醒、開始時自動專注（縮成貓）、提早結束
// xvfb 用；要搭配 QUEST_NPC_HOME＝準備好的資料夾（config.json、plans/raid.md、data/save.json 已經做完新手教學）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, menuTemplate, runTick }) => {
  let T = new Date('2026-10-12T13:30:00').getTime(); // 週一
  engine.nowFn = () => new Date(T);
  const at = (hm) => { T = new Date(`2026-10-12T${hm}:00`).getTime(); };
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})(); 0`);
  const setVal = (sel, val, ev = 'input') => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.value=${JSON.stringify(val)}; el.dispatchEvent(new Event(${JSON.stringify(ev)},{bubbles:true}));})(); 0`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.queue.length > 0 || state.typing'))) break; await js('advance()'); await wait(120); } };
  const refresh = () => js(`api.getView().then((r)=>{ applyView(r.view); if (state.panel) renderPanel(); }); 0`);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2500); await flush();
      // 選單：「📂 週計畫・團戰」裡找得到，第一層不超過 12 項
      const top = menuTemplate().filter((m) => m.type !== 'separator');
      assert(top.length <= 12, '第一層 ' + top.length);
      const sub = top.find((m) => /週計畫/.test(m.label));
      assert(sub && sub.submenu.some((m) => /📯 團戰/.test(m.label || '')), '週計畫選單有團戰');
      // 1. 首頁 📯 → 清單：計畫檔的週會
      await js('openRaids(); 0'); await wait(500); // 主畫面的「📯 團戰」換成「📓 委託」：從今日行程或右鍵選單進
      assert(/週會/.test(await text('.rd-body')) && /計畫檔/.test(await text('.rd-body')), '計畫檔的團戰在清單裡');
      await shot('r01_list');
      // 2. 新團戰：每週一、三的專案站會
      await click('[data-rd-new]'); await wait(400);
      await setVal('#rdTitle', '專案站會');
      await setVal('#rdStart', '16:00', 'change'); await wait(100);
      assert((await js(`document.querySelector('#rdEnd').value`)) === '17:00', '開始改了，結束跟著挪：' + await js(`document.querySelector('#rdEnd').value`));
      await setVal('#rdEnd', '16:30');
      await setVal('#rdRepeat', 'weekly', 'change'); await wait(100);
      await js(`(()=>{const c=document.querySelector('input[name=rdDay][value="3"]'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true}));})(); 0`); await wait(150);
      await shot('r02_new_form');
      await click('[data-rd-save]'); await wait(900);
      assert(engine.state.raids.items.length === 1 && engine.state.raids.items[0].days.join() === '1,3', '存成每週一、三：' + JSON.stringify(engine.state.raids.items));
      assert(await js(`state.panel === 'raids'`), '存好回到清單');
      await flush(); await wait(300); await shot('r03_list_added');
      // 3. 週三那場只改這一次
      const wedKey = await js(`state.view.raids.list.find((o)=>o.date==='2026-10-14').key`);
      await click(`[data-rd-edit="${wedKey}"]`); await wait(400);
      assert(/只改這一次/.test(await text('.rd-scope')), '有範圍選擇');
      await setVal('#rdStart', '17:00', 'change'); await wait(100);
      await shot('r04_edit_one');
      await click('[data-rd-save]'); await wait(900); await flush();
      const wed = await js(`state.view.raids.list.find((o)=>o.date==='2026-10-14')`);
      assert(wed.start === '17:00' && wed.end === '17:30' && wed.moved, '只改週三：' + JSON.stringify(wed));
      // 4. 取消今天那場（系列）→ 只取消這次 → 恢復
      const monKey = await js(`state.view.raids.list.find((o)=>o.date==='2026-10-12' && o.source==='app').key`);
      await click(`[data-rd-cancel="${monKey}"]`); await wait(300);
      assert(/整個系列刪掉/.test(await text('.rd-act.confirm')), '系列：可以只取消這次或整個刪掉');
      await shot('r05_cancel_confirm');
      await click(`[data-rd-cancel-yes="${monKey}"][data-scope="one"]`); await wait(900); await flush();
      assert(await js(`state.view.raids.list.find((o)=>o.key===${JSON.stringify(monKey)}).canceled`), '取消了這次');
      await shot('r06_canceled');
      await click(`[data-rd-restore="${monKey}"]`); await wait(700);
      assert(!(await js(`state.view.raids.list.find((o)=>o.key===${JSON.stringify(monKey)}).canceled`)), '恢復');
      // 5. 今日行程：計畫檔的 📯、自己建的也排在裡面
      await click('[data-close]'); await wait(300);
      await js(`openPanel('daily'); 0`); await wait(500);
      assert((await js(`document.querySelectorAll('.panel-body .row.raid').length`)) === 2, '今日行程裡兩場團戰');
      await shot('r07_daily');
      await js(`closePanel(); closeDialog(); 0`); await wait(300);
      // 6. 前 15 分鐘提醒（13:45 → 14:00 的週會）
      at('13:45'); await runTick(); await wait(1600); await flush(); await wait(300);
      assert(/週會/.test(await text('#dlgText')) && /15 分鐘/.test(await text('#dlgText')), '前 15 分鐘提醒：' + await text('#dlgText'));
      await refresh(); await wait(300);
      assert(/週會/.test(await text('#tracker')), '狀態欄顯示下一場：' + await text('#tracker'));
      await shot('r08_remind15');
      // 7. 開始：自動專注、縮成貓
      at('14:00'); await runTick(); await wait(1500); await flush();
      assert(engine.state.focus && engine.state.focus.raid && engine.state.focus.raid.title === '週會', '自動專注');
      await shot('r09_start_line');
      for (let i = 0; i < 20 && !(await js('state.mini')); i++) await wait(500);
      assert(await js('state.mini'), '說完縮成小貓');
      await wait(800); await shot('r10_mini_focus');
      // 8. 提早結束（待了 20 分鐘）：算打完、給獎勵
      await js(`api.setMini(false); 0`); await wait(1500);
      at('14:20'); await refresh(); await wait(300);
      assert(/📯/.test(await text('#hudFocus')), '狀態欄的倒數是 📯：' + await text('#hudFocus'));
      await click('#hudFocus'); await wait(300);
      assert(/提早結束了？/.test(await text('#tracker')), '問提早結束');
      await shot('r11_end_confirm');
      await click('[data-focus-stop]'); await wait(1500); await flush(); await wait(400);
      assert(!engine.state.focus && /提早結束/.test(await text('#dlgText')), '提早結束：' + await text('#dlgText'));
      await shot('r12_done_early');
      assert(/^- \[x\] 14:00–15:00 📯 週會/m.test(fs.readFileSync(engine.planFile(), 'utf8')), '計畫檔那格勾起來');
      console.log('RAIDS OK');
      setTimeout(() => process.exit(0), 300);
    } catch (e) { console.error('TEST FAIL', e); await shot('r_fail').catch(() => {}); process.exit(1); }
  });
};
