// 狀態面板巡禮（xvfb 用）：時段／沙漏、任務／星星、懸停小卡、今日運勢、專注模式
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
  const year = new Date().getFullYear();
  const realNow = engine.nowFn;
  const at = async (hhmm) => { engine.nowFn = () => new Date(`${year}-09-30T${hhmm}:00`); wc.send('view:update', { view: engine.view() }); await wait(500); };
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2500);
      await js(`closeDialog()`);
      // 1. 時段內：⏳ 沙漏
      await at('10:30'); await shot('h01_slot');
      assert(/09:00/.test(await text('#tracker')) && /12:00/.test(await text('#tracker')) && /剩 90 分/.test(await text('#tracker')), '時段內顯示時段與剩餘分鐘：' + await text('#tracker'));
      await at('11:55'); await shot('h02_slot_soon');
      assert(await js(`!!document.querySelector('.fl.soon')`), '剩 10 分內變色');
      await at('11:58'); await shot('h03_slot_end');
      assert(await js(`!!document.querySelector('.fl.end')`), '剩 3 分內變紅');
      // 2. 切到任務：⭐ 星星
      await click('[data-flip]'); await wait(300); await shot('h04_quest');
      assert(await js(`document.querySelectorAll('.stars i').length`) === 3, '任務模式顯示 3 顆星');
      // 3. 懸停小卡
      await js(`document.querySelector('#tracker').dispatchEvent(new MouseEvent('mouseenter'))`); await wait(500); await shot('h05_peek');
      assert(!(await js(`document.querySelector('#hudPeek').classList.contains('hidden')`)), '小卡出現');
      await js(`document.querySelector('#tracker').dispatchEvent(new MouseEvent('mouseleave'))`); await wait(200);
      // 4. 勾一個目標 → 星星亮起來（時段模式也會先切過來秀一下）
      await click('[data-flip]'); await wait(200);
      const qid = await js('state.view.active.id');
      await js(`api.setObjective(${JSON.stringify(qid)}, 0, true).then((r)=>applyView(r.view))`); await wait(350); await shot('h06_star_pop');
      assert(await js(`document.querySelectorAll('.stars i.on').length`) === 1 && await js(`!!document.querySelector('.stars i.pop')`), '新的星星有亮起動畫');
      // 5. 中午沒有時段：自動顯示任務；切換看下一格
      await at('12:40'); await wait(4200); await shot('h07_noon_quest');
      await click('[data-flip]'); await wait(300); await shot('h08_next_slot');
      assert(/下一格・13:30/.test(await text('#tracker')), '中午切換後顯示下一格：' + await text('#tracker'));
      await click('[data-flip]'); await wait(200);
      // 6. 🔮 今日運勢（固定抽到大吉）
      engine.rand = () => 0.01;
      await click('#fortuneTag'); await wait(250); await shot('h09_fortune_back');
      await wait(1300); await shot('h10_fortune_front');
      assert(/大吉/.test(await text('#fortuneTag')), '等級列顯示今天的運勢');
      await click('#fortuneCard'); await wait(500);
      await click('#fortuneTag'); await wait(600); await shot('h11_fortune_again');
      assert(/已經抽過/.test(await text('#fortuneCard')), '第二次點只是再看一次');
      await click('#fortuneCard'); await wait(500);
      // 7. 🍅 專注：開始 → 變回貓咪 → 點貓看剩幾分 → 提前結束
      engine.nowFn = realNow; wc.send('view:update', { view: engine.view() }); await wait(300);
      await js(`closeDialog()`);
      await click('#hudFocus'); await wait(1200); await shot('h12_focus_start');
      await wait(3600); await shot('h13_focus_mini');
      assert(await js('state.mini') && !(await js(`document.querySelector('#focusBadge').classList.contains('hidden')`)), '專注中變回貓咪、有倒數');
      await js(`onNpcClick()`); await wait(2200); await shot('h14_focus_peek');
      assert(/還剩|還有/.test(await text('#dlgText')), '點貓咪告訴你還剩幾分：' + await text('#dlgText'));
      await click('#hudFocus'); await wait(300); await shot('h15_focus_confirm');
      await click('[data-focus-stop]'); await wait(1500);
      assert(!(await js('state.view.focus.active')), '提前結束');
      // 8. 很短的專注，走一次主程式的計時器：時間到 → 從貓咪叫醒 → 獎勵
      const xp0 = engine.state.player.xp;
      await js(`api.startFocus(0.1).then((r)=>{applyView(r.view); setTimeout(()=>goMini(), 1200);})`);
      await wait(9000); await shot('h16_focus_done');
      assert(!(await js('state.mini')) && engine.state.player.xp === xp0 + 15, `時間到叫醒並給星屑（xp ${xp0} → ${engine.state.player.xp}）`);
      assert(/番茄/.test(await text('#dlgText')), '完成台詞：' + await text('#dlgText'));
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
