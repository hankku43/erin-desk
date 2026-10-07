// 🧭 介面整理（10/7）：面板佔滿上方＋對話泡泡、標題列不跳、首頁選單、成就面板、狀態欄、說明小卡、演出排隊、按鈕回饋、各面板小修
// （xvfb 用，不開 Ollama＝離線）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.window.idleAnim = false; // 待機小字會冒在泡泡的位置：測版面時先關掉
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  const rect = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; })()`);
  const home = async () => { await flush(); await js('closePanel(); openDialog(); 0'); await wait(250); };
  let seed = 11; engine.rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      const Y = engine.plan.year;
      engine.nowFn = () => new Date(`${Y}-09-30T10:20:00`);
      engine.loadPlan();
      const qs = engine.plan.quests;
      for (let i = 0; i < qs[0].objectives.length; i++) await engine.setObjective(qs[0].id, i, true);
      await engine.submit(qs[0].id);
      engine.state.player.gold = 640;
      for (const s of ['我的生日是10/8', '這週簡報好趕，壓力好大', '我家養了一隻貓叫麻糬', '我不太喜歡香菜']) engine.noteFrom(s);
      await wait(1800);
      wc.send('view:update', { view: engine.view() }); await wait(300); await flush();

      // 1. 首頁選單：常用四個＋玩法一排六個；還不能交付時沒有交付鈕
      await home();
      assert((await js(`[...document.querySelectorAll('#choices > .btn:not(.hidden)')].map((b) => b.dataset.act).join()`)) === 'board,daily,chat,report', '常用四個');
      assert((await js(`[...document.querySelectorAll('#choices .more button')].map((b) => b.dataset.act).join()`)) === 'divine,fortune,notebook,journal,shop,ach', '玩法一排六個');
      assert(await js(`document.querySelector('#btnSubmit').classList.contains('hidden')`), '還不能交付：沒有交付鈕');
      // 狀態欄：稱號在經驗條上、圖示列只有一行
      assert(await js(`!!document.querySelector('.xpbar #ptitle') && document.querySelector('#ptitle').textContent.length > 1`), '稱號在經驗條上');
      const hudTopH = (await rect('#hudTop')).h;
      assert(hudTopH < 32, '圖示列一行：' + hudTopH);
      await shot('u01_home');

      // 2. 說明小卡：滑過金幣立刻出現
      await js(`document.querySelector('#gold').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); 0`); await wait(300);
      assert(await js(`!document.querySelector('#tip').classList.contains('hidden') && /640 金幣/.test(document.querySelector('#tip').textContent)`), '金幣的說明小卡');
      const tip = await rect('#tip');
      assert(tip.top >= 0 && tip.left >= 0 && tip.right <= 610, '小卡在視窗裡');
      await shot('u02_tip');
      await js(`document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); 0`); await wait(100);
      assert(await js(`document.querySelector('#tip').classList.contains('hidden')`), '滑開就收起來');

      // 3. 任務板：面板從最上面開始、對話框變成泡泡、艾琳說跟任務板有關的話
      await click('[data-act=board]'); await wait(500);
      const up = await rect('#upper'), pn = await rect('#panel'), dl = await rect('#dialog');
      assert(Math.abs(pn.top - up.top) < 2 && Math.abs(pn.bottom - up.bottom) < 2, `面板佔滿上方：${JSON.stringify(pn)}`);
      assert(dl.top > up.bottom && dl.right < 360, `泡泡在上方區域下面、左邊：${JSON.stringify(dl)}`);
      assert(/還差 \d+ 個目標/.test(await js(`document.querySelector('#dlgText').textContent`)), '任務板的台詞：' + await js(`document.querySelector('#dlgText').textContent`));
      assert(!(await js(`state.log.some((x) => /還差 \\d+ 個目標/.test(x.text))`)), '面板台詞不記進「剛剛的對話」');
      assert((await js(`[...document.querySelectorAll('.q-count')].map((x) => x.textContent).join()`)).includes('0/4'), '任務卡寫「0/4」');
      await shot('u03_board');
      // 換到「紀錄」：標題列不跳
      const headTop = (await rect('#panel .panel-head')).top;
      await click('[data-tab=hist]'); await wait(300);
      assert(Math.abs((await rect('#panel .panel-head')).top - headTop) < 1, '換分頁時標題列不動');
      await click('[data-tab=quests]'); await wait(200);
      // 提示小條：疊在面板下緣，不會跑到面板上面去
      await js(`toast('測試提示'); 0`); await wait(200);
      const ts = await rect('#toast');
      assert(ts.top > pn.top + pn.h / 2 && ts.bottom <= pn.bottom, '提示小條在面板下緣：' + JSON.stringify(ts));
      await js(`document.querySelector('#toast').classList.add('hidden'); 0`);
      // 關掉面板：回到首頁選單
      await click('#panel [data-close]'); await wait(300);
      assert(await js(`!document.querySelector('#dialog').classList.contains('hidden') && !document.querySelector('#dialog').classList.contains('compact')`), '關掉面板回到選單');
      assert(!/還差 \d+ 個目標/.test(await js(`document.querySelector('#dlgText').textContent`)), '回到選單時換回她上一句真的說的話');

      // 4. 雜貨舖：雙胞胎說話時艾琳不出聲；只剩三個分頁；星座卡拿到的大張、沒拿到的小張
      await click('[data-act=shop]'); await wait(900);
      assert(await js(`document.querySelector('#dialog').classList.contains('hidden')`), '雜貨舖：泡泡收起來');
      assert((await js(`[...document.querySelectorAll('[data-sp-tab]')].map((b) => b.dataset.spTab).join()`)) === 'gift,decor,cards', '雜貨舖三個分頁');
      await shot('u04_shop');
      engine.state.collection.dust = 25;
      await click('[data-sp-tab=cards]'); await wait(200);
      await js(`api.shopOpen().then((r) => { state.sp.data = r.shop; renderPanel(); }); 0`); await wait(400);
      assert((await js(`getComputedStyle(document.querySelector('.co-cards.miss')).gridTemplateColumns.split(' ').length`)) === 8, '沒拿到的一排八張');
      const ex = await js(`[...document.querySelectorAll('[data-co-ex]')].length`), cheap = await js(`state.sp.data.cards.cards.filter((x) => !x.count && x.cost <= 25).length`);
      assert(ex === cheap && ex > 0, `星屑夠的才有「換」：${ex}／${cheap}`);
      // 按鈕回饋：換卡的那顆先轉圈圈，換到之後新的那張出現在「已收集」
      await js(`document.querySelector('[data-co-ex]').click(); 0`); await wait(30);
      assert(await js(`!!document.querySelector('[data-co-ex].is-busy') || state.sp.data.cards.owned > 0`), '處理中');
      await wait(800);
      assert(await js(`document.querySelectorAll('.co-cards:not(.miss) .co-card').length === 1`), '換到的卡排在前面');
      await shot('u05_cards');
      await click('#panel [data-close]'); await wait(300);

      // 5. 成就：自己一個面板；字都不小於 12px
      await click('[data-act=ach]'); await wait(900);
      assert(await js(`state.panel === 'ach' && document.querySelectorAll('.co-a').length > 20 && !!document.querySelector('.co-progrow span')`), '成就面板');
      const small = await js(`[...document.querySelectorAll('#panel *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => el.className + ':' + el.textContent.slice(0, 8))`);
      assert(!small.length, '成就面板沒有小於 12px 的字：' + small.join('、'));
      assert(/連續上工|成就/.test(await js(`document.querySelector('#dlgText').textContent`)), '成就的台詞');
      await shot('u06_ach');
      await home();

      // 6. 小本子：每一則剛好在橫線上（26px 一行）
      await click('[data-act=notebook]'); await wait(900); await flush();
      const off = await js(`(() => { const p = document.querySelector('.nb-paper').getBoundingClientRect().top; return [...document.querySelectorAll('.nb-item, .nb-sec h3')].map((el) => Math.round(el.getBoundingClientRect().top - p) % 26); })()`);
      assert(off.length >= 6 && off.every((x) => x === 0), '小本子每行對齊橫線：' + off.join());
      await shot('u07_notebook');
      await home();

      // 7. 冒險日誌：四個大數字＋一行小字；週報只有一層捲動；複製鈕打勾
      await click('[data-act=journal]'); await wait(1500); await flush();
      assert((await js(`document.querySelectorAll('.jn-tile').length`)) === 4 && (await js(`document.querySelectorAll('.jn-more span').length`)) === 4, '日誌數字');
      assert(await js(`!!document.querySelector('.panel-head [data-jn-export]') && !document.querySelector('#panel .panel-foot')`), '匯出在標題列、日誌頁沒有頁尾');
      await shot('u08_journal');
      await click('[data-jn-tab=report]'); await wait(300);
      const ta = await js(`(() => { const t = document.querySelector('#jnReport'); return { sh: t.scrollHeight, ch: t.clientHeight }; })()`);
      assert(ta.sh <= ta.ch + 2, '週報文字框跟著內容長高：' + JSON.stringify(ta));
      await click('[data-jn-copy]'); await wait(400);
      assert(/已複製/.test(await js(`document.querySelector('[data-jn-copy]').textContent`)), '複製鈕打勾：' + await js(`document.querySelector('[data-jn-copy]').textContent`));
      await shot('u09_report');
      await wait(1500);
      assert(/複製/.test(await js(`document.querySelector('[data-jn-copy]').textContent`)) && !(await js(`document.querySelector('[data-jn-copy]').classList.contains('is-done')`)), '一下子就恢復');
      await home();

      // 8. 能交付時：首頁出現金色長條，上面寫報酬；交付面板的台詞
      for (let i = 0; i < qs[1].objectives.length; i++) await engine.setObjective(qs[1].id, i, true);
      wc.send('view:update', { view: engine.view() }); await wait(300); await flush();
      await home();
      assert(await js(`!document.querySelector('#btnSubmit').classList.contains('hidden') && /交付「.+」/.test(document.querySelector('#btnSubmit').textContent) && /XP/.test(document.querySelector('#btnSubmit').textContent)`), '交付長條：' + await js(`document.querySelector('#btnSubmit').textContent`));
      await shot('u10_submit_row');

      // 9. 運勢：卡片蓋在狀態欄上，不擋選單；沒有另外飄字；成就等卡片翻開才出現
      await click('[data-act=fortune]'); await wait(700);
      assert(!(await js(`!!document.querySelector('.float-reward')`)), '運勢不另外飄字（卡片上就有獎勵）');
      assert(!(await js(`!!document.querySelector('.ach-pop')`)), '成就還沒出來');
      const fc = await rect('#fortuneCard'), ch = await rect('#choices');
      assert(fc.top > ch.bottom, `運勢卡不擋選單：卡 ${fc.top}、選單 ${ch.bottom}`);
      await wait(1500);
      assert(await js(`!!document.querySelector('.ach-pop')`), '卡片翻開後成就才出來');
      await js(`[...document.querySelectorAll('.ach-pop')].forEach((x) => x.style.animationPlayState = 'paused'); 0`);
      await shot('u11_fortune');
      await js(`hideFortuneCard(); document.querySelectorAll('.ach-pop').forEach((x) => x.remove()); 0`); await wait(500);

      // 10. 專注中：圖示列還是一行，運勢先收起來
      await engine.startFocus(); wc.send('view:update', { view: engine.view() }); await wait(300); await flush();
      assert(Math.abs((await rect('#hudTop')).h - hudTopH) < 2 && (await js(`getComputedStyle(document.querySelector('#fortuneTag')).display`)) === 'none', '專注中狀態欄不換行');
      await js('closeDialog(); 0'); await wait(200);
      await shot('u12_focus');
      console.log('DONE');
    } catch (e) { console.error('FAIL', e); }
    app.quit();
  });
};
