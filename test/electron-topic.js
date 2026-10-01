// 💬 艾琳主動開話題：沒在理她時亮「!」，點她直接說話題（不再打招呼），聊天框自動打開，回她會加好感（xvfb 用，不開 Ollama＝離線）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] }; // 不要讓午餐、下班提醒在測試中間插話
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const force = async () => { engine.lastTouch = Date.now() - 3 * 3600000; engine.proState().lastAt = 0; const r = await engine.proactive({}); wc.send('npc:lines', r.lines); return r; };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 1. 她主動找你：對話框關著 → 頭上亮「!」，先不說
      const r = await force();
      assert(r && r.kind === 'topic', '開了話題：' + JSON.stringify(r && r.kind));
      const said = r.lines[0].text;
      await wait(400); await shot('t01_alert');
      assert(await js(`!document.querySelector('#marker').classList.contains('hidden') && document.querySelector('#marker').dataset.kind === 'alert'`), '頭上亮 !');
      assert(await js(`document.querySelector('#dialog').classList.contains('hidden')`), '對話框還關著');
      // 2. 點她：直接說話題（不再打一次招呼），聊天框自動打開
      const t0 = engine.lastTouch;
      await js(`document.documentElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); onNpcClick()`); await wait(300); await flush(); await wait(300);
      for (let i = 0; i < 20 && (await js(`document.querySelector('#dlgText').textContent`)) !== said; i++) { await flush(); await wait(150); }
      assert((await js(`document.querySelector('#dlgText').textContent`)) === said, '點她就說話題：' + await js(`JSON.stringify({ text: document.querySelector('#dlgText').textContent, talking: state.talking, pend: !!state.pendingAmbient, hidden: document.querySelector('#dialog').classList.contains('hidden') })`));
      assert(await js(`!document.querySelector('#chatRow').classList.contains('hidden')`), '聊天框打開了');
      assert(/回艾琳的話/.test(await js(`document.querySelector('#chatInput').placeholder`)), '提示改成回她的話');
      assert(engine.lastTouch > t0, '點她會告訴主程式（計時重來）');
      await shot('t02_topic');
      // 3. 回她：好感 +1，提示換回原本的
      const p0 = engine.aff().points;
      await js(`document.querySelector('#chatInput').value='我們這邊很少下雪'; document.querySelector('#chatSend').click();`); await wait(600); await flush(); await wait(300);
      assert(engine.aff().points === p0 + 1, `陪她聊天 +1（${p0} → ${engine.aff().points}）`);
      assert(!/回艾琳的話/.test(await js(`document.querySelector('#chatInput').placeholder`)), '送出後提示換回來');
      await shot('t03_replied');
      // 4. 縮成貓咪時：亮「!」，展開後直接說
      await js('goMini()'); await wait(1600);
      await force(); await wait(500);
      assert(await js(`state.mini && state.miniAlert`), '貓咪也會亮 !');
      await shot('t04_mini_alert');
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
