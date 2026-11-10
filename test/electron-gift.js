// 🎁 送禮：先買好、話晚點說（11/10）——按「送」雜貨舖馬上完成（金幣、雙胞胎的話），艾琳的那句 AI 想好才從對話框出來；
//   送蠟封章時給 AI 的提示裡沒有黃瓜（xvfb 用；Ollama 是假的，故意慢 2 秒）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.twins = { ...(engine.config.twins || {}), enabled: false };
  engine.config.llm.enabled = true; engine.npc.llm.enabled = true;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const until = async (cond, ms = 8000) => { for (let t = 0; t < ms; t += 50) { if (await cond()) return true; await wait(50); } return false; };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const prompts = [];
  engine.npc.checkStatus = async () => engine.npc.status;
  const slowAI = async (_p, body) => { prompts.push(body.messages.map((m) => m.content).join('\n')); await wait(2000); return { message: { content: JSON.stringify({ line: '遠方公會的蠟封章！艾琳的收藏又多一個了～', emotion: 'cheer' }) }, prompt_eval_count: 700, eval_count: 30 }; };
  engine.npc.fetchJSON = slowAI;
  engine.npc.fetchStream = (p, body) => slowAI(p, body);
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      engine.npc.status = { online: true, message: 'AI：測試' };
      engine.state.player.gold = 500; wc.send('view:update', { view: engine.view() });
      await js(`openShop('gift'); 0`);
      assert(await until(() => js(`!!document.querySelector('[data-sp-gift="seal"]')`)), '禮物頁');
      const gold0 = engine.state.player.gold;
      const t0 = Date.now();
      await js(`document.querySelector('[data-sp-gift="seal"]').click(); 0`);
      // 金幣扣掉（第一次送禮的成就會加回 10）、畫面上的金幣和「送過 1 次」都更新了
      const ok = await until(async () => engine.state.player.gold < gold0 && (await js(`state.view && state.view.player && state.view.player.gold`)) === engine.state.player.gold && /送過 1 次/.test(await js(`document.querySelector('#panel').innerText`)), 1500);
      assert(ok, '雜貨舖馬上完成（' + (Date.now() - t0) + 'ms）');
      const quick = Date.now() - t0;
      assert(quick < 1500, `買好了不用等 AI：${quick}ms`);
      await wait(300); await shot('g01_bought_waiting');
      assert(!/藍鈴|收藏又多一個/.test(await text('#dlgText')), '她的話還沒出來');
      assert(await until(async () => /收藏又多一個/.test(await text('#dlgText')), 6000), '她的話晚點出來：' + await text('#dlgText'));
      await wait(600); await flush();
      await shot('g02_line');
      assert(prompts.length === 1 && !/黃瓜/.test(prompts[0]) && /【這次】送的是「遠方公會的蠟封章」/.test(prompts[0]), '提示裡沒有黃瓜');
      console.log(`GIFT TEST OK（雜貨舖 ${quick}ms 完成）`);
    } catch (e) { console.error('GIFT TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => app.quit(), 300);
  });
};
