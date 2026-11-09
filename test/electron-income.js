// 🔔 收入撲滿（11/9）：設定面板 → 艾琳腳邊出現鈴鐺撲滿 → 上班時間每秒掉硬幣、累計一直加；擺設、奶茶的位置；收起來（xvfb 用，不開 Ollama）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] }; // 沒有午休：整段都算
  engine.config.window.idleChatterMinutes = 0;
  engine.dayOff = () => ({ off: false, kind: null }); // 測試哪天跑都當上班日
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const until = async (code, ms = 6000, msg = code) => { for (let i = 0; i < ms / 100; i++) { if (await js(code)) return; await wait(100); } throw new Error('ASSERT 等不到 ' + msg); };
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  // 上班時間：現在的前 2 小時到後 2 小時（跨午夜就縮短）
  const now = new Date();
  const s = new Date(now); s.setHours(Math.max(0, now.getHours() - 2), 0, 0, 0);
  const e = new Date(now); e.setHours(Math.min(23, now.getHours() + 2), 59, 0, 0);
  const set = (id, val) => js(`(()=>{const el=document.querySelector('#${id}');el.value=${JSON.stringify(val)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  wc.on('console-message', (ev) => { if (ev.level === 'warning' || ev.level === 'error') console.log('[renderer]', ev.message); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(1500); await flush();
      await js('closePanel(); closeDialog(); 0'); await wait(300);
      assert(!(await js(`!!document.querySelector('#incomeBank')`)), '還沒設定：沒有撲滿');
      // 1. 設定面板：填月薪 48000 → 時薪 200
      await js(`openPanel('income'); 0`); await wait(400);
      assert(await js(`state.panel === 'income' && !!document.querySelector('#icMonthly')`), '面板打開');
      await set('icMonthly', 'abc'); await js(`document.querySelector('#icSave').click(); 0`); await wait(300);
      assert(/月薪要填/.test(await js(`document.querySelector('#icPreview').textContent`)) && await js(`state.panel === 'income'`), '亂填：不存、說原因');
      await set('icMonthly', '48,000'); await set('icStart', hm(s)); await set('icEnd', hm(e));
      const pv = await js(`document.querySelector('#icPreview').textContent`);
      assert(/時薪 NT\$200/.test(pv) && /每秒 NT\$0\.06/.test(pv) && /每 1 秒 掉 NT\$0\.06/.test(pv), '預覽：' + pv);
      await shot('i01_panel');
      await js(`document.querySelector('#icSave').click(); 0`);
      await until(`!!document.querySelector('#incomeBank') && state.panel === null`, 4000, '撲滿出現');
      assert(engine.config.income.monthly === 48000 && engine.config.income.enabled === true && engine.config.income.interval === 1, '存進設定：' + JSON.stringify(engine.config.income));
      // 2. 每秒掉一枚、累計一直加
      const t1 = await js(`document.querySelector('#incomeBank .ib-total').textContent`);
      let coins = 0;
      for (let i = 0; i < 30; i++) { coins = Math.max(coins, await js(`document.querySelectorAll('#incomeBank .ib-coin').length`)); if (coins) break; await wait(100); }
      assert(coins >= 1, '掉硬幣');
      assert(/^\+0\.06$/.test(await js(`(document.querySelector('#incomeBank .ib-plus')||{}).textContent||''`)), '飄 +0.06');
      await wait(500); await shot('i02_drop');
      await wait(2200);
      const t2 = await js(`document.querySelector('#incomeBank .ib-total').textContent`);
      const n = (x) => Number(String(x).replace(/[^\d.]/g, ''));
      assert(/^NT\$[\d,.]+$/.test(t1) && n(t2) > n(t1), `累計一直加：${t1} → ${t2}`);
      const tip = await js(`document.querySelector('#incomeBank').dataset.tip`);
      assert(/今天賺了 NT\$/.test(tip) && /時薪 NT\$200（月薪 ÷ 240）/.test(tip), '滑過：' + tip);
      // 3. 擺設是別的東西 → 撲滿在它右邊；奶茶再往右
      engine.state.shop.equip.desk = 'pigeon'; wc.send('view:update', { view: engine.view() }); await wait(500);
      const pos = await js(`(()=>{const b=document.querySelector('#incomeBank').getBoundingClientRect(),d=document.querySelector('#decor .d-desk').getBoundingClientRect();return {b:b.left,d:d.left,dr:d.right};})()`);
      assert(pos.b >= pos.dr - 6, '在擺設右邊：' + JSON.stringify(pos));
      await shot('i03_with_desk');
      // 擺設本來就是鈴鐺撲滿 → 用它的位置、擺設那個藏起來
      engine.state.shop.equip.desk = 'piggy'; wc.send('view:update', { view: engine.view() }); await wait(500);
      assert(await js(`document.body.classList.contains('bank-is-desk') && getComputedStyle(document.querySelector('#decor .d-desk')).visibility === 'hidden'`), '擺設的撲滿收起來，不會兩個');
      engine.state.shop.equip.desk = ''; wc.send('view:update', { view: engine.view() }); await wait(300);
      // 4. 下班時間：不掉硬幣、撲滿變淡、累計留著
      engine.config.income.end = hm(new Date(now.getTime() - 60000)); engine.config.income.start = hm(s.getHours() < now.getHours() ? s : new Date(now.getTime() - 3600000));
      wc.send('view:update', { view: engine.view() }); await wait(1300);
      assert(await js(`document.querySelector('#incomeBank').classList.contains('rest')`), '下班：撲滿變淡');
      // 5. 收起撲滿：月薪留著，再打開不用重填
      await js(`openPanel('income'); 0`); await wait(300);
      assert(await js(`document.querySelector('#icMonthly').value === '48000'`), '月薪帶回來');
      await js(`document.querySelector('#icOff').click(); 0`);
      await until(`!document.querySelector('#incomeBank')`, 3000, '收起來');
      assert(engine.config.income.enabled === false && engine.config.income.monthly === 48000, '月薪留著');
      await js(`openPanel('income'); 0`); await wait(300);
      assert(await js(`document.querySelector('#icMonthly').value === '48000'`), '再打開：月薪還在');
      await shot('i04_off_reopen');
      console.log('INCOME OK');
      setTimeout(() => process.exit(0), 200);
    } catch (err) { console.error(err); await shot('i_fail').catch(() => {}); process.exit(1); }
  });
};
