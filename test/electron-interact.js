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
      const wxCalls = [];
      global.wxFetch = async (u) => {
        wxCalls.push(u);
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
      // 預設關著：魔法裡的水晶是淡的、寫「還沒打開」，也沒有連網
      await runWeather(true); await wait(300);
      await js(`document.querySelector('#choices .more button[data-act="magic"]').click()`); await wait(400);
      const off = await js(`(()=>{const b=document.querySelector('#subRow .sub-btn[data-act="weather"]');return b?{dim:b.classList.contains('dim'),note:b.querySelector('small').textContent,tip:b.dataset.tip}:null;})()`);
      assert(off && off.dim && /還沒打開/.test(off.note) && /農曆/.test(off.tip) && wxCalls.length === 0, '預設關著、沒連網：' + JSON.stringify(off) + wxCalls.join());
      await shot('x00a_crystal_off');
      // 點水晶：先看說明（會連到哪裡、送出什麼）；位置先空著，不選不能打開；選縣市就不查 IP
      await js(`document.querySelector('#subRow .sub-btn[data-act="weather"]').click()`); await wait(400);
      assert(await js(`document.querySelector('#panel').dataset.kind === 'weatherSet' && !document.querySelector('#panel').classList.contains('hidden') && document.querySelector('#wxWhere').value === ''`), '點了先看說明，位置先空著');
      await js(`document.querySelector('#wxOn').click()`); await wait(200);
      assert(/先選一個縣市/.test(await js(`document.querySelector('#wxSend').textContent`)) && !engine.weatherOn() && wxCalls.length === 0, '沒選位置不會打開');
      const pickWhere = (val) => js(`(()=>{const s=document.querySelector('#wxWhere');s.value=${JSON.stringify(val)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await pickWhere('ip'); await wait(150);
      assert(/geojs/.test(await js(`document.querySelector('#wxSend').textContent`)), '選網路位置：寫出會連到查 IP 的服務');
      await wait(400); await shot('x00_weather_ask');
      await pickWhere('台中'); await wait(150);
      assert(/只送出「台中」/.test(await js(`document.querySelector('#wxSend').textContent`)), '選縣市：只送那個縣市');
      await js(`document.querySelector('#wxOn').click()`); await wait(1200);
      assert(engine.weatherOn() && engine.weatherCfg().city === '台中' && wxCalls.length === 1 && /open-meteo/.test(wxCalls[0]) && /latitude=24\.16/.test(wxCalls[0]), '打開了：只問天氣、不查 IP：' + wxCalls.join());
      // ✨ 魔法那排：第三顆是天候水晶（會動的小圖＋現在的天氣）
      if (!(await js('state.subRow === "magic"'))) await js(`toggleSub('magic')`);
      await wait(400);
      const wt = await js(`(()=>{const b=document.querySelector('#subRow .sub-btn[data-act="weather"]');const all=[...document.querySelectorAll('#subRow .sub-btn')].map(x=>x.dataset.act);if(!b)return {all};const g=b.querySelector('.wx-cloud,.wx-rays');return {all,dim:b.classList.contains('dim'),note:b.querySelector('small').textContent,svg:!!b.querySelector('svg'),tip:b.dataset.tip,anim:g?getComputedStyle(g).animationName:''};})()`);
      assert(wt.all && wt.all.join() === 'fortune,divine,weather' && !wt.dim && /晴時多雲 26°/.test(wt.note) && /降雨 20%/.test(wt.note) && wt.svg && /台中/.test(wt.tip) && /^wx/.test(wt.anim), '魔法裡的天候水晶：' + JSON.stringify(wt));
      assert(!(await js(`!!document.querySelector('#hudWeather')`)), '狀態欄不再放水晶');
      await shot('x01_magic_crystal');
      await js(`document.querySelector('#subRow .sub-btn[data-act="weather"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`); await wait(400);
      await shot('x02_crystal_tip');
      await js(`document.querySelector('#subRow .sub-btn[data-act="weather"]').dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));hideTip()`);
      await js(`document.querySelector('#subRow .sub-btn[data-act="weather"]').click()`); await wait(250);
      const cast = await js(`(()=>{const b=document.querySelector('#subRow .sub-btn[data-act="weather"]');return {cast:!!b&&b.classList.contains('wx-cast'),rowOpen:!document.querySelector('#subRow').classList.contains('hidden'),emote:!!document.querySelector('#npcWrap > .emote')};})()`);
      assert(cast.cast && cast.emote, '點水晶：水晶亮一下、她身邊閃星星：' + JSON.stringify(cast));
      await shot('x03b_crystal_cast');
      // 天候水晶的面板：霧濛濛的水晶 → 點一下 → 霧散開 → 天空
      await wait(500);
      const g0 = await js(`({panel:state.panel, step:state.wx&&state.wx.step, orb:!!document.querySelector('#wxOrb.misty'), mist:document.querySelectorAll('#wxOrb .wx-mist i').length})`);
      assert(g0.panel === 'weather' && g0.step === 'gaze' && g0.orb && g0.mist === 3, '先是霧濛濛的水晶：' + JSON.stringify(g0));
      await shot('x03_crystal_gaze');
      await js(`document.querySelector('#wxOrb').click()`); await wait(700);
      const g1 = await js(`(()=>{const m=document.querySelector('#wxOrb .wx-mist');return {step:state.wx.step, scry:!!document.querySelector('#wxOrb.scrying'), mist:m?getComputedStyle(m).opacity:''};})()`);
      assert(g1.step === 'scry' && g1.scry && Number(g1.mist) < 1, '霧散開、符文轉快：' + JSON.stringify(g1));
      await shot('x03b_crystal_scry');
      await wait(1600);
      for (let i = 0; i < 20 && !(await js(`!!(state.wx && state.wx.reading)`)); i++) await wait(150);
      const sky = await js(`(()=>({step:state.wx.step, temp:(document.querySelector('.wx-temp')||{}).textContent, hours:document.querySelectorAll('.wx-hour').length, days:document.querySelectorAll('.wx-daycard').length, reading:(document.querySelector('#wxReading .dv-rt')||{}).textContent, anim:(()=>{const g=document.querySelector('.wx-now .wx-cloud,.wx-now .wx-rays');return g?getComputedStyle(g).animationName:''})()}))()`);
      assert(sky.step === 'sky' && sky.temp === '26°' && sky.hours >= 1 && sky.days === 2 && /26/.test(sky.reading) && /^wx/.test(sky.anim), '天空：現在、接下來幾小時、今天明天、她看了水晶說的話：' + JSON.stringify(sky));
      await wait(1200); await shot('x03c_crystal_sky');
      await js(`document.querySelector('[data-close]').click()`); await wait(300);
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
      assert(/cursors\/open_32\.png/.test(cs.inline) && /^(-webkit-)?image-set\(/.test(cs.computed), '頭上：張開的手套、還沒擺（Chromium 認得 image-set）：' + JSON.stringify(cs));
      const probe = await js(`new Promise((r)=>{const i=new Image();i.onload=()=>r({ok:true,w:i.naturalWidth});i.onerror=()=>r({ok:false});i.src='../../assets/ui/cursors/open_32.png';})`);
      assert(probe.ok && probe.w === 32, '鼠標的圖讀得到：' + JSON.stringify(probe));
      const headCur = cs.inline;
      await moveAt(515, 400); cs = await cursorNow(); const faceCur = cs.inline; assert(/cursors\/poke_32\.png/.test(faceCur), '臉頰：伸出食指');
      await moveAt(900, 960); cs = await cursorNow(); assert(/cursors\/pinch_32\.png/.test(cs.inline) && headCur !== faceCur, '尾巴：輕輕捏');
      await moveAt(515, 800); cs = await cursorNow(); assert(cs.inline === '' && cs.computed === 'pointer', '身體：照舊');
      await js(`document.querySelector('#npcWrap').dispatchEvent(new MouseEvent('mouseleave'))`);
      // 摸頭：滑鼠在頭上左右來回
      engine.pokeTimes = [];
      await js(`state.lineDoneAt=0;state.clickedAt=0`);
      const tilts = new Set();
      for (const x of [460, 520, 580, 520, 460, 520, 580, 520, 460, 520]) { await moveAt(x, 150); await wait(40); const c = (await cursorNow()).inline; const m = c.match(/cursors\/pat_([lr])_32/); if (m) tilts.add(m[1]); }
      assert(tilts.has('l') && tilts.has('r'), '摸頭的時候手套左右擺：' + [...tilts]);
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
      await js(`hideSub(); document.querySelector('#choices .more button[data-act="magic"]').click()`); await wait(300);
      const tip2 = await js(`document.querySelector('#subRow .sub-btn[data-act="weather"]').dataset.tip`);
      assert(/萬聖節/.test(tip2) && /農曆/.test(tip2), '水晶滑過看得到今天是什麼日子：' + tip2);
      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
