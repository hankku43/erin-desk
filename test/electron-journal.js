// 📖 冒險日誌＋工作週報：最後一天下班回報後交日誌、評語、週報草稿（改、複製、匯出）、翻上一週、任務的專案標籤（xvfb 用，不開 Ollama＝離線）
const fs = require('fs');
const path = require('path');
const { clipboard } = require('electron');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      // 範例計畫加上專案：兩個任務標 #秋季新品、收銀那個放進「## 收銀系統」分組底下
      const file = engine.planFile();
      let md = fs.readFileSync(file, 'utf8');
      md = md.replace('## 新品標示 + 上架申請 ⭐ 📅 9/29', '## 新品標示 + 上架申請 ⭐ 📅 9/29 #秋季新品')
        .replace('## 10/1 試吃會 ⭐ 📅 10/1', '## 10/1 試吃會 ⭐ 📅 10/1 #秋季新品')
        .replace('## P-12 + P-04 🔧 📅 10/2', '## 收銀系統\n\n### P-12 + P-04 🔧 📅 10/2');
      fs.writeFileSync(file, md);
      const Y = engine.plan.year;
      let T = new Date(`${Y}-09-29T10:00:00`).getTime();
      engine.nowFn = () => new Date(T);
      engine.loadPlan();
      const qs = engine.plan.quests;
      assert(qs[0].project === '秋季新品' && qs[2].project === '收銀系統' && !qs[3].project, '專案：' + qs.map((q) => q.project).join(','));
      // 這週做了一些事
      for (let i = 0; i < qs[0].objectives.length; i++) await engine.setObjective(qs[0].id, i, true);
      await engine.submit(qs[0].id);
      T = new Date(`${Y}-10-01T15:00:00`).getTime();
      for (let i = 0; i < 2; i++) await engine.setObjective(qs[1].id, i, true);
      await engine.submit(qs[1].id);
      await engine.setObjective(qs[2].id, 0, true);
      await engine.setObjective(qs[3].id, 0, true);
      require('../src/main/game').grant(engine.state, { xp: 15, gold: 3 }, '完成專注 25 分鐘（今天第 1 顆🍅）', engine.config.rewards, new Date(T));
      await engine.dailyReport({ done: '試吃會順利結束', blocker: '', next: '回歸測試' });
      await wait(1500); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 任務板：專案標籤
      wc.send('ui:open', 'board'); await wait(600);
      assert(await js(`[...document.querySelectorAll('.chip.proj')].map((x) => x.textContent).includes('秋季新品')`), '任務卡有專案標籤');
      await shot('j00_board');
      // 1. 週五下班回報（表單）→ 艾琳交日誌
      T = new Date(`${Y}-10-02T17:30:00`).getTime();
      await js(`closePanel(); openPanel('report'); 0`); await wait(400);
      await js(`document.querySelector('#rDone').value='備援機測試、提問清單'; document.querySelector('#rBlock').value='報價還沒到；P-12 還有一個邊界情況'; document.querySelector('#rNext').value='下週更新成本'; document.querySelector('#rSend').click(); 0`);
      for (let i = 0; i < 30 && !(await js(`state.panel === 'journal' && !!document.querySelector('.jn-title')`)); i++) await wait(150);
      assert(await js(`state.panel === 'journal'`), '回報完自動打開日誌');
      for (let i = 0; i < 30 && !(await js(`!!document.querySelector('.jn-comment p')`)); i++) await wait(150);
      assert(await js(`!!document.querySelector('.jn-comment p')`), '艾琳寫好評語（離線：內建句子）');
      await flush(); await wait(300);
      const said = await js(`state.log.map((x) => x.text).join('|')`);
      assert(/日誌/.test(said.split('|').pop()), '她說了日誌整理好了：' + said.slice(-120));
      const badge = await js(`document.querySelector('.jn-title b').textContent`);
      await shot('j01_handover');
      await js(`document.querySelector('.panel-body').scrollTop = 9999; 0`); await wait(300);
      await shot('j02_log_bottom');
      assert(await js(`document.querySelectorAll('.jn-quests li.done').length === 2 && document.querySelectorAll('.jn-day').length >= 2`), '委託與每天的回報');
      // 2. 工作週報：依專案分類
      await js(`document.querySelector('[data-jn-tab="report"]').click(); 0`); await wait(300);
      const rep = await js(`document.querySelector('#jnReport').value`);
      assert(/^\[秋季新品\]\n\[Done\]\n- 新品標示 \+ 上架申請/.test(rep) && /\[收銀系統\]/.test(rep) && /\[其他\]/.test(rep) && rep.indexOf('[其他]') > rep.indexOf('[收銀系統]'), '分類：' + rep.slice(0, 200));
      assert(/卡點：P-12 還有一個邊界情況/.test(rep.split('[其他]')[0].split('[收銀系統]')[1] || ''), '卡點掛在收銀的任務底下');
      await shot('j03_report');
      // 改一下 → 出現「還原」；複製的是改過的內容
      await js(`(() => { const t = document.querySelector('#jnReport'); t.value = t.value + '\\n- 補充：下週二跟供應商開會'; t.dispatchEvent(new Event('input', { bubbles: true })); })(); 0`); await wait(200);
      assert(await js(`!!document.querySelector('[data-jn-reset]')`), '改過 → 可以還原');
      await js(`document.querySelector('[data-jn-copy]').click(); 0`); await wait(400);
      assert(/補充：下週二跟供應商開會/.test(clipboard.readText()) && /^\[秋季新品\]/.test(clipboard.readText()), '複製到剪貼簿');
      await shot('j04_copied');
      // 畫面更新（重畫）時，改過的內容還在
      wc.send('view:update', { view: engine.view() }); await wait(300);
      assert(/補充：下週二/.test(await js(`document.querySelector('#jnReport').value`)), '重畫後草稿還在');
      // 匯出 Markdown 到 data/週報
      const ex = engine.journalExport(null);
      assert(fs.existsSync(ex.path) && /## 工作週報/.test(fs.readFileSync(ex.path, 'utf8')) && ex.path.includes(path.join('data', '週報')), '匯出：' + ex.path);
      // 3. 下一週：換計畫檔，日誌還翻得到上一週
      T = new Date(`${Y}-10-05T09:00:00`).getTime();
      fs.writeFileSync(file, `# 本週計畫 10/5–10/9\n\n## 收銀系統\n\n### P-02 匯入格式 🔧 📅 10/7\n- [ ] 匯入不再報錯\n\n## 供應商會議 ⭐ 📅 10/5 #秋季新品\n- [ ] 會議紀錄寄出\n`);
      engine.loadPlan();
      await js('closePanel()'); wc.send('ui:open', 'journal'); await wait(700); await flush();
      assert(/10\/5–10\/9/.test(await js(`document.querySelector('.jn-week b').textContent`)), '打開是這週');
      await js(`document.querySelector('[data-jn-tab="log"]').click(); 0`); await wait(300);
      await js(`document.querySelector('[data-jn-go]:not([disabled])').click(); 0`); await wait(500);
      assert(/9\/28–10\/2/.test(await js(`document.querySelector('.jn-week b').textContent`)) && (await js(`document.querySelector('.jn-title b').textContent`)) === badge, '翻回上一週，稱號還在');
      assert(await js(`!!document.querySelector('.jn-comment p')`), '上一週的評語還在');
      await shot('j05_prev_week');
      // 新任務表單：專案欄位有以前用過的選項
      await js(`closePanel(); openForm('questForm', null); 0`); await wait(300);
      assert(await js(`[...document.querySelectorAll('#qfProjList option')].map((o) => o.value).includes('收銀系統')`), '專案選項');
      await shot('j06_form');
      console.log('DONE');
    } catch (e) { console.error('FAIL', e); }
    app.quit();
  });
};
