// 🐾 互動擴充（10/21）：摸不同的地方、摸頭、幫艾琳做決定（按鈕）、節日、天候水晶（xvfb 用，不開 Ollama、不連網路：天氣用假的）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';

module.exports = ({ win, engine, app, runWeather }) => {
  engine.state.onboarding = { ...(engine.state.onboarding || {}), done: true };
  engine.config.reminders = { ...(engine.config.reminders || {}), items: [] };
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const assert = (c, m) => { if (!c) throw new Error('ASSERT ' + m); };
  const text = () => js(`document.querySelector('#dlgText').textContent`);
  const flush = async () => { for (let i = 0; i < 40; i++) { if (!(await js('state.talking || state.queue.length > 0 || state.typing'))) break; if (await js('state.typing || state.queue.length > 0')) await js('advance()'); await wait(150); } };
  // 立繪原圖座標 (ix, iy) → 畫面上的點
  const at = (ix, iy) => js(`(()=>{const r=document.querySelector('#npcImg').getBoundingClientRect();return {x:r.left+${ix}/1093*r.width,y:r.top+${iy}/1200*r.height};})()`);
  const clickAt = async (ix, iy) => { const p = await at(ix, iy); await js(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,clientX:${p.x},clientY:${p.y},screenX:${p.x},screenY:${p.y}}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:${p.x},clientY:${p.y}}));})()`); };
  const moveAt = async (ix, iy) => { const p = await at(ix, iy); await js(`document.querySelector('#npcWrap').dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:${p.x},clientY:${p.y},screenX:${Math.round(p.x)},screenY:${p.y}}))`); };
  const pokes = [];
  const orig = engine.poke.bind(engine);
  engine.poke = (zone, gesture) => { pokes.push([zone, gesture]); return orig(zone, gesture); };
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('[renderer]', e.message); });

  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background='linear-gradient(135deg,#5b7fa6,#9bb7cf)'`);
      await wait(2500); await flush();
      // ---- ☁ 天候水晶：假的位置與天氣 ----
      global.wxFetch = async (u) => {
        if (/geojs/.test(u)) return { latitude: '24.14771', longitude: '120.67361', city: 'Taichung', region: 'Taichung City', country: 'Taiwan' };
        if (/open-meteo/.test(u)) {
          const now = new Date(); const pad = (n) => String(n).padStart(2, '0');
          const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          const hr = (h) => `${iso(now)}T${pad(h)}:00`;
          return { utc_offset_seconds: -now.getTimezoneOffset() * 60, current: { temperature_2m: 26.4, apparent_temperature: 28.1, relative_humidity_2m: 70, weather_code: 2, is_day: 1, precipitation: 0, wind_speed_10m: 8 },
            hourly: { time: [hr(now.getHours()), hr(Math.min(23, now.getHours() + 1))], precipitation_probability: [10, 20], weather_code: [2, 2], temperature_2m: [26, 26] },
            daily: { time: [iso(now), iso(new Date(now.getTime() + 86400000))], weather_code: [2, 61], temperature_2m_max: [28, 25], temperature_2m_min: [22, 21], precipitation_probability_max: [20, 80] } };
        }
        throw new Error('blocked ' + u);
      };
      await runWeather(true); await wait(500);
      const wt = await js(`(()=>{const t=document.querySelector('#hudWeather');return {hidden:t.classList.contains('hidden'),dim:t.classList.contains('dim'),temp:t.querySelector('.wx-t').textContent,svg:!!t.querySelector('svg'),tip:t.dataset.tip};})()`);
      assert(!wt.hidden && !wt.dim && wt.temp === '26°' && wt.svg && /台中/.test(wt.tip) && /晴時多雲/.test(wt.tip), '狀態欄的天候水晶：' + JSON.stringify(wt));
      const hb = await js(`(()=>{const t=document.querySelector('#hudTop');return {sw:t.scrollWidth,cw:t.clientWidth};})()`);
      assert(hb.sw <= hb.cw + 1, '狀態欄放得下：' + JSON.stringify(hb));
      await shot('x01_hud_crystal');
      await js(`document.querySelector('#hudWeather').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`); await wait(400);
      await shot('x02_crystal_tip');
      await js(`document.querySelector('#hudWeather').dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));hideTip()`);
      await js(`document.querySelector('#hudWeather').click()`); await wait(400); await flush();
      const wl = await text();
      assert(/26/.test(wl) && /晴時多雲/.test(wl), '點水晶：她看天空說一句：' + wl);
      await shot('x03_crystal_line');
      // ---- 🐾 摸不同的地方（第一下是打招呼）----
      await js(`closeDialog()`); await wait(200);
      await clickAt(515, 600); await wait(1500); await flush();
      await js(`state.lineDoneAt=0;state.clickedAt=0`);
      await clickAt(720, 170); await wait(300);
      const em = await js(`(()=>{const e=document.querySelector('#npcWrap > .emote');return e?e.dataset.kind||e.className:'';})()`);
      await wait(1200); await flush();
      assert(pokes.some(([z]) => z === 'earR'), '點右耳：' + JSON.stringify(pokes));
      console.log('耳朵：', await text(), '表情符號：', em);
      await shot('x04_touch_ear');
      engine.pokeTimes = [];
      await js(`state.lineDoneAt=0;state.clickedAt=0`);
      await clickAt(900, 960); await wait(1500); await flush();
      assert(pokes.some(([z]) => z === 'tail'), '點尾巴');
      console.log('尾巴：', await text());
      // 鼠標：滑到頭上是張開的手套、臉頰一根手指、尾巴捏、身體照舊；來回摸的時候手跟著擺
      const cursorNow = () => js(`(()=>{const w=document.querySelector('#npcWrap');return {inline:decodeURIComponent(w.style.cursor||''),computed:getComputedStyle(w).cursor.slice(0,40)};})()`);
      await js(`document.querySelector('#npcWrap').dispatchEvent(new MouseEvent('mouseleave'))`);
      await moveAt(515, 150); let cs = await cursorNow();
      assert(/data:image\/svg\+xml/.test(cs.inline) && /^url\(/.test(cs.computed) && !/rotate/.test(cs.inline), '頭上：張開的手套（Chromium 認得）：' + JSON.stringify(cs));
      await moveAt(515, 400); cs = await cursorNow(); assert(/M10 2\.4|x="10" y="2\.4"/.test(cs.inline), '臉頰：伸出食指');
      await moveAt(900, 960); cs = await cursorNow(); assert(/C12\.6 12\.2 10\.8 8\.6/.test(cs.inline), '尾巴：輕輕捏');
      await moveAt(515, 800); cs = await cursorNow(); assert(cs.inline === '' && cs.computed === 'pointer', '身體：照舊');
      await js(`document.querySelector('#npcWrap').dispatchEvent(new MouseEvent('mouseleave'))`);
      // 摸頭：滑鼠在頭上左右來回
      engine.pokeTimes = [];
      await js(`state.lineDoneAt=0;state.clickedAt=0`);
      const tilts = new Set();
      for (const x of [460, 520, 580, 520, 460, 520, 580, 520, 460, 520]) { await moveAt(x, 150); await wait(40); const c = (await cursorNow()).inline; const m = c.match(/rotate\((-?\d+)/); if (m) tilts.add(m[1]); }
      assert(tilts.has('-16') && tilts.has('16'), '摸頭的時候手套左右擺：' + [...tilts]);
      await wait(300);
      const patEm = await js(`!!document.querySelector('#npcWrap > .emote')`);
      await wait(1200); await flush();
      assert(pokes.some(([z, g]) => z === 'head' && g === 'pat'), '摸頭：' + JSON.stringify(pokes));
      assert(patEm, '摸頭冒小愛心');
      console.log('摸頭：', await text());
      await shot('x05_pat');
      // ---- 🤔 幫她做決定：選項按鈕 ----
      engine.state.decide = { answers: {}, asked: {}, lastBigAt: Date.now() }; // 先問一件小事（大決定下面另外測）
      const n0 = engine.now();
      engine.now = () => new Date(n0.getFullYear(), n0.getMonth(), n0.getDate(), 11, 0);
      const ask = engine.decideAsk();
      assert(ask && ask.lines[0].pick, '有題目可以問');
      wc.send('npc:lines', ask.lines.map((l) => ({ ...l, ambient: true })));
      await wait(600); await flush(); await wait(200);
      const btns = await js(`[...document.querySelectorAll('#pickRow button')].map(b=>b.textContent)`);
      assert(btns.length >= 2 && !(await js(`document.querySelector('#pickRow').classList.contains('hidden')`)), '選項按鈕：' + JSON.stringify(btns));
      await shot('x06_decide_ask');
      await js(`document.querySelector('#pickRow button').click()`); await wait(800); await flush();
      const ans = engine.state.decide.answers[ask.lines[0].pick.id];
      assert(ans && ans.label === btns[0], '按鈕回答：' + JSON.stringify(ans));
      assert(await js(`document.querySelector('#pickRow').classList.contains('hidden')`), '回答完按鈕收起來');
      console.log('回答：', await text());
      await shot('x07_decide_reply');
      // 自己取名字（第七隻鴿子）：選項下面有提示、聊天框打開
      engine.state.decide = { answers: {}, asked: {}, lastBigAt: 0 };
      engine.state.decide.pending = null;
      await js('state.decided = {}');
      const q = require('../src/main/decide').BY.pigeon7;
      engine.state.decide.pending = { id: 'pigeon7', day: 'x', at: engine.now().getTime() };
      const line = { ...engine.npc.textLine(q.ask, 'surprised'), event: 'decide', reply: true, pick: { id: 'pigeon7', options: q.options.map((o) => ({ id: o.id, label: o.label })), free: true } };
      wc.send('npc:lines', [line]); await wait(600); await flush();
      assert(await js(`!!document.querySelector('#pickRow .pick-free') && !document.querySelector('#chatRow').classList.contains('hidden')`), '可以自己取名字：提示＋聊天框');
      await shot('x08_decide_free');
      await js(`document.querySelector('#chatInput').value='就叫阿福吧';document.querySelector('#chatSend').click()`); await wait(1200); await flush();
      assert(engine.state.decide.answers.pigeon7 && engine.state.decide.answers.pigeon7.label === '阿福', '聊天框取名');
      assert(await js(`document.querySelector('#pickRow').classList.contains('hidden')`), '在聊天框回答：按鈕也收起來');
      console.log('取名：', await text());
      await shot('x09_decide_named');
      // ---- 📅 節日：萬聖節第一次見面 ----
      engine.now = () => new Date(2026, 9, 31, 9, 30);
      engine.state.lastGreetDate = ''; engine.state.fest = {}; engine.dayCache = null; engine.idleCache = null;
      await js(`closeDialog(); state.lastGreetAt=0`); await wait(200);
      const g = await engine.greet();
      wc.send('npc:lines', g.lines); wc.send('view:update', { view: engine.view() });
      await wait(400);
      let ft = '';
      for (let i = 0; i < 30; i++) { // 一句一句往下看，看到萬聖節那句就停（逾期的提醒可能晚一點才排進來）
        if (await js('state.typing')) await js('advance()');
        ft = await text();
        if (/萬聖節/.test(ft)) break;
        if (await js('state.queue.length > 0')) await js('advance()');
        await wait(300);
      }
      assert(/萬聖節/.test(ft), '萬聖節的那句：' + ft);
      await shot('x10_halloween');
      const tip2 = await js(`document.querySelector('#hudWeather').dataset.tip`);
      assert(/萬聖節/.test(tip2) && /農曆/.test(tip2), '水晶滑過看得到今天是什麼日子：' + tip2);
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
