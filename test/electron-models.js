// 新手教學 AI 步驟：依電腦配備推薦模型（推薦／上一階／下一階／自選）（xvfb 用；硬體、Ollama 都是假的）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';
const SETUP = require('../src/main/setup');

module.exports = ({ win, engine }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.llm.enabled = false;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name, sel = '.ob-card.on, .ob-row.on') => {
    await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.scrollIntoView({ block: 'center' }); })(); 0`); await wait(150); fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name);
  };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const pick = (v) => js(`(() => { const r = document.querySelector('input[name=obModel][value="${v}"]'); if (!r) throw new Error('no radio ${v}'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); })(); 0`);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  // 假的電腦：每一輪換一台
  let machine = { ramGB: 16, gpu: null };
  let installed = [];
  const pulled = [];
  SETUP.probe = async () => {
    const rec = SETUP.recommend(machine);
    return { ollama: 'running', models: installed, version: '0.12.3', outdated: false, ramGB: machine.ramGB, recommend: rec.model, up: rec.up, down: rec.down, why: rec.why, hw: { ramGB: machine.ramGB, gpu: machine.gpu, text: rec.hwText }, minVersion: SETUP.MIN_OLLAMA, choices: SETUP.buildChoices(rec, installed), embed: { ...SETUP.EMBED, installed: true }, downloadUrl: SETUP.OLLAMA_DOWNLOAD, canInstall: true };
  };
  SETUP.pull = async ({ model, onProgress }) => { pulled.push(model); onProgress({ status: 'downloading', total: 5.2e9, completed: 1.3e9, percent: 25 }); await new Promise(() => {}); };
  const open = async (m, models = []) => {
    machine = m; installed = models;
    await js(`state.ob = null; obState().step = 'ai'; openPanel('onboard'); 0`);
    for (let i = 0; i < 20 && !(await js(`!!document.querySelector('input[name=obModel]')`)); i++) await wait(150);
    await wait(300);
  };
  const cards = () => js(`[...document.querySelectorAll('.ob-card')].map((c) => (c.querySelector('code') || {}).textContent + '|' + [...c.querySelectorAll('.chip')].map((x) => x.textContent).join(','))`);
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      // 1. RTX 4060（8GB）＋16GB：推薦 8b、上一階 14b（會慢）、下一階 4b
      await open({ ramGB: 15.8, gpu: { name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramGB: 8 } });
      let c = await cards();
      assert(/qwen3:8b\|推薦/.test(c[0]) && /qwen3:14b\|⬆ 上一階/.test(c[1]) && /qwen3:4b\|⬇ 下一階/.test(c[2]) && /^undefined\|/.test(c[3]), '4060：' + c.join(' / '));
      assert(/RTX 4060（8GB）・16GB 記憶體/.test(await text('.ob-why')), '寫出偵測到的配備');
      assert(await js(`document.querySelector('input[name=obModel]:checked').value === 'qwen3:8b'`), '預設選推薦的');
      assert(/很快・整個放進顯示卡/.test(await text('.ob-card.on .ob-speed')), '速度標籤');
      await shot('m01_4060_16g');
      await pick('qwen3:14b'); await wait(200);
      assert(/比較吃力/.test(await text('.ob-card.on .ob-warn')), '選會慢的：提醒');
      await shot('m02_4060_up_slow');
      // 2. 4060＋32GB：推薦旗艦（顯示卡＋記憶體），上一階是實驗版
      await open({ ramGB: 31.8, gpu: { name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramGB: 8 } });
      c = await cards();
      assert(/qwen3:30b-instruct\|推薦/.test(c[0]) && /qwen3\.6:35b-a3b\|⬆ 上一階・更聰明,實驗/.test(c[1]) && /qwen3:8b\|⬇ 下一階/.test(c[2]), '4060+32：' + c.join(' / '));
      await pick('qwen3.6:35b-a3b'); await wait(200);
      assert(/還沒用這個模型測試過/.test(await text('.ob-card.on')), '實驗版：提醒還沒測試');
      await shot('m03_4060_32g_exp');
      // 3. 沒有顯示卡、8GB：推薦輕量、上一階標準（會慢）、沒有下一階
      await open({ ramGB: 7.8, gpu: null, gpus: [{ name: 'Intel(R) UHD Graphics', vendor: 'intel', vramGB: 1 }] });
      c = await cards();
      assert(c.length === 3 && /qwen3:1\.7b\|推薦/.test(c[0]) && /qwen3:4b\|⬆ 上一階/.test(c[1]), '8GB：' + c.join(' / '));
      assert(/目前 AI 用不到/.test(await text('.ob-why')), '內顯：說明');
      await shot('m04_cpu_8g');
      // 4. 自選：展開清單（已經下載的其他模型也在裡面）、自己填名稱
      await open({ ramGB: 15.8, gpu: { name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramGB: 8 } }, ['gemma3:4b']);
      await click('[data-ob-more]'); await wait(200);
      const rows = await js(`[...document.querySelectorAll('.ob-row code')].map((x) => x.textContent)`);
      assert(rows.join(',') === 'qwen3:1.7b,qwen3:30b-instruct,qwen3.6:35b-a3b,gemma3:4b', '自選清單：' + rows.join(','));
      await shot('m05_more', '.ob-more');
      await js(`(() => { const el = document.querySelector('#obCustom'); el.value = 'Bad Name!'; el.dispatchEvent(new Event('input', { bubbles: true })); })(); 0`);
      await click('[data-ob-custom]'); await wait(200);
      assert(await js(`state.ob.choice === 'qwen3:8b'`), '名稱不對：不換');
      await js(`(() => { const el = document.querySelector('#obCustom'); el.value = 'gemma3:12b'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })(); 0`); await wait(300);
      assert(await js(`state.ob.choice === 'gemma3:12b' && !!document.querySelector('input[name=obModel][value="gemma3:12b"]:checked')`), 'Enter：用自己填的');
      assert(/還沒用這個模型測試過/.test(await text('.ob-row.on')) && /⬇ 下載/.test(await text('.ob-row.on')), '自己填的：提醒＋可以下載');
      await shot('m06_custom');
      // 按下一步：存設定、開始下載
      await click('[data-ob-next]'); await wait(600);
      assert(engine.config.llm.model === 'gemma3:12b' && engine.config.llm.enabled, '設定成自己填的：' + engine.config.llm.model);
      assert(pulled.includes('gemma3:12b'), '還沒下載：自動開始下載');
      // 5. 收起自選：選回推薦的
      await open({ ramGB: 15.8, gpu: { name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramGB: 8 } }, ['gemma3:12b']);
      assert(await js(`state.ob.choice === 'gemma3:12b' && !!document.querySelector('.ob-more-list')`), '目前用的是清單外的：自動展開');
      await click('[data-ob-more]'); await wait(200);
      assert(await js(`state.ob.choice === 'qwen3:8b' && !document.querySelector('.ob-more-list')`), '收起：回到推薦的');
      console.log('MODELS OK');
      setTimeout(() => process.exit(0), 300);
    } catch (e) { console.error(e); await shot('m_fail').catch(() => {}); process.exit(1); }
  });
};
