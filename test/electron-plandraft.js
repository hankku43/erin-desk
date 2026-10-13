// 📓 用聊的寫週計畫巡禮：任務板「📓 用聊的排」→ 筆記本模式說幾句（規則速記、撤銷一句、整段貼上）→ 攤開大視窗（塗鴉表格）
// → 點一項自己改、加一格團戰、不確定的變成時段、請艾琳改（AI 關著：用規則加新的）→ 寫進計畫檔（合併）→ 拿到獎勵、任務板換新
// xvfb 用；QUEST_NPC_HOME＝準備好的資料夾（config.json、plans/week.md、data/save.json 已經做完新手教學、AI 關著）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, menuTemplate, pdWin }) => {
  const T = new Date('2026-10-13T10:00:00').getTime(); // 週二
  engine.nowFn = () => new Date(T);
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code, w = wc) => w.executeJavaScript(code);
  const shot = async (name, w = win) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel, w = wc) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})(); 0`, w);
  const setVal = (sel, val, w = wc) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.value=${JSON.stringify(val)}; el.dispatchEvent(new Event('input',{bubbles:true}));})(); 0`, w);
  const text = (sel, w = wc) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`, w);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.queue.length > 0 || state.typing'))) break; await js('advance()'); await wait(120); } };
  const say = async (t) => { await setVal('#chatInput', t); await js(`sendChat(); 0`); await wait(500); await flush(); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const logs = (w) => w.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  logs(wc);
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2500); await flush();
      // 選單有入口
      const sub = menuTemplate().find((m) => /週計畫/.test(m.label || ''));
      assert(sub.submenu[0] && /用聊的/.test(sub.submenu[0].label), '選單第一項：' + (sub.submenu[0] || {}).label);
      // 1. 任務板 →「📓 用聊的排」（週二：直接排本週）
      await js(`closeDialog(); openPanel('board'); 0`); await wait(400);
      await click('[data-pd-open]'); await wait(700); await flush();
      assert(await js(`state.panel === 'pdNote' && !document.querySelector('#chatRow').classList.contains('hidden')`), '筆記本模式、聊天框打開');
      assert(/可以這樣說/.test(await text('.pd-help')), '空白時有範例');
      assert(/本週/.test(await text('#panel .sub')), '本週：' + await text('#panel .sub'));
      await shot('pd01_open');
      // 2. 一句一句說
      await say('週五前寫完週報');
      await say('週二下午兩點到三點開週會');
      await say('提醒我週四下午四點打給廠商');
      await say('下午三點打電話給供應商');
      await say('週三整天出差');
      const d = engine.state.planDraft;
      assert(d.quests.length === 1 && d.rows.length === 1 && d.reminders.length === 1 && d.unsure.length === 1 && d.themes['2026-10-14'] === '出差', '記下來了：' + JSON.stringify(engine.pdView().summary));
      assert((await js(`document.querySelectorAll('.pd-entry').length`)) === 5, '五句');
      assert(/寫完週報/.test(await text('.pd-entry .pd-got')) && /速記/.test(await text('.pd-entry')), '速記標記');
      // 撤銷「出差」那句
      await js(`[...document.querySelectorAll('.pd-entry')].at(-1).querySelector('[data-pd-undo]').click(); 0`); await wait(600);
      assert(!engine.state.planDraft.themes['2026-10-14'] && (await js(`document.querySelectorAll('.pd-entry').length`)) === 4, '撤銷一句');
      // 整段貼上（從信件複製的清單）
      await js(`(()=>{ const i=document.querySelector('#chatInput'); i.focus(); const dt=new DataTransfer(); dt.setData('text/plain','整理月報：收齊數字、寫摘要\\n有空的話整理桌面'); i.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); })(); 0`);
      await wait(700); await flush();
      assert(engine.state.planDraft.quests.some((q) => q.title === '整理月報' && q.steps.length === 2) && engine.state.planDraft.quests.some((q) => q.tier === 'side'), '貼上的兩行都記了');
      // 一般聊天不會跑進來：說「就這樣」→ 提示攤開
      await say('就這樣');
      assert(/攤開/.test(await text('#dlgText')), '說完了：' + await text('#dlgText'));
      await shot('pd02_notebook');
      // 3. 攤開大視窗
      await click('[data-pd-review]');
      let bw = null;
      for (let i = 0; i < 40 && !(bw = pdWin()); i++) await wait(150);
      assert(bw, '大視窗打開');
      logs(bw.webContents);
      await new Promise((r) => (bw.webContents.isLoading() ? bw.webContents.once('did-finish-load', r) : r()));
      await wait(900);
      const B = bw.webContents;
      assert(!win.isVisible(), '主視窗先藏起來');
      assert((await js(`document.querySelectorAll('.sticky').length`, B)) === 3, '三張便利貼');
      assert((await js(`document.querySelectorAll('.day').length`, B)) === 5, '週一～五');
      assert(/攤開/.test(await text('#say', B)), '艾琳說話：' + await text('#say', B));
      assert(/合併|寫進/.test(await text('#target', B)), '寫進現在的計畫檔');
      assert(/會蓋掉計畫檔裡的：委託「寫完週報」/.test(await text('#warns', B)) && await js(`!!document.querySelector('.sticky.over')`, B), '會蓋掉的先警告：' + await text('#warns', B));
      await shot('pd03_big', bw);
      // 4. 點便利貼自己改：改成主線、加步驟
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/寫完週報/.test(e.textContent)).click(); 0`, B); await wait(300);
      assert(!(await js(`document.querySelector('#pop').classList.contains('hidden')`, B)), '小卡打開');
      await js(`document.querySelector('#fTier').value='main'; document.querySelector('#fSteps').value='收資料\\n寫初稿'; 0`, B);
      await shot('pd04_edit', bw);
      await click('[data-psave]', B); await wait(600);
      const q = engine.state.planDraft.quests.find((x) => x.title === '寫完週報');
      assert(q.tier === 'main' && q.steps.length === 2 && q.touched, '改好了');
      assert(await js(`!!document.querySelector('.sticky.hl')`, B), '螢光筆標出改的');
      // 5. 週三加一格團戰（時間跟週會不重疊）
      await js(`document.querySelectorAll('.day')[2].querySelector('[data-add-day]').click(); 0`, B); await wait(250);
      await click('[data-pick="raid"]', B); await wait(250);
      await js(`document.querySelector('#fTitle').value='專案同步'; document.querySelector('#fStart').value='10:00'; document.querySelector('#fEnd').value='10:30'; 0`, B);
      await click('[data-psave]', B); await wait(600);
      assert(engine.state.planDraft.rows.some((r) => r.title === '專案同步' && r.raid && r.date === '2026-10-14'), '加了團戰');
      // 6. 不確定 → 變成時段（選週四）
      await click('[data-res-row]', B); await wait(250);
      await js(`document.querySelector('#fDate').value='2026-10-15'; 0`, B);
      await click('[data-psave]', B); await wait(600);
      assert(!engine.state.planDraft.unsure.length && engine.state.planDraft.rows.some((r) => r.date === '2026-10-15' && r.start === '15:00'), '不確定變成時段');
      // 7. 時間重疊 → 紅筆
      await js(`document.querySelectorAll('.day')[1].querySelector('[data-add-day]').click(); 0`, B); await wait(250);
      await click('[data-pick="row"]', B); await wait(250);
      await js(`document.querySelector('#fTitle').value='寫程式'; document.querySelector('#fStart').value='14:30'; document.querySelector('#fEnd').value='16:00'; 0`, B);
      await click('[data-psave]', B); await wait(600);
      assert(/重疊/.test(await text('#warns', B)) && await js(`!!document.querySelector('.item.warn')`, B), '重疊用紅筆圈起來');
      // 8. 請艾琳改（AI 關著：用規則加新的）
      await setVal('#aiInput', '週五 10:00-11:00 跟客戶開會', B);
      await js(`document.querySelector('#aiForm').requestSubmit(); 0`, B); await wait(900);
      assert(engine.state.planDraft.rows.some((r) => r.date === '2026-10-16' && r.raid), 'AI 關著也能加');
      assert(/AI 現在沒開/.test(await text('#say', B)), '說明 AI 沒開：' + await text('#say', B));
      // 復原再重做
      await click('#bUndo', B); await wait(500);
      assert(!engine.state.planDraft.rows.some((r) => r.date === '2026-10-16'), '復原');
      await setVal('#aiInput', '週五 10:00-11:00 跟客戶開會', B);
      await js(`document.querySelector('#aiForm').requestSubmit(); 0`, B); await wait(900);
      await shot('pd05_table', bw);
      // 9. 寫進計畫檔：先確認
      await click('#bCommit', B); await wait(300);
      assert(/合併進/.test(await text('#confirm', B)) && /紅筆/.test(await text('#confirm', B)), '確認：' + await text('#confirm', B));
      await shot('pd06_confirm', bw);
      const gold0 = engine.state.player.gold;
      await click('[data-go]', B);
      for (let i = 0; i < 40 && pdWin(); i++) await wait(150);
      assert(!pdWin(), '寫完視窗關掉');
      await wait(1500); await flush();
      assert(win.isVisible(), '主視窗回來');
      assert(!engine.state.planDraft && engine.state.player.gold >= gold0 + 10 && engine.state.pdDone['2026-10-12'], '獎勵（一週一次）：' + gold0 + '→' + engine.state.player.gold + ' ' + JSON.stringify(engine.state.pdDone));
      const txt = fs.readFileSync(engine.planFile(), 'utf8');
      assert(/寫完週報 ⭐/.test(txt) && /專案同步/.test(txt) && /📯/.test(txt) && /打給廠商/.test(txt) && /原本就有的委託/.test(txt), '寫進去了（原本的保留）：\n' + txt);
      assert(await js(`state.panel !== 'pdNote' && !document.querySelector('#chatRow').classList.contains('pd-on') && document.querySelector('#chatInput').placeholder === CHAT_HINT`), '筆記本收起來、聊天框變回一般聊天');
      await js(`openPanel('board'); 0`); await wait(500);
      assert(/寫完週報/.test(await text('#panel')) && /整理月報/.test(await text('#panel')), '任務板換新');
      await shot('pd07_board');
      // 10. 再開一次 → 先存著 → 選單顯示「繼續」
      await click('[data-pd-open]'); await wait(600); await flush();
      await say('週四前回信給廠商');
      await click('[data-pd-pause]'); await wait(600); await flush();
      assert(engine.state.planDraft && !engine.state.planDraft.active && await js(`state.panel === null`), '先存著');
      const sub2 = menuTemplate().find((m) => /週計畫/.test(m.label || ''));
      assert(/繼續寫週計畫（筆記本裡有 1 筆）/.test(sub2.submenu[0].label), '選單：' + sub2.submenu[0].label);
      // 筆記本收起來後，聊天就是一般聊天
      assert(await js(`document.querySelector('#chatInput').maxLength === 300`), '聊天框恢復');
      console.log('PLANDRAFT OK');
      setTimeout(() => process.exit(0), 300);
    } catch (e) {
      console.error('TEST FAIL', e);
      await shot('pd_fail').catch(() => {});
      const bw = pdWin(); if (bw) await shot('pd_fail_big', bw).catch(() => {});
      process.exit(1);
    }
  });
};
