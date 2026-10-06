// 📊 收起狀態欄：按 HUD 的 ✕ → 只剩艾琳（設定存起來、那一塊可以點穿）；右鍵選單「📊 顯示狀態欄」再打開（xvfb 用）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app, menuTemplate }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const cfg = () => JSON.parse(fs.readFileSync(engine.configFile(), 'utf8'));
  const hudShown = () => js(`getComputedStyle(document.querySelector('#hud')).display !== 'none'`);
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      assert(await hudShown(), '一開始有狀態欄');
      assert(!menuTemplate().some((m) => m.label === '📊 顯示狀態欄'), '狀態欄開著時第一層沒有「顯示狀態欄」');
      await shot('h01_normal');
      // 1. 按 ✕：狀態欄滑下去、收起來，設定存起來
      await js(`document.querySelector('#hudHide').click(); 0`); await wait(150);
      assert(await js(`document.body.classList.contains('hud-out')`), '先滑下去');
      await wait(700);
      assert(!(await hudShown()) && (await js(`document.body.classList.contains('no-hud')`)), '收起來了');
      assert(cfg().window.hud === false && engine.view().hud === false, '設定存起來（下次打開還是收著）');
      assert(/顯示狀態欄/.test(await js(`document.querySelector('#toast').textContent`)), '提示怎麼打開');
      // 提示出現在狀態欄原本的位置（不會飄在視窗最上面）
      const tr = await js(`(() => { const r = document.querySelector('#toast').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, h: innerHeight }; })()`);
      assert(tr.bottom > tr.h - 120 && tr.left < 40, '提示在左下角狀態欄的位置：' + JSON.stringify(tr));
      await shot('h02a_hint');
      // 原本狀態欄那一塊可以點穿（不擋後面的視窗）
      assert(await js(`(() => { const el = document.elementFromPoint(120, 760); return !el || !el.closest('[data-hit]'); })()`), '那一塊可以點穿');
      // 一般的提示：對話框開著 → 貼在對話框上緣；都關著 → 艾琳頭上
      await js(`toast('🧪 一般的提示放在哪裡'); 0`); await wait(250);
      const p1 = await js(`(() => { const t = document.querySelector('#toast').getBoundingClientRect(), d = document.querySelector('#dialog').getBoundingClientRect(); return { tb: t.bottom, dt: d.top, oneLine: t.height < 40 }; })()`);
      assert(p1.tb <= p1.dt && p1.dt - p1.tb < 20 && p1.oneLine, '貼在對話框上緣、一行：' + JSON.stringify(p1));
      await shot('h02b_toast_dialog');
      // 對話框也關掉：畫面上只剩艾琳
      await js('closeDialog()'); await wait(300);
      await js(`toast('🧪 一般的提示放在哪裡'); 0`); await wait(250);
      const p2 = await js(`(() => { const t = document.querySelector('#toast'), r = t.getBoundingClientRect(), n = document.querySelector('#npcWrap').getBoundingClientRect(); return { low: t.classList.contains('low'), tb: r.bottom, nt: n.top, cx: (r.left + r.right) / 2, nl: n.left }; })()`);
      assert(p2.low && p2.tb <= p2.nt && p2.nt - p2.tb < 20 && Math.abs(p2.cx - (p2.nl + 150)) < 6, '都關著：在艾琳頭上、置中：' + JSON.stringify(p2));
      await shot('h02c_toast_alone');
      await wait(2800);
      await shot('h02_only_erin');
      // 2. 右鍵選單：第一層有「📊 顯示狀態欄」，第一層還是不超過 12 項；⚙ 裡的勾選框是沒勾的
      const top = menuTemplate();
      const n = top.filter((m) => m.type !== 'separator').length;
      assert(n <= 12, '第一層最多 12 項（分隔線不算）：' + n);
      const item = top.find((m) => m.label === '📊 顯示狀態欄');
      assert(item, '第一層找得到');
      const gear = top.find((m) => /設定與資料/.test(m.label || ''));
      assert(gear.submenu.find((m) => /狀態欄/.test(m.label)).checked === false, '⚙ 裡的勾選框沒勾');
      // 戳艾琳、交付這類事都照常（狀態欄關著也能說話、升級特效照樣出現）
      await js('onNpcClick()'); await wait(400); await flush();
      assert(!(await js(`document.querySelector('#dialog').classList.contains('hidden')`)), '點艾琳照樣會說話');
      await shot('h03_talk_without_hud');
      // 3. 用選單打開：滑回來
      item.click(); await wait(200);
      assert(await hudShown() && (await js(`document.body.classList.contains('hud-back')`)), '滑回來');
      await wait(800);
      assert(cfg().window.hud === true && !menuTemplate().some((m) => m.label === '📊 顯示狀態欄'), '設定改回來、第一層的項目拿掉');
      await shot('h04_back');
      // 4. ⚙ 的勾選框也能關
      menuTemplate().find((m) => /設定與資料/.test(m.label || '')).submenu.find((m) => /狀態欄/.test(m.label)).click({ checked: false }); await wait(300);
      assert(!(await hudShown()) && cfg().window.hud === false, '⚙ 勾選框也能關');
      console.log('DONE');
    } catch (e) { console.error('FAIL', e); }
    app.quit();
  });
};
