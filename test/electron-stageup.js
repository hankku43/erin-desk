// 💗 好感升階動畫（第 2 階「常客」）整段走一遍（xvfb 用，離線）
//   舊存檔（第 2 階、沒看過）→ 頭上冒「!」→ 點她 → 7 格一格一格點完 → 拉遠成整頁 → 收起來：存檔、她小聲說一句、收進回憶相簿
//   演的時候她想說的話先收著；🎬 回憶相簿：整頁、重看（Esc 跳過）；演到一半縮成貓 → 下次再演
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.state.opening = { done: true, at: new Date().toISOString(), echo: 3 };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.twins = { ...(engine.config.twins || {}), tea: false };
  // 舊存檔：已經是第 2 階（76 分），還沒有 shows
  const a = engine.aff();
  Object.assign(a, { points: 76, stage: 2, maxStage: 2 });
  delete a.shows;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const dbg = () => js('Story.debug()');
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(1800);
      // 1. 頭上冒升階的「!」（不是普通的 !），滑過有說明
      assert(engine.view().affection.shows.next === 2, '舊存檔補演第 2 階');
      assert(await js(`document.querySelector('#marker').dataset.kind === 'story' && !document.querySelector('#marker').classList.contains('hidden')`), '頭上的「!」');
      assert((await js(`document.querySelector('#marker').dataset.tip`)) === '艾琳好像有話想說……（點她）', '說明小卡');
      await shot('su00_marker');
      // 2. 點她 → 漫畫從她身上展開；一格一格點
      await js('onNpcClick(); 0');
      await wait(200);
      assert(await js('Story.active()'), '開始演');
      const seen = new Set(); let clicks = 0, lastKey = '';
      for (let i = 0; i < 600; i++) {
        const d = await dbg();
        if (!d) break;
        const key = `${d.shot}-${d.step}-${d.mode}`;
        if (d.ready && !seen.has(key)) { seen.add(key); await wait(d.mode === 'page' ? 300 : 120); await shot(`su${String(seen.size).padStart(2, '0')}_${d.mode === 'page' ? 'page' : `s${d.shot + 1}_${d.step}`}`); }
        if (d.mode === 'shot' && d.shot === 1 && d.step === 0 && !d.ready && key !== lastKey) { // 演的時候她想說的話：先收著
          wc.send('npc:lines', [{ text: '（測試）演完再說的話。', emotion: 'normal' }]);
        }
        lastKey = key;
        if (d.ready && (d.hint || d.mode === 'page')) { await js('Story.click()'); clicks++; await wait(250); continue; }
        await wait(100);
      }
      assert(!(await js('Story.active()')), '演完收起來');
      assert(seen.size >= 13 && seen.has('6-2-shot') && [...seen].some((k) => /page$/.test(k)), '13 個畫面＋整頁：' + [...seen].join(','));
      await wait(700); await shot('su20_end');
      // 3. 存檔：收進相簿、不再冒「!」；她小聲說一句、提示收進相簿
      const sh = engine.aff().shows;
      assert(sh.pending.length === 0 && sh.seen[2] && sh.seen[2].at && !sh.seen[2].skipped, '存檔：' + JSON.stringify(sh));
      assert((await js(`document.querySelector('#toast').textContent`)).includes('收進回憶相簿：其之二　常客'), '提示');
      assert((await js(`document.querySelector('#idleWhisper').textContent`)) === '……嘿嘿。', '小聲說一句');
      assert(await js(`document.querySelector('#marker').dataset.kind !== 'story'`), '「!」不見了');
      await wait(1500);
      assert(/演完再說的話/.test(await js(`document.querySelector('#dlgText').textContent`)), '演的時候收著的話，演完才說');
      await flush(); await js('closeDialog()');
      // 4. 🎬 回憶相簿：開場＋其之二
      await js(`openPanel('album'); 0`); await wait(500);
      const albumText = await js(`document.querySelector('#panel').innerText`);
      assert(/序章　雨夜的小白貓/.test(albumText) && /其之二　常客/.test(albumText), '相簿：' + albumText);
      await shot('su21_album');
      await js(`document.querySelector('[data-alb-page="2"]').click(); 0`); await wait(900);
      const dp = await dbg();
      assert(dp && dp.mode === 'page' && dp.ready, '直接看整頁');
      await shot('su22_album_page');
      await js('Story.click()'); await wait(800);
      assert(!(await js('Story.active()')) && !(await js(`(document.querySelector('#toast').textContent || '').includes('收進') && !document.querySelector('#toast').classList.contains('hidden')`)), '重看不再提示收進相簿');
      const at1 = engine.aff().shows.seen[2].at;
      await js(`openPanel('album'); 0`); await wait(300);
      await js(`document.querySelector('[data-alb-play="2"]').click(); 0`); await wait(1500);
      assert(await js('Story.active()'), '重看');
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0`); await wait(800);
      assert(!(await js('Story.active()')) && engine.aff().shows.seen[2].at === at1 && engine.aff().shows.seen[2].replayedAt, 'Esc 跳過；看過的時間不變、記重看');
      // 5. 演到一半縮成貓：收起來，下次再演（不算看過）
      engine.aff().shows = { pending: [2], seen: {}, known: [2] };
      wc.send('view:update', { view: engine.view() }); await wait(1800);
      assert(await js(`document.querySelector('#marker').dataset.kind === 'story'`), '又冒「!」');
      await js('onNpcClick(); 0'); await wait(1500);
      await js('applyMini(true); 0'); await wait(500);
      assert(!(await js('Story.active()')) && engine.aff().shows.pending.includes(2), '縮成貓：先收起來，還沒看過');
      await js('applyMini(false); 0'); await wait(1800);
      assert(await js(`document.querySelector('#marker').dataset.kind === 'story'`), '展開後又冒「!」');
      // 6. 專注中不冒「!」
      engine.startFocus(25); wc.send('view:update', { view: engine.view() }); await wait(1800);
      assert(await js(`document.querySelector('#marker').dataset.kind !== 'story'`), '專注中不冒');
      engine.cancelFocus(); wc.send('view:update', { view: engine.view() }); await wait(1800);
      assert(await js(`document.querySelector('#marker').dataset.kind === 'story'`), '專注完又冒');
      console.log('STAGEUP OK');
    } catch (e) {
      console.error('STAGEUP FAIL', e && e.stack || e);
      try { await shot('su_fail'); } catch (_) { /* 截不到就算了 */ }
    }
    app.quit();
  });
};
