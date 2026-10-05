// 🐾 待機小動作巡禮：打瞌睡／醒來揮手、喝奶茶、眨眼、看滑鼠、滑鼠經過、說話時停下、開關（xvfb 用，不開 Ollama＝離線）
// 會在 QUEST_NPC_HOME/assets/character/ 放幾張假的動作圖（拿現有表情複製），測「有動作圖就換圖」
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app, menuTemplate }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0; // 不要主動聊天插話
  const home = process.env.QUEST_NPC_HOME;
  const src = path.join(__dirname, '..', 'assets', 'character');
  const dst = path.join(home, 'assets', 'character');
  fs.mkdirSync(dst, { recursive: true });
  for (const [pose, from] of Object.entries({ blink: 'normal', sleep: 'worried', tea: 'happy', write: 'thinking', stretch: 'cheer', wave: 'surprised' })) fs.copyFileSync(path.join(src, `${from}.png`), path.join(dst, `${pose}.png`));
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const imgIs = async (pose) => /\/(\w+)\.png$/.exec(decodeURIComponent(await js(`document.querySelector('#npcImg').getAttribute('src')`)))[1] === pose;
  const imgName = async () => (/\/(\w+)\.png$/.exec(decodeURIComponent(await js(`document.querySelector('#npcImg').getAttribute('src')`))) || [])[1];
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2000);
      await js(`closePanel(); closeDialog(); state.lineDoneAt = 0; idleDebug.S.mem = IdleBrain.newMemory(nowMs()); idleDebug.S.mem.done.morning = true;`);
      const poses = await js(`Object.keys(state.character.poses || {}).sort().join(',')`);
      assert(poses === 'blink,sleep,stretch,tea,wave,write', '找到動作圖：' + poses);
      const tpl = menuTemplate();
      const setting = tpl.find((m) => /設定與資料/.test(m.label));
      assert(setting.submenu.some((m) => /待機小動作/.test(m.label) && m.type === 'checkbox' && m.checked), '設定裡有「待機小動作」開關');
      // 1. 離開座位 → 打瞌睡
      wc.send('presence', { idleSec: 400, locked: false }); await wait(600);
      assert(await js(`document.body.classList.contains('dozing') && !document.querySelector('#idleZzz').classList.contains('hidden') && document.querySelectorAll('#idleZzz .em-zz').length === 3`), '打瞌睡，頭上 z z Z');
      assert(await imgIs('sleep'), '換成睡覺的圖：' + await imgName());
      await shot('i01_doze');
      // 2. 離開很久回來 → 嚇一跳醒來、揮手、小聲說歡迎回來
      await js(`idleDebug.S.mem.awayAt = nowMs() - 40 * 60000`);
      wc.send('presence', { idleSec: 1, locked: false }); await wait(250);
      assert(!(await js(`document.body.classList.contains('dozing')`)), '醒來了');
      assert(await imgIs('surprised'), '先嚇一跳：' + await imgName());
      await wait(900);
      assert(await imgIs('wave'), '揮手：' + await imgName());
      assert((await js(`(document.querySelector('#npcWrap > .emote')||{dataset:{}}).dataset.kind`)) === 'sparkle', '醒來時頭旁邊閃星星');
      const wtxt = await js(`document.querySelector('#idleWhisper').textContent`);
      assert(IdleBrainLines().wake.includes(wtxt), '小聲說歡迎回來：' + wtxt);
      assert(await js(`document.querySelector('#dialog').classList.contains('hidden')`), '不開對話框');
      await shot('i02_wake');
      await wait(2800);
      assert(await imgIs('normal') || await imgIs('blink'), '揮完換回平常（剛好眨眼也算）：' + await imgName());
      // 3. 下午三點的奶茶（直接演一次）
      await js(`idleDebug.perform({ type: 'tea', pose: 'tea', emotion: 'happy', emote: 'steam', whisper: '三點了，奶茶時間～', ms: 1800 })`); await wait(300);
      assert(await imgIs('tea') && (await js(`document.querySelector('#npcWrap > .emote').dataset.kind`)) === 'steam', '捧著奶茶、杯口冒熱氣');
      assert(await js(`document.querySelectorAll('#npcWrap > .emote .em-rise').length === 3 && getComputedStyle(document.querySelector('#npcWrap > .emote .em-rise')).animationName === 'emRise'`), '熱氣有在動');
      await shot('i03_tea');
      await wait(1900);
      assert(await imgIs('normal'), '喝完換回來');
      // 4. 眨眼：換成閉眼的圖一下下
      await js(`idleDebug.blink(false)`); await wait(40);
      assert(await imgIs('blink'), '眨眼');
      await wait(250);
      assert(await imgIs('normal'), '眨完張開');
      // 5. 看向滑鼠；冷戰時別過頭
      wc.send('cursor', { dx: -700, dy: 0 }); await wait(100);
      assert((await js(`document.querySelector('#npcImg').style.getPropertyValue('--lean')`)) === '-2.20deg', '往滑鼠那邊看');
      // 6. 滑鼠經過：耳朵一抖、冒 ✦
      await js(`document.querySelector('#npcWrap').dispatchEvent(new MouseEvent('mouseenter'))`); await wait(100);
      assert(await js(`document.querySelector('#npcImg').classList.contains('idle-perk')`) && (await js(`document.querySelector('#npcWrap > .emote').dataset.kind`)) === 'twinkle', '滑鼠經過有反應');
      await wait(2100);
      assert(!(await js(`document.querySelector('#npcWrap > .emote')`)), '表情飄完會自己消失（1.3 秒＋淡出）');
      // 7. 隨機小動作會自己出現；她開始說話就停
      await js(`idleDebug.S.mem.lastAt = 0; idleDebug.S.mem.lastBreak = nowMs(); idleDebug.S.presence = { idleSec: 40, locked: false }; idleDebug.tick()`); await wait(200);
      const act = await js(`idleDebug.S.acting && idleDebug.S.acting.type`);
      assert(act, '自己做了一個小動作：' + act);
      await shot('i04_ambient');
      await js(`openDialog(); enqueue([{ text: '冒險者，艾琳在這裡喔。', emotion: 'happy' }])`); await wait(300); await js('idleDebug.tick()'); await wait(100);
      assert(!(await js(`idleDebug.S.acting`)), '說話時小動作停下來');
      await js('advance()'); await wait(200);
      assert(await imgIs('happy'), '表情跟著說的話：' + await imgName());
      // 8. 沒有動作圖：用表情代替
      await js(`closeDialog(); state.lineDoneAt = 0; window.__poses = state.character.poses; state.character.poses = {}; idleDebug.perform({ type: 'think', emote: 'think', emotion: 'thinking', ms: 800 })`); await wait(200);
      assert(await imgIs('thinking'), '沒有動作圖：換表情');
      await wait(900); await js(`state.character.poses = window.__poses`);
      // 9. 關掉開關：什麼都不做、不看滑鼠
      engine.config.window.idleAnim = false; wc.send('view:update', { view: engine.view() }); await wait(300);
      await js(`idleDebug.S.mem.lastAt = 0; idleDebug.tick()`); await wait(100);
      assert(!(await js(`idleDebug.S.acting`)) && (await js(`document.querySelector('#npcImg').style.getPropertyValue('--lean')`)) === '0.00deg', '關掉就不動');
      wc.send('presence', { idleSec: 999, locked: false }); await wait(300);
      assert(!(await js(`document.body.classList.contains('dozing')`)), '關掉也不打瞌睡');
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
  function IdleBrainLines() { return require('../src/renderer/idle-brain').LINES; }
};
