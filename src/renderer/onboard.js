// 🎓 新手引導（第一次開啟時艾琳帶你設定）、新手任務清單、🩺 健康檢查
// 跟 renderer.js 共用全域的 state、$、esc、head、run、toast、openPanel、renderPanel…（renderer.js 先載入）
'use strict';

const OB_STEPS = [
  { key: 'welcome', label: '歡迎' },
  { key: 'basics', label: '操作' },
  { key: 'ai', label: '大腦' },
  { key: 'plan', label: '計畫' },
  { key: 'schedule', label: '作息' },
  { key: 'done', label: '完成' },
];
const npcName = () => (state.view && state.view.npc && state.view.npc.name) || '艾琳';

function obState() {
  if (!state.ob) state.ob = { step: 'welcome', basics: {}, probe: null, probing: false, pulls: {}, choice: undefined, planMode: 'write', planDone: null, embed: false };
  return state.ob;
}
function openOnboard(step) {
  const ob = obState();
  if (step) ob.step = step;
  openPanel('onboard');
}
// 操作教學：點她、拖她、右鍵（renderer.js 的事件會呼叫這裡）
function obMark(key) {
  if (state.panel !== 'onboard' || !state.ob || state.ob.step !== 'basics') return false;
  if (!state.ob.basics[key]) { state.ob.basics[key] = true; renderPanel(); }
  return true;
}

function obStepsBar(cur) {
  const i = OB_STEPS.findIndex((s) => s.key === cur);
  return `<div class="ob-steps">${OB_STEPS.map((s, j) => `<span class="ob-dot ${j < i ? 'past' : j === i ? 'now' : ''}"><i>${j < i ? '✔' : j + 1}</i><small>${s.label}</small></span>`).join('')}</div>`;
}
const say = (html) => { const img = state.character && state.character.mini; return `<div class="ob-say">${img ? `<img class="ob-face" src="${img}" alt="">` : '<span class="ob-face">🐱</span>'}<div>${html}</div></div>`; };
const bar = (p) => `<div class="ob-bar"><div style="width:${Math.max(2, p || 0)}%"></div></div>`;

function pullHtml(model, size) {
  const p = (state.pulls || {})[model];
  if (!p) return `<button class="btn small gold" data-ob-pull="${esc(model)}">⬇ 下載（約 ${esc(size)}）</button>`;
  if (p.status === 'success') return '<span class="chip ok">✔ 下載完成</span>';
  if (p.status === 'error') return `<span class="chip bad">下載失敗：${esc(p.error || '')}</span>${/版本太舊/.test(p.error || '') ? '<button class="btn small gold" data-ob-update>下載新版 Ollama</button>' : ''}<button class="btn small" data-ob-pull="${esc(model)}">再試一次</button>`;
  const mb = p.total ? `（${Math.round((p.completed || 0) / 1048576)}／${Math.round(p.total / 1048576)} MB）` : '';
  return `<div class="ob-pull">${bar(p.percent)}<span class="ob-pct">${p.percent || 0}%${mb}</span><button class="btn small ghost" data-ob-cancel="${esc(model)}">取消</button></div>`;
}

function renderOnboard(el, v) {
  const ob = obState();
  const name = npcName();
  let body = '', foot = '';
  const back = '<button class="btn ghost" data-ob-back>← 上一步</button>';
  if (ob.step === 'welcome') {
    body = say(`初次見面！${esc(name)}是星盾公會晨風鎮分會、三號櫃台的接待員。<br>從今天起，你的每一件工作都是一份「委託」：完成目標就能拿到星屑（經驗值）和金幣，${esc(name)}會幫你記著進度、準時提醒你。`)
      + say(`接下來大概花 3 分鐘，一起把櫃台準備好吧！每一步都可以跳過，之後右鍵選單的「🎓 新手教學」可以再看一次。`);
    foot = `<button class="btn ghost" data-ob-skipall>我很熟了，全部跳過</button><span class="spacer"></span><button class="btn gold" data-ob-next>開始 →</button>`;
  }
  if (ob.step === 'basics') {
    const b = ob.basics;
    const item = (k, t, d) => `<div class="ob-check ${b[k] ? 'done' : ''}"><span class="box">${b[k] ? '✔' : ''}</span><div><b>${t}</b><small>${d}</small></div></div>`;
    const all = b.click && b.drag && b.menu;
    body = say(all ? '都會了！嗯哼，冒險者學得真快。' : `先試試看這三件事（不做也可以直接下一步）：`)
      + item('click', `點${esc(name)}一下`, '平常點她就會打招呼、提醒你現在的任務')
      + item('drag', `按住${esc(name)}，拖到喜歡的位置`, '放開後會記住，下次打開還在那裡')
      + item('menu', `在${esc(name)}身上按右鍵`, '所有功能都在這個選單裡（看完按 Esc 或點旁邊關掉）')
      + `<p class="hint">左下角是你的狀態：等級、金幣、現在該做的事。按 ▁ 可以讓${esc(name)}縮成一隻小貓，不擋畫面。</p>`;
    foot = `${back}<span class="spacer"></span><button class="btn gold" data-ob-next>${all ? '都會了 →' : '下一步 →'}</button>`;
  }
  if (ob.step === 'ai') {
    const p = ob.probe;
    if (!p) {
      body = say('正在看看你的電腦……');
      if (!ob.probing) obProbe();
    } else {
      // 預設：已經裝好的那個；還沒裝就用推薦的（看記憶體）
      if (ob.choice === undefined) ob.choice = v.llm && v.llm.enabled && p.choices.some((c) => c.name === v.llm.model && c.installed) ? v.llm.model : (p.recommend || null);
      const st = p.ollama === 'running' && p.outdated ? `<div class="ob-status warn">🟡 找到 Ollama 了，但版本 ${esc(p.version)} 太舊（需要 ${esc(p.minVersion)} 以上）<div class="ob-sub">舊版的話，${esc(name)}會回得很慢、常常回不好，新的模型也可能下載不了。下載新版直接安裝就好，已經下載的模型會留著。</div><div class="ob-btns"><button class="btn small gold" data-ob-update>下載新版</button><button class="btn small" data-ob-probe>再檢查一次</button></div></div>`
        : p.ollama === 'running' ? `<div class="ob-status ok">🟢 找到 Ollama 了</div>`
        : p.ollama === 'stopped' ? `<div class="ob-status warn">🟡 Ollama 裝好了，但現在沒有開　<button class="btn small gold" data-ob-openollama>幫我打開</button><button class="btn small ghost" data-ob-probe>再檢查一次</button></div>`
          : `<div class="ob-status off">⚪ 還沒有安裝 Ollama<div class="ob-sub">到官網下載 Windows 版，照著畫面安裝就好（不需要系統管理員權限）。裝好後回來按「再檢查一次」。</div><div class="ob-btns"><button class="btn small gold" data-ob-openollama>打開下載頁</button><button class="btn small" data-ob-probe>再檢查一次</button></div></div>`;
      const card = (c) => {
        const rec = c.name === p.recommend ? '<span class="chip rec">推薦</span>' : '';
        const on = ob.choice === c.name;
        const tail = on && p.ollama === 'running' ? (c.installed ? '<span class="chip ok">✔ 已經下載好了</span>' : pullHtml(c.name, c.size)) : '';
        return `<label class="ob-card ${on ? 'on' : ''}"><input type="radio" name="obModel" value="${esc(c.name)}" ${on ? 'checked' : ''}><div><b>${esc(c.label.split('（')[0])}　<code>${esc(c.name)}</code></b>${rec}<small>${esc(c.label.match(/（(.+)）/) ? c.label.match(/（(.+)）/)[1] : '')}・約 ${esc(c.size)}</small>${tail}</div></label>`;
      };
      body = say(`${esc(name)}的「大腦」是裝在你電腦裡的 AI（叫做 Ollama），聊天內容不會傳到網路上。沒有它也能玩，只是${esc(name)}只會說內建的台詞。`)
        + st
        + `<p class="ob-why">💻 ${esc(p.why)}</p>`
        + p.choices.map(card).join('')
        + `<label class="ob-card ${ob.choice === null ? 'on' : ''}"><input type="radio" name="obModel" value="" ${ob.choice === null ? 'checked' : ''}><div><b>先不用 AI</b><small>${esc(name)}用內建台詞說話，之後隨時可以在右鍵選單打開</small></div></label>`
        + (ob.choice && p.ollama === 'running' ? `<label class="ob-opt"><input type="checkbox" id="obEmbed" ${ob.embed || p.embed.installed ? 'checked' : ''} ${p.embed.installed ? 'disabled' : ''}> 也準備「聰明${esc(name)}」（約 ${esc(p.embed.size)}）：換個說法問，她也聽得懂${p.embed.installed ? '（已經下載好了）' : ''}</label>${ob.embed && !p.embed.installed ? `<div class="ob-embed">${pullHtml(p.embed.name, p.embed.size)}</div>` : ''}` : '');
    }
    const downloading = Object.values(state.pulls || {}).some((x) => x && !x.done);
    foot = `${back}<span class="spacer">${downloading ? '下載會在背景繼續，可以先做下一步' : ''}</span><button class="btn gold" data-ob-next ${p ? '' : 'disabled'}>下一步 →</button>`;
  }
  if (ob.step === 'plan') {
    const modes = [
      ['write', '📝', '一起寫'],
      ['ics', '📅', '匯入行事曆'],
      ['file', '📂', '選擇檔案'],
      ['sample', '👀', '看範例'],
    ];
    const tabs = `<div class="ob-modes">${modes.map(([k, ic, t]) => `<button class="ob-mode ${ob.planMode === k ? 'on' : ''}" data-ob-mode="${k}"><span>${ic}</span><b>${esc(t)}</b></button>`).join('')}</div>`;
    let inner = '', action = '';
    if (ob.planMode === 'write') {
      const pick = (val, icon, nm) => `<label class="tp ${val} ${val === 'major' ? 'on' : ''}"><input type="radio" name="qfTier" value="${val}" ${val === 'major' ? 'checked' : ''}>${icon} ${nm}</label>`;
      inner = `<div class="form ob-form">
        <p class="ob-tip">跟${esc(name)}說這週的第一件事，填個名字和要完成的步驟就好：</p>
        <div class="field">📜 第一個任務<input id="obQTitle" placeholder="例如：完成週報" maxlength="80"></div>
        <div class="field">☑ 要完成哪些事（一行一個）<textarea id="obQObjs" rows="3" placeholder="整理資料&#10;寫初稿&#10;寄給主管"></textarea></div>
        <div class="field-row"><div class="field">🏷 重要程度<div class="tier-pick">${pick('main', '👑', '主線')}${pick('major', '⚔️', '重要')}${pick('side', '🌿', '有空再做')}</div></div>
        <div class="field">📅 截止日<input type="date" id="obQDue"><small class="fnote">留空＝這週內</small></div></div>
        <div class="field">🗂 這週的名稱（選填）<input id="obPTitle" placeholder="留空會自動取名，例如「我的一週 10/5–10/9」" maxlength="60"></div></div>`;
      action = '<button class="btn gold" data-ob-create>📜 建立，下一步 →</button>';
    } else if (ob.planMode === 'ics') {
      inner = `<div class="ob-help"><p><b>Google 日曆</b>：電腦版右上角 ⚙ 設定 →「匯入與匯出」→「匯出」，下載後解壓縮會得到 .ics 檔。</p><p><b>Outlook</b>：行事曆 → 檔案 →「另存行事曆」，存成 .ics。</p><p>${esc(name)}會把這週的行程抄進「今日行程」，整天的活動會變成那天的主題。要做的事再到任務板「＋ 新任務」登記。</p></div>`;
      action = '<button class="btn gold" data-ob-ics>📥 選擇 .ics 檔</button>';
    } else if (ob.planMode === 'file') {
      inner = `<div class="ob-help"><p>選一個 .md（Markdown）檔，${esc(name)}會照裡面的「## 任務」和「- [ ] 目標」派任務給你。格式可以參考你資料夾裡的 <code>plans/_template.md</code>。</p></div>`;
      action = '<button class="btn gold" data-ob-choose>📂 選擇檔案</button>';
    } else {
      inner = `<div class="ob-help"><p>範例是一間咖啡店準備秋季新品的一週：有任務、每天的時段和提醒。先玩玩看，之後右鍵選單「選擇週計畫檔…」或重跑新手教學就能換成自己的。</p></div>`;
      action = '<button class="btn gold" data-ob-sample>👀 用範例計畫</button>';
    }
    const doneNote = ob.planDone ? `<div class="ob-status ok">✔ ${esc(ob.planDone)}</div>` : '';
    body = say(`${esc(name)}會照你的「週計畫」派任務。選一種最順手的開始吧：`) + tabs + doneNote + inner;
    foot = ob.planDone
      ? `${back}<span class="spacer"></span><button class="btn ghost" data-ob-redo>再換一份</button><button class="btn gold" data-ob-next>下一步 →</button>`
      : `${back}<span class="spacer"></span><button class="btn ghost" data-ob-next>先跳過</button>${action}`;
  }
  if (ob.step === 'schedule') {
    const s = v.schedule || {};
    const row = (id, icon, label, val, dft) => `<label class="ob-time"><input type="checkbox" id="${id}On" ${val || !s.lunch ? 'checked' : ''}><span>${icon} ${label}</span><input type="time" id="${id}" value="${esc(val || dft)}"></label>`;
    const idle = s.idle || 0;
    const opt = (m, t) => `<option value="${m}" ${Number(idle) === m ? 'selected' : ''}>${t}</option>`;
    body = say(`${esc(name)}會在這些時間來叫你。用不到的取消勾選就好：`)
      + row('obLunch', '🍱', '提醒吃午餐', s.lunch, '12:00')
      + row('obBack', '☀', '午休結束、下午開工', s.back, '13:00')
      + row('obWrap', '🌇', '快下班了，來交日報', s.wrap, '16:50')
      + `<label class="ob-opt"><input type="checkbox" id="obWeekdays" ${s.weekdaysOnly !== false ? 'checked' : ''}> 只在平日（週一～五）提醒</label>`
      + `<div class="field ob-idle">💬 ${esc(name)}主動找你聊天（越熟越常來）<select id="obIdle">${opt(30, '常常（約半小時）')}${opt(45, '偶爾（約 45 分鐘）')}${opt(60, '很少（約 1 小時）')}${opt(0, '不要主動找我')}</select></div>`;
    foot = `${back}<span class="spacer"></span><button class="btn gold" data-ob-schedule>儲存，下一步 →</button>`;
  }
  if (ob.step === 'done') {
    const pr = ob.probe;
    const aiTxt = !v.llm.enabled ? '先用內建台詞（右鍵選單可以打開 AI）'
      : (state.pulls || {})[v.llm.model] && !(state.pulls[v.llm.model].done) ? `${v.llm.model}（下載中 ${state.pulls[v.llm.model].percent || 0}%，好了會自動接上）`
        : pr && pr.ollama !== 'running' ? `${v.llm.model}（等 Ollama 開了會自動接上）` : v.llm.model;
    const s = v.schedule || {};
    const times = [s.lunch && `${s.lunch} 午餐`, s.back && `${s.back} 開工`, s.wrap && `${s.wrap} 日報`].filter(Boolean).join('、') || '不提醒';
    body = say(`準備好了！從現在起，${esc(name)}就是你的專屬櫃台接待員。`)
      + `<div class="ob-summary"><div>🤖 大腦：<b>${esc(aiTxt)}</b></div><div>📜 計畫：<b>${esc(v.planTitle || '（還沒有）')}</b>・${v.quests.length} 個任務</div><div>⏰ 提醒：<b>${esc(times)}</b></div></div>`
      + say(`任務板最上面有 7 個「新手任務」，照著做一遍就會用所有功能，每完成一個都有小獎勵喔～`);
    foot = `${back}<span class="spacer"></span><button class="btn gold" data-ob-finish>⚔ 開始冒險！</button>`;
  }
  el.innerHTML = head('🎓 新手教學', '', '') + obStepsBar(ob.step) + `<div class="panel-body ob-body">${body}</div><div class="panel-foot">${foot}</div>`;
}

async function obProbe() {
  const ob = obState();
  ob.probing = true;
  const r = await api.setupProbe();
  ob.probing = false;
  ob.probe = r && r.ok ? r.probe : { ollama: 'missing', models: [], choices: [], embed: {}, why: '' };
  if (state.panel === 'onboard') renderPanel();
}
function obGo(delta) {
  const ob = obState();
  const i = OB_STEPS.findIndex((s) => s.key === ob.step);
  ob.step = OB_STEPS[Math.max(0, Math.min(OB_STEPS.length - 1, i + delta))].key;
  if (ob.step === 'ai') ob.probe = null; // 每次進來都重新檢查一次
  renderPanel();
  const body = document.querySelector('.ob-body'); if (body) body.scrollTop = 0;
}

async function onboardClick(e) {
  const t = e.target;
  const ob = obState();
  if (t.closest('[data-close]')) { closePanel(); return true; }
  if (t.closest('[data-ob-back]')) { obGo(-1); return true; }
  if (t.closest('[data-ob-skipall]')) { await obFinish(); return true; }
  if (t.closest('[data-ob-probe]')) { ob.probe = null; renderPanel(); return true; }
  if (t.closest('[data-ob-update]')) { api.healthFix('updateOllama').then((r) => { if (r && r.reason) toast(r.reason, 6000); }); return true; }
  if (t.closest('[data-ob-openollama]')) {
    const r = await api.setupOpenOllama();
    toast(r && r.opened === 'app' ? '正在打開 Ollama，等一下再按「再檢查一次」' : '已打開 Ollama 下載頁', 4000);
    if (r && r.opened === 'app') setTimeout(() => { if (state.panel === 'onboard' && ob.step === 'ai') { ob.probe = null; renderPanel(); } }, 5000);
    return true;
  }
  const pl = t.closest('[data-ob-pull]'); if (pl) { await api.setupPull(pl.dataset.obPull); return true; }
  const cp = t.closest('[data-ob-cancel]'); if (cp) { await api.setupCancelPull(cp.dataset.obCancel); return true; }
  if (t.closest('[data-ob-next]')) {
    if (ob.step === 'ai' && ob.probe) {
      const r = await api.setupSetModel(ob.choice || null);
      if (r && r.view) applyView(r.view);
      const c = ob.choice && ob.probe.choices.find((x) => x.name === ob.choice);
      if (c && !c.installed && ob.probe.ollama === 'running' && !(state.pulls || {})[c.name]) api.setupPull(c.name); // 還沒下載：按下一步就開始下載
    }
    obGo(1); return true;
  }
  const md = t.closest('[data-ob-mode]'); if (md) { ob.planMode = md.dataset.obMode; ob.planDone = null; renderPanel(); return true; }
  if (t.closest('[data-ob-redo]')) { ob.planDone = null; renderPanel(); return true; }
  if (t.closest('[data-ob-create]')) {
    const title = $('#obQTitle').value.trim();
    if (!title) { toast('⚠ 先幫第一個任務取個名字吧'); $('#obQTitle').focus(); return true; }
    const tierEl = document.querySelector('input[name="qfTier"]:checked');
    const quest = { title, tier: tierEl ? tierEl.value : 'major', deadlineLabel: isoToLabel($('#obQDue').value), objectives: $('#obQObjs').value.split('\n').map((x) => x.trim()).filter(Boolean) };
    const r = await api.setupCreatePlan({ title: $('#obPTitle').value.trim(), quest });
    if (!r || !r.ok) { toast(`⚠ ${r && r.error ? r.error : '建立失敗'}`, 4000); return true; }
    applyView(r.view);
    ob.planDone = `已建立「${r.view.planTitle}」，第一個任務是「${title}」`;
    toast(`📜 ${ob.planDone}`, 3500);
    obGo(1); return true;
  }
  if (t.closest('[data-ob-ics]')) {
    const r = await api.setupImportIcs();
    if (!r || !r.ok) { toast(`⚠ ${r && r.error ? r.error : '匯入失敗'}`, 4000); return true; }
    if (r.canceled) return true;
    applyView(r.view);
    ob.planDone = `${r.reason || '已匯入行事曆'}（記得到任務板「＋ 新任務」登記要做的事）`;
    renderPanel(); return true;
  }
  if (t.closest('[data-ob-choose]')) {
    const r = await api.setupChoosePlan();
    if (!r || !r.ok || r.canceled) { if (r && !r.ok) toast(`⚠ ${r.error}`, 4000); return true; }
    applyView(r.view);
    ob.planDone = `使用「${r.view.planTitle}」・${r.view.quests.length} 個任務`;
    renderPanel(); return true;
  }
  if (t.closest('[data-ob-sample]')) {
    const r = await api.setupSamplePlan();
    if (!r || !r.ok) { toast(`⚠ ${r && r.error ? r.error : '失敗'}`, 4000); return true; }
    applyView(r.view);
    ob.planDone = `使用範例「${r.view.planTitle}」`;
    renderPanel(); return true;
  }
  if (t.closest('[data-ob-schedule]')) {
    const val = (id) => ($(`#${id}On`).checked ? $(`#${id}`).value : '');
    const r = await api.setupSchedule({ lunch: val('obLunch'), back: val('obBack'), wrap: val('obWrap'), weekdaysOnly: $('#obWeekdays').checked, idle: Number($('#obIdle').value) });
    if (r && r.view) applyView(r.view);
    obGo(1); return true;
  }
  if (t.closest('[data-ob-finish]')) { await obFinish(); return true; }
  return false;
}
async function obFinish() {
  const r = await api.setupFinish();
  state.ob = null;
  closePanel();
  if (r && r.ok) { applyView(r.view); openDialog(); state.lastGreetAt = Date.now(); enqueue(r.lines); }
}
function onboardChange(e) {
  const t = e.target, ob = obState();
  if (t.name === 'obModel') { ob.choice = t.value || null; renderPanel(); return true; }
  if (t.id === 'obEmbed') {
    ob.embed = t.checked;
    if (t.checked && ob.probe && !ob.probe.embed.installed) { api.setSmart(true); api.setupPull(ob.probe.embed.name); }
    renderPanel(); return true;
  }
  if (t.name === 'qfTier') { document.querySelectorAll('.tp').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked)); return true; }
  return false;
}

// ---- 新手任務清單（任務板最上面） ----
function tutorialHtml(v) {
  const t = v.tutorial;
  if (!t) return '';
  if (t.finished) return `<div class="tut done"><div class="tut-head">🎓 新手村畢業 ✔<span class="spacer"></span><button class="btn small ghost" data-tut-hide>收起</button></div></div>`;
  const next = t.items.find((i) => !i.done);
  return `<div class="tut"><div class="tut-head">🎓 新手任務 <b>${t.count}/${t.total}</b><small>每個 +10 XP、${COIN}+5，全部完成再 +50</small><button class="icon-btn" data-tut-hide title="不需要了，收起來">✕</button></div>
    ${next ? `<div class="tut-next">▶ 下一個：<b>${esc(next.label)}</b>　<small>${esc(next.hint)}</small></div>` : ''}
    <div class="tut-list">${t.items.map((i) => `<span class="tut-i ${i.done ? 'done' : ''}" title="${esc(i.label)}：${esc(i.hint)}">${i.done ? '✔' : i.icon} ${esc(i.label)}</span>`).join('')}</div></div>`;
}

// ---- 🩺 健康檢查 ----
function openHealth() { state.health = { items: null, loading: true }; openPanel('health'); healthRun(); }
async function healthRun() {
  if (!state.health) state.health = {};
  state.health.loading = true;
  if (state.panel === 'health') renderPanel();
  const r = await api.healthCheck();
  state.health = { items: r && r.ok ? r.items : [], loading: false, error: r && !r.ok ? r.error : null };
  if (r && r.view) applyView(r.view);
  if (state.panel === 'health') renderPanel();
}
const HL_ICON = { ok: '🟢', warn: '🟡', error: '🔴', info: '⚪' };
function renderHealth(el) {
  const h = state.health || {};
  let body = '';
  if (h.loading && !h.items) body = say('等一下，正在檢查……');
  else {
    const rank = { error: 0, warn: 1, info: 2, ok: 3 };
    const items = [...(h.items || [])].sort((a, b) => rank[a.status] - rank[b.status]); // 有問題的排前面
    const bad = items.filter((i) => i.status === 'error' || i.status === 'warn').length;
    body = say(bad ? `有 ${bad} 個地方要注意，按旁邊的按鈕${esc(npcName())}幫你處理：` : '全部正常！櫃台運作得很順利～')
      + items.map((i) => {
        const pullAct = i.fixes.find((f) => f.action.startsWith('pull:'));
        const pull = pullAct && (state.pulls || {})[pullAct.action.slice(5)];
        const fixes = pull && !pull.done ? pullHtml(pullAct.action.slice(5), '') : i.fixes.map((f) => `<button class="btn small ${i.status === 'error' || i.status === 'warn' ? 'gold' : 'ghost'}" data-fix="${esc(f.action)}">${esc(f.label)}</button>`).join('');
        return `<div class="hl-item ${i.status}"><span class="hl-st">${HL_ICON[i.status] || '⚪'}</span><div class="hl-main"><b>${i.icon} ${esc(i.title)}</b><small>${esc(i.detail)}</small>${fixes ? `<div class="ob-btns">${fixes}</div>` : ''}</div></div>`;
      }).join('');
  }
  el.innerHTML = head('🩺 健康檢查', h.loading ? '檢查中…' : '') + `<div class="panel-body hl-body">${body}</div><div class="panel-foot"><span class="spacer">還是怪怪的？把「你的資料」資料夾裡的 data/llm.log 傳給幫你裝的人</span><button class="btn" data-hl-again>🔄 再檢查一次</button></div>`;
}
async function healthClick(e) {
  const t = e.target;
  if (t.closest('[data-close]')) { closePanel(); return true; }
  if (t.closest('[data-hl-again]')) { healthRun(); return true; }
  const cp = t.closest('[data-ob-cancel]'); if (cp) { await api.setupCancelPull(cp.dataset.obCancel); return true; }
  const fx = t.closest('[data-fix]');
  if (!fx) return false;
  const a = fx.dataset.fix;
  if (a === 'ui:newPlan') { state.ob = null; const ob = obState(); ob.step = 'plan'; openPanel('onboard'); return true; }
  if (a === 'ui:newQuest') { openForm('questForm', null); return true; }
  const r = await api.healthFix(a);
  if (r && r.view) applyView(r.view);
  if (r && !r.ok) toast(`⚠ ${r.error}`, 4000);
  else if (r && r.reason) toast(r.reason, 4000);
  if (!a.startsWith('pull:')) setTimeout(healthRun, 900);
  return true;
}

// ---- 下載進度（新手引導與健康檢查共用） ----
api.on('setup:progress', (p) => {
  state.pulls = state.pulls || {};
  state.pulls[p.model] = p;
  if (p.done) {
    if (p.status === 'success') toast(`✔ ${p.model} 下載完成`, 3500);
    else if (p.error && p.error !== '已取消') toast(`⚠ ${p.model} 下載失敗：${p.error}`, 5000);
    if (state.ob && state.ob.probe) { const c = state.ob.probe.choices.find((x) => x.name === p.model); if (c && p.status === 'success') c.installed = true; if (state.ob.probe.embed && state.ob.probe.embed.name === p.model && p.status === 'success') state.ob.probe.embed.installed = true; }
    if (state.panel === 'health') setTimeout(healthRun, 600);
  }
  const now = Date.now();
  // 進度不用每一筆都重畫（每秒好幾十筆），最多 4 次／秒；完成時一定重畫
  if (!p.done && state.pullPaint && now - state.pullPaint < 250) return;
  state.pullPaint = now;
  if (state.panel === 'onboard' && state.ob && ['ai', 'done'].includes(state.ob.step)) renderPanel();
  if (state.panel === 'health') renderPanel();
});
