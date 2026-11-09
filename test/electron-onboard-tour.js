// 🎓 新手教學（11/9 重新設計）整段走一遍：歡迎 → 操作 → 大腦（先不用 AI）→ 📓 筆記本（聚光燈帶著寫第一份計畫）→ 作息 → 🛒 雜貨舖（送 220 金幣、聚光燈帶著買鈴鐺撲滿、填月薪）→ 完成
//   xvfb 用；QUEST_NPC_HOME＝空資料夾（第一次開）；離線（沒有 Ollama）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app, menuTemplate, pdWin }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const shot = async (name, w = win) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel, j = js) => j(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click(); return 0;})()`);
  const text = (sel, j = js) => j(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
  const until = async (fn, msg, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await wait(120); } throw new Error('ASSERT 等不到：' + msg); };
  const flush = async () => { for (let i = 0; i < 30; i++) { if (!(await js('state.queue.length > 0 || state.typing'))) break; await js('advance()'); await wait(150); } };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[main]', e.message); });

  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800);
      assert(await js(`state.panel === 'onboard'`), '第一次開啟就是新手教學');
      assert((await js(`[...document.querySelectorAll('.ob-dot small')].map((x)=>x.textContent).join(',')`)) === '歡迎,操作,大腦,筆記本,作息,雜貨舖,完成', '七個步驟');
      await shot('t01_welcome');
      await click('[data-ob-next]'); await wait(300);
      await js(`obMark('click'); obMark('drag'); obMark('menu')`); await wait(200);
      await click('[data-ob-next]');
      // 大腦：沒有 Ollama → 先不用 AI
      await until(() => js('!!(state.ob && state.ob.probe)'), '檢查電腦', 20000); await wait(300);
      await js(`(()=>{const r=document.querySelector('input[name=obModel][value=""]'); r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); return 0;})()`); await wait(200);
      await click('[data-ob-next]');
      await until(() => js(`state.ob.step === 'plan'`), '到筆記本那步');
      await wait(300); await shot('t02_plan');
      assert(await js(`!!document.querySelector('[data-ob-pd]') && document.querySelector('.ob-mode.on').dataset.obMode === 'pd'`), '預設是用筆記本寫');
      assert(!(await js(`!!document.querySelector('#obQTitle')`)), '舊的表單拿掉了');

      // ── 📓 筆記本：聚光燈 ──
      await click('[data-ob-pd]');
      await until(() => !!(pdWin() && !pdWin().isDestroyed()), '筆記本視窗');
      const pw = pdWin();
      pw.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[pd]', e.message); });
      const pj = (code) => pw.webContents.executeJavaScript(code);
      await until(async () => { try { return await pj(`!!(window.Coach && Coach.step() === 'say')`); } catch (_) { return false; } }, '筆記本的聚光燈開始', 12000);
      assert(!win.isVisible(), '筆記本開著時主視窗藏起來');
      assert(engine.pdView().tour === true, '筆記本知道是新手教學');
      await wait(600); await shot('n01_say', pw);
      assert(await pj(`(()=>{const r=document.querySelector('.co-ring').getBoundingClientRect(), f=document.querySelector('#sayForm').getBoundingClientRect(); return Math.abs(r.left - f.left) < 12 && Math.abs(r.width - f.width) < 16; })()`), '光圈圍著輸入框');
      await pj(`document.querySelector('#sayInput').value='週五前交週報，要先整理資料、寫初稿'; document.querySelector('#sayForm').requestSubmit(); 0`);
      await until(() => pj(`Coach.step() === 'note'`), '記下來之後指著便利貼');
      await wait(700); await shot('n02_note', pw);
      await click('.co-next', pj);
      await until(() => pj(`Coach.step() === 'time'`), '指著時刻簿的書籤');
      await wait(500); await shot('n03_time', pw);
      // 擋住其他地方：點委託簿的空白不會怎樣（對話框跳一下）
      await pj(`document.querySelector('.co-block').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); 0`);
      await click('#tabs .bm-t', pj);
      await until(() => pj(`Coach.step() === 'tray'`), '時刻簿：拖委託');
      await wait(700); await shot('n04_tray', pw);
      await click('.co-next', pj);
      await until(() => pj(`Coach.step() === 'commit'`), '寫進計畫檔');
      await wait(500); await shot('n05_commit', pw);
      await click('#bCommit', pj);
      await until(() => pj(`Coach.step() === 'go'`), '確認條');
      await wait(400); await shot('n06_go', pw);
      assert(/放在你資料夾的/.test(await text('#confirm', pj)), '新手教學：不用選存在哪裡');
      await click('#confirm [data-go]', pj);
      await until(() => pj(`Coach.step() === 'stamp'`), '先等蓋章演完');
      assert(await pj(`getComputedStyle(document.querySelector('.co-tip')).display === 'none'`), '蓋章的時候不說話');
      await until(() => pj(`Coach.step() === 'end'`), '寫好了');
      assert(await pj(`document.querySelector('#stamp').classList.contains('hidden') && document.querySelector('.co-count').textContent === '7／7'`), '章收起來才說「寫好了」；計數不算等動畫那步：' + await text('.co-count', pj));
      await wait(1200); await shot('n07_end', pw);
      const home = process.env.QUEST_NPC_HOME;
      assert(engine.planFile().startsWith(path.join(home, 'plans')) && /我的一週/.test(path.basename(engine.planFile())), '計畫檔寫在使用者資料夾的 plans/：' + engine.planFile());
      assert(engine.plan.quests.some((q) => /週報/.test(q.title)), '計畫裡有週報：' + engine.plan.quests.map((q) => q.title).join(','));
      assert(!/秋季新品/.test(engine.plan.title || ''), '標題不是照抄範例的：' + engine.plan.title);
      const nb = engine.state.onboarding.notebook;
      assert(nb && nb.title && !engine.pdTour, '新手教學記下筆記本寫好了：' + JSON.stringify(nb));
      await pj(`setTimeout(() => document.querySelector('.co-next').click(), 30); 0`); // 回到櫃台（視窗會關掉：不要等這個 click 的回覆）
      await until(() => pw.isDestroyed(), '筆記本收起來');
      await until(() => win.isVisible(), '主視窗回來');
      await wait(800);
      assert(await js(`state.panel === 'onboard' && state.ob.step === 'plan'`), '回到新手教學的筆記本那步');
      assert(/寫好了/.test(await text('.ob-body')), '打勾：' + await text('.ob-body'));
      await shot('t03_plan_done');
      await click('[data-ob-next]'); await wait(300);
      // 作息
      await click('[data-ob-schedule]'); await wait(500);
      await until(() => js(`state.ob.step === 'shop'`), '到雜貨舖那步');
      await wait(300); await shot('t04_shop');
      assert(engine.state.player.gold < 220 && !engine.incomeUnlocked(), '還沒有撲滿、金幣不夠：' + engine.state.player.gold);
      const gold0 = engine.state.player.gold;
      assert(/220 金幣/.test(await text('.ob-body')) && /鈴鐺撲滿/.test(await text('.ob-body')), '說明見面禮和撲滿');
      // 選單：還沒買撲滿 → 收入撲滿那項帶去雜貨舖
      assert(JSON.stringify(menuTemplate()).includes('到雲朵雜貨舖買「鈴鐺撲滿」就能用'), '選單：還沒解鎖');

      // ── 🛒 雜貨舖：聚光燈 ──
      await click('[data-ob-shop]');
      await until(() => js(`window.Coach && Coach.step() === 'shopBtn'`), '指著雜貨舖的按鈕');
      assert(engine.state.player.gold === gold0 + 220 && engine.state.obGifts.piggy, '收到 220 金幣');
      await wait(500); await shot('t05_shopbtn');
      assert(await js(`state.panel === null`), '新手教學面板先收起來');
      await click('#choices [data-act="shop"]');
      await until(() => js(`Coach.step() === 'decorTab'`), '指著裝飾分頁');
      await wait(900); await shot('t06_decortab');
      await click('#panel [data-sp-tab="decor"]');
      await until(() => js(`Coach.step() === 'buy'`), '指著鈴鐺撲滿');
      await wait(700); await shot('t07_buy');
      assert(await js(`(()=>{const r=document.querySelector('.co-ring').getBoundingClientRect(), b=document.querySelector('[data-sp-buy="piggy"]').getBoundingClientRect(); return r.top <= b.top && r.bottom >= b.bottom && r.top >= 0 && r.bottom <= innerHeight; })()`), '光圈圍著「買」，而且捲到看得到');
      await click('#panel [data-sp-buy="piggy"]');
      await until(() => js(`Coach.step() === 'salary' && state.panel === 'income'`), '買了接著填月薪', 6000);
      const spent = engine.state.history.find((h) => /雜貨舖：鈴鐺撲滿/.test(h.reason || ''));
      assert(engine.incomeUnlocked() && spent && engine.state.shop.equip.desk === 'piggy', '扣 220 金幣、擺上櫃台：' + JSON.stringify({ gold: engine.state.player.gold, gold0, eq: engine.state.shop.equip, h: engine.state.history.slice(0, 4) }));
      await wait(700); await shot('t08_salary');
      await js(`document.querySelector('#icMonthly').value='48000'; document.querySelector('#icMonthly').dispatchEvent(new Event('input',{bubbles:true})); 0`);
      await click('#icSave');
      await until(() => js(`Coach.step() === 'bank'`), '指著撲滿');
      assert(engine.view().income.on && engine.config.income.monthly === 48000, '收入撲滿打開了');
      await wait(900); await shot('t09_bank');
      await click('.co-next');
      await until(() => js(`state.panel === 'onboard' && state.ob.step === 'done'`), '回到新手教學的完成');
      await wait(400); await shot('t10_done');
      assert(/撲滿/.test(await text('.ob-summary')) && /存錢/.test(await text('.ob-summary')), '完成頁寫撲滿：' + await text('.ob-summary'));
      assert(JSON.stringify(menuTemplate()).includes('🔔 收入撲滿…（開著'), '選單：解鎖了');
      await click('[data-ob-finish]'); await wait(2000); await flush();
      assert(engine.state.onboarding.done, '新手教學結束');
      await wait(400); await shot('t11_after');
      // 再看一次新手教學：見面禮不會再送、雜貨舖那步寫「已經有撲滿」
      const g1 = engine.state.player.gold;
      const r = engine.obShopGift();
      assert(r.owned && engine.state.player.gold === g1, '已經有撲滿：不再送');
      console.log('TOUR OK');
    } catch (e) {
      console.error('TOUR FAIL', e && e.stack || e);
      try { await shot('t_fail'); } catch (_) { /* 截不到就算了 */ }
      try { const w = pdWin(); if (w && !w.isDestroyed()) await shot('n_fail', w); } catch (_) { /* 截不到就算了 */ }
    }
    app.quit();
  });
};
