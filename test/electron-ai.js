// 10/14 AI 提示審視 E I M：聊天框捷徑（勾目標／交付／收工回報）、聊天串流（讀完提示 → 在寫了 → 字一段一段出來、最後接著打完）、
//   筆記本「✨ 再看一次」（規則有記到但沒把握：想要才請艾琳整理）。xvfb 用；QUEST_NPC_HOME＝week（plans/week.md）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';

module.exports = ({ win, engine, pdWin, pdOpen }) => {
  engine.nowFn = () => new Date('2026-10-13T10:00:00');
  engine.config.twins = { ...(engine.config.twins || {}), enabled: false };
  engine.config.window.idleChatterMinutes = 0;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code, w = wc) => w.executeJavaScript(code);
  const shot = async (name, w = win) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await wait(1800);
      // 1. E：聊天框上面的捷徑
      await js(`closePanel(); openDialog(); document.querySelector('[data-act=chat]').click(); 0`); await wait(300);
      const cq = await js(`[...document.querySelectorAll('#chatQuick [data-cq]')].map((b) => b.dataset.cq + ':' + b.textContent.trim()).join('|')`);
      assert(/^board:☑ 勾目標/.test(cq) && /report:🌙 收工回報/.test(cq), '捷徑：' + cq);
      assert(await js(`(() => { const r = document.querySelector('#chatQuick').getBoundingClientRect(), i = document.querySelector('#chatInput').getBoundingClientRect(); return r.bottom <= i.top + 1 && r.height < 34; })()`), '捷徑一行、在輸入框上面');
      await shot('ai01_chat_quick');
      await js(`document.querySelector('#chatQuick [data-cq=board]').click(); 0`); await wait(400);
      assert((await js('state.panel')) === 'board', '☑ 勾目標 → 週任務板');
      await js(`closePanel(); openDialog(); 0`); await wait(200);
      await js(`document.querySelector('[data-act=chat]').click(); 0`); await wait(200);
      await js(`document.querySelector('#chatQuick [data-cq=report]').click(); 0`); await wait(400);
      assert((await js('state.panel')) === 'report', '🌙 收工回報 → 回報表單');
      await js(`closePanel(); openDialog(); 0`); await wait(200);
      // 2. I：串流——讀完提示 → 「想好了，在寫…」→ 字一段一段 → 最後那句接著打完
      await js(`state.talking = true; showThinking(); 0`); await wait(100);
      wc.send('npc:partial', { writing: true, text: '' }); await wait(120);
      assert(/想好了，在寫/.test(await js(`document.querySelector('#dlgText').textContent`)), '讀完提示：在寫了');
      await shot('ai02_writing');
      wc.send('npc:partial', { writing: true, text: '嗯哼～週報的初稿' }); await wait(120);
      assert((await js(`document.querySelector('#dlgText .typing').textContent`)) === '嗯哼～週報的初稿', '字一段一段出來');
      await shot('ai03_streaming');
      await js(`state.talking = false; enqueue([{ text: '嗯哼～週報的初稿寫好了？那艾琳幫你記著！', emotion: 'happy', event: 'chat' }]); 0`);
      await wait(90);
      const mid = await js(`document.querySelector('#dlgText').textContent.length`);
      assert(mid >= '嗯哼～週報的初稿'.length, '接著打，不從頭再打：' + mid);
      await wait(1200);
      assert((await js(`document.querySelector('#dlgText').textContent`)) === '嗯哼～週報的初稿寫好了？那艾琳幫你記著！', '打完');
      // 3. M：筆記本「✨ 再看一次」
      engine.config.llm.enabled = true; engine.npc.status = { online: true, message: 'AI：test' };
      let asked = 0, release;
      engine.npc.structured = async (event) => { asked++; await new Promise((r) => { release = r; }); return { items: [{ kind: 'task', title: '準備面試', steps: ['看履歷', '準備問題'] }] }; };
      pdOpen('this', { book: 'quests' });
      let bw = null; for (let i = 0; i < 40 && !(bw = pdWin()); i++) await wait(150);
      await new Promise((r) => (bw.webContents.isLoading() ? bw.webContents.once('did-finish-load', r) : r()));
      await wait(2200);
      const B = bw.webContents;
      await js(`(()=>{const i=document.querySelector('#sayInput'); i.value='準備面試要看履歷然後想問題還有約時間跟主管確認名單'; document.querySelector('#sayForm').requestSubmit();})(); 0`, B); await wait(600);
      assert(asked === 0 && (await js(`!!document.querySelector('#log .again')`, B)), '規則有記到但沒把握：不自動問，出現「再看一次」');
      await shot('ai04_ask_again', bw);
      await js(`document.querySelector('#log .again').click(); 0`, B); await wait(400);
      assert(asked === 1 && (await js(`!!document.querySelector('#log .busy') && !document.querySelector('#log .again')`, B)), '按了：艾琳整理中');
      release(); await wait(800);
      assert(await js(`!document.querySelector('#log .busy') && [...document.querySelectorAll('.sticky')].some((s) => /準備面試/.test(s.textContent))`, B), '整理好了');
      await shot('ai05_refined', bw);
      engine.config.llm.enabled = false;
      console.log('AI UX OK');
    } catch (e) {
      console.log('TEST FAIL', e);
      await shot('ai_fail').catch(() => {});
    }
    setTimeout(() => process.exit(0), 300);
  });
};
