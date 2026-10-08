// 🎓 新手教學＋新手任務＋🩺 健康檢查巡禮（xvfb 用；要搭配 /tmp/fake-ollama.js 與 QUEST_NPC_HOME=空資料夾）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})()`);
  const type = (sel, val) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); el.value=${JSON.stringify(val)}; el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 30; i++) { if (!(await js('state.queue.length > 0 || state.typing'))) break; await js('advance()'); await wait(150); } };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800);
      // 0. 第一次開：直接出現新手教學
      assert(await js(`state.panel === 'onboard'`), '第一次開啟就是新手教學');
      await shot('o01_welcome');
      await click('[data-ob-next]'); await wait(300);
      // 1. 操作：點她、拖她、右鍵
      await shot('o02_basics');
      await js(`obMark('click'); obMark('drag')`); await wait(250); await shot('o03_basics_two');
      await js(`obMark('menu')`); await wait(250);
      assert(/都會了/.test(await text('.panel-foot')), '三件事都做了');
      await click('[data-ob-next]'); await wait(1500);
      // 2. 大腦：找到 Ollama、推薦模型、選輕量版並下載
      await shot('o04_ai');
      assert(/找到 Ollama/.test(await text('.ob-body')), '偵測到 Ollama');
      await js(`(()=>{const r=document.querySelector('input[name=obModel][value="qwen3:1.7b"]'); r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(300);
      await click('[data-ob-pull="qwen3:1.7b"]'); await wait(3200); await shot('o05_pulling');
      assert(/%/.test(await text('.ob-pull')), '有下載進度');
      await wait(7000); await shot('o06_pulled');
      assert(/下載完成|已經下載好了/.test(await text('.ob-body')), '下載完成');
      await click('[data-ob-next]'); await wait(600);
      assert(engine.config.llm.model === 'qwen3:1.7b' && engine.config.llm.enabled, '設定成 1.7b 並開啟 AI');
      // 3. 計畫：跟艾琳一起寫
      await shot('o07_plan');
      await type('#obQTitle', '整理月報'); await type('#obQObjs', '收齊各組數字\n寫摘要\n寄給主管');
      await shot('o07b_plan_filled');
      await click('[data-ob-create]'); await wait(800);
      assert(engine.plan.quests.length === 1 && engine.plan.quests[0].objectives.length === 3, '建立了一個任務、三個目標');
      assert(engine.planFile().startsWith(process.env.QUEST_NPC_HOME), '計畫檔在使用者資料夾：' + engine.planFile());
      assert(await js(`state.ob.step === 'schedule'`), '建立後直接到作息');
      // 換一種：看範例（再回來）
      await click('[data-ob-back]'); await wait(300); await click('[data-ob-mode="sample"]'); await wait(200); await shot('o08_plan_sample');
      await click('[data-ob-mode="write"]'); await wait(200); await click('[data-ob-next]'); await wait(400);
      // 4. 作息
      await shot('o09_schedule');
      await js(`document.querySelector('#obBackOn').checked=false; document.querySelector('#obIdle').value='0';`);
      await click('[data-ob-schedule]'); await wait(500);
      assert(engine.config.reminders.items.length === 2 && engine.config.window.idleChatterMinutes === 0, '作息存好了');
      // 5. 完成
      await shot('o10_done');
      await click('[data-ob-finish]'); await wait(2500); await flush(); await wait(600); await shot('o11_first_lines');
      assert(engine.state.onboarding.done && engine.tutorialInfo().count === 0, '引導結束、新手任務開始');
      // 6. 新手任務：任務板上方清單；勾一個目標
      await js(`openPanel('board')`); await wait(400); await shot('o12_tutorial_list');
      assert(/新手任務/.test(await text('.tut')), '任務板有新手任務');
      const q = engine.plan.quests[0];
      await js(`api.setObjective(${JSON.stringify(q.id)}, 0, true).then((r)=>{applyView(r.view); openDialog(); enqueue(r.lines);})`); await wait(1500); await flush(); await wait(500);
      await shot('o13_tutorial_step');
      assert(engine.tutorialInfo().count === 1, '勾目標完成一個新手任務');
      await js('closePanel()'); await wait(200);
      // 7. 健康檢查
      await js(`openHealth()`); await wait(2500); await shot('o14_health');
      assert(/AI 對話/.test(await text('.hl-body')) && /你的資料/.test(await text('.hl-body')), '健康檢查有列出項目');
      // 關掉 AI → 健康檢查顯示可以打開
      await js(`api.healthFix('disableAI').then(()=>healthRun())`); await wait(1800); await shot('o15_health_ai_off');
      assert(/打開 AI 對話/.test(await text('.hl-body')), '關掉 AI 後有「打開」按鈕');
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
