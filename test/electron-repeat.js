// 🔁 聊天整句重複（10/27）：AI 第一次把上一句原封不動吐回來 → 畫面收掉、顯示「換個說法，再想一下」→ 第二次的回覆打出來
//   （xvfb 用；Ollama 是假的，串流照順序回）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.llm.enabled = true;
  engine.npc.llm.enabled = true; engine.npc.status = { online: true, message: 'AI：測試' };
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const until = async (cond, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await cond()) return true; await wait(100); } return false; };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  // 假的 Ollama：一個字一個字串流；gate 讓測試拍到每個階段
  const SAID = '艾琳剛才在櫃台後面整理了一整排的委託書，尾巴都累到垂下來了，冒險者今天也辛苦了喔。';
  const NEW = '那艾琳先去泡兩杯熱可可，等一下端過來給冒險者！';
  let queue = [];
  let gate = null;
  let startGate = null;
  const calls = [];
  engine.npc.checkStatus = async () => engine.npc.status;
  engine.npc.fetchStream = async (_p, body, _ms, onChunk) => {
    calls.push(body);
    if (startGate && calls.length === 3) await startGate; // 第二次：讀提示要一點時間（拍「再想一下」）
    const line = queue.shift();
    const full = JSON.stringify({ line, emotion: 'happy' });
    const cut = full.indexOf(line) + line.length;
    for (let i = full.indexOf(line) + 4; i < cut; i += 6) { onChunk(full.slice(0, i)); await wait(40); }
    onChunk(full);
    if (gate) await gate;
    return { message: { content: full }, prompt_eval_count: 900, eval_count: 40 };
  };
  engine.npc.fetchJSON = engine.npc.fetchStream;
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      engine.npc.status = { online: true, message: 'AI：測試' }; // 開啟時真的問過 Ollama（雲端沒有）→ 改回連線中
      const send = (msg) => js(`(() => { if (document.querySelector('#chatRow').classList.contains('hidden')) document.querySelector('[data-act=chat]').click(); document.querySelector('#chatInput').value = ${JSON.stringify(msg)}; document.querySelector('#chatSend').click(); })(); 0`);
      // 1. 先聊一句，讓她說過 SAID
      queue = [SAID];
      await send('今天好累');
      assert(await until(async () => (await text('#dlgText')).includes('辛苦了喔')), '第一句：' + await text('#dlgText'));
      await wait(1500); await flush();
      // 2. 再聊一句：AI 又回 SAID（整句重複）→ 收掉、重新想 → NEW
      let open1, open2; gate = new Promise((r) => { open1 = r; }); startGate = new Promise((r) => { open2 = r; });
      queue = [SAID, NEW];
      await send('嗯');
      assert(await until(async () => (await text('#dlgText')).includes('委託書')), '串流出重複的那句');
      await shot('r01_repeated_streaming');
      open1(); // 第一次回完 → 引擎發現整句重複 → restart
      assert(await until(async () => /換個說法，再想一下/.test(await text('#dlgText'))), '畫面收掉、顯示重新想：' + await text('#dlgText'));
      await shot('r02_restart');
      gate = null; open2();
      assert(await until(async () => (await text('#dlgText')).includes('熱可可')), '新的那句：' + await text('#dlgText'));
      await wait(1500); await flush();
      assert(!(await text('#dlgText')).includes('委託書') && calls.length === 3, '最後只剩新的那句');
      assert(/【不要重複】/.test(calls[2].messages.at(-1).content), '第二次有說不要重複');
      await shot('r03_new_line');
      console.log('REPEAT TEST OK');
    } catch (e) { console.error('REPEAT TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => app.quit(), 300);
  });
};
