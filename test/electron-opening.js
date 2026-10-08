// 🎬 開場「雨夜的小白貓」整段走一遍（xvfb 用；QUEST_NPC_OPENING=1、QUEST_NPC_HOME=空資料夾）
//   第一次：全部照劇本點完（按住加熱、三選一、系統提示輸入名字、登記簿）→ 主視窗出現、新手教學從「基本操作」開始
//   重看：直接跳過＝什麼都不改；過熱會自己涼回來；當作第一次再演一次並跳過＝直接到取名和登記簿
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app, menuTemplate, opening }) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  let ow = opening.win();
  const js = (code) => ow.webContents.executeJavaScript(code);
  const shot = async (name, w = ow) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await w.capturePage()).toPNG()); console.log('shot', name); };
  const step = () => js('window.__op ? __op.step() : ""');
  const until = async (id, ms = 9000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if ((await step()) === id) return; await wait(80); }
    throw new Error(`等不到 ${id}（現在是 ${await step()}）`);
  };
  const typed = async () => { for (let i = 0; i < 80; i++) { if (!(await js('__op.typing()'))) return; await wait(80); } };
  const op = (code) => js(`__op.${code}`);
  const closed = async (w, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (w.isDestroyed()) return; await wait(100); } throw new Error('開場視窗沒有關'); };
  const ready = (w) => new Promise((r) => w.webContents.once('did-finish-load', r));
  const fresh = async (opts) => { ow = opening.start(opts); await ready(ow); await js(`document.documentElement.style.background=${JSON.stringify(BG)}`); await wait(300); };
  const hook = (w) => w.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[opening]', e.message); });

  hook(ow);
  win.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[main]', e.message); });
  ow.webContents.once('did-finish-load', async () => {
    try {
      assert(!win.isVisible(), '演開場時主視窗先藏著');
      assert(JSON.stringify(menuTemplate()).includes('重看開場'), '選單有「重看開場」');
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      // ── 序章 ──
      await wait(1500); await shot('op01_title');
      assert((await step()) === 'title', '黑底字');
      await until('forest'); await wait(1400); await shot('op02_forest');
      await until('cat'); await typed(); await shot('op03_cat');
      assert(/斗篷/.test(await js(`document.querySelector('.act').textContent`)), '動作按鈕');
      await op('act()'); await until('cloak'); await typed(); await shot('op04_cloak');
      await op('act()'); await until('cold'); await typed(); await shot('op05_cold');
      assert(await js(`document.querySelector('.act').classList.contains('fire')`), '火魔法按鈕是火的顏色');
      await op('act()'); await until('heat'); await wait(500);
      await op('heat(0.3)'); await wait(200);
      assert(/月光涼/.test(await js(`document.querySelector('.gauge .hint').textContent`)), '太早放開：還是月光涼');
      await shot('op06_heat_cold');
      // 真的按住：pointerdown → 等到星火溫 → 放開
      await js(`document.querySelector('.hold').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}))`);
      for (let i = 0; i < 60 && (await op('heatLevel()')) < 0.58; i++) await wait(50);
      await shot('op07_heating');
      assert(await js(`document.querySelector('.cg').classList.contains('heating')`), '按住時火苗亮起來');
      await js(`document.querySelector('.hold').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}))`);
      await wait(250); await shot('op08_heat_ok');
      await until('warm'); await typed(); await shot('op09_warm');
      await op('click()'); await until('words'); await wait(400); await shot('op10_words');
      await op('choose(3)'); await until('gone'); await typed(); await wait(900); await shot('op11_gone');
      assert((await op('state()')).echo === 3, '記住選了第 3 句');
      // ── 現在 ──
      await op('click()'); await wait(300); await shot('op12_whiteout');
      await until('guild'); await wait(1300); await shot('op13_guild');
      await until('bell'); await wait(500); await shot('op14_bell');
      await until('meow'); await wait(500); await shot('op15_meow_typing'); await typed(); await shot('op16_meow');
      assert((await op('np()')) === '？？？', '還沒報名字');
      await op('click()'); await until('intro'); await typed(); await wait(400); await shot('op17_intro');
      await op('click()'); await until('name'); await wait(400); await shot('op18_name');
      assert((await js(`document.querySelector('#opName').value`)) === '艾琳', '系統提示預設艾琳');
      let err = await op(`name('我是誰')`); await wait(150);
      assert(/我/.test(err) && (await step()) === 'name', '名字裡有「我」：不能用');
      await shot('op19_name_error');
      err = await op(`name('小雪')`);
      await until('named'); await wait(250); await shot('op20_named_flip'); await typed(); await shot('op21_named');
      assert((await op('np()')) === '小雪' && /接待員是小雪/.test(await op('text()')), '她用新名字自我介紹');
      await op('click()'); await until('register'); await wait(600); await shot('op22_register');
      await op(`register('阿明')`); await until('registered'); await typed(); await shot('op23_registered');
      await op('click()'); await until('tea'); await typed(); await shot('op24_tea');
      assert(/星火溫/.test(await op('text()')), '是星火溫喔');
      await op('click()'); await until('cheer'); await typed(); await shot('op25_cheer');
      assert(/^第一天，慢慢來就好。/.test(await op('text()')) && /交給小雪吧/.test(await op('text()')), '說回序章那句：' + (await op('text()')));
      await op('click()'); await until('finale'); await wait(1300); await shot('op26_leaving');
      const first = ow; await closed(first);
      await wait(1200);
      assert(win.isVisible(), '演完主視窗出現');
      assert(engine.config.npc.name === '小雪' && engine.npc.names().self === '小雪', '改名');
      assert(engine.state.playerName === '阿明' && engine.state.opening.done && engine.state.opening.echo === 3 && !engine.state.opening.skipped, '存檔');
      assert(await win.webContents.executeJavaScript(`state.panel === 'onboard' && state.ob.step === 'basics'`), '新手教學從「基本操作」開始');
      assert(win.getTitle().startsWith('小雪的任務櫃台'), '視窗標題：' + win.getTitle());
      await win.webContents.executeJavaScript(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(300); await shot('op27_main_basics', win);

      // ── 重看：直接跳過＝什麼都不改 ──
      await fresh({ replay: true }); hook(ow);
      assert(!win.isVisible(), '重看時主視窗也先藏起來');
      await wait(1200); await shot('op30_replay_title');
      assert((await op('state()')).name === null, '重看一開始沒改名字');
      await op('skip()'); await closed(ow); await wait(500);
      assert(win.isVisible() && engine.config.npc.name === '小雪' && engine.state.playerName === '阿明' && !engine.state.opening.replayedAt, '重看直接跳過：什麼都不改');

      // ── 重看：太燙會自己涼回星火溫；選了話再跳過＝那句話留著、名字不動 ──
      await fresh({ replay: true }); hook(ow);
      for (const id of ['cat', 'cloak', 'cold']) { await until(id); await op('act()'); }
      await until('heat'); await wait(300);
      await op('heat(0.92)'); await wait(250);
      assert(/太燙/.test(await js(`document.querySelector('.gauge .hint').textContent`)), '日焰燙：等它涼');
      await shot('op31_too_hot');
      await until('warm', 4000); await typed();
      await op('click()'); await until('words'); await op('choose(1)'); await until('gone');
      await op('skip()'); await closed(ow); await wait(600);
      assert(engine.config.npc.name === '小雪' && engine.state.playerName === '阿明' && engine.state.opening.echo === 1 && engine.state.opening.replayedAt, '重看選了第 1 句再跳過：那句話換掉、名字不動');

      // ── 當作第一次：開頭就跳過 → 取名（預設現在的名字）、登記簿（預填、改成先空著）→ 新手教學 ──
      await fresh({ replay: false }); hook(ow);
      await wait(800); await op('skip()'); await until('name', 4000); await wait(500);
      assert((await js(`document.querySelector('#opName').value`)) === '小雪', '系統提示預設現在的名字');
      await shot('op32_skip_to_name');
      await op(`name('莉亞')`); await until('register'); await wait(600);
      assert((await js(`document.querySelector('#opReg').value`)) === '阿明', '登記簿預填登記過的名字');
      await shot('op33_skip_register');
      await op('blank()'); await until('finale'); await closed(ow); await wait(1200);
      assert(engine.config.npc.name === '莉亞' && engine.npc.names().self === '莉亞' && engine.state.playerName === '' && engine.state.opening.skipped, '跳過：名字一定要有、登記簿可以空著');
      assert(await win.webContents.executeJavaScript(`state.panel === 'onboard' && state.ob.step === 'basics'`), '跳過後一樣接新手教學');
      console.log('OPENING OK');
    } catch (e) {
      console.error('OPENING FAIL', e && e.stack || e);
      try { await shot('op_fail'); } catch (_) { /* 視窗可能已經關了 */ }
    }
    app.quit();
  });
};
