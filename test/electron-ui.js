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
  engine.config.twins = { ...(engine.config.twins || {}), enabled: false }; // 15:00–17:00 跑測試時雙胞胎的下午茶會插進來：先關掉（10/13）
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
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
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

      // 1. 首頁選單：常用四個＋一排四個（魔法、回憶、日誌、雜貨舖）；還不能交付時沒有交付鈕
      await home();
      assert((await js(`[...document.querySelectorAll('#choices > .btn:not(.hidden)')].map((b) => b.dataset.act).join()`)) === 'board,pd,daily,chat', '常用四個：週任務板、委託、今日行程、聊聊');
      assert((await js(`[...document.querySelectorAll('#choices .more button')].map((b) => b.dataset.act).join()`)) === 'magic,memories,journal,shop', '魔法、回憶、日誌、雜貨舖一排四個');
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

      // 3b. 今日行程：標題列只有標題，按鈕在下面的工具列；字寬多 15%（Windows 的字比較寬）也不會把按鈕拆成兩行
      await click('[data-act=daily]'); await wait(600); await flush();
      // 10/13：工具列只剩四顆有字的（時段、提醒、團戰、筆記本↗）；請假、匯入匯出在 ⋯；收工回報是清單最下面一條
      const tb = await js(`(() => { const bs = [...document.querySelectorAll('#panel .panel-tools > .btn')]; return { n: bs.length, text: bs.map((b) => b.textContent.trim()), worded: bs.every((b) => /[\\u4e00-\\u9fff]/.test(b.textContent)), head: !!document.querySelector('#panel .panel-head [data-new]'), menu: document.querySelectorAll('#panel .tool-menu [role=menuitem]').length, wrap: (document.querySelector('#panel .panel-foot .wrap-row[data-report-open]') || {}).textContent || '' }; })()`);
      assert(!tb.head && tb.n === 4 && tb.worded && /筆記本↗/.test(tb.text.join('')) && tb.menu === 3 && /收工回報/.test(tb.wrap), '工具列四顆有字＋⋯三項＋收工回報在最下面：' + JSON.stringify(tb));
      await click('[data-tool-more]'); await wait(150);
      assert(await js(`!document.querySelector('#panel .tool-menu').classList.contains('hidden') && document.querySelector('#panel .tool-menu').getBoundingClientRect().right <= window.innerWidth`), '⋯ 打開、不超出視窗');
      await shot('u03a_daily_more');
      await js(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 0`); await wait(100);
      assert(await js(`document.querySelector('#panel .tool-menu').classList.contains('hidden')`), '點外面 ⋯ 收起來');
      const wide = await wc.insertCSS('.panel-head *, .panel-tools * { letter-spacing: .15em !important; }');
      await wait(200);
      const hd = await js(`(() => { const h = document.querySelector('#panel .panel-head'); const bs = [...document.querySelectorAll('#panel .panel-head button, #panel .panel-tools button, #panel .panel-head h2')]; return { h: h.getBoundingClientRect().height, tall: bs.filter((b) => b.getBoundingClientRect().height > 36).map((b) => b.textContent.trim()) }; })()`);
      assert(hd.h < 46 && !hd.tall.length, '標題列一行、按鈕不拆兩行：' + JSON.stringify(hd));
      await wc.removeInsertedCSS(wide);
      await shot('u03b_daily');
      await home();

      // 4. 雜貨舖：雙胞胎說話時艾琳不出聲；只剩三個分頁；星座卡拿到的大張、沒拿到的小張
      await click('[data-act=shop]'); await wait(900);
      assert(await js(`document.querySelector('#dialog').classList.contains('hidden')`), '雜貨舖：泡泡收起來');
      assert((await js(`[...document.querySelectorAll('[data-sp-tab]')].map((b) => b.dataset.spTab).join()`)) === 'gift,decor,cards', '雜貨舖三個分頁');
      await shot('u04_shop');
      // 10/13 L：剛開店招牌是大的；換過分頁就縮成一行（小頭像＋一句話），清單多出一截
      const stall0 = await js(`document.querySelector('.sp-stall').getBoundingClientRect().height`);
      engine.state.collection.dust = 25;
      await click('[data-sp-tab=cards]'); await wait(200);
      await js(`api.shopOpen().then((r) => { state.sp.data = r.shop; renderPanel(); }); 0`); await wait(400);
      const stall1 = await js(`document.querySelector('.sp-stall.compact') ? document.querySelector('.sp-stall.compact').getBoundingClientRect().height : 0`);
      assert(stall0 >= 120 && stall1 > 0 && stall1 <= 50 && (await js(`!!document.querySelector('.sp-stall.compact .st-say span') && document.querySelector('.sp-stall.compact .tw-bust.on').getBoundingClientRect().height < 90`)), `招牌縮成一行：${stall0} → ${stall1}`);
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
      // 10/13 G：魔法、回憶點了在原位展開子選項（不另開一層面板），再點一次收起來
      await click('[data-act=memories]'); await wait(300);
      assert(await js(`!state.panel && !document.querySelector('#subRow').classList.contains('hidden') && document.querySelectorAll('#subRow [data-act]').length === 3 && document.querySelector('#choices .more [data-act=memories]').classList.contains('on')`), '回憶：原位展開三個子選項');
      await shot('u05b_sub_memories');
      await click('[data-act=memories]'); await wait(200);
      assert(await js(`document.querySelector('#subRow').classList.contains('hidden')`), '再點一次收起來');
      await click('[data-act=memories]'); await wait(300); await click('#subRow [data-act=ach]'); await wait(900);
      assert(await js(`document.querySelector('#subRow').classList.contains('hidden') && !!document.querySelector('.co-level .co-lv')`), '子選項點了就收起來；成就最上面有等級'); // 10/13 N
      assert(await js(`state.panel === 'ach' && document.querySelectorAll('.co-a').length > 20 && !!document.querySelector('.co-progrow span')`), '成就面板');
      const small = await js(`[...document.querySelectorAll('#panel *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => el.className + ':' + el.textContent.slice(0, 8))`);
      assert(!small.length, '成就面板沒有小於 12px 的字：' + small.join('、'));
      assert(/連續上工|成就/.test(await js(`document.querySelector('#dlgText').textContent`)), '成就的台詞');
      await shot('u06_ach');
      await home();

      // 6. 小本子：每一則剛好在橫線上（26px 一行）
      await click('[data-act=memories]'); await wait(300); await click('#subRow [data-act=notebook]'); await wait(900); await flush();
      const off = await js(`(() => { const p = document.querySelector('.nb-paper').getBoundingClientRect().top; return [...document.querySelectorAll('.nb-item, .nb-sec h3')].map((el) => Math.round(el.getBoundingClientRect().top - p) % 26); })()`);
      assert(off.length >= 6 && off.every((x) => x === 0), '小本子每行對齊橫線：' + off.join());
      await shot('u07_notebook');
      await home();

      // 7. 冒險日誌：四個大數字＋一行小字；週報只有一層捲動；複製鈕打勾
      await click('[data-act=journal]'); await wait(1500); await flush();
      assert((await js(`document.querySelectorAll('.jn-tile').length`)) === 4 && (await js(`document.querySelectorAll('.jn-more span').length`)) === 4, '日誌數字');
      assert(await js(`!document.querySelector('.panel-head [data-jn-export]') && /匯出/.test((document.querySelector('#panel .panel-foot [data-jn-export]') || {}).textContent || '')`), '匯出在頁尾、有字（10/14 K）');
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
      // 10/14 I：狀態欄追蹤列第二行寫「可以交付了」，不會被截成「點艾…」
      const fl = await js(`(() => { const s = document.querySelector('#tracker .fl-sub'); return { t: s.textContent, sw: s.scrollWidth, cw: s.clientWidth }; })()`);
      assert(/可以交付了/.test(fl.t) && fl.sw <= fl.cw + 1, '追蹤列不截字：' + JSON.stringify(fl));
      // 10/14 E：欄位少的表單貼在上方、只佔需要的高度，按鈕就在欄位下面
      for (const [kind, code] of [['rowForm', `openPanel('daily'); openForm('rowForm')`], ['submit', `openPanel('submit', ${JSON.stringify(qs[1].id)})`]]) {
        await js(code + '; 0'); await wait(400);
        const g = await js(`(() => { const p = document.querySelector('#panel').getBoundingClientRect(), u = document.querySelector('#upper').getBoundingClientRect(), f = document.querySelector('#panel .panel-foot').getBoundingClientRect(), last = [...document.querySelectorAll('#panel .panel-body input, #panel .panel-body textarea')].at(-1).getBoundingClientRect(); return { pTop: Math.round(p.top - u.top), pH: Math.round(p.height), uH: Math.round(u.height), gap: Math.round(f.top - last.bottom) }; })()`);
        assert(g.pTop <= 2 && g.pH < g.uH - 40 && g.gap < 40, `${kind}：貼在上方、按鈕緊跟欄位：` + JSON.stringify(g));
        if (kind === 'rowForm') await shot('u10b_form_fit');
        await js('closePanel(); 0'); await wait(200);
      }
      await home();

      // 9. 運勢：卡片蓋在狀態欄上，不擋選單；沒有另外飄字；成就等卡片翻開才出現
      await click('[data-act=magic]'); await wait(300); await click('#subRow [data-act=fortune]'); await wait(700);
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
      // 10/14 F：「要結束專注嗎？」的「繼續」在深色狀態欄上看得清楚（白字）
      await click('#hudFocus'); await wait(300);
      const keep = await js(`getComputedStyle(document.querySelector('[data-focus-keep]')).color`);
      const [kr, kg, kb] = keep.match(/\d+/g).map(Number);
      assert(kr > 200 && kg > 200 && kb > 200, '「繼續」是白字：' + keep);
      await shot('u12b_focus_confirm');
      await js('state.focusConfirm = false; renderTracker(); 0');
      await engine.cancelFocus(); wc.send('view:update', { view: engine.view() }); await wait(300); await flush();

      // 11. 10/14 B：狀態欄最壞情況（連續 150 天、金幣 12345、筆記本 12 處沒寫進去、抽過運勢）：🍅 還在框裡、金幣寫「1.2萬」、🔥 寫 99+
      engine.state.player.gold = 12345;
      engine.state.streak = { ...(engine.state.streak || {}), cur: 150, best: 150, last: require(path.resolve('src/main/game')).todayISO(engine.now()), days: 160 };
      engine.pdOpen('this', {}); for (let i = 0; i < 12; i++) engine.pdSay(`週五前寫完月報${i}`); engine.pdPause();
      wc.send('view:update', { view: engine.view() }); await wait(400); await flush();
      const hb = await js(`(() => { const t = document.querySelector('#hudTop'), f = document.querySelector('#hudFocus').getBoundingClientRect(), h = document.querySelector('#hud').getBoundingClientRect(); return { sw: t.scrollWidth, cw: t.clientWidth, focusIn: f.right <= h.right - 4, gold: document.querySelector('#gold').textContent, streak: document.querySelector('#hudStreak').textContent, hidden: [...t.querySelectorAll('.fit-hide')].map((x) => x.id) }; })()`);
      assert(hb.sw <= hb.cw + 1 && hb.focusIn && hb.gold === '1.2萬' && /99\+/.test(hb.streak), '狀態欄最壞情況放得下：' + JSON.stringify(hb));
      const wideHud = await wc.insertCSS('#hud * { letter-spacing: .12em !important; }'); await wait(150);
      const hw = await js(`(() => { fitHud(); const t = document.querySelector('#hudTop'); return { sw: t.scrollWidth, cw: t.clientWidth, hidden: [...t.querySelectorAll('.fit-hide')].map((x) => x.id) }; })()`);
      assert(hw.sw <= hw.cw + 1 && hw.hidden.includes('fortuneTag'), 'Windows 字寬：先收運勢、還放得下：' + JSON.stringify(hw));
      await wait(120); await shot('u13_hud_worst');
      await wc.removeInsertedCSS(wideHud); await js('fitHud(); 0');

      // 12. 10/14 C＋H：計畫檔沒有任務——警告只跳一次；週任務板是一張卡、三條路；艾琳不說「委託」
      fs.writeFileSync(path.join(process.env.QUEST_NPC_HOME, 'plans', 'empty.md'), `# 週計畫 9/28–10/2\n`);
      await js(`window.__toasts = []; const _t = toast; toast = function (m, ...a) { window.__toasts.push(String(m)); return _t.call(this, m, ...a); }; 0`);
      engine.saveConfigPatch({ plan: { path: 'plans/empty.md' } }); engine.loadPlan();
      for (let i = 0; i < 4; i++) { wc.send('view:update', { view: engine.view() }); await wait(250); }
      await flush(); await home();
      await click('[data-act=board]'); await wait(500); await flush();
      wc.send('view:update', { view: engine.view() }); await wait(300);
      const warned = await js(`window.__toasts.filter((x) => /^⚠/.test(x))`);
      assert(warned.length === 1 && !/##/.test(warned[0]), '警告只跳一次、不叫人改 markdown：' + JSON.stringify(warned));
      assert(await js(`!!document.querySelector('#panel .empty-card') && document.querySelectorAll('#panel .empty-card .ec-acts .btn').length === 3`), '空的週任務板：一張卡、三顆按鈕');
      assert(!/委託/.test(await js(`document.querySelector('#dlgText').textContent`)), '艾琳說「任務」：' + await js(`document.querySelector('#dlgText').textContent`));
      await shot('u14_empty_board');
      console.log('DONE');
    } catch (e) { console.error('FAIL', e); }
    app.quit();
  });
};
