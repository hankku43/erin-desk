// 🤖 幫朋友安裝 Ollama：新手教學 AI 步驟、健康檢查（xvfb 用；安裝流程、偵測、模型下載全部用假的，不會真的下載）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';
const SETUP = require('../src/main/setup');
const OI = require('../src/main/ollamaInstall');

module.exports = ({ win, engine, app }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.llm.enabled = true; engine.config.llm.model = 'qwen3:4b';
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  // 假的 Ollama 狀態：missing → （裝好）running；outdated
  let fake = { ollama: 'missing', models: [], version: null, outdated: false };
  const REC = SETUP.recommend(16);
  SETUP.probe = async () => ({ ...fake, ramGB: 16, recommend: REC.model, up: REC.up, down: REC.down, why: REC.why, hw: { ramGB: 16, gpu: null, text: REC.hwText }, minVersion: SETUP.MIN_OLLAMA, choices: SETUP.buildChoices(REC, fake.models), embed: { ...SETUP.EMBED, installed: false }, downloadUrl: SETUP.OLLAMA_DOWNLOAD, canInstall: true });
  OI.supported = () => true;
  OI.installerSize = async () => 1181116006;
  // 假的安裝：一步一步由測試推進
  let gate = null;
  const next = () => new Promise((r) => { gate = r; });
  let failWith = null;
  OI.install = async ({ onProgress, signal }) => {
    if (failWith) { await wait(200); throw failWith; }
    const total = 1181116006;
    for (const pct of [8, 23, 42]) { onProgress({ phase: 'download', percent: pct, received: Math.round(total * pct / 100), total, text: OI.PHASE_TEXT.download }); await wait(80); }
    await next(); if (signal.aborted) { const e = new Error('已取消'); e.code = 'canceled'; throw e; }
    onProgress({ phase: 'verify', text: OI.PHASE_TEXT.verify }); await wait(80);
    onProgress({ phase: 'install', text: OI.PHASE_TEXT.install });
    await next();
    onProgress({ phase: 'start', text: OI.PHASE_TEXT.start }); await wait(150);
    fake = { ollama: 'running', models: [], version: '0.12.3', outdated: false };
    return { version: '0.12.3' };
  };
  const pulled = [];
  SETUP.pull = async ({ model, onProgress }) => { pulled.push(model); onProgress({ status: 'downloading', total: 2.5e9, completed: 0.75e9, percent: 30 }); await new Promise(() => {}); };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 1. 新手教學 AI 步驟：沒有 Ollama → 幫我安裝（約 1.1 GB）
      await js(`state.ob = null; obState().step = 'ai'; openPanel('onboard'); 0`);
      for (let i = 0; i < 20 && !(await js(`!!document.querySelector('[data-ob-install]')`)); i++) await wait(150);
      assert(/幫我安裝（約 1\.1 GB）/.test(await text('[data-ob-install]')), '安裝按鈕有大小：' + await text('.ob-status'));
      assert(await js(`!!document.querySelector('.ob-status [data-ob-openollama]')`), '也可以自己去官網');
      await wait(700); await shot('i01_missing');
      // 2. 下載中
      await click('[data-ob-install]'); await wait(700);
      assert(/42%（\d+／1126 MB）/.test(await text('.ob-status')), '下載進度：' + await text('.ob-status'));
      assert(await js(`!!document.querySelector('[data-oi-cancel]')`), '下載中可以取消');
      assert(/可以先做下一步/.test(await text('.panel-foot')), '安裝時也可以先做下一步');
      await shot('i02_downloading');
      // 3. 安裝中（不能取消）
      gate(); await wait(400);
      assert(/安裝中/.test(await text('.ob-status')) && !(await js(`!!document.querySelector('[data-oi-cancel]')`)), '安裝中不能取消');
      await shot('i03_installing');
      // 4. 裝好 → 重新檢查 → 自動下載選的模型
      gate(); await wait(1500);
      assert(/找到 Ollama 了/.test(await text('.ob-status')), '裝好後重新檢查：' + await text('.ob-body'));
      assert(pulled[0] === 'qwen3:4b', '自動下載推薦的模型：' + pulled.join(','));
      assert(/30%/.test(await text('.ob-card.on .ob-pull')), '模型下載進度：' + await text('.ob-card.on'));
      await shot('i04_installed_pulling');
      await js('closePanel()'); await wait(300);
      // 5. 健康檢查：沒有 Ollama → 幫我安裝
      fake = { ollama: 'missing', models: [], version: null, outdated: false };
      await js(`state.ollamaInstall = null; state.pulls = {}; openHealth(); 0`);
      for (let i = 0; i < 20 && !(await js(`!!document.querySelector('[data-fix="installOllama"]')`)); i++) await wait(150);
      assert(/幫我安裝 Ollama（約 1\.1 GB）/.test(await text('[data-fix="installOllama"]')), '健康檢查的安裝按鈕');
      await wait(700); await shot('i05_health_missing');
      // 6. 健康檢查裡安裝失敗（簽章不對）：說明原因、可以再試或自己去官網
      failWith = Object.assign(new Error('下載到的檔案不是 Ollama 官方簽章（NotSigned），為了安全沒有安裝'), { code: 'signature' });
      await click('[data-fix="installOllama"]'); await wait(900);
      assert(/不是 Ollama 官方簽章/.test(await text('.hl-item.error')) && await js(`!!document.querySelector('.hl-item.error [data-ob-install]')`), '失敗說明＋再試一次：' + await text('.hl-item.error'));
      await shot('i06_health_error');
      await js('closePanel()'); await wait(300);
      // 7. 版本太舊：幫我更新
      failWith = null;
      fake = { ollama: 'running', models: ['qwen3:4b'], version: '0.6.2', outdated: true };
      await js(`state.ollamaInstall = null; state.ob = null; obState().step = 'ai'; openPanel('onboard'); 0`);
      for (let i = 0; i < 20 && !(await js(`!!document.querySelector('.ob-status.warn')`)); i++) await wait(150);
      assert(/幫我更新/.test(await text('.ob-status.warn [data-ob-install]')), '版本太舊可以幫忙更新');
      await wait(700); await shot('i07_outdated');
      console.log('OLLAMA TEST OK');
    } catch (e) { console.error('OLLAMA TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => app.quit(), 300);
  });
};
