// 🎭 新表情（11/10）：每一種都換得上去、大小位置跟平常一樣；劇情表情還沒解鎖時用替代的圖（xvfb 用，不開 Ollama）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';
const { EXPRESSIONS } = require('../src/main/npc');

module.exports = ({ win, engine }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.window.idleAnim = false;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1500);
      await js('closePanel(); closeDialog(); 0'); await wait(300);
      const box = () => js(`(()=>{const i=document.querySelector('#npcImg');const r=i.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.left),y:Math.round(r.top),src:i.getAttribute('src'),nw:i.naturalWidth,nh:i.naturalHeight};})()`);
      const base = await box();
      // 1. 都解鎖了：每一種都換得上去、圖的大小跟 normal 一樣（畫框對齊）
      engine.affShows().seen[4] = { at: 1 }; engine.affShows().seen[5] = { at: 1 }; engine.state.callUnlocked = true;
      wc.send('view:update', { view: engine.view() }); await wait(300);
      for (const e of ['moved', 'fluster', ...EXPRESSIONS]) {
        await js(`setEmotion(${JSON.stringify(e)}); 0`);
        for (let i = 0; i < 30 && !(await js(`document.querySelector('#npcImg').complete`)); i++) await wait(50);
        await wait(150);
        const b = await box();
        assert(new RegExp(`/${e}\\.(webp|png)$`).test(b.src), `${e} 換上了：${b.src}`);
        const near = (a, c) => Math.abs(a - c) <= 4; // 呼吸的小動畫會差 1～2px
        assert(b.nw === base.nw && b.nh === base.nh && near(b.w, base.w) && near(b.h, base.h) && near(b.x, base.x) && near(b.y, base.y), `${e} 大小位置一樣：` + JSON.stringify({ b, base }));
        await shot('e_' + e);
      }
      // 2. 還沒看完第 4、5 階：打勾勾、心形火、叫名字用替代的圖
      engine.affShows().seen = {}; engine.state.callUnlocked = false;
      wc.send('view:update', { view: engine.view() }); await wait(300);
      assert((await js(`state.view.exprLocked.join()`)) === 'promise,heartflame,callname', '鎖著三種');
      await js(`setEmotion('promise'); 0`); await wait(200);
      assert(/\/happy\.(png|webp)$/.test((await box()).src), '打勾勾還沒解鎖：開心');
      await js(`setEmotion('callname'); 0`); await wait(200);
      assert(/\/shy\.(png|webp)$/.test((await box()).src), '叫名字還沒解鎖：害羞');
      await js(`setEmotion('stamp'); 0`); await wait(200);
      assert(/\/stamp\.webp$/.test((await box()).src), '日常的不用解鎖');
      console.log('EXPR OK');
      setTimeout(() => process.exit(0), 200);
    } catch (err) { console.error(err); await shot('e_fail').catch(() => {}); process.exit(1); }
  });
};
