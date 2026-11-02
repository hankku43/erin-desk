// 💗 好感升階動畫第 4 階「可靠的夥伴」整段走一遍（xvfb 用，離線）
//   看過第 2、3 階、已經到第 4 階的存檔 → 新版本補演第 4 階 → 7 格（第 6 格三選一：選「我陪你練。」）→ 整頁 → 收起來（對小豆說的那句）
//   回答存成 shows.promise＝3；相簿重看用鍵盤 1 選「一起去吧。」→ 不改回答；相簿直接看整頁＝放存起來的那個反應
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
  // 看過第 2、3 階（舊版本只認得 2、3），現在第 4 階 170 分
  const a = engine.aff();
  Object.assign(a, { points: 170, stage: 4, maxStage: 4, shows: { pending: [], seen: { 2: { at: '2026-10-12T01:00:00.000Z' }, 3: { at: '2026-10-20T01:00:00.000Z' } }, known: [2, 3] } });
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const dbg = () => js('Story.debug()');
  // 一路點到收起來；遇到選項點第 pick 個按鈕（真的點 DOM 的按鈕）
  async function playThrough(prefix, pick) {
    const seen = new Set(); let nudged = false;
    for (let i = 0; i < 800; i++) {
      const d = await dbg();
      if (!d) break;
      const key = `${d.shot}-${d.step}-${d.mode}`;
      if (d.ready && !seen.has(key) && d.mode !== 'closing') { seen.add(key); await wait(d.mode === 'page' ? 500 : 900); await shot(`${prefix}${String(seen.size).padStart(2, '0')}_${d.mode === 'page' ? 'page' : `s${d.shot + 1}_${d.step}`}`); }
      if (d.choosing) {
        if (!nudged) { // 選之前點畫面：不會往下
          await js('Story.click()'); await wait(300);
          const d2 = await dbg(); assert(d2.choosing && d2.step === d.step, '要先選一個');
          assert((await js(`document.querySelectorAll('.st-shot .st-pick').length`)) === 3, '三個按鈕');
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
      assert(engine.view().affection.shows.next === 4, '新版本補演第 4 階：' + JSON.stringify(engine.view().affection.shows));
      assert(await js(`document.querySelector('#marker').dataset.kind === 'story'`), '頭上的「!」');
      await shot('f00_marker');
      await js('onNpcClick(); 0'); await wait(200);
      assert((await js(`document.querySelector('#story .st-title').textContent`)) === '其之四　可靠的夥伴', '標題');
      // 圖都載得到
      await wait(1500);
      const broken = await js(`[...document.querySelectorAll('#story img')].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src)`);
      assert(!broken.length, '圖載不到：' + broken.join(','));
      const seen = await playThrough('f', 2);
      assert(!(await js('Story.active()')), '演完收起來');
      assert(seen.has('5-3-shot') && !seen.has('5-1-shot') && !seen.has('5-2-shot') && seen.has('6-1-shot') && [...seen].some((k) => /page$/.test(k)), '選「我陪你練。」：' + [...seen].join(','));
      await wait(700); await shot('f40_end');
      const sh = engine.aff().shows;
      assert(sh.seen[4] && sh.seen[4].at && !sh.pending.length && sh.known.includes(4) && sh.promise === 3 && sh.promiseAt, '存檔：' + JSON.stringify(sh));
      assert((await js(`document.querySelector('#toast').textContent`)).includes('收進回憶相簿：其之四　可靠的夥伴'), '提示');
      assert((await js(`document.querySelector('#idleWhisper').textContent`)) === '……小豆，要加油喔。', '對小豆說的那句');
      // 相簿：三頁＋序章；重看用鍵盤 1 選「一起去吧。」→ 反應後接第 7 格；回答不改
      await wait(3000); await flush(); await js('closeDialog()');
      await js(`openPanel('album'); 0`); await wait(500);
      const albumText = await js(`document.querySelector('#panel').innerText`);
      assert(/其之二　常客/.test(albumText) && /其之三　熟面孔/.test(albumText) && /其之四　可靠的夥伴/.test(albumText), '相簿：' + albumText);
      await shot('f41_album');
      await js(`document.querySelector('[data-alb-play="4"]').click(); 0`); await wait(300);
      for (let i = 0; i < 500; i++) {
        const d = await dbg();
        if (d.choosing) { await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); 0`); await wait(500); break; }
        if (d.ready && d.hint) await js('Story.click()');
        await wait(120);
      }
      for (let i = 0; i < 100; i++) { const d = await dbg(); if (d.step === 1 && d.ready) break; await wait(100); }
      const dA = await dbg();
      assert(dA.shot === 5 && dA.step === 1 && dA.pick === 0, '鍵盤 1：選「一起去吧。」' + JSON.stringify(dA));
      await wait(600); await shot('f42_pick1');
      await js('Story.click()'); await wait(300);
      for (let i = 0; i < 60; i++) { const d = await dbg(); if (d.shot === 6 && d.ready) break; await wait(100); }
      assert((await dbg()).shot === 6, '反應之後接第 7 格');
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0`); await wait(900);
      assert(!(await js('Story.active()')) && engine.aff().shows.seen[4].replayedAt && engine.aff().shows.promise === 3, '重看跳過；回答不改：' + engine.aff().shows.promise);
      // 相簿直接看整頁：第 6 格放存起來的回答（我陪你練＝小豆變愛心）
      await js(`openPanel('album'); 0`); await wait(300);
      await js(`document.querySelector('[data-alb-page="4"]').click(); 0`); await wait(1200);
      assert(await js(`[...document.querySelectorAll('.st-page .st-pn')][5].querySelector('[data-show="3"].on') !== null`), '整頁第 6 格＝存起來的那個反應');
      await shot('f43_album_page');
      await js('Story.click()'); await wait(800);
      console.log('STAGEUP4 OK');
    } catch (e) {
      console.error('STAGEUP4 FAIL', e && e.stack || e);
      try { await shot('f_fail'); } catch (_) { /* 截不到就算了 */ }
    }
    app.quit();
  });
};
