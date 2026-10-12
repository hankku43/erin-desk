// 💗 好感升階動畫第 3 階「熟面孔」整段走一遍（xvfb 用，離線）
//   看過第 2 階、已經到第 3 階的存檔 → 新版本補演第 3 階 → 7 格（第 6 格二選一：選「看到了喔。」）→ 整頁 → 收起來（她對尾巴說的那句）
//   相簿重看選「……沒看到。」；選之前點畫面不會往下；鍵盤 1／2 也能選
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
  // 看過第 2 階（舊版本只認得第 2 階），現在第 3 階 95 分
  const a = engine.aff();
  Object.assign(a, { points: 95, stage: 3, maxStage: 3, shows: { pending: [], seen: { 2: { at: '2026-10-12T01:00:00.000Z' } }, known: [2] } });
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const dbg = () => js('Story.debug()');
  // 一路點到收起來；遇到二選一點第 pick 個按鈕（真的點 DOM 的按鈕）
  async function playThrough(prefix, pick, { shots = true } = {}) {
    const seen = new Set(); let nudged = false;
    for (let i = 0; i < 700; i++) {
      const d = await dbg();
      if (!d) break;
      const key = `${d.shot}-${d.step}-${d.mode}`;
      if (d.ready && !seen.has(key) && d.mode !== 'closing') { seen.add(key); if (shots) { await wait(d.mode === 'page' ? 350 : 150); await shot(`${prefix}${String(seen.size).padStart(2, '0')}_${d.mode === 'page' ? 'page' : `s${d.shot + 1}_${d.step}`}`); } }
      if (d.choosing) {
        if (!nudged) { // 選之前點畫面：不會往下
          await js('Story.click()'); await wait(300);
          const d2 = await dbg(); assert(d2.choosing && d2.step === d.step, '要先選一個');
          nudged = true;
        }
        await js(`document.querySelector('.st-pick[data-pick="${pick}"]').click(); 0`); await wait(400);
        continue;
      }
      if (d.ready && (d.hint || d.mode === 'page')) { await js('Story.click()'); await wait(250); continue; }
      await wait(100);
    }
    return seen;
  }
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(1800);
      assert(engine.view().affection.shows.next === 3, '新版本補演第 3 階：' + JSON.stringify(engine.view().affection.shows));
      assert(await js(`document.querySelector('#marker').dataset.kind === 'story'`), '頭上的「!」');
      await shot('t00_marker');
      await js('onNpcClick(); 0'); await wait(200);
      assert((await js(`document.querySelector('#story .st-title').textContent`)) === '其之三　熟面孔', '標題');
      const seen = await playThrough('t', 1);
      assert(!(await js('Story.active()')), '演完收起來');
      assert(seen.has('5-2-shot') && !seen.has('5-1-shot') && seen.has('5-3-shot') && [...seen].some((k) => /page$/.test(k)), '選「看到了喔。」：' + [...seen].join(','));
      await wait(700); await shot('t30_end');
      const sh = engine.aff().shows;
      assert(sh.seen[3] && sh.seen[3].at && !sh.pending.length && sh.known.includes(3), '存檔：' + JSON.stringify(sh));
      assert((await js(`document.querySelector('#toast').textContent`)).includes('收進回憶相簿：其之三　熟面孔'), '提示');
      assert((await js(`document.querySelector('#idleWhisper').textContent`)) === '……尾、尾巴，不准搖。', '對尾巴說的那句');
      // 相簿：兩頁＋序章；重看選「……沒看到。」（鍵盤 1）
      await wait(3000); await flush(); await js('closeDialog()');
      await js(`openPanel('album'); 0`); await wait(500);
      const albumText = await js(`document.querySelector('#panel').innerText`);
      assert(/其之二　常客/.test(albumText) && /其之三　熟面孔/.test(albumText), '相簿：' + albumText);
      await shot('t31_album');
      await js(`document.querySelector('[data-alb-play="3"]').click(); 0`); await wait(300);
      for (let i = 0; i < 400; i++) {
        const d = await dbg();
        if (d.choosing) { await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); 0`); await wait(500); break; }
        if (d.ready && d.hint) await js('Story.click()');
        await wait(120);
      }
      for (let i = 0; i < 100; i++) { const d = await dbg(); if (d.step === 1 && d.ready) break; await wait(100); }
      const dA = await dbg();
      assert(dA.shot === 5 && dA.step === 1 && dA.pick === 0, '鍵盤 1：選「……沒看到。」' + JSON.stringify(dA));
      await wait(300); await shot('t32_pickA');
      await js('Story.click()'); await wait(200);
      for (let i = 0; i < 60; i++) { const d = await dbg(); if (d.step === 3 && d.ready) break; await wait(100); }
      assert((await dbg()).step === 3, '反應之後接提燈');
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0`); await wait(800);
      assert(!(await js('Story.active()')) && engine.aff().shows.seen[3].replayedAt, '重看跳過');
      // 整頁
      await js(`openPanel('album'); 0`); await wait(300);
      await js(`document.querySelector('[data-alb-page="3"]').click(); 0`); await wait(1000);
      await shot('t33_album_page');
      await js('Story.click()'); await wait(800);
      console.log('STAGEUP3 OK');
    } catch (e) {
      console.error('STAGEUP3 FAIL', e && e.stack || e);
      try { await shot('t_fail'); } catch (_) { /* 截不到就算了 */ }
    }
    app.quit();
  });
};
