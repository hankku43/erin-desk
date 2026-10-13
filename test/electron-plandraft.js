// 📓 艾琳的筆記本（委託）巡禮：任務板「📓」→ 大視窗（原本的計畫是墨水）→ 說話（新委託、這個任務的步驟、移時段、提醒、不確定、整段貼上）
// → 撤銷一句 → 勾目標（立刻寫進去、有獎勵）→ 點一下改、刪掉／復原 → 下週 → 寫進計畫檔（這週：一項一項改；下週：新檔）→ 收起來
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
      const sub = menuTemplate().find((m) => /週計畫/.test(m.label || ''));
      assert(/委託：艾琳的筆記本/.test(sub.submenu[0].label), '選單第一項：' + sub.submenu[0].label);
      // 1. 任務板 →「📓」直接打開大視窗
      await js(`openDialog(); 0`); await wait(300);
      await click('[data-act=pd]'); // 主畫面的「📓 委託」
      let bw = null;
      for (let i = 0; i < 40 && !(bw = pdWin()); i++) await wait(150);
      assert(bw, '大視窗打開');
      logs(bw.webContents);
      await new Promise((r) => (bw.webContents.isLoading() ? bw.webContents.once('did-finish-load', r) : r()));
      await wait(600);
      const B = bw.webContents;
      const say = async (t) => { await js(`(()=>{const i=document.querySelector('#sayInput'); i.value=${JSON.stringify(t)}; document.querySelector('#sayForm').requestSubmit();})(); 0`, B); await wait(500); };
      assert(!win.isVisible(), '主視窗先藏起來');
      assert(!(await js(`document.querySelector('#intro').classList.contains('hidden')`, B)), '打開的過場');
      await shot('pd00_intro', bw);
      await wait(1600);
      assert((await js(`document.querySelectorAll('.sticky').length`, B)) === 2, '原本的兩個委託');
      assert(/寫完週報/.test(await text('#quests', B)) && /讀文件/.test(await text('#days', B)), '原本的計畫顯示出來');
      assert(/這週/.test(await text('#weeks .on', B)) && /下週/.test(await text('#weeks', B)), '這週／下週');
      assert(/assets\/stageup\/erin_(hug_notebook|write_hum)/.test(await js(`document.querySelector('#face').src`, B)), '艾琳抱著筆記本／邊哼歌邊寫');
      await shot('pd01_open', bw);
      // 2. 說話
      await say('整理實驗報告');
      await say('這個任務的步驟有要先做文獻整理後寫初稿再接著請主管看');
      const q = view().quests.find((x) => x.title === '整理實驗報告');
      assert(q && q.steps.map((s) => s.text).join('→') === '文獻整理→寫初稿→請主管看', '步驟：' + JSON.stringify(q && q.steps));
      await say('把讀文件移到週四');
      assert(view().rows.find((r) => r.title === '讀文件').date === '2026-10-15', '移到週四（不用等 AI）');
      assert(/原本/.test(await text('.item.st-dirty', B)), '改過的標出原本的');
      await say('提醒我週四下午四點打給廠商');
      await say('下午三點打電話給供應商');
      assert(view().unsure.length === 1, '不確定');
      // 整段貼上
      await js(`(()=>{ const i=document.querySelector('#sayInput'); i.focus(); const dt=new DataTransfer(); dt.setData('text/plain','整理月報：收齊數字、寫摘要\\n有空的話整理桌面'); i.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); })(); 0`, B);
      await wait(700);
      assert(view().quests.some((x) => x.title === '整理月報' && x.steps.length === 2) && view().quests.some((x) => x.title === '整理桌面'), '貼上的兩行');
      assert((await js(`document.querySelectorAll('#log .chip').length`, B)) === 4, '最近四句');
      // 撤銷「整理月報」那句
      await js(`[...document.querySelectorAll('#log .chip')].at(-1).querySelector('[data-undo-log]').click(); 0`, B); await wait(500);
      assert(!view().quests.some((x) => x.title === '整理月報'), '撤銷一句');
      await shot('pd02_said', bw);
      // 3. 勾目標（立刻寫進去、有獎勵）
      const gold0 = engine.state.player.gold;
      await js(`[...document.querySelectorAll('[data-check]')].find((e)=>e.dataset.step==='寫初稿' && e.closest('.sticky').textContent.includes('寫完週報')).click(); 0`, B); await wait(900);
      assert(/- \[x\] 寫初稿/.test(planText()) && engine.state.player.gold > gold0, '勾目標寫進檔案、有獎勵');
      assert(await js(`!!document.querySelector('.float-reward')`, B), '獎勵特效');
      // 4. 點一下改：寫完週報改成主線
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/寫完週報/.test(e.textContent)).click(); 0`, B); await wait(300);
      assert(/原本就在計畫檔裡/.test(await text('.card .note', B)), '提醒：原本的要寫進去才算');
      await js(`document.querySelector('#fTier').value='main'; 0`, B);
      await click('[data-psave]', B); await wait(500);
      assert(view().quests.find((x) => x.title === '寫完週報').st === 'dirty', '改過');
      // 刪掉原本的「整理客戶名單」→ 劃掉 → 復原 → 再刪
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/整理客戶名單/.test(e.textContent)).click(); 0`, B); await wait(300);
      await click('[data-pdel]', B); await wait(500);
      assert(await js(`!![...document.querySelectorAll('.sticky.st-del')].find((e)=>/整理客戶名單/.test(e.textContent))`, B), '劃掉');
      await click('.sticky.st-del [data-restore]', B); await wait(400);
      assert(!view().quests.find((x) => x.title === '整理客戶名單').del, '復原');
      await js(`[...document.querySelectorAll('.sticky')].find((e)=>/整理客戶名單/.test(e.textContent)).click(); 0`, B); await wait(300);
      await click('[data-pdel]', B); await wait(400);
      // 不確定 → 變成時段（週四）
      await click('[data-res-row]', B); await wait(250);
      await js(`document.querySelector('#fDate').value='2026-10-15'; 0`, B);
      await click('[data-psave]', B); await wait(500);
      assert(!view().unsure.length, '不確定處理掉');
      assert(/處還沒寫進計畫檔/.test(await text('#changes', B)), '還沒寫進去的修改');
      await shot('pd03_edited', bw);
      // 5. 寫進計畫檔（這週）
      await click('#bCommit', B); await wait(300);
      assert(/寫進「week\.md」/.test(await text('#confirm', B)), '確認：' + await text('#confirm', B));
      await shot('pd04_confirm', bw);
      await click('[data-go]', B); await wait(400);
      assert(!(await js(`document.querySelector('#stamp').classList.contains('hidden')`, B)), '蓋章');
      await shot('pd05_stamp', bw);
      await wait(1800);
      const txt = planText();
      assert(/## 寫完週報 ⭐/.test(txt) && /## 整理實驗報告/.test(txt) && /文獻整理/.test(txt) && !/整理客戶名單/.test(txt) && /打給廠商/.test(txt) && /- \[x\] 收資料/.test(txt), '寫進去了：\n' + txt);
      const thu = require('../src/main/planParser').parsePlan(txt).days.find((d) => d.date === '2026-10-15');
      assert(thu && thu.rows.some((r) => r.a === '讀文件') && thu.rows.some((r) => r.a === '打電話給供應商'), '週四的時段');
      assert(view().changes === 0 && !(await js(`document.querySelector('.st-new, .st-dirty')!==null`, B)), '寫完：都變墨水');
      assert(/寫好了|寫進計畫檔/.test(await text('#say', B)), '艾琳說：' + await text('#say', B));
      // 6. 下週：還沒有檔案 → 新檔（存檔視窗用測試路徑代替）
      await click('[data-week="next"]', B); await wait(500);
      assert(view().week.start === '2026-10-19' && (await js(`document.querySelectorAll('.sticky').length`, B)) === 0, '下週是空的');
      await say('週一 9:00-10:00 站會');
      await say('週五前交月報');
      await shot('pd06_next', bw);
      console.log('step next-commit'); global.pdSavePath = path.join(path.dirname(engine.planFile()), '下週.md');
      await click('#bCommit', B); await wait(200);
      assert(/還沒有計畫檔/.test(await text('#confirm', B)), '新檔確認');
      await click('[data-go]', B); await wait(2500);
      assert(fs.existsSync(global.pdSavePath) && engine.state.pendingPlan && engine.state.pendingPlan.start === '2026-10-19', '下週新檔＋週一換上');
      assert(view().target.kind === 'file', '再看：讀那個檔');
      console.log('step close');
      // 7. 收起來
      await click('#bClose', B);
      for (let i = 0; i < 40 && pdWin(); i++) await wait(150);
      assert(!pdWin() && win.isVisible(), '收起來、主視窗回來');
      await wait(800); await flush();
      await js(`openPanel('board'); 0`); await wait(500);
      assert(/整理實驗報告/.test(await text('#panel')), '週任務板換新');
      await shot('pd07_board');
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
