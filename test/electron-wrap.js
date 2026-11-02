// 🌙 收工問卡點：回了先跳確認卡（記下／先不要），按確認才寫進計畫檔（11/2：不一定要回報）（xvfb 用，離線）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';
const G = require('../src/main/game');

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.llm.enabled = false;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const visible = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0; })()`);
  const until = async (cond, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await cond()) return true; await wait(100); } return false; };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const send = (msg) => js(`(() => { if (document.querySelector('#chatRow').classList.contains('hidden')) document.querySelector('[data-act=chat]').click(); document.querySelector('#chatInput').value = ${JSON.stringify(msg)}; document.querySelector('#chatSend').click(); })(); 0`);
  const today = () => G.todayISO(engine.now());
  const ask = () => { engine.state.wrapAsk = { date: today(), at: engine.now().getTime() - 60000 }; engine.writePlan(engine.planText.replace(/\n## 進度紀錄[\s\S]*$/, '\n')); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 1. 回了卡點 → 確認卡（完成／卡點／明日）＋她問要不要記
      ask();
      await send('卡在等廠商報價，明天先寫測試');
      assert(await until(() => visible('#proposal')), '跳確認卡');
      await wait(600); await flush();
      const card = await text('#proposal');
      assert(/整理的收工回報/.test(card) && /寫收工回報/.test(card) && /卡點 等廠商報價/.test(card) && /明日 寫測試/.test(card) && /先不要/.test(card) && /記下來/.test(card), '確認卡：' + card);
      assert(/收工回報|卡住|進度/.test(await text('#dlgText')), '她問要不要記：' + await text('#dlgText'));
      assert(!engine.plan.progressLog.some((x) => x.date === today()), '還沒記');
      await shot('w01_confirm');
      // 2. 按確認 → 寫進計畫檔、她回收工的話
      await js(`document.querySelector('#ppYes').click(); 0`);
      assert(await until(() => engine.plan.progressLog.some((x) => x.date === today())), '確認後寫進計畫檔');
      await wait(800); await flush();
      assert(!(await visible('#proposal')), '卡片收起來');
      await shot('w02_recorded');
      // 3. 隔一次：回的是閒聊 → 按「先不要」→ 不記
      ask(); engine.state.chat = [];
      await js('closeDialog()'); await wait(200);
      await send('今天好累喔');
      assert(await until(() => visible('#proposal')), '一樣先問');
      await wait(400); await flush();
      await js(`document.querySelector('#ppNo').click(); 0`);
      await wait(800); await flush();
      assert(/不記|先不記/.test(await text('#dlgText')) && !engine.plan.progressLog.some((x) => x.date === today()), '先不要：' + await text('#dlgText'));
      await shot('w03_skip');
      console.log('WRAP TEST OK');
    } catch (e) { console.error('WRAP TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => app.quit(), 300);
  });
};
