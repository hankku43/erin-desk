// 版面巡禮：把每個畫面都截一張圖（xvfb 用）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const qid = (i) => js(`state.view.quests[${i}].id`); // 任務 id 是標題雜湊，用位置去拿
  const click = (sel) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})()`);
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(3000);
      await shot('t01_greet');
      await click('[data-act=board]'); await wait(700); await shot('t02_board');
      const q1 = await qid(0), q3 = await qid(2);
      await click(`[data-toggle="${q3}"]`); await wait(400); await shot('t03_board_expand2');
      await click('[data-tab=hist]'); await wait(400); await shot('t04_history_empty');
      await click('[data-tab=quests]'); await wait(300);
      await click(`input[data-obj="${q1}"][data-idx="0"]`); await wait(2200); await shot('t05_objective');
      await click(`input[data-obj="${q1}"][data-idx="1"]`); await wait(1200);
      await click(`input[data-obj="${q1}"][data-idx="2"]`); await wait(2200); await shot('t06_ready');
      await click(`[data-submit="${q1}"]`); await wait(600); await shot('t07_submit_form');
      await js(`document.querySelector('#sReport').value='標示補完，申請已寄出'`);
      await click('#sSend'); await wait(700); await shot('t08_reward_fx');
      await wait(3500); await shot('t09_after_submit');
      await click('[data-tab=hist]'); await wait(400); await shot('t10_history');
      await click('[data-act=daily]'); await wait(2200); await shot('t11_daily');
      await click('input[data-row]'); await wait(1500); await shot('t12_daily_checked');
      await click('[data-act=report]'); await wait(700); await shot('t13_report');
      await js(`document.querySelector('#rDone').value='標示補完、上架申請寄出';document.querySelector('#rBlock').value='等審核';document.querySelector('#rNext').value='開始修 P-12'`);
      await click('#rSend'); await wait(2200); await shot('t14_report_done');
      await click('[data-act=chat]'); await wait(300);
      await js(`document.querySelector('#chatInput').value='菜單定稿了'`); await click('#chatSend'); await wait(2200); await shot('t15_chat_proposal');
      await click('#ppYes'); await wait(2200); await shot('t16_chat_applied');
      await click('#dlgMini'); await wait(1000); await shot('t17_mini');
      wc.send('npc:lines', [{ text: '決策時間到了！', emotion: 'thinking', event: 'reminder' }]); await wait(800); await shot('t18_mini_alert');
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
