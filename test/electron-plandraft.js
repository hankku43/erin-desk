// 📓 艾琳的筆記本（兩本書）巡禮：主畫面「📓 筆記本」→ 📜 委託簿（依截止日分欄）→ 說話（新委託、這個任務的步驟、移時段 → 時刻簿的書籤 +1）
// → 🕘 時刻簿（一天一頁、改過的標原本、一週總覽）→ 委託「🕘 排進時刻簿」（小卡、預覽）→ 點空白加一格（同時段並排）
// → 勾目標、改委託、刪掉／復原、不確定 → 寫進計畫檔 → 時刻簿勾一格（委託的步驟一起勾）→ 下週新檔 → 收起來
// xvfb 用；QUEST_NPC_HOME＝準備好的資料夾（config.json、plans/week.md、data/save.json 已經做完新手教學、AI 關著）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, menuTemplate, pdWin }) => {
  const T = new Date('2026-10-13T10:00:00').getTime(); // 週二
  engine.nowFn = () => new Date(T);
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code, w = wc) => w.executeJavaScript(code);
  const shot = async (name, w = win) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel, w = wc) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})(); 0`, w);
  const text = (sel, w = wc) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`, w);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.queue.length > 0 || state.typing'))) break; await js('advance()'); await wait(120); } };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const logs = (w) => w.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  const planText = () => fs.readFileSync(engine.planFile(), 'utf8');
  const view = () => engine.pdView();
  logs(wc);
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2500); await flush();
      const top = menuTemplate().filter((m) => m.type !== 'separator');
      assert(top.filter((m) => /^📓 筆記本/.test(m.label || '')).length === 1 && !top.some((m) => m.submenu && m.submenu.some((x) => /筆記本/.test(x.label || ''))), '右鍵第一層有「📓 筆記本」、而且只有這一處'); // 10/13
      // 1. 主畫面「📓 筆記本」→ 大視窗、📜 委託簿
      await js(`openDialog(); 0`); await wait(300);
      await click('[data-act=pd]');
      let bw = null;
      for (let i = 0; i < 40 && !(bw = pdWin()); i++) await wait(150);
      assert(bw, '大視窗打開');
      logs(bw.webContents);
      await new Promise((r) => (bw.webContents.isLoading() ? bw.webContents.once('did-finish-load', r) : r()));
      await wait(600);
      const B = bw.webContents;
      const say = async (t) => { await js(`(()=>{const i=document.querySelector('#sayInput'); i.value=${JSON.stringify(t)}; document.querySelector('#sayForm').requestSubmit();})(); 0`, B); await wait(500); };
      const book = async (k) => { await click(`#tabs [data-book="${k}"]`, B); await wait(450); };
      const dayTab = async (date) => { await click(`#dayTabs [data-day="${date}"]`, B); await wait(400); };
      assert(!win.isVisible(), '主視窗先藏起來');
      assert(!(await js(`document.querySelector('#intro').classList.contains('hidden')`, B)), '打開的過場');
      await shot('pd00_intro', bw);
      await wait(1600);
      assert((await js(`document.querySelector('#book').dataset.book`, B)) === 'quests', '先開委託簿');
      assert((await js(`document.querySelectorAll('.sticky').length`, B)) === 2, '原本的兩個委託');
      assert(/寫完週報/.test(await text('[data-col="2026-10-16"]', B)) && /整理客戶名單/.test(await text('[data-col="none"]', B)), '依截止日分欄（週五／沒有截止日）');
      assert(/這週/.test(await text('#weeks .on', B)) && /下週/.test(await text('#weeks', B)), '這週／下週');
      assert(/assets\/stageup\/erin_(hug_notebook|write_hum)/.test(await js(`document.querySelector('#face').src`, B)), '艾琳抱著筆記本／邊哼歌邊寫');
      await shot('pd01_quests', bw);
      // 10/13 視窗縮到最小：欄頭「週二 今天 10/13」還是一行、不溢出（以前「今天」會掉到第二行）
      const [w0, h0] = bw.getSize();
      // 10/14 A：縮到最小（900）頂欄的 ✕、寫進去都還在視窗裡
      bw.setSize(900, 640); await wait(500);
      const bar = await js(`(() => { const b = document.querySelector('#book').getBoundingClientRect(), x = document.querySelector('#bClose').getBoundingClientRect(), bar = document.querySelector('#bar'); return { close: Math.round(x.right), book: Math.round(b.right), sw: bar.scrollWidth, cw: bar.clientWidth, commit: document.querySelector('#bCommit').innerText.trim() }; })()`, B);
      assert(bar.close <= bar.book && bar.sw <= bar.cw + 1 && /寫進去/.test(bar.commit), '900 寬：頂欄放得下：' + JSON.stringify(bar));
      await shot('pd01b_min900', bw);
      bw.setSize(960, 640); await wait(500);
      const dh = await js(`[...document.querySelectorAll('.dcol .dh')].map((h) => ({ t: h.textContent.trim(), h: Math.round(h.getBoundingClientRect().height), over: h.scrollWidth > h.clientWidth + 1 }))`, B);
      assert(dh.some((x) => /週二/.test(x.t)) && dh.every((x) => x.h <= 30 && !x.over), '欄頭一行、不溢出：' + JSON.stringify(dh));
      bw.setSize(w0, h0); await wait(400);
      // 10/13 J：「🕘 排進時刻簿」平常不顯示，滑過（或鍵盤停在）那張便利貼才出現
      assert((await js(`getComputedStyle(document.querySelector('.sticky .split')).opacity`, B)) === '0', '平常看不到');
      await js(`document.querySelector('.sticky').focus(); 0`, B); await wait(300);
      assert((await js(`getComputedStyle(document.querySelector('.sticky:focus .split')).opacity`, B)) === '1', '停在便利貼上才出現');
      await js(`document.activeElement.blur(); 0`, B); await wait(250);
      // 10/14 J：每欄的 ＋ 在欄頭下面（跟時刻簿一樣在上面）；頁首沒有另一顆「＋ 委託」
      const ca = await js(`(() => { const cols = [...document.querySelectorAll('.dcol')]; return { n: cols.filter((c) => c.querySelector(':scope > .col-add')).length, cols: cols.filter((c) => c.dataset.col !== 'other').length, top: cols.every((c) => { const a = c.querySelector(':scope > .col-add'); return !a || (a.getBoundingClientRect().bottom <= c.querySelector('.dbody').getBoundingClientRect().top + 1 && a.getBoundingClientRect().top >= c.querySelector('.dh').getBoundingClientRect().bottom); }), head: !!document.querySelector('#pageQuests .ph [data-add]'), bottom: !!document.querySelector('.dbody ~ .add') }; })()`, B);
      assert(ca.n === ca.cols && ca.n > 0 && ca.top && !ca.head && !ca.bottom, '＋ 在欄頭下面、頁首沒有：' + JSON.stringify(ca));
      await js(`document.querySelector('[data-col="2026-10-15"] > .col-add').click(); 0`, B); await wait(300);
      assert((await js(`!document.querySelector('#pop').classList.contains('hidden') && document.querySelector('#fDue').value`, B)) === '2026-10-15', '週四欄的 ＋：截止日帶週四');
      await shot('pd01c_col_add', bw);
      await js(`document.querySelector('[data-pcancel]').click(); 0`, B); await wait(250);
      // 2. 說話：新委託＋步驟；移時段 → 時刻簿的書籤 +1
      await say('整理實驗報告');
      await say('這個任務的步驟有要先做文獻整理後寫初稿再接著請主管看');
      const q = view().quests.find((x) => x.title === '整理實驗報告');
      assert(q && q.steps.map((s) => s.text).join('→') === '文獻整理→寫初稿→請主管看', '步驟：' + JSON.stringify(q && q.steps));
      await say('把讀文件移到週四');
      assert(view().rows.find((r) => r.title === '讀文件').date === '2026-10-15', '移到週四（不用等 AI）');
      assert(/\+1/.test(await text('#tabs [data-book="time"] .bump', B)), '時刻簿的書籤 +1');
      await say('提醒我週四下午四點打給廠商');
      await say('下午三點打電話給供應商');
      assert(view().unsure.length === 1, '不確定');
      // 整段貼上
      await js(`(()=>{ const i=document.querySelector('#sayInput'); i.focus(); const dt=new DataTransfer(); dt.setData('text/plain','整理月報：收齊數字、寫摘要\\n有空的話整理桌面'); i.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); })(); 0`, B);
      await wait(700);
      assert(view().quests.some((x) => x.title === '整理月報' && x.steps.length === 2) && view().quests.some((x) => x.title === '整理桌面'), '貼上的兩行');
      assert((await js(`document.querySelectorAll('#log .chip').length`, B)) === 4, '最近四句');
      await js(`[...document.querySelectorAll('#log .chip')].at(-1).querySelector('[data-undo-log]').click(); 0`, B); await wait(500);
      assert(!view().quests.some((x) => x.title === '整理月報'), '撤銷一句');
      await shot('pd02_said', bw);
      // 3. 🕘 時刻簿：書籤翻過去（今天週二）→ 週四：搬過來的讀文件標原本、提醒的小旗子
      await book('time');
      assert((await js(`document.querySelector('#book').dataset.book`, B)) === 'time' && !(await js(`!document.querySelector('#tabs [data-book="time"] .bump').classList.contains('hidden')`, B)), '翻到時刻簿、+1 消掉');
      await dayTab('2026-10-15');
      assert(/原本/.test(await text('.blk.st-dirty', B)) && /打給廠商/.test(await text('.flag', B)), '週四：改過的標原本、⏰ 小旗子');
      await shot('pd03_time_thu', bw);
      // 4. 委託「🕘 排進時刻簿」：週二 13:00–16:00、每格 1 小時、三個步驟
      await book('quests');
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/整理實驗報告/.test(e.textContent)).querySelector('[data-split]').click(); 0`, B); await wait(500);
      assert(/排進時刻簿/.test(await text('.split-card h3', B)) && /文獻整理/.test(await js(`document.querySelector('#sSteps').value`, B)), '拆時段小卡：步驟先帶進來');
      await js(`(()=>{ const f=document.querySelector('#sFrom'); f.value='13:00'; f.dispatchEvent(new Event('input',{bubbles:true})); const t=document.querySelector('#sTo'); t.value='16:00'; t.dispatchEvent(new Event('input',{bubbles:true})); })(); 0`, B);
      await wait(700);
      assert((await js(`document.querySelectorAll('#sPrev .pv-row').length`, B)) === 3 && /13:00–14:00/.test(await text('#sPrev', B)), '預覽三格：' + await text('#sPrev', B));
      await shot('pd04_split', bw);
      await click('[data-split-go]', B); await wait(700);
      assert((await js(`document.querySelector('#book').dataset.book`, B)) === 'time' && (await js(`document.querySelectorAll('.blk.linked').length`, B)) === 3, '排進去：翻到時刻簿那天、三格連到委託');
      assert(/整理實驗報告.*格/.test(await text('#say', B)), '艾琳說：' + await text('#say', B));
      // 點時間軸的空白加一格：13:30（每 30 分）→ 跟「文獻整理」並排
      await js(`(()=>{ const ln=document.querySelector('.lanes'); const blk=[...document.querySelectorAll('.blk')].find((b)=>/文獻整理/.test(b.textContent)); const r=blk.getBoundingClientRect(); const L=ln.getBoundingClientRect(); ln.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:L.right-8,clientY:r.top+ r.height*0.6})); })(); 0`, B);
      await wait(300);
      assert(/新時段/.test(await text('#pop h3', B)) && (await js(`document.querySelector('#fStart').value`, B)) === '13:30', '點空白：對齊 30 分＝13:30，開始時間：' + await js(`document.querySelector('#fStart').value`, B));
      await js(`document.querySelector('#fTitle').value='回客戶信'; 0`, B);
      await click('[data-psave]', B); await wait(500);
      const lanes = await js(`[...document.querySelectorAll('.blk')].filter((b)=>/文獻整理|回客戶信/.test(b.textContent)).map((b)=>Math.round(b.getBoundingClientRect().width))`, B);
      assert(lanes.length === 2 && lanes[0] < 600 && Math.abs(lanes[0] - lanes[1]) < 4, '同時段並排：' + lanes);
      assert(!view().checks.length, '同時段兩件事：不用紅筆');
      await shot('pd05_time_tue', bw);
      // 一週總覽
      await click('#bWeekView', B); await wait(400);
      assert((await js(`document.querySelectorAll('.wk-col').length`, B)) === 5 && (await js(`document.querySelectorAll('.blk.compact').length`, B)) >= 6, '一週總覽');
      await shot('pd06_week', bw);
      await click('.wk-dh[data-day="2026-10-13"]', B); await wait(300);
      // 5. 委託簿：勾目標（立刻寫進去、有獎勵）、改委託、刪掉／復原、不確定 → 時段
      await book('quests');
      const gold0 = engine.state.player.gold;
      await js(`[...document.querySelectorAll('[data-check]')].find((e)=>e.dataset.step==='寫初稿' && e.closest('.sticky').textContent.includes('寫完週報')).click(); 0`, B); await wait(900);
      assert(/- \[x\] 寫初稿/.test(planText()) && engine.state.player.gold > gold0, '勾目標寫進檔案、有獎勵');
      assert(await js(`!!document.querySelector('.float-reward')`, B), '獎勵特效');
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/寫完週報/.test(e.textContent)).click(); 0`, B); await wait(300);
      assert(/原本就在計畫檔裡/.test(await text('.card .note', B)), '提醒：原本的要寫進去才算');
      await js(`document.querySelector('#fTier').value='main'; 0`, B);
      await click('[data-psave]', B); await wait(500);
      assert(view().quests.find((x) => x.title === '寫完週報').st === 'dirty', '改過');
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/整理客戶名單/.test(e.textContent)).click(); 0`, B); await wait(300);
      await click('[data-pdel]', B); await wait(500);
      assert(await js(`!![...document.querySelectorAll('.sticky.st-del')].find((e)=>/整理客戶名單/.test(e.textContent))`, B), '劃掉');
      await click('.sticky.st-del [data-restore]', B); await wait(400);
      assert(!view().quests.find((x) => x.title === '整理客戶名單').del, '復原');
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/整理客戶名單/.test(e.textContent)).click(); 0`, B); await wait(300);
      await click('[data-pdel]', B); await wait(400);
      await click('[data-res-row]', B); await wait(250);
      await js(`document.querySelector('#fDate').value='2026-10-15'; 0`, B);
      await click('[data-psave]', B); await wait(500);
      assert(!view().unsure.length, '不確定處理掉');
      assert(/處還沒寫進計畫檔/.test(await text('#changes', B)), '還沒寫進去的修改');
      await shot('pd07_quests_edited', bw);
      // 6. 寫進計畫檔（這週）
      await click('#bCommit', B); await wait(300);
      assert(/寫進「week\.md」/.test(await text('#confirm', B)), '確認：' + await text('#confirm', B));
      await click('[data-go]', B); await wait(400);
      assert(!(await js(`document.querySelector('#stamp').classList.contains('hidden')`, B)), '蓋章');
      await shot('pd08_stamp', bw);
      await wait(1800);
      const txt = planText();
      assert(/## 寫完週報 ⭐/.test(txt) && /## 整理實驗報告/.test(txt) && /文獻整理/.test(txt) && !/整理客戶名單/.test(txt) && /打給廠商/.test(txt) && /- \[x\] 收資料/.test(txt), '寫進去了：\n' + txt);
      assert(/13:00–14:00 整理實驗報告：文獻整理/.test(txt) && /13:30–14:00 回客戶信/.test(txt), '時段寫成「委託：步驟」：\n' + txt);
      const thu = require('../src/main/planParser').parsePlan(txt).days.find((d) => d.date === '2026-10-15');
      assert(thu && thu.rows.some((r) => r.a === '讀文件') && thu.rows.some((r) => r.a === '打電話給供應商'), '週四的時段');
      assert(view().changes === 0 && !(await js(`document.querySelector('#pageQuests .st-new, #pageQuests .st-dirty')!==null`, B)), '寫完：委託簿都變墨水');
      // 7. 時刻簿勾「整理實驗報告：文獻整理」那格 → 委託的「文獻整理」也勾起來
      await book('time');
      assert(!(await js(`document.querySelector('#pageTime .st-new, #pageTime .st-dirty')!==null`, B)), '寫完：時刻簿也都變墨水');
      await js(`[...document.querySelectorAll('.blk')].find((b)=>/文獻整理/.test(b.textContent)).querySelector('[data-rowdone]').click(); 0`, B); await wait(900);
      const t2 = planText();
      assert(/- \[x\] 13:00–14:00 整理實驗報告：文獻整理/.test(t2) && /- \[x\] 文獻整理/.test(t2), '做完一格：步驟也勾：\n' + t2);
      assert(/也幫你勾起來/.test(await text('#say', B)), '艾琳說：' + await text('#say', B));
      await shot('pd09_linked_done', bw);
      // 8. 下週：還沒有檔案 → 新檔（存檔視窗用測試路徑代替）
      await click('[data-week="next"]', B); await wait(500);
      assert(view().week.start === '2026-10-19', '下週');
      await say('週一 9:00-10:00 站會');
      await say('週五前交月報');
      global.pdSavePath = path.join(path.dirname(engine.planFile()), '下週.md');
      await click('#bCommit', B); await wait(200);
      assert(/還沒有計畫檔/.test(await text('#confirm', B)), '新檔確認');
      await click('[data-go]', B); await wait(2500);
      assert(fs.existsSync(global.pdSavePath) && engine.state.pendingPlan && engine.state.pendingPlan.start === '2026-10-19', '下週新檔＋週一換上');
      // 9. 收起來
      await click('#bClose', B);
      for (let i = 0; i < 40 && pdWin(); i++) await wait(150);
      assert(!pdWin() && win.isVisible(), '收起來、主視窗回來');
      await wait(800); await flush();
      // 今日行程的「🕘」：直接翻到時刻簿的今天
      await js(`openPanel('daily'); 0`); await wait(500);
      assert(await js(`!!document.querySelector('[data-pd-time]')`), '今日行程有 🕘');
      await shot('pd10_daily');
      await click('[data-pd-time]');
      for (let i = 0; i < 40 && !(bw = pdWin()); i++) await wait(150);
      await new Promise((r) => (bw.webContents.isLoading() ? bw.webContents.once('did-finish-load', r) : r()));
      await wait(2200);
      assert((await js(`document.querySelector('#book').dataset.book`, bw.webContents)) === 'time' && /二/.test(await text('#dayTabs .on', bw.webContents)), '翻到時刻簿的今天');
      await shot('pd11_from_daily', bw);
      // 10. 10/13 C：留一處沒寫進去就收起來 → 主視窗的狀態欄 ✏️1、首頁 📓 筆記本右上角 ✏️1；點 ✏️ 又打開筆記本
      await js(`(()=>{const i=document.querySelector('#sayInput'); i.value='週五前寫完月報'; document.querySelector('#sayForm').requestSubmit();})(); 0`, bw.webContents); await wait(600);
      assert(view().changes >= 1, '有一處沒寫進去：' + view().changes);
      await click('#bClose', bw.webContents);
      for (let i = 0; i < 40 && pdWin(); i++) await wait(150);
      await wait(900); await flush();
      const dr = await js(`({ hud: document.querySelector('#hudDraft').classList.contains('hidden') ? '' : document.querySelector('#hudDraft').textContent, badge: (document.querySelector('#choices [data-act="pd"] .pd-badge') || {}).textContent || '' })`);
      assert(/✏️[1-9]/.test(dr.hud) && /✏️[1-9]/.test(dr.badge), '狀態欄和首頁都標了沒寫進去的：' + JSON.stringify(dr));
      await js(`openDialog(); 0`); await wait(300); await shot('pd12_draft_badge');
      await click('#hudDraft');
      for (let i = 0; i < 40 && !(bw = pdWin()); i++) await wait(150);
      assert(bw, '點 ✏️ 打開筆記本');
      console.log('PLANDRAFT OK');
      setTimeout(() => process.exit(0), 300);
    } catch (e) {
      console.error('TEST FAIL', e);
      await shot('pd_fail').catch(() => {});
      const bw = pdWin(); if (bw) await shot('pd_fail_big', bw).catch(() => {});
      process.exit(1);
    }
  });
};
