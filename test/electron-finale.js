// 💗 好感升階第 5 階「特別的冒險者」（終章，舞台模式）整段走一遍（xvfb 用，離線）
//   看過第 2～4 階（第 4 階選了「一起去吧。」）、跳過了開場（沒選那句話）、登記簿空著的存檔 → 新版本補演終章
//   點「!」→ 主視窗藏起來、開全螢幕舞台 → 回憶裡選那句話 → 登記簿寫名字 → ⚙ 系統提示選「登記的名字」→ 第一次叫名字 → 燈籠的願望 → 燈籠飛上夜空 → 縮回右下角
//   演完：稱呼解鎖、存進設定；主視窗的她小聲叫你一次；相簿多一頁（只有重看）；重看跳過什麼都不改；⚙「她怎麼叫你」可以改
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app, menuTemplate, finale }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.state.opening = { done: true, at: new Date().toISOString(), echo: 0, skipped: true };
  engine.state.playerName = '';
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.twins = { ...(engine.config.twins || {}), tea: false };
  const a = engine.aff();
  Object.assign(a, { points: 300, stage: 5, maxStage: 5, shows: { pending: [], seen: { 2: { at: '2026-10-12T01:00:00.000Z' }, 3: { at: '2026-10-20T01:00:00.000Z' }, 4: { at: '2026-11-01T01:00:00.000Z' } }, known: [2, 3, 4], promise: 1, promiseAt: '2026-11-01T01:00:00.000Z' } });
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const shot = async (name, w = win) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const getFinale = async (ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const w = finale.win(); if (w && !w.isDestroyed()) return w; await wait(80); } throw new Error('終章視窗沒有開'); };
  const loaded = async (w) => { for (let i = 0; i < 100; i++) { try { if (await w.webContents.executeJavaScript('!!window.__fn')) return; } catch (_) { /* 還在載 */ } await wait(100); } throw new Error('終章視窗沒載好'); };
  const closed = async (w, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (w.isDestroyed()) return; await wait(100); } throw new Error('終章視窗沒有關'); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });

  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(1800);
      assert(engine.view().affection.shows.next === 5, '新版本補演終章：' + JSON.stringify(engine.view().affection.shows));
      assert(engine.view().npc.call === '冒險者' && !engine.view().npc.callUnlocked, '還沒解鎖稱呼');
      assert(!JSON.stringify(menuTemplate()).includes('她怎麼叫你'), '解鎖前選單沒有「她怎麼叫你」');
      assert(await js(`document.querySelector('#marker').dataset.kind === 'story'`), '頭上的「!」');
      await js('onNpcClick(); 0');
      // ── 終章視窗 ──
      const fw = await getFinale();
      fw.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[finale]', e.message); });
      await loaded(fw);
      const fj = (code) => fw.webContents.executeJavaScript(code);
      const fshot = (name) => shot(name, fw);
      await fj(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      assert(!win.isVisible(), '演的時候主視窗藏起來');
      assert(await js('Story.active() && !!Story.stage()'), '主視窗知道正在演終章');
      const steps = await fj('__fn.steps()');
      assert(steps.includes('reg') && steps.includes('callSet') && steps.includes('promise') && steps.includes('mPick'), '登記簿空著、要設定稱呼、有約定：' + steps.join(','));
      // 圖都載得到
      await wait(2500);
      const broken = await fj(`[...document.querySelectorAll('img')].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src)`);
      assert(!broken.length, '圖載不到：' + broken.join(','));
      const step = () => fj('__fn.step()');
      const typed = async () => { for (let i = 0; i < 120; i++) { if (!(await fj('__fn.typing()'))) return; await wait(80); } };
      const SHOTS = { brush: 'n02_brush', cheek: 'n03_cheek', point: 'n04_point', twice: 'n05_twice', deny: 'n06_deny', remember: 'n07_remember', mCloak: 'n08_cloak', mPick: 'n09_pick', mWords: 'n10_words', mNotice: 'n11_notice', mBell: 'n12_bell', confess: 'n13_confess', steamNar: 'n14_steam', why: 'n15_why', promise: 'n16_promise', ask: 'n17_ask', reg: 'n18_reg', callSet: 'n19_callset', called: 'n20_called', called2: 'n21_called2', wish: 'n22_wish', skyOpen: 'n23_sky', last: 'n24_last' };
      const seen = new Set();
      let id = '';
      for (let i = 0; i < 600; i++) {
        if (fw.isDestroyed()) break;
        id = await step();
        if (id === 'finale') break;
        if (!seen.has(id)) {
          seen.add(id);
          if (id === 'title') { await wait(1400); await fshot('n01_title'); }
          if (SHOTS[id]) { await wait(id === 'skyOpen' ? 1500 : 700); await typed(); await wait(500); await fshot(SHOTS[id]); }
          if (id === 'point') assert(await fj(`!!document.querySelector('#props .f-trail') && !!document.querySelector('#props .f-ring')`), '指星星：手指到星星的光、圈起來的那顆');
          if (id === 'confess') assert(await fj(`document.querySelectorAll('#efx .f-steam path').length === 3`), '頭上冒煙');
          if (id === 'promise') assert((await fj('__fn.erin()')).pose === 'pinky' && /極光/.test(await fj('__fn.text()')), '約定：一起去看極光（打勾勾）');
          if (id === 'mPick') { assert(await fj(`document.querySelectorAll('.choices button').length === 3`), '沒選過那句話：在這裡選'); await fj('__fn.choose(2); 0'); await wait(300); continue; }
          if (id === 'mWords') assert(/淋了雨會感冒喔/.test(await fj('__fn.text()')), '說了選的那句');
          if (id === 'reg') { await typed(); await fj(`__fn.register('小葵'); 0`); await wait(400); continue; }
          if (id === 'callSet') {
            assert(/登記的名字「小葵」/.test(await fj(`document.querySelector('.sys.call').innerText`)), '選項有登記的名字');
            assert(/不能有「我」/.test(await fj(`__fn.callOwn('我的勇者')`)), '自己取：不合規則會提示');
            assert((await step()) === 'callSet', '不合規則：留在這裡');
            await fj(`__fn.callOpt('player'); 0`); await wait(400); continue;
          }
          if (id === 'called') assert((await fj('__fn.text()')) === '…………小葵。' && (await fj('__fn.np()')) === '艾琳', '第一次叫名字');
          if (id === 'wish') assert((await fj('__fn.wish()')) === '一直當小葵的接待員。', '燈籠上的願望：' + await fj('__fn.wish()'));
          if (id === 'last') assert((await fj('__fn.text()')) === '以後也請多指教喔，小葵。', '最後一句');
        }
        if (['title', 'hall', 'skyOpen', 'mPick', 'reg', 'callSet'].includes(id)) { await wait(150); continue; }
        await fj('__fn.click(); 0'); await wait(id && !(await fj('__fn.typing()')) ? 260 : 120);
      }
      assert(['brush', 'twice', 'mCloak', 'mFire', 'mKept', 'mLook', 'mNotice', 'mBell', 'mNap', 'confess', 'why', 'promise', 'ask', 'reg', 'callSet', 'called', 'called2', 'wish', 'wishNar', 'sky', 'last'].every((k) => seen.has(k)), '每一步都演到：' + [...seen].join(','));
      await wait(1500); try { await fshot('n25_finale'); } catch (_) { /* 已經關了 */ }
      await closed(fw);
      await wait(1200);
      // ── 演完：存檔、主視窗 ──
      assert(win.isVisible(), '主視窗回來');
      const sh = engine.aff().shows;
      assert(sh.seen[5] && sh.seen[5].at && !sh.pending.length && sh.known.includes(5), '存檔：' + JSON.stringify(sh));
      assert(engine.state.callUnlocked && engine.config.npc.callName === '小葵' && engine.state.playerName === '小葵' && engine.state.opening.echo === 2, '稱呼、登記名字、那句話：' + JSON.stringify({ c: engine.config.npc.callName, p: engine.state.playerName, o: engine.state.opening }));
      assert(engine.view().npc.call === '小葵', '她現在叫你小葵');
      await wait(600);
      assert((await js(`document.querySelector('#toast').textContent`)).includes('收進回憶相簿：終章　特別的冒險者'), '提示');
      assert((await js(`document.querySelector('#idleWhisper').textContent`)) === '……小葵。嘿嘿。', '主視窗的她小聲叫一次：' + await js(`document.querySelector('#idleWhisper').textContent`));
      assert(!(await js('Story.active()')), '主視窗不再是演出中');
      await shot('n30_main');
      assert(JSON.stringify(menuTemplate()).includes('她怎麼叫你（現在叫你「小葵」）'), '選單多了「她怎麼叫你」');
      // ── 相簿：終章只有「重看」；重看不問名字和稱呼，跳過什麼都不改 ──
      await wait(3000); await flush(); await js('closeDialog()');
      await js(`openPanel('album'); 0`); await wait(500);
      const albumText = await js(`document.querySelector('#panel').innerText`);
      assert(/終章　特別的冒險者/.test(albumText) && (await js(`!!document.querySelector('[data-alb-play="5"]') && !document.querySelector('[data-alb-page="5"]')`)), '相簿：' + albumText);
      await shot('n31_album');
      await js(`document.querySelector('[data-alb-play="5"]').click(); 0`);
      const fw2 = await getFinale();
      await loaded(fw2);
      const steps2 = await fw2.webContents.executeJavaScript('__fn.steps()');
      assert(!steps2.includes('reg') && !steps2.includes('callSet'), '重看：不問名字和稱呼：' + steps2.join(','));
      await wait(1500);
      await fw2.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0`);
      await closed(fw2); await wait(800);
      assert(engine.aff().shows.seen[5].replayedAt && engine.config.npc.callName === '小葵' && engine.state.playerName === '小葵', '重看跳過：什麼都不改');
      assert(win.isVisible() && !(await js('Story.active()')), '重看完主視窗回來');
      // ── ⚙ 她怎麼叫你 ──
      await js(`openPanel('callName'); 0`); await wait(400);
      assert((await js(`document.querySelector('#cnName').value`)) === '小葵', '面板：現在的稱呼');
      await shot('n32_callpanel');
      await js(`document.querySelector('#cnName').value = '我'; document.querySelector('#cnSave').click(); 0`); await wait(300);
      assert(/不能有「我」/.test(await js(`document.querySelector('#cnErr').textContent`)), '面板：不合規則');
      await js(`document.querySelector('#cnName').value = '小隊長'; document.querySelector('#cnSave').click(); 0`); await wait(1500);
      assert(engine.config.npc.callName === '小隊長' && engine.view().npc.call === '小隊長', '改好了');
      assert(/小隊長/.test(await js(`document.querySelector('#dlgText').textContent`)), '她用新稱呼叫一次：' + await js(`document.querySelector('#dlgText').textContent`));
      await shot('n33_called_new');
      console.log('FINALE OK');
    } catch (e) {
      console.error('FINALE FAIL', e && e.stack || e);
      try { await shot('n_fail'); } catch (_) { /* 截不到就算了 */ }
      try { const w = finale.win(); if (w && !w.isDestroyed()) await shot('n_fail_finale', w); } catch (_) { /* 截不到就算了 */ }
    }
    app.quit();
  });
};
