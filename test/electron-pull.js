// 🛡 下載模型的防呆：下載前檢查（擋下、proxy、仍然下載）、網路斷掉自動接著下載、放棄時的說明、健康檢查裡的錯誤
//   （xvfb 用；Ollama、模型網站、下載都是假的，不會真的連網路）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';
const SETUP = require('../src/main/setup');
const PG = require('../src/main/pullGuard');

module.exports = ({ win, engine }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  engine.config.window.idleChatterMinutes = 0;
  engine.config.llm.enabled = false;
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name, sel) => {
    if (sel) { await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.scrollIntoView({ block: 'center' }); })(); 0`); await wait(150); }
    fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name);
  };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ' + ${JSON.stringify(sel)}); el.click(); })(); 0`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const has = (sel) => js(`!!document.querySelector(${JSON.stringify(sel)})`);
  const until = async (cond, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await cond()) return true; await wait(100); } return false; };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const FLAG = 'qwen3:30b-instruct';
  // 假的電腦（4060＋32GB → 推薦旗艦）、假的 Ollama（開著、還沒有模型）
  const machine = { ramGB: 31.8, gpu: { name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramGB: 8 } };
  SETUP.probe = async () => {
    const rec = SETUP.recommend(machine);
    return { ollama: 'running', models: [], version: '0.12.3', outdated: false, ramGB: machine.ramGB, recommend: rec.model, up: rec.up, down: rec.down, why: rec.why, hw: { ramGB: machine.ramGB, gpu: machine.gpu, text: rec.hwText }, minVersion: SETUP.MIN_OLLAMA, choices: SETUP.buildChoices(rec, []), embed: { ...SETUP.EMBED, installed: true }, downloadUrl: SETUP.OLLAMA_DOWNLOAD, canInstall: true };
  };
  // 下載前檢查：用真的 preflight，只把連線換成假的
  const realPreflight = PG.preflight;
  const D = (c) => `sha256:${c.repeat(64)}`;
  const manifest = { config: { digest: D('e'), size: 487 }, layers: [{ digest: D('d'), size: 18.6e9 }] };
  const ok = (body) => ({ ok: true, status: 200, url: '', json: async () => body, arrayBuffer: async () => new ArrayBuffer(4) });
  const timeout = () => Object.assign(new TypeError('net::ERR_CONNECTION_TIMED_OUT'));
  const storageBlocked = async (u) => { if (/manifests/.test(u)) return ok(manifest); throw timeout(); };
  const allOk = async (u) => ok(/manifests/.test(u) ? manifest : null);
  const bigDisk = { existsSync: (p) => !/sha256-/.test(p), // 資料夾在、模型檔案還沒有
    readdirSync: () => [], readFileSync: () => '', statfsSync: () => ({ bavail: 200 * 1024, bsize: 1024 * 1024 }) };
  const smallDisk = { ...bigDisk, statfsSync: () => ({ bavail: 12 * 1024, bsize: 1024 * 1024 }) };
  let scene = null; // 這一次檢查要遇到的狀況
  let gate = null;
  const checks = [];
  PG.preflight = async (o) => {
    checks.push(o.model);
    if (gate) await gate; // 讓測試拍到「檢查中」
    const env = { OLLAMA_MODELS: 'C:\\Users\\cafe\\.ollama\\models' };
    if (scene === 'storage') return realPreflight({ ...o, env, platform: 'win32', fsx: bigDisk, ollamaFetch: storageBlocked, systemFetch: null, resolveProxy: null });
    if (scene === 'proxy') return realPreflight({ ...o, env, platform: 'win32', fsx: bigDisk, ollamaFetch: storageBlocked, systemFetch: allOk, resolveProxy: async () => 'PROXY proxy.cafe.example:8080; DIRECT' });
    if (scene === 'disk') return realPreflight({ ...o, env, platform: 'win32', fsx: smallDisk, ollamaFetch: allOk });
    return { ok: true, notes: ['測試'] };
  };
  // 下載：每一次 SETUP.pull 照 plan 走
  const R2 = 'max retries exceeded: Get "https://abc123example.r2.cloudflarestorage.com/ollama/docker/registry/v2/blobs/sha256/dd/dddd/data?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=FAKE&X-Amz-Signature=FAKE": dial tcp 192.0.2.10:443: connectex: A connection attempt failed because the connected party did not properly respond after a period of time.';
  const fail = () => { throw SETUP.pullError(R2); };
  const prog = (onP, pct) => onP({ status: `pulling ${'d'.repeat(12)}`, total: 18.6e9, completed: 18.6e9 * pct / 100, percent: pct });
  let plan = [];
  let release = null;
  const pullCalls = [];
  SETUP.pull = async ({ model, onProgress, signal }) => {
    pullCalls.push(model);
    const f = plan.shift();
    if (!f) return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })))); // 一直下載，直到取消
    return f(onProgress);
  };
  PG.WAIT_STEPS.splice(0, PG.WAIT_STEPS.length, 4, 2); // 測試不要等那麼久
  const openAI = async () => {
    await js(`state.ob = null; state.pulls = {}; obState().step = 'ai'; openPanel('onboard'); 0`);
    await until(() => has(`.ob-card.on [data-ob-pull="${FLAG}"]`));
    await wait(300);
  };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1800); await flush();
      await js('closePanel(); closeDialog()'); await wait(200);
      await openAI();
      assert(await js(`document.querySelector('input[name=obModel]:checked').value === ${JSON.stringify(FLAG)}`), '推薦旗艦');
      // 1. 按下載 → 先檢查
      let open; gate = new Promise((r) => { open = r; }); scene = 'storage';
      await click(`[data-ob-pull="${FLAG}"]`);
      assert(await until(() => has('.ob-card.on .pull-note')), '檢查中');
      assert(/下載前先檢查/.test(await text('.ob-card.on .pull-note')) && await has(`.ob-card.on [data-ob-cancel="${FLAG}"]`), '檢查中可以取消');
      await shot('p01_checking', '.ob-card.on');
      // 2. 連不上下載伺服器 → 擋下來，說明＋再試一次＋仍然下載
      gate = null; open();
      assert(await until(() => has('.ob-card.on .pull-err')), '擋下');
      let err = await text('.ob-card.on .pull-err');
      assert(/還沒開始下載/.test(err) && /Cloudflare/.test(err) && /手機熱點/.test(err), '說明：' + err);
      assert(await has(`.ob-card.on [data-ob-pull="${FLAG}"]:not([data-force])`) && await has(`.ob-card.on [data-ob-pull="${FLAG}"][data-force="1"]`), '再試一次＋仍然下載');
      assert(/還沒開始下載：連不上下載伺服器/.test(await text('#toast')), '小提示只放短短一句：' + await text('#toast'));
      assert(pullCalls.length === 0, '擋下來就不下載');
      await shot('p02_blocked', '.ob-card.on .pull-err');
      // 3. 再試一次：這次查出來是 proxy
      scene = 'proxy';
      await click(`.ob-card.on [data-ob-pull="${FLAG}"]:not([data-force])`);
      assert(await until(async () => /proxy\.cafe\.example:8080/.test(await text('.ob-card.on .pull-err'))), 'proxy 的說明');
      err = await text('.ob-card.on .pull-err');
      assert(/HTTPS_PROXY/.test(err) && /http:\/\/proxy\.cafe\.example:8080/.test(err) && /編輯您帳戶的環境變數/.test(err), 'proxy：' + err);
      await shot('p03_proxy', '.ob-card.on .pull-err');
      // 4. 仍然下載 → 不檢查，直接下載；中途斷線 → 倒數後自動接著下載
      const nChecks = checks.length;
      plan = [(onP) => { prog(onP, 30); fail(); }, async (onP) => { prog(onP, 12); prog(onP, 55); await new Promise((r) => { release = r; }); fail(); }, fail, fail, fail];
      await click(`.ob-card.on [data-ob-pull="${FLAG}"][data-force="1"]`);
      assert(await until(() => has('.ob-card.on .pull-note.wait')), '自動重試');
      assert(checks.length === nChecks && pullCalls.length === 1, '仍然下載：不檢查');
      const note = await text('.ob-card.on .pull-note.wait');
      assert(/網路斷了一下，\d 秒後自動接著下載（第 1 次重試，已經下載的部分會留著）/.test(note), '倒數：' + note);
      assert(/^30%/.test(await text('.ob-card.on .ob-pct')) && await has(`.ob-card.on [data-ob-cancel="${FLAG}"]`), '進度留著、可以取消');
      await shot('p04_retrying', '.ob-card.on');
      // 5. 接著下載：百分比不倒退（一開始只列出部分檔案也不會變 12%）
      assert(await until(() => pullCalls.length === 2 && js(`/^55%/.test((document.querySelector('.ob-card.on .ob-pct') || {}).textContent || '')`), 7000), '接著下載');
      assert(!(await has('.ob-card.on .pull-note')), '下載中不顯示倒數');
      await shot('p05_resumed', '.ob-card.on');
      // 6. 之後一直連不上 → 放棄：說明試了幾次、技術訊息（沒有長網址）
      release();
      assert(await until(() => has('.ob-card.on .pull-err'), 15000), '放棄');
      err = await text('.ob-card.on .pull-err');
      assert(/下載沒有完成/.test(err) && /試了 5 次都沒辦法下載完/.test(err) && /Cloudflare/.test(err), '放棄的說明：' + err);
      const tech = await text('.ob-card.on .pull-tech');
      assert(/abc123example\.r2\.cloudflarestorage\.com/.test(tech) && !/X-Amz|FAKE/.test(tech), '技術訊息：' + tech);
      assert(!(await has(`.ob-card.on [data-force="1"]`)), '下載失敗不用「仍然下載」');
      assert(pullCalls.length === 5, '一共下載 5 次：' + pullCalls.length);
      await shot('p06_gave_up', '.ob-card.on .pull-err');
      // 6b. 新手教學最後一頁：大腦那行說還沒下載好、去健康檢查看原因
      await js(`state.view.llm.enabled = true; state.view.llm.model = ${JSON.stringify(FLAG)}; obState().step = 'done'; renderPanel(); 0`); await wait(300);
      assert(/還沒下載好：網路連不上下載伺服器。之後在右鍵選單「🩺 健康檢查」/.test(await text('.ob-summary')), '完成頁：' + await text('.ob-summary'));
      // 7. 紀錄：data/setup.log
      const log = fs.readFileSync(path.join(engine.dataDir, 'setup.log'), 'utf8');
      assert(/下載前檢查：擋下（連不上下載伺服器）/.test(log) && /擋下（Ollama 沒有走 proxy）/.test(log) && /按了「仍然下載」/.test(log) && /第 1 次失敗（network，有進度）/.test(log) && /放棄：/.test(log), 'setup.log：' + log);
      assert(!/X-Amz|FAKE|Users/.test(log), 'setup.log 沒有長網址和使用者資料夾');
      await js('closePanel()'); await wait(300);
      // 8. 健康檢查：AI 打開但模型沒下載 → 下載失敗的原因＋再試一次＋其他按鈕還在；再試一次 → 硬碟不夠
      engine.config.llm.enabled = true; engine.config.llm.model = FLAG;
      await js('openHealth(); 0');
      assert(await until(() => has('.hl-item .pull-err')), '健康檢查顯示下載失敗的原因');
      assert(await has('.hl-item [data-fix="disableAI"]') && await has(`.hl-item [data-ob-pull="${FLAG}"]`), '其他按鈕還在');
      scene = 'disk';
      await click(`.hl-item [data-ob-pull="${FLAG}"]`);
      assert(await until(async () => /硬碟空間不夠/.test(await text('.hl-item .pull-err'))), '健康檢查裡也會檢查');
      err = await text('.hl-item .pull-err');
      assert(/還要下載約 17\.3 GB/.test(err) && /C 槽只剩 12\.0 GB/.test(err), '硬碟：' + err);
      await shot('p07_health_disk', '.hl-item .pull-err');
      // 9. 仍然下載 → 下載中按取消 → 回到原本的按鈕（不顯示成錯誤）
      await click(`.hl-item [data-ob-pull="${FLAG}"][data-force="1"]`);
      assert(await until(() => has(`.hl-item [data-ob-cancel="${FLAG}"]`)), '下載中可以取消');
      await click(`.hl-item [data-ob-cancel="${FLAG}"]`);
      assert(await until(async () => !(await has('.hl-item .pull-err')) && await has(`.hl-item [data-fix="pull:${FLAG}"]`)), '取消後回到「下載模型」');
      assert(/已取消/.test(fs.readFileSync(path.join(engine.dataDir, 'setup.log'), 'utf8').split('\n').filter(Boolean).pop()), '紀錄取消');
      console.log('PULL TEST OK');
    } catch (e) { console.error('PULL TEST FAIL', e); process.exitCode = 1; }
    setTimeout(() => require('electron').app.quit(), 300);
  });
};
