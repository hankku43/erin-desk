// npm test：解析與回寫的基本檢查
process.env.TZ = process.env.TZ || 'Asia/Taipei'; // 日期相關測試以台北時間為準
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parsePlan, setObjective, setProgress } = require('../src/main/planParser');
const G = require('../src/main/game');

// 用固定的範例檔測試，不用 plans/ 裡那份（那份會被使用者改）
const md = fs.readFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), 'utf8');
const p = parsePlan(md);
assert.strictEqual(p.quests.length, 6);
assert.strictEqual(p.quests[0].type, '必達');
assert.strictEqual(p.quests[0].deadline, `${p.year}-09-29`);
assert.strictEqual(p.days.length, 4);
assert.strictEqual(p.days[0].rows.length, 5);
assert.strictEqual(p.decisions.length, 2);
const md2 = setProgress(setObjective(md, p.quests[1].id, 1, true, new Date(`${p.year}-09-30T10:00:00`)), `${p.year}-09-30`, { done: 'A|B', blocker: '', next: 'C' });
const p2 = parsePlan(md2);
assert.ok(p2.quests[1].objectives[1].done);
assert.ok(/- \[x\] 試吃紀錄與待辦已送出 ✅ \d{4}-\d{2}-\d{2}/.test(md2), '勾選要加上 ✅ 完成日');
assert.strictEqual(p2.progressLog.find((r) => r.date === `${p.year}-09-30`).done, 'A／B');
assert.strictEqual(p2.quests.length, p.quests.length);
assert.strictEqual(p2.days.length, p.days.length);

// 寬鬆格式：單行任務、分組、Obsidian 記號、時段、提醒、新增
const loose = parsePlan(`# 週計畫 10/5–10/9\n\n## 新品上架 ⭐ 📅 10/6\n> 理由\n- [ ] a\n- [ ] b\n\n- [ ] 單獨任務 🔽\n- [ ] 整理筆記 📅 2026-10-09 ⏫\n  - [ ] 子項一\n  - [x] 子項二 ✅ 2026-10-05\n\n## Tasks\n- [ ] c\n\n## 週二 10/6｜主題\n- 09:00–10:30 上課 → 標示\n- [x] 13:30-15:00 讀菜單\n- ⏰ 17:00 沒回覆 → 追一次\n\n⏰ 10/9 12:00 資料未到 → 移到下週\n`);
assert.deepStrictEqual(loose.quests.map((q) => [q.title, q.tier, q.objectives.length, q.deadline]), [
  ['新品上架', 'main', 2, '2026-10-06'], ['單獨任務', 'side', 1, '2026-10-09'], ['整理筆記', 'main', 2, '2026-10-09'], ['c', 'major', 1, '2026-10-09'],
]);
assert.strictEqual(loose.quests[0].reason, '理由');
assert.ok(loose.quests[2].objectives[1].done);
assert.deepStrictEqual(loose.days.map((d) => [d.date, d.theme, d.rows.length]), [['2026-10-06', '主題', 2]]);
assert.strictEqual(loose.days[0].rows[1].done, true);
assert.deepStrictEqual(loose.decisions.map((d) => d.at), ['2026-10-06T17:00:00', '2026-10-09T12:00:00']);
const { addQuest, addScheduleRow, addReminder } = require('../src/main/planParser');
let grown = addQuest('# 週計畫\n', { title: '新任務', tier: 'side', deadlineLabel: '10/8', objectives: ['x', 'y'], note: 'n' });
grown = addScheduleRow(grown, '2026-10-08', { start: '14:00', end: '15:00', text: '開會' });
grown = addReminder(grown, { at: '2026-10-08T16:30:00', text: '確認', action: '改線上' });
grown = setProgress(grown, '2026-10-08', { done: '完成了' });
const gp = parsePlan(grown);
assert.deepStrictEqual([gp.quests.length, gp.quests[0].tier, gp.quests[0].objectives.length, gp.days.length, gp.days[0].rows.length, gp.decisions.length, gp.progressLog.length], [1, 'side', 2, 1, 1, 1, 1]);
// 編輯／刪除／加目標／時段回寫
const PP = require('../src/main/planParser');
let ed = fs.readFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), 'utf8');
const idOf = (t) => PP.parsePlan(ed).quests.find((q) => q.title === t).id;
const beforeIds = PP.parsePlan(ed).quests.map((q) => q.id);
ed = PP.deleteQuest(ed, idOf('10/1 試吃會'));
assert.deepStrictEqual(PP.parsePlan(ed).quests.map((q) => q.id), beforeIds.filter((x) => x !== beforeIds[1]), '刪掉中間的任務，其他任務 id 不變');
ed = PP.editQuest(ed, idOf('P-12 + P-04'), { tier: 'main', deadlineLabel: '10/1', note: '改過的台詞' });
const edq = PP.parsePlan(ed).quests.find((q) => q.title === 'P-12 + P-04');
assert.deepStrictEqual([edq.tier, edq.deadlineLabel, edq.reason], ['main', '10/1', '改過的台詞']);
ed = PP.addObjective(ed, edq.id, '新目標');
assert.strictEqual(PP.parsePlan(ed).quests.find((q) => q.id === edq.id).objectives.at(-1).text, '新目標');
ed = PP.deleteObjective(ed, edq.id, 0);
assert.strictEqual(PP.parsePlan(ed).quests.find((q) => q.id === edq.id).objectives.length, 4);
const row0 = PP.parsePlan(ed).days[0].rows[0];
ed = PP.setScheduleDone(ed, row0.line, true);
assert.strictEqual(PP.parsePlan(ed).days[0].rows[0].done, true);
assert.ok(/^- \[x\] 09:00/.test(ed.split('\n')[row0.line]));

// 行事曆（.ics）：時區、重複規則、排除、覆寫、取消、Outlook 時區名、逸出字元
const ICS = require('../src/main/ics');
const cal = ICS.parseICS(fs.readFileSync(path.join(__dirname, 'fixtures', 'calendar_sample.ics'), 'utf8'));
assert.strictEqual(cal.name, '工作');
const wk = ICS.expandAll(cal.events, '2026-09-28', '2026-10-04');
assert.deepStrictEqual(wk.map((e) => [e.date, e.allDay ? '全天' : `${e.startHM}-${e.endHM}`, e.summary]), [
  ['2026-09-28', '09:30-10:00', '站會'],                       // 每週一三五；9/30 被 EXDATE 拿掉
  ['2026-10-01', '全天', '出差台中'],                           // 兩天的全天事件
  ['2026-10-01', '14:00-16:00', '專案週會'],                    // UTC 06:00 → 台北 14:00
  ['2026-10-02', '11:00-11:30', '站會（改時間）'],               // RECURRENCE-ID 覆寫掉 10/2 那次
  ['2026-10-02', '16:00-16:30', 'Outlook 匯出的會議, 逗號; 分號'], // Windows 時區名靠 VTIMEZONE；\, \; 還原
], '一週內的事件');
assert.strictEqual(wk.find((e) => e.summary === '專案週會').location, '3F 會議室');
assert.strictEqual(ICS.isoDate(wk[1].end), '2026-10-03', '全天事件的結束日不含');
const nov = ICS.expandAll(cal.events, '2026-11-01', '2026-12-31');
assert.deepStrictEqual(nov.filter((e) => e.summary.startsWith('每月')).map((e) => [e.date, e.alarmMinutes]), [['2026-11-03', 10]], 'MONTHLY BYDAY=1TU COUNT=3：9/1、10/6、11/3，12 月沒有；鬧鐘 10 分鐘');
assert.strictEqual(ICS.expandAll(cal.events, '2027-10-01', '2027-10-31').filter((e) => e.allDay).map((e) => e.summary).join(), '國慶日', 'YEARLY');
assert.ok(!ICS.expandAll(cal.events, '2026-09-01', '2026-12-31').some((e) => e.summary === '取消的會議'), 'CANCELLED 不匯入');
assert.deepStrictEqual(ICS.parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261231T155959Z').byDay.map((b) => b.wd), [2, 4]);
assert.strictEqual(ICS.parseDuration('P1DT2H30M'), (26 * 60 + 30) * 60000);
// 寫出再讀回
const icsText = ICS.buildICS([
  { uid: 'a@t', summary: '測試, 逗號; 分號', description: '第一行\n第二行', start: '2026-10-06T09:00:00', end: '2026-10-06T10:30:00', alarmMinutes: 0 },
  { uid: 'b@t', summary: '截止', allDay: true, start: '2026-10-06', end: '2026-10-07' },
], { name: '週計畫' });
assert.ok(/^SUMMARY:測試\\, 逗號\\; 分號$/m.test(icsText) && /^DTSTART:20261006T010000Z$/m.test(icsText) && icsText.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), '逸出、UTC、75 bytes 折行');
const back = ICS.expandAll(ICS.parseICS(icsText).events, '2026-10-05', '2026-10-11');
assert.deepStrictEqual(back.map((e) => [e.date, e.startHM, e.summary, e.allDay, e.alarmMinutes, e.description]), [
  ['2026-10-06', '', '截止', true, null, ''], ['2026-10-06', '09:00', '測試, 逗號; 分號', false, 0, '第一行\n第二行'],
], '匯出後讀回一致');

// 舊格式轉換
const { convert } = require('../tools/convert_plan');
const legacyMd = fs.readFileSync(path.join(__dirname, 'fixtures', 'week_legacy.md'), 'utf8');
const conv = parsePlan(convert(legacyMd));
assert.strictEqual(conv.quests.length, 6); assert.strictEqual(conv.days.length, 4); assert.strictEqual(conv.decisions.length, 2);
// 派任務：必達優先
const s = G.newState(); const ps = G.planState(s, p.title);
assert.strictEqual(G.pickNextQuest(p, ps, new Date(`${p.year}-09-29T10:00:00`)).id, p.quests[0].id);
assert.ok(/^q-[0-9a-z]{1,6}$/.test(p.quests[0].id), '任務 id 應是標題雜湊');
console.log('全部測試通過 ✔');

// 聊天改進度：關鍵字解析與驗證
const I = require('../src/main/intent');
const cat = I.buildCatalog(p, ps, { rows: [] }, new Date(`${p.year}-09-29T10:00:00`));
const lab = (msg) => I.validate(I.ruleParse(msg, cat), cat).map((x) => x.type + ':' + x.key);
assert.deepStrictEqual(lab('菜單定稿了'), ['check:q2-0']);
assert.deepStrictEqual(lab('我先做 P-12'), ['activate:q3']);
assert.deepStrictEqual(lab('交付新品標示和上架申請'), ['check:q1-0', 'check:q1-1', 'check:q1-2', 'submit:q1']);
assert.deepStrictEqual(I.validate([{ type: 'check', target: 'q9-9' }, { type: 'bogus' }], cat), []);
console.log('聊天改進度測試通過 ✔');

// 多顯示器：用假的 screen 測試
const DM = require('../src/main/displays');
const D1 = { id: 1, label: 'A', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, size: { width: 1920, height: 1080 } };
const D2 = { id: 2, label: 'B', bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, workArea: { x: 1920, y: 0, width: 2560, height: 1400 }, size: { width: 2560, height: 1440 } };
let winBounds = null;
const fakeScreen = {
  getAllDisplays: () => [D1, D2], getPrimaryDisplay: () => D1,
  getDisplayMatching: (r) => (DM.centerIn(r, D2) ? D2 : D1),
  getDisplayNearestPoint: (p) => (p.x >= 1920 ? D2 : D1),
};
const st = { ui: { mini: false } };
const mk = () => DM.create({ screen: fakeScreen, state: st, sizes: { WIN_W: 610, WIN_H: 800, MINI_SIZE: 140 }, isMini: () => st.ui.mini, win: () => (winBounds ? { isDestroyed: () => false, getBounds: () => winBounds } : null) });
// 視窗在副螢幕 → 縮小後落在副螢幕右下角
winBounds = { x: 2600, y: 300, width: 610, height: 800 };
let m = mk(); let d = m.targetDisplay();
assert.strictEqual(d.id, 2);
assert.deepStrictEqual(m.boundsOn(d, 'mini'), { x: 1920 + 2560 - 146, y: 1400 - 146, width: 140, height: 140 });
// 固定在主螢幕 → 不管視窗在哪都回主螢幕
st.ui.display = { id: 1, sig: DM.dispSig(D1) };
assert.strictEqual(mk().targetDisplay().id, 1);
// 固定的螢幕拔掉（id、sig 都找不到）→ 退回視窗所在
st.ui.display = { id: 9, sig: 'x' };
assert.strictEqual(mk().targetDisplay().id, 2);
// 每台各自記位置
st.ui.display = 'auto';
st.positions = { [DM.dispSig(D2)]: { mini: { x: 3000, y: 500 } } };
assert.deepStrictEqual(mk().boundsOn(D2, 'mini'), { x: 3000, y: 500, width: 140, height: 140 });
assert.strictEqual(mk().boundsOn(D1, 'mini').x, 1920 - 146);
console.log('多顯示器測試通過 ✔');

// 角色設定檢索
const { Lore } = require('../src/main/lore');
const L = new Lore({ file: path.join(__dirname, '..', 'lore', '艾琳.md'), dataDir: '/tmp', llm: {}, embeddings: 'off' });
assert.ok(L.entries.length >= 25, '設定條目太少');
assert.ok(L.core.length > 100 && L.core.length < 400, '角色核心長度要在 100～400 字');
for (const e of L.entries) assert.ok(e.keywords.length >= 3 && e.reply, `「${e.title}」缺關鍵字或台詞`);
(async () => {
  const expect = { '你幾歲': '年齡與生日', '你老家在哪': '故鄉：霜月村', 'Python 是什麼': '對現代事物的理解', '我好累': '累了、想休息', '推薦午餐': '喜歡的食物', '你的老闆是誰': '梟長（公會長）' };
  for (const [q, title] of Object.entries(expect)) {
    const h = await L.retrieve(q, 3);
    assert.ok(h.length && h[0].entry.title === title && h[0].strong, `「${q}」應該命中「${title}」，實際：${h.map((x) => x.entry.title).join('/') || '無'}`);
  }
  assert.deepStrictEqual(await L.retrieve('菜單定稿了，標示也補完了', 3), [], '工作進度句不該命中角色設定');
  // 擴充的設定（2026-10）：問得到、私密的要夠熟才找得到、工作句不會被新條目搶走
  const more = { '巴特爺爺是誰': '公會的同事們', '你喜歡喝咖啡嗎': '咖啡與茶', '我好孤單': '寂寞與心情低落', '我一直拖延': '專注與拖延', '你穿的是制服嗎': '制服與打扮', '你房間長怎樣': '艾琳的房間', '你看過流星嗎': '星空', '有個好消息': '好消息與慶祝' };
  for (const [q, title] of Object.entries(more)) {
    const h = await L.retrieve(q, 3, { stage: 5 });
    assert.ok(h.length && h[0].entry.title === title && h[0].strong, `「${q}」應該命中「${title}」，實際：${h.map((x) => x.entry.title).join('/') || '無'}`);
  }
  for (const [q, title] of [['梟長以前是做什麼的', '梟長的過去'], ['你也會累嗎', '艾琳的煩惱'], ['星圖上哪一顆是我', '冒險者的那顆星'], ['你小時候怕什麼', '小時候與奶奶']]) {
    assert.ok((await L.retrieve(q, 3, { stage: 5 })).some((x) => x.entry.title === title && x.strong), `夠熟：「${q}」→「${title}」`);
    assert.ok(!(await L.retrieve(q, 3, { stage: 1 })).some((x) => x.entry.title === title), `還不熟：「${q}」不該聊到「${title}」`);
  }
  const added = new Set(['公會的同事們', '晨風鎮的小店', '季節與祭典', '艾琳的房間', '艾琳的一天', '制服與打扮', '星空', '咖啡與茶', '專注與拖延', '寂寞與心情低落', '生氣與委屈', '好消息與慶祝', '小時候與奶奶', '梟長的過去', '艾琳的煩惱', '冒險者的那顆星']);
  assert.strictEqual(L.entries.filter((e) => added.has(e.title)).length, added.size, '新條目都讀得到');
  for (const q of ['報告寫完了', '今天要整理一天的資料', '我把房間的資料夾整理好了', '把衣服尺寸表更新了', '新年度預算表做好了', '專案進度 50%', '截止日延到下週', '測試通過了']) {
    const h = (await L.retrieve(q, 3, { stage: 5 })).filter((x) => x.strong && added.has(x.entry.title));
    assert.deepStrictEqual(h.map((x) => x.entry.title), [], `工作句「${q}」不該強命中新設定`);
  }
  console.log('角色設定檢索測試通過 ✔');
})();

// 引擎：程式內新增／編輯／刪除會寫進計畫檔，狀態跟著搬
(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-engine-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md', writeBack: true }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: 'off' } }));
  const year = new Date().getFullYear();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(`${year}-09-29T10:00:00`) });
  const file = () => fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  assert.ok(E.view().editable, '新格式應可編輯');
  const n0 = E.plan.quests.length;
  // 新增
  const added = await E.addQuest({ title: '週報', tier: 'side', deadlineLabel: '10/2', note: '週五寄', objectives: ['整理', '寄出'] });
  assert.ok(added.questId && added.lines.length, '新增後艾琳要有台詞');
  assert.strictEqual(E.plan.quests.length, n0 + 1);
  assert.ok(/^## 週報 🌿 📅 10\/2\n> 週五寄\n- \[ \] 整理\n- \[ \] 寄出/m.test(file()), '任務區塊寫進檔案');
  await assert.rejects(E.addQuest({ title: '週報' }), /同名/, '同名任務要擋');
  await assert.rejects(E.addQuest({ title: '  ' }), /名稱/, '空名稱要擋');
  // 勾目標拿 XP → 改名後 XP 狀態要跟著搬
  await E.setObjective(added.questId, 0, true);
  const xp = E.state.player.xp; assert.ok(xp > 0);
  const edited = await E.editQuest(added.questId, { title: '週報與計畫', tier: 'main' });
  assert.ok(edited.questId !== added.questId, '改名後 id 會變');
  assert.ok(/^## 週報與計畫 ⭐ 📅 10\/2$/m.test(file()));
  const qv = E.view().quests.find((q) => q.id === edited.questId);
  assert.strictEqual(qv.doneCount, 1, '改名後勾選狀態還在');
  await E.setObjective(edited.questId, 0, false); await E.setObjective(edited.questId, 0, true);
  assert.strictEqual(E.state.player.xp, xp, '同一個目標不重複給 XP');
  // 目標
  await E.addObjective(edited.questId, '存檔');
  assert.strictEqual(E.plan.quests.find((q) => q.id === edited.questId).objectives.length, 3);
  await E.deleteObjective(edited.questId, 2);
  assert.ok(!/- \[ \] 存檔/.test(file()));
  await assert.rejects(E.addObjective(edited.questId, ''), /內容/);
  // 時段：新增、勾選回寫、刪除
  await E.addScheduleRow(`${year}-09-29`, { start: '17:00', end: '17:30', text: '收尾', output: '筆記' });
  const row = E.plan.days.find((d) => d.date === `${year}-09-29`).rows.find((r) => r.a === '收尾');
  assert.ok(row && /^- 17:00–17:30 收尾 → 筆記$/m.test(file()));
  await E.toggleDaily(row.id, true);
  assert.ok(/^- \[x\] 17:00–17:30 收尾 → 筆記$/m.test(file()), '勾選時段寫回 - [x]');
  assert.ok(E.view().today.rows.find((r) => r.id === row.id).done);
  await assert.rejects(E.addScheduleRow('2026/9/29', { start: '9:00', text: 'x' }), /格式/);
  await E.deleteScheduleRow(row.id);
  assert.ok(!/收尾 → 筆記/.test(file()));
  // 提醒
  const rem = await E.addReminder({ at: `${year}-09-30T16:30:00`, text: '沒回覆', action: '追一次' });
  assert.ok(rem.lines.length && /^- ⏰ 16:30 沒回覆 → 追一次$/m.test(file()));
  const d = E.plan.decisions.find((x) => x.condition === '沒回覆');
  assert.ok(d && d.at === `${year}-09-30T16:30:00`);
  await E.deleteReminder(d.id);
  assert.ok(!/沒回覆/.test(file()));
  // 刪任務：狀態一起清掉
  await E.deleteQuest(edited.questId);
  assert.strictEqual(E.plan.quests.length, n0);
  assert.ok(!/週報與計畫/.test(file()) && !E.ps.submitted[edited.questId]);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'backups')) && fs.readdirSync(path.join(dir, 'data', 'backups')).length === 1, '第一次改檔前要備份一份');
  // 行事曆匯入：只取計畫那一週；有時間→時段、全天→主題；再匯一次不重複
  const icsFile = fs.readFileSync(path.join(__dirname, 'fixtures', 'calendar_sample.ics'), 'utf8');
  assert.deepStrictEqual(E.importRange(), [`${year}-09-28`, `${year}-10-04`], '範例計畫 9/28～10/2 → 那一週的週一到週日');
  const imp = await E.importICS(icsFile);
  assert.deepStrictEqual([imp.added.length, imp.themed.length, imp.skipped, imp.calendar], [4, 2, 0, '工作']);
  assert.ok(imp.lines.length && /4 格行程、2 天主題/.test(imp.label), imp.label);
  let txt = file();
  assert.ok(/^- 09:30–10:00 📯 站會$/m.test(txt), '時段寫進 9/28（行事曆裡有時間的事件＝團戰）');
  assert.ok(/^- 14:00–16:00 📯 專案週會（3F 會議室）$/m.test(txt), '地點附在後面');
  assert.ok(E.plan.days.find((d) => d.date === `${year}-09-28`).rows.some((r) => r.raid && r.a === '站會'), '匯入的是團戰、名稱不含記號');
  assert.ok(/^## 週四 10\/1｜試吃會日、出差台中$/m.test(txt) && /^## 週五 10\/2｜驗證收尾 \+ 週報、出差台中$/m.test(txt), '全天事件接在原本主題後面');
  const d1001 = E.plan.days.find((d) => d.date === `${year}-10-01`);
  assert.deepStrictEqual(d1001.rows.map((r) => r.slot), ['09:00–12:00', '13:30–14:30', '14:00–16:00', '14:30–17:00'], '照時間插進去');
  const again = await E.importICS(icsFile);
  assert.deepStrictEqual([again.added.length, again.themed.length, again.skipped], [0, 0, 6], '再匯一次全部略過');
  assert.strictEqual(file(), txt, '檔案沒變');
  delete E.ps.icsImported; // 就算忘了匯過（例如換電腦），同時間同標題也會擋
  const third = await E.importICS(icsFile);
  assert.deepStrictEqual([third.added.length, third.themed.length], [0, 0]);
  await assert.rejects(E.importICS('BEGIN:VCALENDAR\nEND:VCALENDAR\n'), /沒有行事曆事件/);
  // 匯出：時段、提醒（附鬧鐘）、有截止日的任務（全天）；讀回來數量對得上
  const ex = E.exportICS();
  const rows = E.plan.days.reduce((n, d) => n + d.rows.length, 0);
  const dues = E.plan.quests.filter((q) => q.deadline && q.deadlineLabel !== '本週內').length;
  assert.strictEqual(ex.count, rows + E.plan.decisions.length + dues);
  const exEvents = ICS.expandAll(ICS.parseICS(ex.text).events, `${year}-09-01`, `${year}-12-31`);
  assert.strictEqual(exEvents.length, ex.count);
  assert.ok(exEvents.some((e) => e.summary === '⏰ 上架申請仍無回覆' && e.alarmMinutes === 0), '提醒帶鬧鐘');
  assert.ok(exEvents.some((e) => e.allDay && /截止：新品標示/.test(e.summary) && /☐/.test(e.description)), '截止日是全天事件，目標放說明');
  assert.ok(exEvents.every((e) => /@erin-desk$/.test(e.uid)), 'UID 固定，重匯不會重複');

  // 舊格式：不能編輯
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_legacy.md'), path.join(dir, 'plan.md'));
  E.loadPlan();
  assert.ok(E.legacy && !E.view().editable);
  await assert.rejects(E.addQuest({ title: 'x' }), /舊格式/);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('引擎編輯與行事曆測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// 口吻：自稱「艾琳」、稱呼「冒險者」（「你」「我們」可以用）
(async () => {
  const { NPC, TEMPLATES, voice } = require('../src/main/npc');
  const names = { self: '艾琳', call: '冒險者' };
  const singleMe = /我(?![們])/;
  // 內建台詞、角色設定的台詞與核心
  for (const [k, arr] of Object.entries(TEMPLATES)) for (const [t] of arr) assert.ok(!singleMe.test(t) && !/玩家|您/.test(t), `內建台詞「${k}」還有「我／玩家／您」：${t}`);
  for (const e of L.entries) assert.ok(!singleMe.test(e.reply) && !/玩家/.test(e.reply), `設定「${e.title}」的台詞還有「我」：${e.reply}`);
  assert.ok(!/玩家/.test(L.core) && /自稱「艾琳」/.test(L.core));
  // 校正：自稱、稱呼、您、自我介紹、不動引號和冒險者自己寫的字
  const v = (t, protect = []) => voice(t, { ...names, protect });
  assert.strictEqual(v('我幫你記著「整理我的筆記」，玩家加油！'), '艾琳幫你記著「整理我的筆記」，冒險者加油！');
  assert.strictEqual(v('提醒設好了：提醒我打電話。時間到我會叫你', ['提醒我打電話']), '提醒設好了：提醒我打電話。時間到艾琳會叫你');
  assert.strictEqual(v('主人，歡迎回來～您今天辛苦了'), '冒險者，歡迎回來～你今天辛苦了');
  assert.strictEqual(v('冒險者大人，交給我吧！艾琳我會好好驗收'), '冒險者，交給艾琳吧！艾琳會好好驗收');
  assert.strictEqual(v('嗨～我是艾琳！我們一起加油吧'), '嗨～這裡是艾琳！我們一起加油吧');
  assert.strictEqual(v('自我介紹一下：我叫艾琳。'), '自我介紹一下：這裡是艾琳。');
  assert.strictEqual(v('胖狐狸食堂的主人今天烤了麵包'), '胖狐狸食堂的主人今天烤了麵包', '不是稱呼的「主人」不動');
  assert.strictEqual(v('`my_notes.md` 我看到了'), '`my_notes.md` 艾琳看到了');
  // 模擬 AI：系統提示有規則、狀態裡叫冒險者、回覆被校正、任務名不被改
  const npc = new NPC({ npc: { name: '艾琳', role: '接待員', callName: '冒險者', catchphrases: ['交給艾琳吧！'] }, llm: { enabled: true, baseUrl: 'http://x', model: 'm', maxChars: 90 } });
  npc.status.online = true;
  let sent = null;
  npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify({ line: '玩家，我已經把「整理我的筆記」記下來了，您放心！', emotion: 'happy' }) } }; };
  const said = await npc.say('registered', { quest: '整理我的筆記', level: 1, title: '見習', xpInLevel: 0, xpForNext: 120, goldTotal: 0, streak: 0, now: '9/30' }, { userText: '幫我登記', history: [{ role: 'assistant', content: JSON.stringify({ line: '我在喔，玩家', emotion: 'normal' }) }] });
  assert.strictEqual(said.text, '冒險者，艾琳已經把「整理我的筆記」記下來了，你放心！');
  const sys = sent.messages[0].content, usr = sent.messages.at(-1).content;
  assert.ok(/叫對方「冒險者」/.test(sys) && /自稱「艾琳」不說「我」/.test(sys), '系統提示寫明稱呼與自稱');
  assert.ok(!/玩家/.test(usr.replace(/不要叫「玩家」/, '')) && /冒險者說：「幫我登記」/.test(usr), '狀態與情境都用冒險者');
  assert.ok(/艾琳在喔，冒險者/.test(sent.messages[1].content), '舊聊天紀錄也先校正');
  const off = new NPC({ npc: { name: '艾琳', callName: '冒險者' }, llm: { enabled: false } });
  const t = off.template('reminder_set', { label: '9/30 16:30 提醒我打電話' });
  assert.ok(/艾琳/.test(t.text) && /提醒我打電話/.test(t.text) && !/我(?!打電話)/.test(t.text.replace('提醒我打電話', '')), '內建台詞：自稱艾琳，提醒內容照原樣');
  console.log('口吻測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// 🧠 聰明艾琳（向量搜尋）開關：用假的 Ollama 測狀態、快取、開關與寫回設定
(async () => {
  const os = require('os');
  const { Lore } = require('../src/main/lore');
  const { Engine } = require('../src/main/engine');
  const loreFile = path.join(__dirname, '..', 'lore', '艾琳.md');
  // 假向量：字元雜湊成 64 維，字越像向量越近
  const fakeVec = (t) => { const v = new Array(64).fill(0); for (const ch of String(t)) v[ch.codePointAt(0) % 64] += 1; const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
  let ollama = 'up', models = ['qwen3-embedding:0.6b', 'qwen3:4b'], embedCalls = 0;
  const realFetch = Lore.prototype.fetchJSON;
  Lore.prototype.fetchJSON = async function (p, body) {
    if (ollama === 'down') throw new Error('ECONNREFUSED');
    if (p === '/api/tags') return { models: models.map((name) => ({ name })) };
    if (p === '/api/embed') { embedCalls++; return { embeddings: body.input.map(fakeVec) }; }
    throw new Error('unexpected ' + p);
  };
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-smart-'));
    const mk = (embeddings) => new Lore({ file: loreFile, dataDir: dir, llm: { baseUrl: 'http://x' }, embeddings });
    // 關著：不碰 Ollama，只用關鍵字
    const off = mk(false);
    assert.strictEqual(await off.prepareEmbeddings(), 'off');
    assert.ok(!off.smartOn() && !off.vectors && /已關閉/.test(off.statusText()) && embedCalls === 0);
    // 開著：算向量、寫快取、檢索帶語意分數
    const on = mk(true);
    const [s1, s2] = await Promise.all([on.prepareEmbeddings(), on.prepareEmbeddings()]);
    assert.deepStrictEqual([s1, s2], ['ready', 'ready'], '同時呼叫兩次只算一次');
    assert.strictEqual(on.vectors.size, on.entries.length);
    assert.ok(/向量就緒（\d+ 條設定）/.test(on.statusText()));
    assert.ok(fs.existsSync(path.join(dir, 'lore_vectors.json')));
    const hits = await on.retrieve('你幾歲', 3);
    assert.ok(hits.length && hits[0].sem > 0, '開著時檢索有語意分數');
    // 第二次啟動：全部從快取拿，不重算
    const before = embedCalls;
    await mk('auto').prepareEmbeddings();
    assert.strictEqual(embedCalls, before, '快取命中不重算');
    // 關掉：馬上回到純關鍵字，檢索照常
    on.disableSmart();
    assert.ok(!on.vectors && !on.smartOn());
    const kwHits = await on.retrieve('你幾歲', 3);
    assert.ok(kwHits.length && kwHits[0].entry.title === '年齡與生日' && kwHits[0].sem === 0);
    // 沒裝模型／Ollama 沒開：狀態講清楚，檢索退回關鍵字
    models = ['qwen3:4b'];
    const nm = mk(true); assert.strictEqual(await nm.prepareEmbeddings(), 'no-model'); assert.ok(/ollama pull qwen3-embedding:0\.6b/.test(nm.statusText()));
    ollama = 'down';
    const nd = mk(true); assert.strictEqual(await nd.prepareEmbeddings(), 'no-ollama'); assert.ok(/連不到 Ollama/.test(nd.statusText()));
    assert.ok((await nd.retrieve('你老家在哪', 3))[0].entry.title === '故鄉：霜月村');
    // 引擎：setSmart 寫回 config.json，AI 對話關著也能開
    ollama = 'up'; models = ['qwen3-embedding:0.6b'];
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false }, lore: { path: loreFile, embeddings: false } }));
    const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data') });
    assert.ok(!E.view().smart.on);
    const r1 = await E.setSmart(true);
    assert.deepStrictEqual([r1.on, r1.status, E.view().smart.on], [true, 'ready', true]);
    assert.ok(/思考帽/.test(r1.lines[0].text) && /艾琳/.test(r1.lines[0].text));
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).lore.embeddings, true, '開關寫進 config.json');
    assert.ok(E.lore.vectors && E.lore.vectors.size > 0);
    const r2 = await E.setSmart(false);
    assert.deepStrictEqual([r2.on, r2.status, !!E.lore.vectors], [false, 'off', false]);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).lore.embeddings, false);
    models = [];
    const r3 = await E.setSmart(true);
    assert.strictEqual(r3.status, 'no-model'); assert.ok(/qwen3-embedding/.test(r3.lines[0].text), '沒裝模型時艾琳會說要裝什麼');
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('聰明艾琳開關測試通過 ✔');
  } finally { Lore.prototype.fetchJSON = realFetch; }
})().catch((e) => { console.error(e); process.exit(1); });

// 聊天備援：備援句子不進歷史、照抄的前綴會被拿掉、逾時不當斷線、context 長度固定、耗時紀錄
(async () => {
  const os = require('os');
  const { NPC, WHY } = require('../src/main/npc');
  const { Engine } = require('../src/main/engine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-chat-'));
  const cfg = () => ({ npc: { name: '艾琳', role: '接待員', callName: '冒險者' }, llm: { enabled: true, baseUrl: 'http://x', model: 'm', timeoutMs: 45000 } });
  const facts = { quest: '週報', due: '還有 2 天', level: 1, title: '見習', xpInLevel: 0, xpForNext: 120, goldTotal: 0, streak: 0, now: '9/30' };
  let calls = [], reply = null, fail = null;
  const mk = () => {
    const n = new NPC(cfg()); n.status.online = true; n.setLogFile(path.join(dir, 'llm.log'));
    n.fetchJSON = async (_p, body, timeout) => { calls.push({ body, timeout }); if (fail) throw fail(); return { message: { content: JSON.stringify(reply) }, load_duration: 3e9, prompt_eval_count: 900, prompt_eval_duration: 2e10, eval_count: 60, eval_duration: 8e9 }; };
    return n;
  };
  // 1. 你遇到的情況：歷史裡有一句舊的「AI 對話離線中」→ 不能送給模型
  const npc = mk();
  reply = { line: '（AI 對話離線中，先用內建臺詞）當前委託是「週報」。', emotion: 'normal' };
  const hist = [
    { role: 'user', content: '可以幫我加油嗎?' },
    { role: 'assistant', content: JSON.stringify({ line: '（AI 對話離線中，先用內建台詞）當前委託是「週報」…直接告訴我做完了什麼喔。', emotion: 'thinking' }) }, // 舊存檔沒有 source
    { role: 'user', content: '你是誰' },
    { role: 'assistant', content: JSON.stringify({ line: '這裡是艾琳！', emotion: 'happy' }), source: 'llm' },
    { role: 'user', content: '生氣' },
    { role: 'assistant', content: JSON.stringify({ line: '要幫你勾選嗎？', emotion: 'thinking' }), source: 'template' },
  ];
  const r1 = await npc.say('chat', facts, { userText: '不開心', history: hist, extraUser: '【可操作項目】' });
  const sentText = JSON.stringify(calls[0].body.messages);
  assert.ok(!/離線中|內建[台臺]詞/.test(sentText), '備援句子不能出現在送給模型的歷史裡');
  assert.ok(!/可以幫我加油嗎|"生氣"/.test(sentText.replace(/不開心/, '')), '被拿掉的那一輪，冒險者的那句也一起拿掉');
  assert.ok(/這裡是艾琳/.test(sentText) && /你是誰/.test(sentText), '正常的那一輪保留');
  assert.strictEqual(r1.text, '當前委託是「週報」。', '模型照抄的備援前綴要拿掉');
  assert.strictEqual(r1.source, 'llm');
  // 2. context 長度：聊天、閒話、暖機都一樣（不同的話 Ollama 會重載模型）；聊天的逾時比較長
  reply = { line: '嗯哼～', emotion: 'happy' };
  await npc.say('poke', facts);
  assert.deepStrictEqual(calls.map((c) => c.body.options.num_ctx), [6144, 6144], '預設 6144（4096 放不下聊天的提示）');
  assert.ok(calls[0].timeout >= 90000 && calls[1].timeout === 45000, `聊天 ${calls[0].timeout}ms、閒話 ${calls[1].timeout}ms`);
  npc.warmUp(); await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(calls.at(-1).body.options.num_ctx, 6144, '暖機也用同一個 num_ctx');
  // 3. 逾時：不當斷線；閒話 2 分鐘內用內建台詞，聊天照樣問 AI
  calls = [];
  fail = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  const r2 = await npc.say('chat', facts, { userText: '生氣' });
  assert.ok(npc.status.online && npc.status.slow, '逾時後還是連線中');
  assert.ok(r2.text.startsWith(WHY.timeout) && r2.source === 'template', r2.text);
  const before = calls.length;
  const r3 = await npc.say('poke', facts);
  assert.strictEqual(calls.length, before, '剛逾時：閒話不呼叫 AI');
  assert.ok(!/內建/.test(r3.text), '閒話的內建台詞不帶說明');
  fail = null; reply = { line: '冒險者，艾琳在這裡～', emotion: 'happy' };
  const r4 = await npc.say('chat', facts, { userText: '不開心' });
  assert.ok(r4.source === 'llm' && !npc.slowUntil, '聊天照樣問 AI，成功後恢復');
  // 4. 真的連不到：標成離線，說明是「連不到 AI」
  fail = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const r5 = await npc.say('chat', facts, { userText: '哈囉' });
  assert.ok(!npc.status.online && r5.text.startsWith(WHY.offline));
  const r6 = await new NPC({ ...cfg(), llm: { enabled: false } }).say('chat', facts, { userText: '哈囉' });
  assert.ok(r6.text.startsWith(WHY.off));
  // 5. 耗時紀錄
  const log = fs.readFileSync(path.join(dir, 'llm.log'), 'utf8').trim().split('\n');
  assert.ok(log.some((l) => /\tchat\t\d+ms\t載入模型 3000ms｜讀提示 900 tok 20000ms｜產生 60 tok 8000ms/.test(l)), log[0]);
  assert.ok(log.some((l) => /失敗：timeout/.test(l)) && log.some((l) => /失敗：fetch failed/.test(l)));
  // 6. 引擎：備援那一輪存成 source=template，下一句不會被送給模型
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: true, baseUrl: 'http://x' }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data') });
  E.npc.status.online = false;
  const c1 = await E.chat('唉唷喂'); // 隨便一句不會命中角色設定的話（「生氣」現在有設定了）
  assert.ok(c1.lines[0].text.startsWith(WHY.offline), c1.lines[0].text);
  assert.strictEqual(E.state.chat.at(-1).source, 'template');
  let sent = null;
  E.npc.status.online = true;
  E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify({ line: '冒險者，先深呼吸，艾琳陪你～', emotion: 'worried', actions: [] }) } }; };
  const c2 = await E.chat('不開心');
  assert.strictEqual(c2.lines[0].text, '冒險者，先深呼吸，艾琳陪你～');
  assert.ok(!/連不到 AI|內建台詞/.test(JSON.stringify(sent.messages.slice(1, -1))) && !sent.messages.slice(1, -1).some((m) => /唉唷喂/.test(m.content)), '上一輪備援沒有送給模型');
  assert.ok(fs.existsSync(path.join(dir, 'data', 'llm.log')), '引擎把紀錄寫在 data/llm.log');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('聊天備援測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// 對話紀錄只給「同一個當前任務、30 分鐘內」的：換任務後，舊對話的任務名不能再送給模型
(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-hist-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: true, baseUrl: 'http://x' }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  let t = new Date(`${new Date().getFullYear()}-09-30T10:00:00`).getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  const [qa, qb] = E.plan.quests;
  let sent = null;
  E.npc.status.online = true;
  E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify({ line: '嗯哼～', emotion: 'happy', actions: [] }) } }; };
  const said = () => sent.messages.slice(1, -1).map((m) => m.content).join(' ');
  await E.setActive(qa.id);
  // 舊存檔的紀錄（沒有 quest／at）一律不送
  E.state.chat = [{ role: 'user', content: '舊的問題' }, { role: 'assistant', content: JSON.stringify({ line: `你的任務是「${qb.title}」`, emotion: 'normal' }) }];
  await E.chat('第一句');
  assert.ok(!/舊的問題/.test(said()), '沒有標記的舊紀錄不送');
  t += 60000; await E.chat('第二句');
  assert.ok(/第一句/.test(said()), '同任務、剛剛的對話會送');
  // 換任務：之前的對話不再送
  await E.setActive(qb.id);
  t += 60000; await E.chat('第三句');
  assert.ok(!/第一句|第二句/.test(said()), '換了當前任務，舊任務的對話不送');
  // 超過 30 分鐘也不送
  t += 31 * 60000; await E.chat('第四句');
  assert.ok(!/第三句/.test(said()), '30 分鐘前的對話不送');
  assert.ok(/以這裡為準/.test(sent.messages.at(-1).content) && /已經過時/.test(sent.messages[0].content), '提示寫明以狀態為準');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('對話紀錄範圍測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// 🔮 今日運勢、🍅 專注模式
(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-fun-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, achievements: { enabled: false }, streak: { enabled: false }, // 舊測試算的是確切的金幣：成就、連續上工另外測
    llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  let t = new Date(`${new Date().getFullYear()}-09-30T10:00:00`).getTime();
  const mk = () => new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  let E = mk();
  // 運勢：一天一次，第一次有獎勵
  E.rand = () => 0.01; // 大吉、第一句建議、第一個幸運物
  assert.strictEqual(E.view().fortune, null);
  const xp0 = E.state.player.xp, g0 = E.state.player.gold;
  const f1 = E.drawFortune();
  assert.deepStrictEqual([f1.again, f1.fortune.rank, f1.fortune.item, E.state.player.xp - xp0, E.state.player.gold - g0], [false, '大吉', '溫奶茶', 10, 12]);
  assert.ok(/「大吉」/.test(f1.lines[0].text) && /溫奶茶/.test(f1.lines[0].text) && /12 金幣/.test(f1.lines[0].text), f1.lines[0].text);
  assert.strictEqual(E.state.history[0].reason, '今日運勢：大吉');
  const f2 = E.drawFortune();
  assert.ok(f2.again && /已經抽過/.test(f2.lines[0].text) && E.state.player.gold - g0 === 12, '同一天再抽只是再看一次');
  assert.strictEqual(E.view().fortune.rank, '大吉');
  E.rand = () => 0.99;
  t += 24 * 3600000;
  const f3 = E.drawFortune();
  assert.ok(!f3.again && f3.fortune.rank === '末吉', '隔天可以再抽；最差是末吉（沒有凶）');
  // 專注：開始 → 太早結算不算 → 時間到結算 → 獎勵與計數
  const s1 = E.startFocus();
  assert.ok(E.view().focus.active && E.view().focus.leftMin === 25 && /專注 25 分鐘/.test(s1.lines[0].text));
  assert.throws(() => E.startFocus(), /已經在專注/);
  assert.ok(/還剩 25 分鐘|還有 25 分鐘/.test(E.focusPeek().lines[0].text));
  t += 10 * 60000;
  assert.strictEqual(E.completeFocus(), null, '還沒到就不結算');
  assert.strictEqual(E.view().focus.leftMin, 15);
  // 重開程式：專注狀態還在
  E = mk();
  assert.ok(E.view().focus.active, '重開程式後還在專注');
  t += 15 * 60000;
  const xp1 = E.state.player.xp;
  const done = E.completeFocus();
  assert.ok(done && done.reward.xp === 15 && done.reward.gold === 3 && E.state.player.xp === xp1 + 15);
  assert.ok(/第 1 顆番茄/.test(done.lines[0].text), done.lines[0].text);
  assert.ok(!E.view().focus.active && E.view().focus.todayCount === 1);
  assert.ok(/完成專注 25 分鐘（今天第 1 顆🍅）/.test(E.state.history[0].reason));
  // 取消：沒有獎勵
  E.startFocus(); t += 7 * 60000;
  const xp2 = E.state.player.xp;
  const c = E.cancelFocus();
  assert.ok(!E.view().focus.active && E.state.player.xp === xp2 && /專注了 7 分鐘/.test(c.lines[0].text));
  // 設定可以改分鐘數與獎勵
  E.saveConfigPatch({ focus: { minutes: 50, xp: 30 } });
  E.startFocus(); t += 50 * 60000;
  const d2 = E.completeFocus();
  assert.ok(d2.reward.xp === 30 && /完成專注 50 分鐘（今天第 2 顆🍅）/.test(E.state.history[0].reason) && E.view().focus.todayCount === 2, E.state.history[0].reason);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('今日運勢與專注模式測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ✨ 占卜魔法：梅花易數的卦表、起卦、互變、體用；引擎的花費、一事不二占、金幣不夠、內建解讀
(async () => {
  const os = require('os');
  const MH = require('../src/main/meihua');
  const { Engine } = require('../src/main/engine');
  const { TEMPLATES } = require('../src/main/npc');
  // 64 卦：卦序各一次、卦名的上下卦和八卦的象一致
  const seen = new Set();
  for (let u = 1; u <= 8; u++) for (let l = 1; l <= 8; l++) {
    const h = MH.hexagram(u, l); seen.add(h.no);
    if (u === l) assert.ok(h.name.startsWith(h.upper.name) && h.name.includes('為'), h.name);
    else assert.ok(h.name[0] === h.upper.nature && h.name[1] === h.lower.nature, `${h.name} 應為 ${h.upper.nature}${h.lower.nature}`);
    assert.ok(h.meaning, `${h.name} 缺卦義`);
  }
  assert.strictEqual(seen.size, 64);
  assert.deepStrictEqual([MH.hexagram(1, 1).no, MH.hexagram(8, 8).no, MH.hexagram(6, 4).no, MH.hexagram(6, 3).no, MH.hexagram(3, 6).no], [1, 2, 3, 63, 64], '乾1 坤2 屯3 既濟63 未濟64');
  // 經典例子：天水訟 五爻動 → 互 風火家人、變 火水未濟；體坎水、用乾金 → 用生體
  const song = MH.cast(1, 6, 5);
  assert.deepStrictEqual([song.ben.name, song.hu.name, song.bian.name, song.ti.name, song.yong.name, song.relation, song.verdict.tag], ['天水訟', '風火家人', '火水未濟', '坎', '乾', '用生體', '大吉']);
  // 地天泰 初爻動 → 互 雷澤歸妹、變 地風升；動在下卦 → 體坤土、用乾金 → 體生用
  const tai = MH.cast(8, 1, 1);
  assert.deepStrictEqual([tai.hu.name, tai.bian.name, tai.ti.name, tai.relation], ['雷澤歸妹', '地風升', '坤', '體生用']);
  // 餘數為 0 → 算 8／算 6
  const z = MH.cast(16, 8, 12);
  assert.deepStrictEqual([z.ben.upper.name, z.ben.lower.name, z.moving], ['坤', '坤', 6]);
  assert.ok(/算 8/.test(z.formula.upper) && /算 6/.test(z.formula.moving));
  // 五行生剋
  assert.deepStrictEqual(['木火', '火木', '金木', '木金', '土土'].map(([t, o]) => MH.relation(t, o)), ['體生用', '用生體', '體剋用', '用剋體', '比和']);
  // 時辰：23:00 與 00:30 是子、11:00 是午、22:59 是亥
  assert.deepStrictEqual(['23:00', '00:30', '11:00', '22:59'].map((t) => MH.hourBranch(new Date(`2026-09-30T${t}:00`)).name), ['子', '子', '午', '亥']);
  // 報數：3、8 在午時（7）→ 上離下坤 火地晉；動爻 3+8+7=18 → 上爻
  const jin = MH.castByNumbers(3, 8, new Date('2026-09-30T11:30:00'));
  assert.deepStrictEqual([jin.ben.name, jin.moving, jin.hour.name], ['火地晉', 6, '午']);
  assert.throws(() => MH.castByNumbers(0, 5), /大於 0/);
  // 時間起卦：2026-09-30 10:30 ＝ 丙午年八月二十巳時 → 午7＋8＋20＝35 → 離；35＋6＝41 → 乾；41÷6 餘 5 → 五爻 → 火天大有
  assert.ok(MH.hasLunar(), '農曆套件已安裝');
  const t1 = MH.castByTime(new Date('2026-09-30T10:30:00'));
  assert.deepStrictEqual([t1.lunar.text, t1.ben.name, t1.moving], ['丙午年 八月二十 巳時', '火天大有', 5]);
  assert.strictEqual(MH.lunarInfo(new Date('2026-02-17T09:00:00')).text, '丙午年 正月初一 巳時', '2026 春節');
  assert.ok(/本卦：天水訟/.test(MH.describe(song, '測試')) && /用生體/.test(MH.describe(song, '測試')));
  // 內建台詞口吻
  for (const k of ['divine', 'divine_repeat', 'divine_poor']) for (const [t] of TEMPLATES[k]) assert.ok(!/我(?!們)|玩家|您/.test(t), `${k}：${t}`);

  // 引擎
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-dv-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  let t = new Date('2026-09-30T10:30:00').getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.player.gold = 25;
  assert.deepStrictEqual([E.view().divination.cost, E.view().divination.timeAvailable], [10, true]);
  assert.throws(() => E.divineCast({ question: '  ', method: 'circle', a: 1, b: 1 }), /想問的事/);
  const c1 = E.divineCast({ question: '這週的發表會會順利嗎？', method: 'circle', a: 17, b: 6 });
  assert.strictEqual(E.state.player.gold, 15, '扣 10 金幣');
  assert.deepStrictEqual([c1.record.result.ben.name, c1.record.method, E.state.history[0].reason, E.state.history[0].gold], ['天水訟', 'circle', '星環占卜：天水訟', -10]);
  const read = await E.divineRead(c1.record.id);
  assert.ok(/天水訟/.test(read.lines[0].text) && /艾琳的建議/.test(read.lines[0].text) && !/我(?!們)/.test(read.lines[0].text), read.lines[0].text);
  assert.strictEqual((await E.divineRead(c1.record.id)).lines[0].text, read.lines[0].text, '再看一次用同一段解讀');
  // 一事不二占：換個說法、24 小時內 → 不扣錢，給上次的結果
  for (const q of ['請問這週發表會會順利嗎', '這週的發表會會順利嗎']) {
    const rp = E.divineCast({ question: q, method: 'numbers', a: 3, b: 4 });
    assert.ok(rp.repeat && rp.record.id === c1.record.id && /一事不二占/.test(rp.lines[0].text), q);
  }
  assert.ok(E.divineCheck('這週的發表會會順利嗎').repeat && !E.divineCheck('下週的旅行').repeat);
  assert.strictEqual(E.state.player.gold, 15, '重複問不扣錢');
  // 不同的事可以問；時間起卦
  const c2 = E.divineCast({ question: '下週的旅行好不好', method: 'time' });
  assert.deepStrictEqual([c2.record.result.ben.name, E.state.player.gold], ['火天大有', 5]);
  // 金幣不夠：不扣錢、不起卦
  const poor = E.divineCast({ question: '午餐要吃什麼', method: 'numbers', a: 1, b: 2 });
  assert.ok(poor.poor && /星粉不夠/.test(poor.lines[0].text) && E.state.player.gold === 5 && E.state.divinations.length === 2);
  assert.ok(E.divineCheck('午餐要吃什麼').poor);
  // 24 小時後同一件事可以再問
  t += 25 * 3600000; E.state.player.gold = 30;
  assert.ok(!E.divineCast({ question: '這週的發表會會順利嗎？', method: 'numbers', a: 5, b: 5 }).repeat, '過了 24 小時可以再問');
  // 設定可以改價錢
  E.saveConfigPatch({ divination: { cost: 3 } });
  E.divineCast({ question: '新的問題', method: 'numbers', a: 2, b: 2 });
  assert.strictEqual(E.state.player.gold, 17, '改成 3 金幣');
  // 最近的占卜
  assert.deepStrictEqual(E.view().divination.recent.map((r) => r.question).slice(0, 2), ['新的問題', '這週的發表會會順利嗎？']);
  // 過程與結果同一卦時，內建解讀只講一次
  const same = E.divineCast({ question: '會不會下雨', method: 'numbers', a: 2, b: 9 }); // 午時 → 澤天夬，互、變都是乾為天
  const sameRead = await E.divineRead(same.record.id);
  assert.ok(/過程和結果都是「乾為天」/.test(sameRead.lines[0].text), sameRead.lines[0].text);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('占卜魔法測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 表情：害羞、鄙視 ----------
(async () => {
  const { NPC, EMOTIONS, TEMPLATES, normEmotion, fillEmotionImages } = require('../src/main/npc');
  assert.ok(EMOTIONS.includes('shy') && EMOTIONS.includes('disdain'));
  const loreSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'lore.js'), 'utf8');
  assert.strictEqual(loreSrc.match(/const EMOTIONS = (\[[^\]]*\])/)[1], JSON.stringify(EMOTIONS).replace(/"/g, "'").replace(/,/g, ', '), 'lore.js 的表情清單要跟 npc.js 一樣');
  // 角色設定檔裡的 shy 讀得到；disdain 只留給失禮、騷擾（設定裡不能有）
  const byTitle = Object.fromEntries(L.entries.map((e) => [e.title, e.emotion]));
  assert.strictEqual(byTitle['稱讚與感謝'], 'shy');
  assert.ok(!L.entries.some((e) => e.emotion === 'disdain'), '角色設定不能標 disdain');
  // 內建台詞只用存在的表情，而且新表情真的有被用到
  const used = new Set();
  for (const arr of Object.values(TEMPLATES)) for (const [, emo] of arr) { assert.ok(EMOTIONS.includes(emo), `不存在的表情：${emo}`); used.add(emo); }
  assert.ok(used.has('shy') && used.has('disdain'));
  // 模型自己發明的名稱收斂回來
  assert.strictEqual(normEmotion('Embarrassed'), 'shy');
  assert.strictEqual(normEmotion('contempt'), 'disdain');
  assert.strictEqual(normEmotion('disdain'), 'disdain');
  assert.strictEqual(normEmotion('dancing'), 'normal');
  assert.strictEqual(normEmotion(undefined), 'normal');
  // 還沒有圖的表情：害羞借 happy、鄙視借 thinking，都沒有就用 normal
  const f1 = fillEmotionImages({ normal: 'n.png', happy: 'h.png', thinking: 't.png' });
  assert.deepStrictEqual([f1.shy, f1.disdain, f1.cheer, f1.worried], ['h.png', 't.png', 'n.png', 'n.png']);
  const f2 = fillEmotionImages({ normal: 'n.png', happy: 'h.png', thinking: 't.png', shy: 's.png', disdain: 'd.png' });
  assert.deepStrictEqual([f2.shy, f2.disdain], ['s.png', 'd.png'], '有自己的圖就用自己的');
  assert.strictEqual(fillEmotionImages({ normal: 'n.png' }).disdain, 'n.png');
  assert.strictEqual(fillEmotionImages({ happy: 'h.png' }).disdain, 'h.png', '連 normal 都沒有時用任何一張');
  // 系統提示與 JSON schema 都有新表情；模型回 blush 會變成 shy
  const npc = new NPC({ npc: { name: '艾琳', role: '接待員', callName: '冒險者' }, llm: { enabled: true, baseUrl: 'http://x', model: 'm', maxChars: 90 } });
  npc.status.online = true;
  let sent = null;
  npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify({ line: '欸？！艾、艾琳才沒有害羞……', emotion: 'blush' }) } }; };
  const said = await npc.say('chat', { level: 1, title: '見習', xpInLevel: 0, xpForNext: 120, goldTotal: 0, streak: 0, now: '9/30' }, { userText: '艾琳今天好可愛' });
  assert.strictEqual(said.emotion, 'shy');
  assert.ok(/shy＝.*disdain＝/.test(sent.messages[0].content), '系統提示說明新表情');
  assert.ok(!sent.format.properties.emotion.enum.includes('disdain'), '沒有要判斷態度：schema 不給 disdain（10/14）');
  await npc.say('chat', { level: 1, title: '見習', xpInLevel: 0, xpForNext: 120, goldTotal: 0, streak: 0, now: '9/30' }, { userText: '你好吵', extraProps: { attitude: { type: 'string' } } });
  assert.ok(sent.format.properties.emotion.enum.includes('disdain') && sent.format.required.join() === 'line,emotion', '要判斷態度時才有 disdain；只強制 line、emotion');
  console.log('表情測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 模型照抄格式說明（戳一下回「臺詞」） ----------
(async () => {
  const { NPC, TEMPLATES } = require('../src/main/npc');
  const npc = new NPC({ npc: { name: '艾琳', role: '接待員', callName: '冒險者' }, llm: { enabled: true, baseUrl: 'http://x', model: 'm', maxChars: 90 } });
  npc.status.online = true;
  let reply = null;
  npc.fetchJSON = async () => ({ message: { content: JSON.stringify(reply) } });
  const facts = { level: 1, title: '見習', xpInLevel: 0, xpForNext: 120, goldTotal: 0, streak: 0, now: '9/30', pokeCount: 1 };
  assert.ok(!/台詞/.test(npc.systemPrompt()), '系統提示完全不提「台詞」這個字');
  const pokeTexts = TEMPLATES.poke.map(([t]) => t.replace(/\{self\}/g, '艾琳').replace(/\{call\}/g, '冒險者'));
  for (const bad of ['台詞', '臺詞', '台词', '「台詞」', '…']) {
    reply = { line: bad, emotion: 'shy' };
    const r = await npc.say('poke', facts);
    assert.strictEqual(r.source, 'template', `「${bad}」要改用內建台詞`);
    assert.ok(pokeTexts.includes(r.text), `換成戳一下的內建台詞：${r.text}`);
    assert.ok(npc.status.online && /照抄了格式說明/.test(npc.status.message), '狀態仍是連線，並寫明原因：' + npc.status.message);
  }
  reply = { line: '尾巴又被抓到了……好啦，輕輕的可以。', emotion: 'shy' };
  const ok = await npc.say('poke', facts);
  assert.strictEqual(ok.source, 'llm'); assert.strictEqual(ok.emotion, 'shy');
  assert.ok(/AI：m$/.test(npc.status.message), '下一句正常就恢復');
  console.log('格式說明照抄測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 好好的害羞：先擲骰決定情緒、台詞裡的害羞描寫、重複句、代號 ----------
(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const { refineEmotion, dropRepeats, MOODS } = require('../src/main/npc');
  const I = require('../src/main/intent');
  // 台詞在害羞，表情卻是笑的 → 修正；模型自己選了別的表情就不動；鄙視不靠台詞推測（只在失禮時出現）
  assert.strictEqual(refineEmotion('艾、艾琳才沒有害羞！', 'happy'), 'shy');
  assert.strictEqual(refineEmotion('（突然低下頭）……謝謝你。', 'happy'), 'shy');
  assert.strictEqual(refineEmotion('黃瓜？艾琳冷冷地看著它。', 'normal'), 'normal');
  assert.strictEqual(refineEmotion('嗯哼～今天也一起加油吧！', 'happy'), 'happy');
  assert.strictEqual(refineEmotion('艾、艾琳嚇到了！', 'surprised'), 'surprised');
  // 其他表情也跟著台詞走：驚訝、擔心、思考、歡呼；看不出來時用事件本身的表情
  assert.strictEqual(refineEmotion('欸？！真的假的', 'happy'), 'surprised');
  assert.strictEqual(refineEmotion('別太累了喔，先休息一下。', 'happy'), 'worried');
  assert.strictEqual(refineEmotion('嗯……讓艾琳想想。', 'happy'), 'thinking');
  assert.strictEqual(refineEmotion('太棒了！恭喜交付！', 'happy'), 'cheer');
  assert.strictEqual(refineEmotion('好的，艾琳記下了。', 'normal', 'overdue'), 'worried');
  assert.strictEqual(refineEmotion('今天也辛苦了。', 'happy', 'levelup'), 'cheer');
  assert.strictEqual(refineEmotion('今天也辛苦了。', 'happy', 'greet'), 'happy', '一般事件維持模型的選擇');
  assert.ok(/不要每句都用 happy/.test(new (require('../src/main/npc').NPC)({ npc: { name: '艾琳' }, llm: {} }).systemPrompt()), '系統提示說明每種表情');
  // 重複前幾句的句子會被拿掉；整句都重複時保留並標記
  const prev = ['喵～艾琳的尾巴現在在搖晃，但更開心的是能和你分享奶茶的時光！'];
  assert.deepStrictEqual(dropRepeats('喵～艾琳的尾巴突然停在半空，但更開心的是能和你分享奶茶的時光！今天想聊什麼呢？', prev), { text: '今天想聊什麼呢？', removed: 1 });
  assert.ok(dropRepeats('喵～艾琳的尾巴突然跳起來，但更開心的是能和你分享奶茶的時光！', prev).allRepeated);
  assert.deepStrictEqual(dropRepeats('完全不一樣的一句話。', prev), { text: '完全不一樣的一句話。', removed: 0 });
  // 代號換回名字
  const cat0 = { objectives: [{ key: 'q2-0', text: '菜單定稿，店長回饋已處理' }], quests: [{ key: 'q2', title: '10/1 試吃會' }], daily: [{ key: 'd1', label: '補完最後三項標示' }] };
  assert.strictEqual(I.decodeKeys('先幫你完成 q2-0 吧？', cat0), '先幫你完成「菜單定稿，店長回饋已處理」吧？');
  assert.strictEqual(I.decodeKeys('「q2」和d1都記著', cat0), '「10/1 試吃會」和「補完最後三項標示」都記著');
  assert.strictEqual(I.decodeKeys('q9-9 不存在就不動', cat0), 'q9-9 不存在就不動');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-shy-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: true, baseUrl: 'http://x' }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  let t = new Date(`${new Date().getFullYear()}-09-30T10:00:00`).getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  await E.setActive(E.plan.quests[1].id);
  let sent = null, reply = null;
  E.npc.status.online = true;
  E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify(reply) } }; };
  const sys = () => sent.messages[0].content;
  assert.strictEqual(E.emotionChance(), 0.2, '好感第 1 階：害羞機率 0.2');
  // 骰到了：請模型害羞、表情固定 shy、這句不要提任務
  E.rand = () => 0.1;
  reply = { line: '欸？！艾琳才、才不是……尾巴自己在動啦。', emotion: 'shy', actions: [] };
  let r = await E.chat('艾琳你好可愛');
  assert.ok(/這次的情緒：害羞/.test(sys()) && /不要提任務/.test(sys()), '系統提示有害羞的說話指示');
  assert.deepStrictEqual(sent.format.properties.emotion.enum, ['shy'], '表情只能選 shy');
  assert.strictEqual(r.lines[0].emotion, 'shy');
  assert.ok(/表情可用 shy/.test(sent.messages.at(-1).content), '角色設定參考帶著設定的表情');
  // 沒骰到：交給模型；模型選 happy、台詞沒有害羞描寫 → 維持 happy
  E.rand = () => 0.9; t += 60000;
  reply = { line: '嗯哼～謝謝誇獎，今天也一起加油吧！', emotion: 'happy', actions: [] };
  r = await E.chat('你喜歡的人是誰');
  assert.ok(!/這次的情緒/.test(sys()) && sent.format.properties.emotion.enum.length === 7, '沒骰到就不加指示（沒有要判斷態度：鄙視不能選）');
  assert.strictEqual(r.lines[0].emotion, 'happy');
  // 沒骰到但台詞在害羞 → 表情跟著台詞
  t += 60000; reply = { line: '（突然害羞地低頭）唔……這種事要保密啦。', emotion: 'happy', actions: [] };
  r = await E.chat('告訴我一個秘密');
  assert.strictEqual(r.lines[0].emotion, 'shy');
  // 回報進度時不套用害羞（要好好確認）
  E.rand = () => 0; t += 60000;
  reply = { line: '要幫你勾起來嗎？', emotion: 'thinking', actions: [{ type: 'check', target: 'q2-0' }] };
  await E.chat('謝謝，菜單定稿了');
  assert.ok(!/這次的情緒/.test(sys()), '同時在回報進度時不害羞');
  // 設定成 0：永遠交給 AI；設定成 1：每次都害羞
  E.saveConfigPatch({ lore: { emotionChance: 0 } }); E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify(reply) } }; }; E.npc.status.online = true;
  t += 60000; reply = { line: '嗯哼～', emotion: 'happy', actions: [] };
  await E.chat('你好可愛'); assert.ok(!/這次的情緒/.test(sys()), 'emotionChance 0');
  // 台詞裡的代號換成名字
  t += 60000; reply = { line: '先幫艾琳完成 q2-0 吧？', emotion: 'happy', actions: [] };
  r = await E.chat('今天天氣如何');
  assert.ok(/「菜單定稿，店長回饋已處理」/.test(r.lines[0].text) && !/q2-0/.test(r.lines[0].text), r.lines[0].text);
  // 整句都在重複前面的話 → 改用這個話題預寫的台詞
  t += 60000; reply = { line: '喵～艾琳的尾巴現在在搖晃，但更開心的是能和你分享奶茶的時光！', emotion: 'happy', actions: [] };
  await E.chat('你有喜歡的人嗎');
  t += 60000; reply = { line: '喵～艾琳的尾巴突然跳起來，但更開心的是能和你分享奶茶的時光！', emotion: 'happy', actions: [] };
  r = await E.chat('你有喜歡的人嗎');
  const loveReply = E.lore.entries.find((e) => e.title === '感情、戀愛').reply;
  assert.strictEqual(r.lines[0].text, loveReply, '重複時改用預寫台詞：' + r.lines[0].text);
  assert.strictEqual(r.lines[0].emotion, 'shy');
  assert.ok(sent.messages.filter((m) => m.role !== 'system').length <= 5, '最多帶 4 句舊對話');
  // 戳一下：骰到就害羞，戳太多下骰到就鄙視（預設戳一下用內建台詞；這裡先測問 AI 的時候）
  E.saveConfigPatch({ lore: { emotionChance: 0.5 } }); E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify(reply) } }; }; E.npc.status.online = true;
  E.rand = () => 0.05; E.pokeTimes = []; sent = null;
  r = await E.poke(); assert.ok(r.lines[0].emotion === 'shy' && r.lines[0].source === 'template' && !sent, '預設：戳一下馬上用內建台詞，骰到害羞就挑害羞的句子');
  E.config.llm.quickLines = false; E.pokeTimes = [];
  reply = { line: '尾、尾巴不可以抓啦……', emotion: 'shy' };
  r = await E.poke(); assert.strictEqual(r.lines[0].emotion, 'shy'); assert.ok(/這次的情緒：害羞/.test(sys()));
  await E.poke();
  reply = { line: '……冒險者，你是不是很閒？', emotion: 'disdain' };
  r = await E.poke(); assert.strictEqual(r.lines[0].emotion, 'disdain'); assert.ok(/這次的情緒：鄙視/.test(sys()));
  // AI 關著時，骰到害羞就挑害羞的內建台詞
  E.config.llm.quickLines = true; E.npc.status.online = false; E.pokeTimes = [];
  for (let i = 0; i < 5; i++) { E.pokeTimes = []; r = await E.poke(); assert.strictEqual(r.lines[0].emotion, 'shy', '離線也挑害羞的句子：' + r.lines[0].text); }
  assert.ok(MOODS.shy('冒險者', '艾琳').includes('艾、艾琳'));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('害羞與重複測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 💗 隱藏好感度 ----------
(async () => {
  const os = require('os');
  const A = require('../src/main/affection');
  const { Engine } = require('../src/main/engine');
  // 判斷：要針對艾琳才算；抱怨工作、台灣口語、說自己很痛苦都不算
  const cls = { '你是白癡': 'rude', '白癡': 'rude', '給我去死': 'rude', '你很煩': 'rude', '你媽的': 'rude', '滾': 'rude',
    '這個bug白癡': null, '你看這垃圾code': null, '幹得好': null, '靠北這個bug又來了': null, '這專案煩死了': null, '他媽的這個bug': null, '笨蛋': null,
    '給我看你的胸部': 'harass', '你的屁股好翹': 'harass', '今晚陪我睡': 'harass', '胸部X光的報告寫好了': null, '我摸摸你的頭': null,
    '對不起啦': 'apology', '不好意思，請問一下': null, '謝謝艾琳': 'kind', '我好想去死': 'care', '累死我了': null };
  for (const [t, k] of Object.entries(cls)) assert.strictEqual(A.classify(t), k, `「${t}」應該是 ${k}`);
  assert.strictEqual(A.classify('你這個爛東西', { rude: ['爛東西'] }), 'rude', '自己加的關鍵字');
  const t0 = Date.now();
  assert.strictEqual(A.spamCheck('asdfgh', [], t0), 'mash');
  assert.strictEqual(A.spamCheck('jjjjjjj', [], t0), 'repeat');
  assert.strictEqual(A.spamCheck('哈哈哈哈哈哈', [], t0), null, '笑聲不算洗版');
  assert.strictEqual(A.spamCheck('你好', [{ text: '你好', at: t0 - 1000 }], t0), null, '重複一次還不算');
  assert.strictEqual(A.spamCheck('你好', [{ text: '你好', at: t0 - 1000 }, { text: '你好！', at: t0 - 2000 }], t0), 'same', '同一句第三次');
  assert.strictEqual(A.spamCheck('新的一句', Array.from({ length: 6 }, (_, i) => ({ text: `第${i}句`, at: t0 - i * 5000 })), t0), 'flood');
  assert.deepStrictEqual([0, 29, 30, 80, 160, 280, 999].map((p) => A.stageOf(p)), [1, 1, 2, 3, 4, 5, 5]);
  assert.strictEqual(A.stageOf(27, 2), 2, '差一點點不降');
  assert.strictEqual(A.stageOf(24, 2), 1);
  assert.strictEqual(A.guardAttitude('rude', '這專案爛透了'), 'rude', '短句、沒有工作內容 → 採信');
  assert.strictEqual(A.guardAttitude('rude', '幫我把那個模型跑完然後整理一下結果給我看看好嗎這樣可以嗎'), 'ok', '長句又沒有針對艾琳 → 不採信');
  assert.strictEqual(A.guardAttitude('rude', '你真的很爛欸', { hasWork: true }), 'ok', '同一句在回報進度 → 不扣');
  assert.strictEqual(A.guardAttitude('harass', '我好想死'), 'ok');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-aff-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: true, baseUrl: 'http://x' }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  let t = new Date(`${new Date().getFullYear()}-09-30T10:00:00`).getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  let sent = null, reply = { line: '嗯哼～', emotion: 'happy', actions: [], attitude: 'ok' }, calls = 0;
  const online = () => { E.npc.status.online = true; E.npc.fetchJSON = async (_p, body) => { calls++; sent = body; return { message: { content: JSON.stringify(reply) } }; }; };
  online();
  E.rand = () => 0.99; // 預設不擲出害羞／鄙視
  const sys = () => sent.messages[0].content;
  const a = () => E.state.affection || E.aff();
  const next = (ms = 60000) => { t += ms; };
  // 一開始：第 1 階，系統提示有關係、沒有數字
  await E.greet();
  assert.strictEqual(a().points, 1, '今天第一次見面 +1');
  assert.ok(/登記簿上的名字/.test(sys()) && !/好感\s*\d/.test(sys()), '系統提示有關係描述、沒有數字');
  assert.strictEqual(E.view().affection.cold, false);
  assert.ok(!('points' in E.view().affection), '畫面拿不到好感數字');
  next(); await E.greet(); assert.strictEqual(a().points, 1, '同一天再打招呼不加');
  // 完成目標 +1，取消再勾不會重複加
  const q = E.plan.quests[0];
  await E.setObjective(q.id, 0, true); assert.strictEqual(a().points, 2);
  await E.setObjective(q.id, 0, false); await E.setObjective(q.id, 0, true); assert.strictEqual(a().points, 2, '同一個目標只加一次');
  // 稱讚一天最多算 3 次
  for (const w of ['艾琳謝謝你', '你好可愛喔', '辛苦了艾琳', '艾琳最棒了']) { next(); await E.chat(w); }
  assert.strictEqual(a().points, 5, '稱讚最多 +3');
  // 每日上限 10
  a().gainedToday = 9; await E.dailyReport({ done: '整理了試吃菜單', blocker: '', next: '' });
  assert.strictEqual(a().points, 6, '下班回報 +2，但到上限只加到 10');
  // 失禮（關鍵字）：鄙視的臉、不處理進度；−3 再因為鄙視 −2
  a().points = 50; next();
  reply = { line: '……這樣講話，艾琳不喜歡。', emotion: 'happy', actions: [{ type: 'check', target: 'q2-0' }], attitude: 'ok' };
  let r = await E.chat('你是白癡');
  assert.ok(/這次的情緒：鄙視/.test(sys()) && sent.format.properties.emotion.enum.join() === 'disdain');
  assert.strictEqual(r.lines[0].emotion, 'disdain'); assert.strictEqual(r.proposal, null, '罵人的那句不處理進度');
  assert.strictEqual(a().points, 45, '失禮 −3、鄙視 −2');
  assert.ok(a().log.some((x) => x.reason === '失禮') && a().log.some((x) => x.reason === '露出鄙視的眼神'));
  // AI 說失禮，但只是在抱怨工作的長句 → 不扣，也不擺臉色
  next(); reply = { line: '辛苦了，先喝口奶茶吧。', emotion: 'disdain', actions: [], attitude: 'rude' };
  r = await E.chat('今天這份報告又要改第五版了真的很想把電腦丟出去');
  assert.strictEqual(a().points, 45); assert.strictEqual(r.lines[0].emotion, 'thinking');
  // 說自己很痛苦：就算 AI 誤判也不扣，而且請 AI 溫柔關心
  next(); reply = { line: '冒險者，先休息一下好嗎？', emotion: 'worried', actions: [], attitude: 'rude' };
  await E.chat('我好想去死');
  assert.strictEqual(a().points, 45); assert.ok(/溫柔地關心/.test(sys()));
  // AI 判斷的騷擾（短句）：−5、鄙視 −2
  next(); reply = { line: '……請自重。', emotion: 'normal', actions: [], attitude: 'harass' };
  r = await E.chat('今晚來我房間');
  assert.strictEqual(r.lines[0].emotion, 'disdain'); assert.strictEqual(a().points, 38);
  // 10 分鐘內第三次 → 冷戰
  next(); reply = { line: '……', emotion: 'normal', actions: [], attitude: 'ok' };
  r = await E.chat('閉嘴啦');
  assert.ok(r.lines.some((l) => /整理委託書/.test(l.text)), '冷戰開始的台詞');
  assert.ok(E.isCold() && E.view().affection.cold, '冷戰中');
  const before = a().points; calls = 0; E.pokeTimes = [];
  r = await E.poke();
  assert.strictEqual(calls, 0, '冷戰中戳她不問 AI'); assert.strictEqual(a().points, before, '也不再扣');
  assert.ok(TEMPLATESof('poke_cold').includes(r.lines[0].text));
  next(); reply = { line: '嗯。有公事就說。', emotion: 'happy', actions: [], attitude: 'ok' };
  r = await E.chat('今天天氣不錯');
  assert.ok(/冷戰中/.test(sys()) && sent.format.properties.emotion.enum.join() === 'normal', '冷戰：冷淡、表情固定 normal');
  // 道歉：+2、和好；一天只算一次
  next(); reply = { line: '……好啦，原諒你。', emotion: 'shy', actions: [], attitude: 'apology' };
  const p0 = a().points;
  await E.chat('對不起，剛剛是我不好');
  assert.ok(/【道歉】/.test(sys())); assert.strictEqual(a().points, p0 + 2); assert.ok(!E.isCold(), '和好了');
  next(); await E.chat('真的對不起'); assert.strictEqual(a().points, p0 + 2, '道歉一天只算一次');
  // 洗版：不問 AI；第三次開始扣（−1，鄙視再 −2）
  calls = 0; const p1 = a().points;
  for (const w of ['asdfgh', 'qwerty', 'zxcvbn']) { next(5000); r = await E.chat(w); }
  assert.strictEqual(calls, 0, '洗版不問 AI'); assert.strictEqual(r.lines[0].emotion, 'disdain'); assert.strictEqual(a().points, p1 - 3);
  // 連戳：第 3、4 下 −1；骰到鄙視再 −2；第 5 下 −2
  t += 3600000; a().offenses = []; a().coldUntil = 0;
  E.pokeTimes = []; reply = { line: '嗯？', emotion: 'normal' };
  const p2 = a().points;
  await E.poke(); await E.poke(); assert.strictEqual(a().points, p2, '前兩下不扣');
  await E.poke(); assert.strictEqual(a().points, p2 - 1, '第三下 −1（沒骰到鄙視）');
  E.rand = () => 0.05; reply = { line: '……你是不是很閒？', emotion: 'disdain' };
  r = await E.poke(); assert.strictEqual(r.lines[0].emotion, 'disdain'); assert.strictEqual(a().points, p2 - 4, '第四下 −1、鄙視 −2');
  E.rand = () => 0.99; reply = { line: '喵！', emotion: 'surprised' };
  await E.poke(); assert.strictEqual(a().points, p2 - 6, '第五下 −2');
  // 升階：跨過門檻 → 專屬台詞＋心意金幣（只有第一次）；掉下去 → 生疏；再升回來不再送
  t += 86400000; a().offenses = []; a().coldUntil = 0;
  a().points = 28; a().stage = 1; a().maxStage = 1;
  const g0 = E.state.player.gold;
  r = await E.setObjective(q.id, 1, true);
  r = await E.setObjective(q.id, 2, true);
  // 💗 第 2 階有漫畫：當下只說一句預告（頭上冒「!」，點她才演；原本那句在漫畫最後一格）
  assert.ok(r.lines.some((l) => /晚點再跟冒險者說|有件事想跟冒險者說/.test(l.text)) && !r.lines.some((l) => /常客才有/.test(l.text)), '升到第 2 階：預告');
  assert.deepStrictEqual(a().shows.pending, [2], '排進待演');
  assert.strictEqual(E.view().affection.shows.next, 2);
  assert.strictEqual(a().stage, 2); assert.ok(E.state.player.gold >= g0 + 20, '心意：20 金幣');
  assert.ok(/「常客」/.test((await E.chat('今天好忙'), sys())), '系統提示換成常客');
  a().points = 20; E.pokeTimes = [];
  r = await E.poke(); assert.ok(r.lines.some((l) => /生疏/.test(l.text)) && a().stage === 1, '掉回第 1 階');
  const g1 = E.state.player.gold; a().points = 35; r = await E.poke();
  assert.ok(r.lines.some((l) => /常客才有/.test(l.text)) && E.state.player.gold === g1, '再升回來不再送');
  // 解鎖劇情：第 3 階以上才聊得到小本子；問關係照階段回答（AI 關著）
  E.npc.status.online = false;
  const book = E.lore.entries.find((x) => x.title === '艾琳的小本子').reply;
  next(); r = await E.chat('你的小本子寫了什麼'); assert.notStrictEqual(r.lines[0].text, book, '第 2 階還聊不到');
  a().points = 90; next(); r = await E.chat('你的小本子寫了什麼'); assert.strictEqual(r.lines[0].text, book, '第 3 階解鎖');
  next(); r = await E.chat('我們是什麼關係'); assert.ok(/奶茶要幾分糖/.test(r.lines[0].text), '問關係：第 3 階的回答');
  assert.strictEqual(E.emotionChance(), 0.5, '第 3 階害羞機率 0.5');
  // 離線罵人：用內建的鄙視台詞
  next(); r = await E.chat('你這個垃圾貓'); assert.strictEqual(r.lines[0].emotion, 'disdain'); assert.ok(/不喜歡|沒聽到/.test(r.lines[0].text));
  // 鄙視只在扣分時出現：非聊天事件的 schema 不給選
  online(); reply = { line: '早安！', emotion: 'normal' }; await E.daily();
  assert.ok(!sent.format.properties.emotion.enum.includes('disdain'));
  // 關掉好感度
  E.saveConfigPatch({ affection: { enabled: false } }); online();
  const p3 = (E.state.affection || {}).points;
  next(); reply = { line: '……', emotion: 'normal', actions: [], attitude: 'rude' }; await E.chat('你是白癡');
  assert.strictEqual(E.state.affection.points, p3, '關掉後不扣'); assert.ok(!/【關係】/.test(sys())); assert.strictEqual(E.emotionChance(), 0.5);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('好感度測試通過 ✔');
  function TEMPLATESof(k) { return require('../src/main/npc').TEMPLATES[k].map(([x]) => x.replace(/\{self\}/g, '艾琳').replace(/\{call\}/g, '冒險者')); }
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🎓 新手引導、新手任務、🩺 健康檢查、使用者資料夾 ----------
(async () => {
  const os = require('os');
  const S = require('../src/main/setup');
  const { buildHealth, parseLog } = require('../src/main/health');
  const { Engine } = require('../src/main/engine');
  const PP = require('../src/main/planParser');
  // 沒有記號、沒有日期的任務標題會被當成分組 → 新增任務一定要寫記號
  const qText = PP.addQuest('# 這週\n', { title: '整理月報', tier: 'major', objectives: ['收齊數字', '寫摘要'] });
  assert.ok(/## 整理月報 🔧/.test(qText));
  assert.deepStrictEqual(PP.parsePlan(qText).quests.map((q) => [q.title, q.objectives.length]), [['整理月報', 2]], '一個任務兩個目標');
  // 依記憶體和顯示卡推薦模型：推薦／上一階／下一階
  const R = (h) => { const r = S.recommend(h); return [r.model, r.up, r.down]; };
  const G = (ram, vram, name = 'NVIDIA GeForce RTX 4060') => ({ ramGB: ram, gpu: { name, vendor: 'nvidia', vramGB: vram } });
  assert.deepStrictEqual(R(15.8), ['qwen3:4b', 'qwen3:8b', 'qwen3:1.7b'], '沒顯示卡 16GB：照舊用 4b');
  assert.deepStrictEqual(R(7.8), ['qwen3:1.7b', 'qwen3:4b', null], '沒顯示卡 8GB：輕量');
  assert.deepStrictEqual(R(3.8), [null, 'qwen3:1.7b', null], '4GB：先不用 AI');
  assert.deepStrictEqual(R(31.7), ['qwen3:30b-instruct', 'qwen3.6:35b-a3b', 'qwen3:4b'], '沒顯示卡 32GB：MoE 旗艦（上一階頂級會慢）');
  assert.deepStrictEqual(R(47.8), ['qwen3.6:35b-a3b', null, 'qwen3:30b-instruct'], '沒顯示卡 48GB：頂級');
  assert.deepStrictEqual(R(63.8), ['qwen3.6:35b-a3b', null, 'qwen3:30b-instruct'], '沒顯示卡 64GB：頂級');
  assert.deepStrictEqual(R(G(15.8, 8)), ['qwen3:8b', 'qwen3:14b', 'qwen3:4b'], '4060 + 16GB');
  assert.deepStrictEqual(R(G(31.8, 8)), ['qwen3:30b-instruct', 'qwen3.6:35b-a3b', 'qwen3:8b'], '4060 + 32GB：顯示卡＋記憶體一起跑');
  assert.strictEqual(S.recommend(G(31.8, 8)).fits.find((f) => f.m.name === 'qwen3.6:35b-a3b').speed, 'slow', '4060 + 32GB 跑頂級：記憶體不夠寬裕');
  assert.deepStrictEqual(R(G(63.8, 8)), ['qwen3.6:35b-a3b', null, 'qwen3:30b-instruct'], '4060 + 64GB：頂級');
  assert.deepStrictEqual(R(G(31.8, 16, 'RTX 4060 Ti')), ['qwen3.6:35b-a3b', null, 'qwen3:30b-instruct'], '16GB 顯示卡 + 32GB：放得下大半，頂級');
  assert.deepStrictEqual(R(G(15.9, 12, 'RTX 3060')), ['qwen3:14b', 'qwen3:30b-instruct', 'qwen3:8b'], '3060 12GB');
  assert.deepStrictEqual(R(G(31.8, 24, 'RTX 4090')), ['qwen3.6:35b-a3b', null, 'qwen3:30b-instruct'], '4090');
  assert.deepStrictEqual(R({ ramGB: 32, gpu: { name: 'Apple Silicon', vendor: 'apple', vramGB: 21.1, unified: true } }), ['qwen3:30b-instruct', null, 'qwen3:14b'], 'Apple 32GB');
  assert.deepStrictEqual(R({ ramGB: 64, gpu: { name: 'Apple Silicon', vendor: 'apple', vramGB: 42.2, unified: true } }), ['qwen3.6:35b-a3b', null, 'qwen3:30b-instruct'], 'Apple 64GB');
  assert.deepStrictEqual(R({ ramGB: 16, gpu: { name: 'Apple Silicon', vendor: 'apple', vramGB: 10.6, unified: true } }), ['qwen3:8b', 'qwen3:14b', 'qwen3:4b'], 'Apple 16GB');
  const exp = S.recommend({ ramGB: 64, gpu: null }, [...S.LADDER.slice(0, -1), { ...S.LADDER[S.LADDER.length - 1], experimental: true }]);
  assert.deepStrictEqual([exp.model, exp.up], ['qwen3:30b-instruct', 'qwen3.6:35b-a3b'], '實驗版不會被自動推薦，只會出現在上一階');
  const f4060 = Object.fromEntries(S.recommend(G(15.8, 8)).fits.map((f) => [f.m.name, `${f.speed}/${f.where}`]));
  assert.deepStrictEqual([f4060['qwen3:8b'], f4060['qwen3:14b'], f4060['qwen3:30b-instruct']], ['great/gpu', 'slow/mix', 'no/cpu']);
  assert.ok(/RTX 4060（8GB）・16GB 記憶體/.test(S.recommend(G(15.8, 8)).why) && /整個放進顯示卡/.test(S.recommend(G(15.8, 8)).why));
  assert.ok(/用處理器跑/.test(S.recommend(15.8).why) && /先不用|內建台詞/.test(S.recommend(3.8).why));
  assert.ok(/顯示卡 Intel UHD Graphics 目前 AI 用不到/.test(S.recommend({ ramGB: 15.8, gpu: null, gpus: [{ name: 'Intel(R) UHD Graphics', vendor: 'intel', vramGB: 1 }] }).why), '內顯：說明為什麼不用');
  // 偵測顯示卡：nvidia-smi → Windows 登錄檔
  const HW = require('../src/main/hardware');
  assert.deepStrictEqual(HW.parseNvidiaSmi('NVIDIA GeForce RTX 4060, 8188\r\nNVIDIA GeForce RTX 3090, 24576\n'), [{ name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramGB: 8 }, { name: 'NVIDIA GeForce RTX 3090', vendor: 'nvidia', vramGB: 24 }]);
  assert.deepStrictEqual(HW.parseNvidiaSmi('NVIDIA-SMI has failed because it couldn\'t communicate with the NVIDIA driver.'), []);
  const reg = HW.parseRegistry(`Intel(R) UHD Graphics 770|2147483648\r\nAMD Radeon RX 7600|8589934592\nAMD Radeon RX 7600|8589934592\nAMD Radeon RX 580 Series|8589934592\n|`);
  assert.deepStrictEqual(reg.map((g) => [g.vendor, g.vramGB, HW.usable(g)]), [['intel', 2, false], ['amd', 8, true], ['amd', 8, false]], '登錄檔：重複的合併；RX 580 太舊、Intel 先不用');
  const fakeRun = (out) => async (cmd) => out[cmd] === undefined ? null : out[cmd];
  let hw = await HW.detect({ platform: 'win32', totalmem: 32 * 1024 ** 3, run: fakeRun({ 'nvidia-smi': 'NVIDIA GeForce RTX 4060 Laptop GPU, 8188\n' }), fresh: true });
  assert.ok(hw.gpu.name === 'NVIDIA GeForce RTX 4060 Laptop GPU' && hw.gpu.vramGB === 8 && hw.ramGB === 32);
  hw = await HW.detect({ platform: 'win32', totalmem: 16 * 1024 ** 3, run: fakeRun({ 'powershell.exe': 'Intel(R) Iris(R) Xe Graphics|1073741824\nNVIDIA GeForce GTX 1660 SUPER|6442450944\n' }), fresh: true });
  assert.ok(hw.gpu.name === 'NVIDIA GeForce GTX 1660 SUPER' && hw.gpu.vramGB === 6 && hw.gpus.length === 2, 'nvidia-smi 問不到：看登錄檔');
  hw = await HW.detect({ platform: 'win32', totalmem: 16 * 1024 ** 3, run: fakeRun({}), fresh: true });
  assert.ok(hw.gpu === null && hw.gpus.length === 0, '什麼都問不到：當作沒有顯示卡');
  hw = await HW.detect({ platform: 'darwin', arch: 'arm64', totalmem: 16 * 1024 ** 3, run: fakeRun({}), fresh: true });
  assert.ok(hw.gpu.unified && hw.gpu.vramGB > 10 && hw.gpu.vramGB < 11, 'Apple：共用記憶體');
  assert.strictEqual(await HW.detect({ run: fakeRun({ 'nvidia-smi': 'X, 99999' }) }), hw, '同一次開機只問一次');
  assert.ok(S.hasModel(['qwen3:4b'], 'qwen3:4b') && S.hasModel(['qwen3:4b-q4_K_M'], 'qwen3:4b') && !S.hasModel(['qwen3:1.7b'], 'qwen3:4b'));
  // 偵測：Ollama 有開／沒開
  const fakeFetch = (models) => async (url) => { if (!models) throw new Error('ECONNREFUSED'); return { ok: true, json: async () => ({ models: models.map((name) => ({ name })) }) }; };
  let pr = await S.probe({ fetchImpl: fakeFetch(['qwen3:1.7b', 'gemma3:4b', 'qwen3-embedding:0.6b']), totalmem: 8 * 1024 ** 3, gpu: null });
  assert.strictEqual(pr.ollama, 'running'); assert.strictEqual(pr.recommend, 'qwen3:1.7b');
  assert.ok(pr.choices.find((c) => c.name === 'qwen3:1.7b').installed && !pr.choices.find((c) => c.name === 'qwen3:4b').installed);
  assert.deepStrictEqual(pr.choices.filter((c) => c.tier).map((c) => [c.tier, c.name, c.speed]), [['rec', 'qwen3:1.7b', 'great'], ['up', 'qwen3:4b', 'slow']], '8GB：推薦輕量、上一階標準（會慢）');
  assert.ok(pr.choices.some((c) => c.name === 'gemma3:4b' && c.other && c.installed) && !pr.choices.some((c) => /embedding/.test(c.name)), '自選：電腦裡已經有的其他模型（語意模型除外）');
  assert.ok(pr.hw.text === '8GB 記憶體' && pr.up === 'qwen3:4b' && pr.down === null);
  pr = await S.probe({ fetchImpl: fakeFetch([]), totalmem: 16 * 1024 ** 3, gpu: { name: 'NVIDIA GeForce RTX 4060', vendor: 'nvidia', vramGB: 8 } });
  assert.ok(pr.recommend === 'qwen3:8b' && pr.up === 'qwen3:14b' && pr.down === 'qwen3:4b' && /RTX 4060/.test(pr.hw.text), '4060：' + JSON.stringify([pr.recommend, pr.up, pr.down]));
  assert.strictEqual(pr.choices.find((c) => c.name === 'qwen3:14b').speedText, '會等比較久');
  pr = await S.probe({ fetchImpl: fakeFetch(null), totalmem: 16 * 1024 ** 3, gpu: null });
  assert.ok(['missing', 'stopped'].includes(pr.ollama) && pr.recommend === 'qwen3:4b');
  // Ollama 版本：0.9.0 以前太舊（關不掉思考）；問不到版本、開發版都不算太舊
  assert.ok(S.versionLess('0.6.2', '0.9.0') && S.versionLess('0.8.9', '0.9.0') && !S.versionLess('0.9.0', '0.9.0') && !S.versionLess('0.12.3', '0.9.0') && !S.versionLess('1.0.0', '0.9.0'));
  assert.ok(!S.versionLess('0.0.0', '0.9.0') && !S.versionLess('', '0.9.0') && !S.versionLess('abc', '0.9.0') && S.versionLess('v0.5.7-rc1', '0.9.0'));
  const verFetch = (version) => async (url) => {
    if (/version$/.test(url)) { if (version === null) throw new Error('404'); return { ok: true, json: async () => ({ version }) }; }
    return { ok: true, json: async () => ({ models: [{ name: 'qwen3:4b' }] }) };
  };
  pr = await S.probe({ fetchImpl: verFetch('0.6.2'), totalmem: 16 * 1024 ** 3, gpu: null });
  assert.ok(pr.version === '0.6.2' && pr.outdated && pr.minVersion === S.MIN_OLLAMA, '舊版 Ollama：' + JSON.stringify([pr.version, pr.outdated]));
  pr = await S.probe({ fetchImpl: verFetch('0.12.3'), totalmem: 16 * 1024 ** 3, gpu: null });
  assert.ok(pr.version === '0.12.3' && !pr.outdated, '新版不提醒');
  pr = await S.probe({ fetchImpl: verFetch(null), totalmem: 16 * 1024 ** 3, gpu: null });
  assert.ok(pr.ollama === 'running' && pr.version === null && !pr.outdated, '問不到版本：不提醒');
  assert.ok(/版本太舊/.test(S.friendlyPullError('pull model manifest: 412: The model you are attempting to pull requires a newer version of Ollama.')), '舊版下載新模型：中文說明');
  assert.ok(/找不到這個模型/.test(S.friendlyPullError('pull model manifest: file does not exist')), '沒有這個模型：中文說明');
  // 下載：把 Ollama 一行一行的進度合起來算百分比
  const lines = [{ status: 'pulling manifest' }, { status: 'pulling a', digest: 'a', total: 100, completed: 50 }, { status: 'pulling b', digest: 'b', total: 100, completed: 0 }, { status: 'pulling a', digest: 'a', total: 100, completed: 100 }, { status: 'pulling b', digest: 'b', total: 100, completed: 100 }, { status: 'success' }];
  const streamFetch = (ls) => async () => {
    const chunks = ls.map((l) => new TextEncoder().encode(JSON.stringify(l) + '\n'));
    let i = 0;
    return { ok: true, body: { getReader: () => ({ read: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { done: true }) }) } };
  };
  const seen = [];
  await S.pull({ model: 'qwen3:1.7b', fetchImpl: streamFetch(lines), onProgress: (p) => seen.push(p.percent) });
  assert.ok(seen.includes(25) && seen.includes(50) && seen[seen.length - 1] === 100, '進度：' + seen.join(','));
  await assert.rejects(S.pull({ model: 'x', fetchImpl: streamFetch([{ error: 'pull model manifest: file does not exist' }]) }), (e) => /找不到這個模型/.test(e.message) && /does not exist/.test(e.raw) && e.kind === 'notfound');
  await assert.rejects(S.pull({ model: 'x', fetchImpl: streamFetch([{ status: 'pulling manifest' }]) }), /沒有完成/);
  await assert.rejects(S.pull({ model: 'x', fetchImpl: streamFetch([{ error: 'pull model manifest: 412: requires a newer version of Ollama' }]) }), /版本太舊/);
  await assert.rejects(S.pull({ model: 'x', fetchImpl: async () => ({ ok: false, status: 412, text: async () => 'requires a newer version of Ollama' }) }), /版本太舊/);
  // 健康檢查：各種情況的紅綠燈與修法
  const base = { name: '艾琳', plan: { file: 'p.md', exists: true, quests: 3 }, llm: { enabled: true, model: 'qwen3:4b' }, probe: { ollama: 'running', models: ['qwen3:4b'], embed: { installed: true } }, ramGB: 16, smart: { on: false }, charOK: true, saveOK: true, userDir: '/u' };
  const st = (x) => Object.fromEntries(buildHealth({ ...base, ...x }).map((i) => [i.id, i]));
  assert.strictEqual(st({}).ai.status, 'ok');
  assert.ok(!st({}).ollamaVer, 'Ollama 版本正常：不顯示');
  const old = st({ probe: { ollama: 'running', models: ['qwen3:4b'], embed: { installed: true }, version: '0.6.2', minVersion: '0.9.0', outdated: true } });
  assert.ok(old.ollamaVer && old.ollamaVer.status === 'warn' && old.ollamaVer.fixes.some((f) => f.action === 'updateOllama') && /0\.6\.2/.test(old.ollamaVer.detail), 'Ollama 太舊：黃燈＋下載新版');
  // 安裝前檢查 Node.js 版本（安裝.bat、打包.bat 會先跑）
  const cp = require('child_process');
  const chk = (want) => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'check-node.js')], { env: { ...process.env, CHECK_NODE_WANT: want || '' }, encoding: 'utf8' });
  assert.strictEqual(chk('').status, 0, 'Node 版本夠：' + chk('').stdout);
  const bad = chk('99.0.0');
  assert.ok(bad.status === 1 && /版本太舊/.test(bad.stdout) && /nodejs\.org/.test(bad.stdout), '版本太舊：說明去哪裡下載');
  assert.strictEqual(require('../package.json').engines.node, '>=22.12.0', 'package.json 寫明需要的 Node 版本');
  assert.ok(st({ probe: { ollama: 'missing', models: [], embed: {} } }).ai.fixes.some((f) => f.action === 'openOllama'));
  assert.ok(st({ probe: { ollama: 'stopped', models: [], embed: {} } }).ai.detail.includes('沒有開'));
  assert.ok(st({ probe: { ollama: 'running', models: [], embed: {} } }).ai.fixes.some((f) => f.action === 'pull:qwen3:4b'));
  assert.strictEqual(st({ llm: { enabled: false, model: 'qwen3:4b' } }).ai.status, 'info');
  assert.ok(st({ ramGB: 8 }).ram.fixes.some((f) => f.action === 'useModel:qwen3:1.7b'), '8GB 用 4b → 建議換輕量');
  const gp = (model, hw) => st({ llm: { enabled: true, model }, probe: { ollama: 'running', models: [model], embed: { installed: true }, hw } });
  const h4060 = { ramGB: 15.8, gpu: { name: 'RTX 4060', vramGB: 8 } };
  assert.ok(gp('qwen3:8b', h4060).ram.status === 'ok' && /RTX 4060（8GB）/.test(gp('qwen3:8b', h4060).ram.detail), '4060 跑 8b：沒問題');
  assert.ok(gp('qwen3:30b-instruct', h4060).ram.fixes.some((f) => f.action === 'useModel:qwen3:8b'), '4060 + 16GB 跑 30b：建議換推薦的 8b');
  assert.strictEqual(gp('gemma3:12b', h4060).ram.status, 'ok', '自己填的模型：不亂建議');
  assert.strictEqual(st({ configError: 'config.json 格式錯誤：Unexpected token' }).config.status, 'error');
  assert.strictEqual(st({ plan: { file: 'x.md', exists: false } }).plan.status, 'error');
  assert.ok(st({ plan: { file: 'x.md', exists: true, quests: 0 } }).plan.fixes.some((f) => f.action === 'ui:newQuest'));
  const slowLog = parseLog(Array.from({ length: 5 }, () => '9/30 10:00:00\tchat\t60000ms\t載入模型 5ms').join('\n'));
  assert.strictEqual(st({ log: slowLog }).speed.status, 'warn');
  assert.ok(st({ log: slowLog }).speed.fixes.some((f) => f.action === 'useModel:qwen3:1.7b'), '太慢：換小一階');
  assert.strictEqual(st({ log: slowLog, llm: { enabled: true, model: 'qwen3:1.7b' }, probe: { ollama: 'running', models: ['qwen3:1.7b'], embed: { installed: true } } }).speed.fixes.length, 0, '已經最小了：不建議');
  assert.strictEqual(st({ log: parseLog('9/30 10:00:00\tpoke\t900ms\t失敗：timeout\n'.repeat(4)) }).fails.status, 'warn');
  assert.strictEqual(st({ saveOK: false }).save.status, 'error');
  assert.strictEqual(st({ smart: { on: true, status: 'no-model' }, probe: { ollama: 'running', models: ['qwen3:4b'], embed: { installed: false } } }).smart.status, 'info', '自動模式：語意模型是選用');

  // 使用者資料夾跟程式分開（打包後的樣子）
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-app-'));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-user-'));
  fs.mkdirSync(path.join(appDir, 'plans')); fs.mkdirSync(path.join(appDir, 'lore'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(appDir, 'plans', 'week_sample.md'));
  fs.copyFileSync(path.join(__dirname, '..', 'lore', '艾琳.md'), path.join(appDir, 'lore', '艾琳.md'));
  fs.copyFileSync(path.join(__dirname, '..', 'config.example.json'), path.join(appDir, 'config.example.json'));
  const E = new Engine({ appDir, userDir, now: () => new Date(`${new Date().getFullYear()}-09-30T10:00:00`) });
  E.npc.status.online = false;
  assert.ok(fs.existsSync(path.join(userDir, 'config.json')) && !fs.existsSync(path.join(appDir, 'config.json')), '設定檔建在使用者資料夾');
  assert.strictEqual(E.lore.file, path.join(appDir, 'lore', '艾琳.md'), '沒複製出來時用內建的角色設定');
  assert.strictEqual(E.planFile(), path.join(appDir, 'plans', 'week_sample.md'), '沒複製出來時用內建的範例');
  assert.ok(E.view().onboarding.needed && !E.view().tutorial, '第一次用：要新手引導');
  // 建立第一份計畫
  const cr = await E.createPlan({ quest: { title: '整理月報', tier: 'major', objectives: ['收齊數字', '寫摘要', ''] } });
  assert.ok(cr.file.startsWith(path.join(userDir, 'plans')) && /我的一週 9_28–10_2\.md$/.test(cr.file), cr.file);
  assert.deepStrictEqual(E.plan.quests.map((q) => [q.title, q.objectives.length]), [['整理月報', 2]]);
  assert.ok(!E.config.plan.path.startsWith('/'), '存成相對路徑：' + E.config.plan.path);
  const cr2 = await E.createPlan({ quest: { title: '另一件事' } });
  assert.ok(/\(2\)\.md$/.test(cr2.file), '同名不覆蓋');
  // 範例計畫：複製一份再用
  E.useSamplePlan();
  assert.ok(E.planFile().startsWith(userDir) && E.plan.quests.length > 3);
  // 作息與模型
  E.saveSchedule({ lunch: '12:30', back: '', wrap: '17:30', weekdaysOnly: false, idle: 0 });
  assert.deepStrictEqual(E.config.reminders.items, [{ time: '12:30', event: 'lunch' }, { time: '17:30', event: 'wrapup' }]);
  assert.strictEqual(E.config.reminders.weekdaysOnly, false); assert.strictEqual(E.config.window.idleChatterMinutes, 0);
  assert.deepStrictEqual(E.view().schedule, { lunch: '12:30', back: '', wrap: '17:30', weekdaysOnly: false, idle: 0 });
  E.setModel('qwen3:1.7b'); assert.ok(E.config.llm.enabled && E.config.llm.model === 'qwen3:1.7b');
  E.setModel(null); assert.ok(!E.config.llm.enabled);
  E.npc.status.online = false;
  // 完成引導 → 新手任務開始
  const fin = await E.finishOnboarding();
  assert.ok(E.state.onboarding.done && E.tutorialInfo().count === 0 && fin.lines.some((l) => /新手任務/.test(l.text)));
  // 新手任務：每個一次、有獎勵；全部完成畢業
  const xp0 = E.state.player.xp, g0 = E.state.player.gold;
  const q0 = E.plan.quests[0];
  const r1 = await E.setObjective(q0.id, 0, true);
  assert.ok(r1.lines.some((l) => /新手任務完成|學會了/.test(l.text) && /1\/7/.test(l.text)), '勾目標 → 完成一個');
  await E.setObjective(q0.id, 0, false); await E.setObjective(q0.id, 0, true);
  assert.strictEqual(E.tutorialInfo().count, 1, '同一個不重複算');
  await E.chat('艾琳今天好嗎'); await E.drawFortune(); E.startFocus(0.1); E.cancelFocus();
  for (const k of ['progress', 'submit']) E.tutorialMark(k);
  assert.strictEqual(E.tutorialInfo().count, 6);
  E.tutorialMark('mini');
  const last = E.settle({ lines: [] });
  assert.ok(last.lines.some((l) => /畢業/.test(l.text)) && E.tutorialInfo().finished, '全部完成 → 畢業');
  assert.ok(E.state.history.some((h) => h.reason === '新手村畢業' && h.gold === 50));
  assert.ok(E.state.history.filter((h) => /^新手任務：/.test(h.reason)).length === 7);
  assert.ok(E.state.player.gold >= g0 + 7 * 5 + 50 && E.state.player.xp >= xp0 + 7 * 10);
  E.hideTutorial(); assert.strictEqual(E.view().tutorial, null);
  // 已經在用的存檔：不跳新手引導
  const E2 = new Engine({ appDir, userDir });
  assert.ok(!E2.view().onboarding.needed);
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-old-'));
  fs.mkdirSync(path.join(d3, 'data'));
  fs.writeFileSync(path.join(d3, 'data', 'save.json'), JSON.stringify({ player: { xp: 120, gold: 30 }, history: [{ at: 'x', reason: '完成目標：舊的', xp: 10, gold: 5 }] }));
  fs.copyFileSync(path.join(__dirname, '..', 'config.example.json'), path.join(d3, 'config.example.json'));
  const E3 = new Engine({ appDir: d3 });
  assert.ok(!E3.view().onboarding.needed, '舊存檔直接當作完成引導');
  E3.restartOnboarding(); assert.ok(E3.view().onboarding.needed, '右鍵選單可以再看一次');
  for (const d of [appDir, userDir, d3]) fs.rmSync(d, { recursive: true, force: true });
  console.log('新手引導測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 動作不等 AI：先完成、話晚點說（排隊、合併、順序） ----------
(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-defer-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: true, baseUrl: 'http://x', quickLines: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } })); // 這裡測排隊：勾目標也問 AI
  const E = new Engine({ appDir: dir, now: () => new Date(`${new Date().getFullYear()}-09-30T10:00:00`) });
  E.deferSpeech = true;
  const heard = [], asked = [];
  E.onSpeech = (ls) => heard.push(...ls);
  E.npc.status.online = true;
  // AI 先「卡住」不回話（gate 關著）：勾選如果在等 AI 就會一直卡著 → 5 秒後失敗；不用量時間，慢的電腦也不會誤判
  let openGate; const gate = new Promise((r) => { openGate = r; });
  E.npc.fetchJSON = async (_p, body) => { asked.push(body); await gate; await new Promise((r) => setTimeout(r, 600)); return { message: { content: JSON.stringify({ line: `好的（第 ${asked.length} 句）`, emotion: 'happy' }) } }; };
  const noWait = (p) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('勾選在等 AI 回話')), 5000); })]).finally(() => clearTimeout(t)); };
  const q = E.plan.quests[0];
  // 連勾三個目標：每一個都馬上完成，不用等 AI
  const rs = [];
  for (let i = 0; i < 3; i++) rs.push(await noWait(E.setObjective(q.id, i, true)));
  assert.ok(heard.length === 0, 'AI 還沒回話，三個都勾好了（勾選不用等 AI）');
  openGate();
  assert.ok(rs.every((r) => !r.lines.some((l) => l.event === 'objective')), '回傳裡沒有 AI 的話（晚點推）');
  assert.ok(rs[2].view.quests.find((x) => x.id === q.id).objectives.every((o) => o.done), '三個都勾好了');
  assert.ok(rs[0].view.rev < rs[1].view.rev && rs[1].view.rev < rs[2].view.rev, '畫面有新舊順序');
  assert.strictEqual(E.speechSeq, 3);
  await E.speechIdle();
  const objLines = heard.filter((l) => l.event === 'objective');
  assert.ok(objLines.length <= 2 && objLines.every((l) => l.deferred), '還沒開始說的舊句子被最新的取代：' + objLines.length);
  const lastAsk = asked[asked.length - 1].messages.at(-1).content;
  assert.ok(/3\/3|目標全完成|全部/.test(lastAsk) || /「上架申請已送出/.test(lastAsk), '最後一句是照最新的進度說的');
  // 交付：先回傳報酬，話照順序說（交付 → 下一個任務）
  heard.length = 0;
  const sub = await E.submit(q.id);
  assert.ok(sub.reward && sub.reward.xp > 0 && !sub.lines.some((l) => ['submit', 'assign'].includes(l.event)));
  await E.speechIdle();
  assert.deepStrictEqual(heard.map((l) => l.event).filter((e) => e !== 'levelup'), ['submit', 'assign'], '順序：交付 → 派下一個');
  // AI 沒開：一樣排隊，用內建台詞，很快就說
  heard.length = 0; E.npc.status.online = false;
  await E.setActive(E.plan.quests[2].id);
  await E.speechIdle();
  assert.ok(heard.length === 1 && heard[0].source === 'template' && heard[0].event === 'assign');
  // 聊天、戳、打招呼照舊等回覆（那是在講話）
  E.npc.status.online = true;
  const c = await E.chat('今天好嗎');
  assert.ok(c.lines.some((l) => l.event === 'chat'));
  // 沒開延後時（測試、舊行為）：照舊直接回傳
  E.deferSpeech = false;
  const r = await E.setObjective(E.plan.quests[1].id, 0, true);
  assert.ok(r.lines.some((l) => l.event === 'objective'));
  // 10/14 AI 提示審視 A：預設冒險者自己按的（勾目標、打開今日行程、點艾琳、戳、換任務）馬上用內建台詞，不問 AI
  E.config.llm.quickLines = true; E.deferSpeech = true; asked.length = 0; heard.length = 0;
  const qo = await noWait(E.setObjective(E.plan.quests[1].id, 1, true));
  const ol = qo.lines.find((l) => l.event === 'objective');
  assert.ok(ol && ol.source === 'template' && !asked.length, '勾目標：回傳裡就有內建台詞，沒問 AI');
  const seen = new Set([ol.tpl]);
  for (let i = 0; i < 3; i++) { await E.setObjective(E.plan.quests[3].id, 0, i % 2 === 0); const l = (await E.setObjective(E.plan.quests[3].id, 0, true)).lines.find((x) => x.event === 'objective'); if (l) seen.add(l.tpl); }
  assert.ok(seen.size >= 2, '同一種不會一直說同一句');
  const dl = (await E.daily()).lines[0];
  assert.ok(dl.source === 'template' && !asked.length && !/「」/.test(dl.text), '打開今日行程：內建台詞、沒有空格子：' + dl.text);
  E.pokeTimes = []; assert.strictEqual((await E.poke()).lines[0].source, 'template', '戳一下：內建台詞');
  assert.strictEqual((await E.greet()).lines[0].event, 'morning', '今天第一次見面還是問 AI');
  await E.speechIdle(); const n0 = asked.length;
  const g2 = await E.greet(); assert.ok(g2.lines[0].source === 'template' && asked.length === n0, '再點艾琳：內建台詞');
  await E.daily({ ai: true }); assert.ok(asked.length === n0 + 1, '艾琳自己發現換到下一格（主動開口）：問 AI');
  const c2 = await E.chat('今天好嗎'); assert.ok(c2.lines[0].source === 'llm', '聊天照樣問 AI');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('動作不等 AI 測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 主動聊天：開話題、越熟越私人、越熟越常來 ----------
(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const { Lore } = require('../src/main/lore');
  const loreFile = path.join(__dirname, '..', 'lore', '艾琳.md');
  // 設定檔的話題：每一階都有，還沒解鎖的不會出現
  const L = new Lore({ file: loreFile, dataDir: os.tmpdir(), llm: {}, embeddings: false, log: () => {} });
  const per = [1, 2, 3, 4, 5].map((s) => L.topicPool(s).filter((x) => x.stage === s).length);
  assert.ok(per.every((n) => n >= 3), '每一階都有話題：' + per);
  assert.ok(L.topicPool(1).every((x) => x.stage === 1) && L.topicPool(4).every((x) => x.stage <= 4));
  assert.ok(L.topicPool(5).some((x) => x.entry.title === '第一次見面') && !L.topicPool(4).some((x) => x.entry.title === '第一次見面'));
  assert.ok(L.topicPool(5).every((x) => /[？?]/.test(x.text)), '開場都丟一個問題給冒險者');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-topic-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false, baseUrl: 'http://x' }, lore: { path: loreFile, embeddings: false }, window: { idleChatterMinutes: 30 } }));
  const Y = new Date().getFullYear();
  let t = new Date(`${Y}-10-03T10:00:00`).getTime(); // 週六：計畫裡沒有這天的行程
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  const min = (m) => { t += m * 60000; };
  const due = (o) => E.proactiveDue(o || {});
  // 第 1 階：間隔 30 × 0.8 = 24 分鐘（從最後一次碰她算起）
  assert.strictEqual(due(), null, '剛打開不說');
  min(23); assert.strictEqual(due(), null);
  min(2); assert.strictEqual(due(), 'topic', '24 分鐘沒理她 → 開話題');
  assert.strictEqual(due({ idleSec: 400 }), null, '不在電腦前不說');
  assert.strictEqual(due({ locked: true }), null, '鎖螢幕不說');
  E.touch(); assert.strictEqual(due(), null, '剛碰過她，計時重來');
  min(25);
  const r = await E.proactive({});
  assert.ok(r && r.kind === 'topic' && r.lines.length === 1 && r.lines[0].ambient && r.lines[0].topic, '主動說的話標成 ambient＋topic');
  const said = r.lines[0];
  assert.ok(L.topicPool(1).some((x) => x.text === said.text), '離線：說設定檔裡寫好的開場');
  assert.ok(!/q-|進度|任務/.test(said.text), '不提任務');
  const last = E.state.chat[E.state.chat.length - 1];
  assert.ok(last.role === 'assistant' && last.topic === said.topic, '放進聊天紀錄，回話時才接得上');
  // 沒人理：不會一直說；過了三倍間隔才再試一次
  min(30); assert.strictEqual(due(), null, '上一句還沒人理');
  min(45); assert.strictEqual(due(), 'topic', '三倍間隔後再試');
  // 有理她 → 照常
  E.touch(); min(25); assert.strictEqual(due(), 'topic');
  // 專注、冷戰、沒做完新手教學、關掉 → 都不說
  E.state.focus = { endAt: t + 60000 }; assert.strictEqual(due(), null, '專注中'); delete E.state.focus;
  E.aff().coldUntil = t + 60000; assert.strictEqual(due(), null, '冷戰中'); E.aff().coldUntil = 0;
  E.state.onboarding = { done: false }; assert.strictEqual(due(), null, '新手教學還沒做完'); E.state.onboarding = { done: true };
  E.config.window.idleChatterMinutes = 0; assert.strictEqual(due(), null, '設成 0 就不主動'); E.config.window.idleChatterMinutes = 30;
  // 連續開話題：不會連續兩次同一條、最近聊過的先不聊；第 1 階只聊公開的
  const seen = [];
  for (let i = 0; i < 30; i++) { E.touch(); min(25); const x = await E.proactive({}); seen.push(x.lines[0].topic); }
  assert.ok(seen.every((s, i) => i === 0 || s !== seen[i - 1]), '不會連續同一條');
  const st1 = new Set(L.topicPool(1).map((x) => x.entry.title));
  assert.ok(seen.every((s) => st1.has(s)), '第 1 階只聊第 1 階的話題');
  assert.ok(new Set(seen).size >= 6, '話題有在換：' + new Set(seen).size);
  // 第 5 階：間隔變 12 分鐘，私人話題變多
  E.aff().points = 300; E.aff().stage = 5;
  E.touch(); min(11); assert.strictEqual(due(), null); min(2); assert.strictEqual(due(), 'topic', '越熟越常來（12 分鐘）');
  const stages = [];
  for (let i = 0; i < 120; i++) { E.touch(); min(13); const x = await E.proactive({}); stages.push(L.topicPool(5).find((y) => y.text === x.lines[0].text).stage); }
  const high = stages.filter((s) => s >= 4).length / stages.length;
  assert.ok(stages.includes(5) && high > 0.35, `第 5 階常聊私人的話題（4、5 階佔 ${Math.round(high * 100)}%）`);
  // 排定的時段內：每格先提一次行程，之後才開話題
  t = new Date(`${Y}-09-30T10:00:00`).getTime(); E.touch(); min(13);
  assert.strictEqual(due(), 'daily', '時段裡先提這格行程');
  const d = await E.proactive({}); assert.ok(d.kind === 'daily' && d.lines.every((l) => l.ambient));
  E.touch(); min(13); assert.strictEqual(due(), 'topic', '同一格只提一次');

  // 回她的話題：AI 知道剛剛在聊什麼、好感 +1（一天最多 3 次）；聊別的就不算
  E.aff().points = 40; E.aff().stage = 2; E.aff().gainedToday = 0; E.aff().topicToday = 0;
  E.config.llm.enabled = true; E.npc.llm.enabled = true; E.npc.status.online = true; E.rand = () => 0.99;
  let sent = [];
  E.npc.fetchJSON = async (_p, body) => { sent.push(body); return { message: { content: JSON.stringify({ line: '原來冒險者那邊也會下雪呀～', emotion: 'happy', actions: [], attitude: 'ok' }) } }; };
  t = new Date(`${Y}-10-03T15:00:00`).getTime(); E.touch(); min(25);
  const tp = await E.proactive({});
  const topicReq = sent[sent.length - 1].messages.map((m) => m.content).join('\n');
  assert.ok(/【話題】/.test(topicReq) && /【話題相關設定】/.test(topicReq) && !/【當前任務】/.test(topicReq), 'AI 開話題：給話題和設定，不給任務');
  assert.strictEqual(tp.lines[0].text, '原來冒險者那邊也會下雪呀～');
  const p0 = E.aff().points;
  min(1); await E.chat('我們這邊冬天會下一點點雪');
  const replyReq = sent[sent.length - 1];
  assert.ok(new RegExp(`【話題】剛才是你主動找冒險者聊「${tp.lines[0].topic}」`).test(replyReq.messages[0].content), '回話時告訴 AI 剛剛在聊的話題');
  assert.ok(replyReq.messages.some((m) => m.role === 'assistant' && /下雪呀/.test(m.content)), '聊天紀錄裡有她開的話題');
  assert.strictEqual(E.aff().points, p0 + 1, '陪她聊天 +1');
  min(1); await E.chat('對啊');
  assert.ok(!/【話題】/.test(sent[sent.length - 1].messages[0].content), '已經回過了，不再帶話題');
  assert.strictEqual(E.aff().points, p0 + 1, '同一個話題只加一次');
  for (let i = 0; i < 4; i++) { E.touch(); min(25); await E.proactive({}); min(1); await E.chat(`回第 ${i} 個話題`); }
  assert.strictEqual(E.aff().topicToday, 3, '一天最多 3 次');
  // 過太久才回、或中間聊了別的：不算回話題
  E.touch(); min(25); await E.proactive({}); min(25); await E.chat('剛剛在忙');
  assert.ok(!/【話題】/.test(sent[sent.length - 1].messages[0].content), '超過 20 分鐘不算');
  // 離線回話題：用內建的反應
  E.config.llm.enabled = false; E.npc.llm.enabled = false;
  E.touch(); min(25); await E.proactive({}); min(1);
  const off = await E.chat('我也喜歡');
  assert.ok(TEMPLATESof('topic_reply').includes(off.lines[0].text) || off.lines[0].source === 'lore', '離線也會回應：' + off.lines[0].text);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('主動聊天測試通過 ✔');
  function TEMPLATESof(k) { return require('../src/main/npc').TEMPLATES[k].map(([x]) => x.replace(/\{self\}/g, '艾琳').replace(/\{call\}/g, '冒險者')); }
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 待機小動作：打瞌睡、醒來、跟著作息、隨機小動作 ----------
(() => {
  const B = require('../src/renderer/idle-brain');
  const Y = new Date().getFullYear();
  let now = new Date(`${Y}-10-02T09:00:00`).getTime();
  const mem = B.newMemory(now);
  let seq = 0; const rnd = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
  const ctx = (o = {}) => ({ now, idleSec: 30, enabled: true, wrap: '16:50', ...o });
  const sec = (s) => { now += s * 1000; };
  // 早上剛打開：先伸懶腰說早安（一天一次）
  assert.strictEqual(B.decide(ctx(), mem, rnd), null, '剛打開先不動');
  sec(9); const m = B.decide(ctx(), mem, rnd);
  assert.ok(m && m.type === 'morning' && m.whisper && m.pose === 'stretch', '早上伸懶腰');
  sec(60); const after = B.decide(ctx(), mem, rnd); assert.ok(!after || after.type !== 'morning', '早安只說一次');
  // 離開座位 → 打瞌睡；說話中也照樣；回來 → 醒來（離開很久才說歡迎回來）
  assert.strictEqual(B.decide(ctx({ idleSec: 301, busy: true }), mem, rnd).type, 'doze');
  sec(60); assert.strictEqual(B.decide(ctx({ idleSec: 361 }), mem, rnd), null, '睡著時不做別的');
  sec(5 * 60); let w = B.decide(ctx({ idleSec: 2 }), mem, rnd);
  assert.ok(w.type === 'wake' && !w.whisper, '短暫離開：醒來揮手，不說話');
  sec(10); B.decide(ctx({ locked: true }), mem, rnd); sec(40 * 60); w = B.decide(ctx({ idleSec: 1 }), mem, rnd);
  assert.ok(w.type === 'wake' && w.away >= 40 * 60000 && B.LINES.wake.includes(w.whisper), '鎖螢幕很久回來：歡迎回來');
  // 說話中、縮成貓咪、專注、新手教學、關掉 → 不做隨機小動作
  sec(120);
  for (const o of [{ busy: true }, { mini: true }, { focus: true }, { onboarding: true }, { enabled: false }]) assert.strictEqual(B.decide(ctx(o), mem, rnd), null, JSON.stringify(o));
  // 隨機小動作：有間隔、不連續同一個；你在忙時多半在寫小本子
  const seen = []; let last = 0;
  for (let i = 0; i < 400; i++) { sec(5); const a = B.decide(ctx({ idleSec: i % 2 ? 3 : 40 }), mem, rnd); if (a && B.AMBIENT[a.type]) { assert.ok(!last || now - last >= 30000, '間隔至少 30 秒'); last = now; seen.push(a.type); } }
  assert.ok(seen.length >= 8 && seen.every((k, i) => i === 0 || k !== seen[i - 1]), '有在動、不連續同一個：' + seen.join(','));
  assert.ok(!seen.includes('heart') && !seen.includes('sigh'), '還不熟：沒有 ♡；沒冷戰：不嘆氣');
  // 坐太久：50 分鐘提醒起來動一動
  now = new Date(`${Y}-10-02T13:00:00`).getTime();
  const m2 = B.newMemory(now); m2.done = {}; m2.day = '';
  let br = null; for (let i = 0; i < 60 && !br; i++) { sec(60); const a = B.decide(ctx({ idleSec: 2 }), m2, rnd); if (a && a.type === 'break') br = { a, at: now }; }
  assert.ok(br && B.LINES.break.includes(br.a.whisper) && br.at - new Date(`${Y}-10-02T13:00:00`).getTime() >= 50 * 60000, '連續 50 分鐘：提醒起來動一動');
  // 下午三點：奶茶（一天一次）；冷戰時不喝、只會別過頭
  now = new Date(`${Y}-10-02T15:05:00`).getTime(); m2.lastAt = 0;
  assert.strictEqual(B.decide(ctx(), m2, rnd).type, 'tea');
  sec(120); m2.lastAt = 0; const c1 = B.decide(ctx(), m2, rnd); assert.ok(!c1 || c1.type !== 'tea', '奶茶一天一次');
  const m3 = B.newMemory(now - 3600000); m3.lastAt = 0; m3.lastBreak = now;
  assert.strictEqual(B.decide(ctx({ cold: true }), m3, rnd).type, 'sigh', '冷戰中只會別過頭');
  // 很熟了：常冒 ♡
  const m4 = B.newMemory(now - 3600000); m4.done = { tea: true }; m4.day = new Date(now).getFullYear() + '-' + (new Date(now).getMonth() + 1) + '-' + new Date(now).getDate();
  const hearts = []; for (let i = 0; i < 300; i++) { sec(10); m4.lastBreak = now; const a = B.decide(ctx({ fond: true, idleSec: 40 }), m4, rnd); if (a) hearts.push(a.type); }
  assert.ok(hearts.filter((k) => k === 'heart').length >= 3, '很熟了會冒 ♡');
  // 自言自語：閒著時偶爾配一句，你在忙（剛有打字）時不說；星期一、五早上有專屬的句子
  const m7 = B.newMemory(now - 3600000); m7.done = { tea: true, morning: true }; m7.day = m4.day;
  let idleSay = 0, busySay = 0;
  for (let i = 0; i < 600; i++) { sec(10); m7.lastBreak = now; const busyNow = i % 2 === 0; const a = B.decide(ctx({ idleSec: busyNow ? 3 : 40 }), m7, rnd); if (a && a.whisper) { if (busyNow) busySay++; else { idleSay++; assert.ok(B.LINES.ambient[a.type].includes(a.whisper), a.type + '：' + a.whisper); } } }
  assert.ok(idleSay >= 2 && busySay === 0, `閒著偶爾說話、忙的時候不說：${idleSay}/${busySay}`);
  const all = [...Object.entries(B.LINES).flatMap(([k, v]) => (Array.isArray(v) ? v : Object.values(v).flat()))];
  assert.ok(all.every((t) => !/我(?!們)|玩家|您/.test(t)), '自言自語也用「艾琳」「冒險者」');
  const mon = new Date(`${Y}-10-05T09:00:00`); while (mon.getDay() !== 1) mon.setDate(mon.getDate() + 1);
  const seenMon = new Set(); for (let r = 0; r < 20; r++) { const mm = B.newMemory(mon.getTime()); const a = B.decide({ now: mon.getTime() + 9000, idleSec: 30, enabled: true }, mm, () => r / 20); seenMon.add(a.whisper); }
  assert.ok([...seenMon].some((t) => B.LINES.monday.includes(t)), '星期一早上會說開門日的話');
  // 加班：下班時間過一小時後關心，45 分鐘一次
  now = new Date(`${Y}-10-02T18:00:00`).getTime();
  const m5 = B.newMemory(now - 3600000); m5.lastAt = 0; m5.lastBreak = now;
  assert.strictEqual(B.decide(ctx(), m5, rnd).type, 'overtime');
  sec(20 * 60); m5.lastAt = 0; m5.lastBreak = now; const o2 = B.decide(ctx(), m5, rnd); assert.ok(!o2 || o2.type !== 'overtime', '45 分鐘內不重複');
  const m6 = B.newMemory(now - 3600000); m6.lastAt = 0; m6.lastBreak = now; const o3 = B.decide(ctx({ wrap: '' }), m6, rnd);
  assert.ok(!o3 || o3.type !== 'overtime', '沒設下班時間就不算加班');
  console.log('待機小動作測試通過 ✔');
})();

// ---------- 漂浮表情符號：全部自己畫的 SVG、沒有系統 emoji、漸層 id 不撞 ----------
(() => {
  const E = require('../src/renderer/emotes');
  const B = require('../src/renderer/idle-brain');
  for (const k of E.KINDS) {
    const svg = E.svgOf(k);
    assert.ok(svg.startsWith('<svg') && svg.includes('class="emote-svg"'), k);
    assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(svg), k + '：不用 emoji');
    const ids = [...svg.matchAll(/id="(\w+)"/g)].map((m) => m[1]);
    for (const [, ref] of svg.matchAll(/url\(#(\w+)\)/g)) assert.ok(ids.includes(ref), `${k}：漸層 ${ref} 要在同一張 SVG 裡`);
    assert.ok(/class="em-(float|pop|twinkle|sink|slide|rise|zz)"/.test(svg), k + '：有動畫');
  }
  const a = E.svgOf('notes'), b = E.svgOf('notes');
  assert.notStrictEqual([...a.matchAll(/id="(\w+)"/g)][0][1], [...b.matchAll(/id="(\w+)"/g)][0][1], '每張的漸層 id 不一樣（同名會互相蓋掉）');
  assert.strictEqual(E.svgOf('nope'), '');
  // idle-brain 給的表情名稱都畫得出來
  for (const [k, v] of Object.entries(B.AMBIENT)) if (v.emote) assert.ok(E.KINDS.includes(v.emote), `${k} → ${v.emote}`);
  const Y = new Date().getFullYear();
  const mem = B.newMemory(new Date(`${Y}-10-02T15:05:00`).getTime());
  const tea = B.decide({ now: new Date(`${Y}-10-02T15:05:00`).getTime() + 9000, idleSec: 30, enabled: true }, mem, () => 0.5);
  assert.ok(tea && tea.type === 'tea' && tea.emote === 'steam' && !tea.balloon, '奶茶：杯口冒熱氣，沒有舊的泡泡');
  console.log('漂浮表情符號測試通過 ✔');
})();

// ---------- 📒 小本子：只記冒險者親口說的事、會追問後續、記得重要的日子 ----------
(() => {
  const M = require('../src/main/memory');
  const now = new Date('2026-10-06T10:00:00'); // 週二
  const ex = (s) => M.extractRules(s, now).map((n) => `${n.kind}:${n.text}${n.date ? '@' + n.date : ''}${n.self ? '(自己)' : ''}`);
  // 規則：喜好、日子、最近的事、工作、生活
  assert.deepStrictEqual(ex('我超喜歡無糖綠茶'), ['like:喜歡無糖綠茶']);
  assert.deepStrictEqual(ex('我不太喜歡加班'), ['like:不喜歡加班'], '「不太喜歡」不是喜歡');
  assert.deepStrictEqual(ex('10/15 要上台發表'), ['date:上台發表@2026-10-15']);
  assert.deepStrictEqual(ex('下週三口試'), ['date:口試@2026-10-14'], '「下週三」換成日期');
  assert.deepStrictEqual(ex('我的生日是10/8'), ['date:生日@10-08(自己)']);
  assert.deepStrictEqual(ex('我媽的生日是 3/12'), ['date:媽媽的生日@03-12']);
  assert.deepStrictEqual(ex('這週簡報好趕，壓力好大'), ['event:這週簡報好趕，壓力好大'], '同一句的心情合成一件事');
  assert.deepStrictEqual(ex('我昨天跟朋友吵架'), ['event:跟朋友吵架'], '「昨天」拿掉（之後追問時就不是昨天了）');
  assert.deepStrictEqual(ex('我最近在忙新品上市的企劃'), ['work:在忙新品上市的企劃']);
  assert.deepStrictEqual(ex('我週末都去爬山'), ['life:週末常爬山']);
  assert.strictEqual(M.extractRules('我考上研究所了！', now)[0].mood, 'good');
  // 不記：說艾琳的、問句、任務回報、太模糊的
  for (const s of ['我喜歡你', '你喜歡什麼？', '艾琳喜歡吃魚嗎', '報告寫完了', '我喜歡這個', '我好累']) assert.deepStrictEqual(ex(s), [], s);
  // AI 寫的筆記：冒險者沒說過的、說艾琳的、沒根據的日子都丟掉；最多 2 則
  const said = '我週末去看了海，好開心，下週五要去面試';
  const ai = M.guardAI([
    { kind: 'event', text: '週末去看海' }, { kind: 'like', text: '喜歡貓咪和咖啡' }, { kind: 'like', text: '喜歡艾琳' },
    { kind: 'date', text: '面試', date: '2026-10-16' }, { kind: 'nope', text: '看海' },
  ], said, now);
  assert.deepStrictEqual(ai.map((n) => n.text), ['週末去看海', '面試'], '只留冒險者親口說的');
  assert.deepStrictEqual(M.guardAI([{ kind: 'date', text: '面試', date: '2026-10-16' }], '我要去面試', now), [], '沒說日期就不記日子');
  assert.deepStrictEqual(M.guardAI('亂寫', said, now), []);
  // 小本子：同一件事更新、喜歡↔不喜歡互相蓋掉、記太多先丟舊的
  const nb = M.blank();
  M.add(nb, M.extractRules('我超喜歡香菜', now), now);
  const r1 = M.add(nb, M.extractRules('我討厭香菜', now), now);
  assert.ok(nb.items.length === 1 && nb.items[0].text === '討厭香菜' && r1.updated.length === 1, '改口：新的蓋掉舊的');
  assert.strictEqual(M.add(nb, M.extractRules('我討厭香菜', now), now).updated.length, 0, '一樣的話不重記');
  const big = M.blank();
  M.add(big, [{ kind: 'date', text: '生日', date: '10-08', yearly: true, self: true }], new Date('2026-01-01'));
  ['草莓', '拉麵', '爵士樂', '桌遊', '海邊', '烏龍茶'].forEach((x, i) => M.add(big, [{ kind: 'like', text: `喜歡${x}` }], new Date(now.getTime() + i * 1000), { max: 4 }));
  assert.ok(big.items.length === 4 && big.items.some((x) => x.self) && !big.items.some((x) => x.text === '喜歡草莓'), '超過上限：丟最舊的，生日留著');
  // 追問：隔天以後才問、問過不再問；工作每 3 天問一次
  const fu = M.blank(); const D = 86400000;
  M.add(fu, M.extractRules('這週簡報好趕，壓力好大', now), now);
  M.add(fu, M.extractRules('我最近在忙新品上市的企劃', now), now);
  assert.strictEqual(M.dueFollowUp(fu, new Date(now.getTime() + 3600000)), null, '剛說完不問');
  const e1 = M.dueFollowUp(fu, new Date(now.getTime() + D));
  assert.ok(e1 && e1.kind === 'event', '隔天先問最近的事');
  e1.followed = now.getTime() + D;
  assert.strictEqual(M.dueFollowUp(fu, new Date(now.getTime() + 2 * D)), null, '問過了；工作還沒到 3 天');
  assert.strictEqual(M.dueFollowUp(fu, new Date(now.getTime() + 3 * D)).kind, 'work', '3 天後問工作進度');
  assert.strictEqual(M.dueFollowUp(fu, new Date(now.getTime() + 40 * D)), null, '太久以前的就不問了');
  // 重要的日子：前一天提醒、當天說；每年的照月日
  const dd = M.blank();
  M.add(dd, [...M.extractRules('10/15 要上台發表', now), ...M.extractRules('我的生日是10/8', now)], now);
  const at = (s) => M.dueDates(dd, new Date(s)).map((x) => `${x.when}:${x.item.text}`);
  assert.deepStrictEqual(at('2026-10-07T09:00:00'), [], '前一天的生日不提（每年的只在當天）');
  assert.deepStrictEqual(at('2026-10-08T09:00:00'), ['today:生日']);
  assert.deepStrictEqual(at('2026-10-14T09:00:00'), ['eve:上台發表']);
  assert.deepStrictEqual(at('2027-10-08T09:00:00'), ['today:生日'], '明年也記得');
  dd.items.find((x) => x.self).saidOn = '2026-10-08';
  assert.deepStrictEqual(at('2026-10-08T15:00:00'), [], '同一天只說一次');
  // 聊天時給 AI 的筆記：有關的才給；問「你記得嗎」就多給
  const rel = M.blank();
  M.add(rel, [...M.extractRules('我超喜歡無糖綠茶', now), ...M.extractRules('我家養了一隻貓叫麻糬', now)], now);
  assert.deepStrictEqual(M.relevant(rel, '今天喝了無糖綠茶', now).map((x) => x.text), ['喜歡無糖綠茶']);
  assert.strictEqual(M.relevant(rel, '你還記得我說過什麼嗎', now).length, 2);
  assert.ok(/【小本子】/.test(M.contextText(M.relevant(rel, '無糖綠茶', now), now)) && M.contextText([], now) === '');
  console.log('小本子規則測試通過 ✔');
})();

(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const { TEMPLATES } = require('../src/main/npc');
  const loreFile = path.join(__dirname, '..', 'lore', '艾琳.md');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-nb-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false, baseUrl: 'http://x' }, lore: { path: loreFile, embeddings: false }, window: { idleChatterMinutes: 30 } }));
  const Y = new Date().getFullYear();
  let t = new Date(`${Y}-10-06T10:00:00`).getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  const M_iso = require('../src/main/memory').iso;
  const tplOf = (k) => TEMPLATES[k].map(([x]) => x.replace(/\{self\}/g, '艾琳').replace(/\{call\}/g, '冒險者'));
  const fills = (k, text) => tplOf(k).some((x) => new RegExp('^' + x.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.*') + '$').test(text));
  // 離線聊天也會記；回傳 noted 給畫面跳提示
  const c1 = await E.chat('我超喜歡無糖綠茶');
  assert.deepStrictEqual(c1.noted, ['喜歡無糖綠茶']);
  const c2 = await E.chat('我的生日是10/8');
  assert.deepStrictEqual(c2.noted, ['10/8 生日']);
  assert.ok(fills('note_taken', c2.lines[0].text) && /10\/8 生日/.test(c2.lines[0].text), '說自己生日：不接成艾琳的生日，說記下來了：' + c2.lines[0].text);
  await E.chat('這週簡報好趕，壓力好大');
  const c3 = await E.chat('你喜歡什麼？');
  assert.deepStrictEqual(c3.noted, [], '問句不記');
  assert.strictEqual(E.notebookView().count, 3);
  // 偷看：熟了比較害羞；劃掉、全部劃掉
  const pk = E.peekNotebook();
  assert.ok(pk.notebook.groups.length === 3 && pk.notebook.enabled && pk.notebook.sketch === 0 && fills('notebook_peek', pk.lines[0].text));
  assert.strictEqual(E.peekNotebook(true).lines.length, 0, '安靜更新不說話');
  E.aff().points = 120; E.aff().stage = 3;
  const pk3 = E.peekNotebook();
  assert.ok(fills('notebook_peek_close', pk3.lines[0].text) && pk3.notebook.sketch === 1, '第 3 階：害羞、最後一頁有貼紙蓋住的畫');
  E.aff().points = 40; E.aff().stage = 2;
  // 主動追問（第 2 階以上）：隔天問「最近的事」，AI 關掉時用內建台詞
  t += 86400000; E.rand = () => 0.1; E.touch(); t += 30 * 60000;
  const p1 = await E.proactive({});
  assert.ok(p1 && p1.kind === 'topic' && p1.lines[0].topic === '小本子' && /簡報好趕/.test(p1.lines[0].text) && fills('followup', p1.lines[0].text), '隔天關心簡報：' + (p1 && p1.lines[0].text));
  assert.ok(E.state.notebook.items.find((x) => x.kind === 'event').followed, '問過了');
  // 回她的關心：AI 知道在聊小本子上的事
  E.config.llm.enabled = true; E.npc.llm.enabled = true; E.npc.status.online = true;
  const sent = [];
  let reply = { line: '太好了～', emotion: 'happy', actions: [], notes: [{ kind: 'event', text: '簡報順利講完了' }, { kind: 'like', text: '喜歡吃拉麵' }] };
  E.npc.fetchJSON = async (_p, body) => { sent.push(body); return { message: { content: JSON.stringify(reply) } }; };
  t += 60000;
  const c4 = await E.chat('簡報順利講完了，超開心');
  const req = sent[sent.length - 1];
  assert.ok(/【話題】剛才是你主動關心冒險者之前說的「這週簡報好趕/.test(req.messages[0].content), '告訴 AI 剛剛在關心哪件事');
  assert.ok(/【小本子】冒險者在「這句話」裡/.test(req.messages[0].content) && req.format.properties.notes, 'AI 可以記筆記');
  assert.deepStrictEqual(c4.noted, ['簡報順利講完了'], 'AI 記的：冒險者說過的才留（拉麵沒說過）');
  // AI 看得到有關的筆記
  reply = { line: '嗯嗯', emotion: 'normal', actions: [] };
  await E.chat('等等去買無糖綠茶');
  assert.ok(/【小本子】艾琳記得冒險者說過：喜歡無糖綠茶/.test(sent[sent.length - 1].messages.map((m) => m.content).join('\n')), '聊到綠茶：給 AI 看小本子');
  E.config.llm.enabled = false; E.npc.llm.enabled = false;
  // 重要的日子：生日當天打招呼時祝福＋送金幣（一年一次），前一天提醒一次性的事
  t = new Date(`${Y}-10-08T09:00:00`).getTime();
  const g0 = E.state.player.gold;
  const g = await E.greet();
  const bd = g.lines.find((l) => l.event === 'note');
  assert.ok(bd && fills('date_birthday', bd.text) && /20/.test(bd.text) && E.state.player.gold === g0 + 20, '生日：祝福＋20 金幣');
  t += 3600000; E.touch(); t += 120000;
  assert.notStrictEqual(E.proactiveDue({}), 'note', '同一天不再說');
  E.state.notebook.items.find((x) => x.self).saidOn = '';
  const again = await E.noteDateLines();
  assert.ok(fills('date_birthday_again', again[0].text) && E.state.player.gold === g0 + 20, '同一年不再送金幣');
  await E.chat('10/15 要上台發表');
  t = new Date(`${Y}-10-14T13:00:00`).getTime(); E.touch(); t += 120000;
  assert.strictEqual(E.proactiveDue({}), 'note', '前一天：不用等間隔就提醒');
  const ev = await E.proactive({});
  assert.ok(ev.kind === 'note' && fills('date_eve', ev.lines[0].text) && /上台發表/.test(ev.lines[0].text) && ev.lines[0].ambient);
  t += 120000; assert.notStrictEqual(E.proactiveDue({}), 'note', '提醒過了');
  // 劃掉、全部劃掉、關掉
  const id = E.notebookView().groups[0].items[0].id;
  const n0 = E.notebookView().count;
  const fg = E.forgetNote(id);
  assert.ok(fg.notebook.count === n0 - 1 && fills('notebook_forget', fg.lines[0].text));
  assert.throws(() => E.forgetNote(id), /不在小本子上/);
  const cl = E.clearNotebook();
  assert.ok(cl.notebook.count === 0 && fills('notebook_clear', cl.lines[0].text));
  const off = E.setNotebook(false);
  assert.ok(!off.notebook.enabled && fills('notebook_off', off.lines[0].text) && E.view().notebook.enabled === false);
  assert.deepStrictEqual((await E.chat('我超喜歡貓')).noted, [], '關掉就不記');
  E.state.notebook.items.push({ id: 'n99', kind: 'date', text: '生日', date: M_iso(E.now()).slice(5), yearly: true, self: true, at: t, updatedAt: t });
  E.touch(); t += 120000;
  assert.ok(E.proactiveDue({}) !== 'note' && (await E.noteDateLines()).length === 0, '收起來時不提日子');
  E.state.notebook.items.pop();
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).notebook.enabled === false, '設定存起來');
  E.setNotebook(true);
  assert.deepStrictEqual((await E.chat('我超喜歡貓')).noted, ['喜歡貓']);
  // 罵人的那句不記
  t += 5 * 60000;
  const rude = await E.chat('我討厭香菜，你這個白癡');
  assert.ok(rude.noted.length === 0 && rude.lines[0].emotion === 'disdain', '罵人的那句不記');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('小本子測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 📖 冒險日誌＋工作週報：專案分類、稱號、最後一天交日誌、評語、匯出、翻上一週 ----------
(() => {
  const P = require('../src/main/planParser');
  const J = require('../src/main/journal');
  // 專案：任務標題的 #標籤、外層的分組標題、分組標題的 #標籤；附帶任務這種分類名稱不算專案；#12 不是標籤
  const pl = P.parsePlan(`# 計畫 10/5–10/9\n## 新品上架 ⭐ 📅 10/6 #秋季新品\n- [ ] a\n\n## 收銀系統\n### 修 P-12 🔧\n- [ ] 修好 #12 的問題\n\n- [ ] 單行任務\n\n## 附帶任務 🌿\n- [ ] 照片\n\n## 會議 #店務\n- [ ] 準備提問\n\n## 週二 10/6\n- 09:00–10:00 x\n`);
  assert.deepStrictEqual(pl.quests.map((q) => [q.title, q.project]), [['新品上架', '秋季新品'], ['修 P-12', '收銀系統'], ['單行任務', '收銀系統'], ['附帶任務', null], ['準備提問', '店務']]);
  assert.strictEqual(pl.quests[1].objectives[0].text, '修好 #12 的問題', '#12 不是標籤');
  // 表單改專案：自己的標籤換掉；外層分組給的專案沒改就不加標籤；保留 ### 層級
  const src = `# 計畫\n## 收銀系統\n### 修 P-12 🔧 📅 10/7\n- [ ] x\n## 新品上架 ⭐ #秋季新品\n- [ ] y\n`;
  const p0 = P.parsePlan(src);
  assert.strictEqual(P.editQuest(src, p0.quests[0].id, { title: '修 P-12！', project: '收銀系統' }).split('\n')[2], '### 修 P-12！ 🔧 📅 10/7');
  assert.strictEqual(P.editQuest(src, p0.quests[0].id, { project: '收銀改版' }).split('\n')[2], '### 修 P-12 🔧 📅 10/7 #收銀改版');
  assert.strictEqual(P.editQuest(src, p0.quests[1].id, { project: '' }).split('\n')[4], '## 新品上架 ⭐');
  assert.strictEqual(P.editQuest(src, p0.quests[1].id, { tier: 'side' }).split('\n')[4], '## 新品上架 🌿 #秋季新品', '沒改專案就留著標籤');
  assert.strictEqual(P.parsePlan(P.addQuest(src, { title: '新任務', project: '秋季 新品' })).quests.find((q) => q.title === '新任務').project, '秋季_新品');
  assert.strictEqual(J.shortTitle('本週工作計畫 9/28–10/2｜秋季新品上市'), '本週工作計畫｜秋季新品上市');
  // 稱號：照順序取第一個；完美的一週就不另外列委託全制霸、準時之星
  const base = { quests: 0, questsTotal: 4, questsDone: 0, onTime: 0, late: 0, objectives: 0, rows: 0, reports: 0, days: 5, focus: 0, focusMin: 0, levelStart: 2, levelEnd: 2 };
  const ids = (s) => J.badges({ ...base, ...s }).map((b) => b.id);
  assert.deepStrictEqual(ids({}), ['rest']);
  assert.deepStrictEqual(ids({ objectives: 3 }), ['steady']);
  assert.deepStrictEqual(ids({ quests: 4, questsDone: 4, onTime: 4, objectives: 12, focus: 9, levelEnd: 3 }), ['perfect', 'levelup', 'focus', 'grinder']);
  assert.deepStrictEqual(ids({ quests: 4, questsDone: 4, onTime: 3, late: 1, objectives: 5 }), ['allclear']);
  assert.deepStrictEqual(ids({ quests: 2, questsDone: 2, onTime: 2, objectives: 4, reports: 5 }), ['ontime', 'reporter']);
  // 週報草稿：專案 → Done／On-progress／Pending；做一半的任務拆兩邊；最後一天的卡點掛到認得的任務，認不出的放「其他」
  const snap = {
    quests: [
      { id: 'a', title: '新品上架', project: '秋季新品', status: 'done', objectives: [{ text: '標示完成', done: true }, { text: '申請送出', done: true }] },
      { id: 'b', title: '成本試算表', project: null, status: 'progress', objectives: [{ text: '一鍵算出成本', done: true }, { text: '報價到了之後比對', done: false }] },
      { id: 'c', title: '收銀 `P-12`', project: '收銀系統', status: 'pending', objectives: [{ text: '修 P-12', done: false, implicit: true }] },
      { id: 'd', title: '照片上傳', project: '秋季新品', status: 'pending', objectives: [{ text: '照片上傳', done: false, implicit: true }] },
    ],
    daily: [{ date: '2026-10-08', blocker: '舊的卡點' }, { date: '2026-10-09', blocker: '報價還沒到；印表機壞了' }],
  };
  const txt = J.reportText(snap);
  assert.strictEqual(txt, [
    '[秋季新品]', '[Done]', '- 新品上架', '  - 標示完成', '  - 申請送出', '[On-progress]', '- （無）', '[Pending]', '- 照片上傳', '',
    '[收銀系統]', '[Done]', '- （無）', '[On-progress]', '- （無）', '[Pending]', '- 收銀 P-12', '',
    '[其他]', '[Done]', '- 成本試算表', '  - 一鍵算出成本', '[On-progress]', '- 成本試算表', '  - 報價到了之後比對', '  - 卡點：報價還沒到', '[Pending]', '- 卡點：印表機壞了',
  ].join('\n'));
  assert.ok(/^\[秋季新品\]\n\[完成\]/.test(J.reportText(snap, { done: '完成' })), '標籤可以改');
  console.log('週報規則測試通過 ✔');
})();

(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const { TEMPLATES } = require('../src/main/npc');
  const loreFile = path.join(__dirname, '..', 'lore', '艾琳.md');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-journal-'));
  const md = fs.readFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), 'utf8').replace('## 新品標示 + 上架申請 ⭐ 📅 9/29', '## 新品標示 + 上架申請 ⭐ 📅 9/29 #秋季新品');
  fs.writeFileSync(path.join(dir, 'plan.md'), md);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false, baseUrl: 'http://x' }, lore: { path: loreFile, embeddings: false } }));
  const Y = new Date().getFullYear();
  let t = new Date(`${Y}-09-29T10:00:00`).getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  const tplOf = (k) => TEMPLATES[k].map(([x]) => x);
  const q = E.plan.quests[0];
  for (let i = 0; i < q.objectives.length; i++) await E.setObjective(q.id, i, true);
  await E.submit(q.id);
  assert.ok(E.state.history.every((h) => h.at.startsWith(`${Y}-09-29`)), '紀錄的時間用引擎的時鐘');
  // 存檔時日誌跟著更新
  const w0 = E.weeks()[E.currentWeekKey()];
  assert.ok(w0 && w0.label === '9/28–10/2' && w0.stats.quests === 1 && w0.stats.objectives === 3 && w0.stats.xp > 0 && w0.name === '本週工作計畫｜秋季新品上市');
  // 不是最後一天：不交日誌
  t = new Date(`${Y}-10-01T17:30:00`).getTime();
  assert.strictEqual((await E.dailyReport({ done: '試吃會', blocker: '', next: '' })).journal, null);
  // 最後一天（時間表的最後一天 10/2）：交日誌，一週一次
  t = new Date(`${Y}-10-02T17:30:00`).getTime();
  const fri = await E.dailyReport({ done: '回歸測試', blocker: '報價還沒到', next: '下週更新成本' });
  assert.strictEqual(fri.journal, w0.key);
  assert.ok(fri.lines.some((l) => l.event === 'journal_ready' && tplOf('journal_ready').includes(l.text.replace(/艾琳/g, '{self}').replace(/冒險者/g, '{call}'))), '說日誌整理好了');
  assert.strictEqual((await E.dailyReport({ done: '補一句', blocker: '報價還沒到', next: '' })).journal, null, '同一週只交一次');
  // 評語：離線照稱號拼內建句子；數字沒變就不重寫
  const c1 = await E.journalComment(fri.journal);
  const wk = c1.journal.week;
  assert.ok(wk.comment && wk.commentSource === 'template' && !wk.stale && /下週/.test(wk.comment), '離線評語：' + wk.comment);
  assert.ok(!/[我]/.test(wk.comment.replace(/我們/g, '')) && !/玩家|您/.test(wk.comment), '評語的口吻');
  assert.ok(/^\[秋季新品\]\n\[Done\]\n- 新品標示 \+ 上架申請/.test(wk.report) && /\[其他\]/.test(wk.report) && /卡點：報價還沒到/.test(wk.report));
  const again = await E.journalComment(fri.journal);
  assert.strictEqual(again.journal.week.commentAt, wk.commentAt, '沒變就不重寫');
  await E.setObjective(E.plan.quests[3].id, 0, true);
  assert.ok(E.journalView(fri.journal).week.stale, '又完成目標 → 提示可以重寫');
  // AI 開著：照【本週】寫；太短或失敗就用內建
  E.config.llm.enabled = true; E.npc.llm.enabled = true; E.npc.status.online = true;
  let sent = null;
  E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify({ line: '這週冒險者把新品標示整整齊齊地交出去了，艾琳看了好開心！成本試算表還差一點，下週一起把它完成吧。', emotion: 'happy' }) } }; };
  const c2 = await E.journalComment(fri.journal, true);
  const req = sent.messages.map((m) => m.content).join('\n');
  assert.ok(/【本週】9\/28–10\/2；交付任務 1\/6/.test(req) && /【情境】你在冒險日誌上/.test(req) && !/【當前任務】/.test(req), 'AI 拿到這週的摘要');
  assert.ok(c2.journal.week.commentSource === 'llm' && /新品標示/.test(c2.journal.week.comment));
  E.config.llm.enabled = false; E.npc.llm.enabled = false;
  // 匯出：data/週報/ 底下
  const ex = E.journalExport(fri.journal);
  assert.ok(ex.path.startsWith(path.join(dir, 'data', '週報')) && /# 冒險日誌 9\/28–10\/2｜本週工作計畫｜秋季新品上市/.test(fs.readFileSync(ex.path, 'utf8')));
  // 換下一週的計畫：上一週的日誌（評語）還在，可以翻
  fs.writeFileSync(path.join(dir, 'plan.md'), '# 本週計畫 10/5–10/9\n\n## 新任務 ⭐ 📅 10/6 #店務\n- [ ] a\n');
  t = new Date(`${Y}-10-05T09:00:00`).getTime();
  E.loadPlan();
  const v = E.journalView();
  assert.ok(v.week.label === '10/5–10/9' && v.prev === fri.journal && !v.next && v.list.length === 2);
  const old = E.journalView(v.prev);
  assert.ok(old.week.comment === c2.journal.week.comment && old.next === v.current, '上一週還在');
  assert.deepStrictEqual(E.view().projects.sort(), ['店務', '秋季新品'].sort(), '新任務表單的專案選項');
  // 打開日誌時她說一句；quiet 不說
  assert.ok(E.journalOpen(null).lines.length === 1 && E.journalOpen(null, true).lines.length === 0);
  // 最多留 keep 週
  E.config.journal = { keep: 1 };
  E.saveState();
  assert.strictEqual(J_list(E).length, 1, '超過上限丟最舊的');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('冒險日誌測試通過 ✔');
  function J_list(e) { return require('../src/main/journal').list(e.state); }
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🛒 雲朵雜貨舖、🌌 星座卡、🏅 成就、🔥 連續上工：規則 ----------
(() => {
  const C = require('../src/main/cards');
  const AC = require('../src/main/achievements');
  const S = require('../src/main/shop');
  const G2 = require('../src/main/game');
  const Art = require('../src/renderer/art');
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // 稀有度：大概照權重；十抽最後一張保底 ★★★；50 抽沒出 ★★★★ 下一張一定是
  const n = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < 20000; i++) n[C.rollRarity(rnd)]++;
  assert.ok(n[1] > 11500 && n[1] < 13300 && n[4] > 150 && n[4] < 460, '權重：' + JSON.stringify(n));
  for (let k = 0; k < 30; k++) { const col = C.blank(); assert.ok(C.draw(col, 10, rnd).some((x) => x.card.r >= 3), '十抽保底'); }
  const pc = C.blank(); pc.sinceTop = C.PITY - 1;
  assert.strictEqual(C.draw(pc, 1, () => 0.01)[0].card.r, 4, '50 抽保底');
  assert.strictEqual(pc.sinceTop, 0);
  // 重複的換星屑；星屑換還沒有的卡
  const col = C.blank();
  const a = C.draw(col, 1, () => 0.01)[0]; const b = C.draw(col, 1, () => 0.01)[0];
  assert.ok(a.isNew && !b.isNew && b.dust === C.RARITY[1].dust && col.dust === C.RARITY[1].dust);
  assert.throws(() => C.exchange(col, a.card.id), /已經有了/);
  assert.throws(() => C.exchange(col, 'meteor'), /星屑不夠/);
  col.dust = 400; C.exchange(col, 'meteor');
  assert.ok(col.cards.meteor === 1 && col.dust === 100 && C.view(col).owned === 2);
  assert.strictEqual(new Set(C.CARDS.map((c) => c.id)).size, C.CARDS.length, '卡片 id 不重複');
  // 成就：只送一次；hidden 的達成前看不到
  const got = {};
  const ctx = { objectives: 1, quests: 0, onTime: 0, onTimeStreak: 0, focus: 0, reports: 0, weeks: 0, level: 1, streakBest: 0, daikichi: 0, divinations: 0, gifts: 0, giftKinds: 0, giftKindsTotal: 8, cucumber: 0, ornaments: 0, themed: 0, cards: 0, cards1: 0, cards1Total: 10, ssr: 0, cardsTotal: 24, notes: 0, stage: 1 };
  assert.deepStrictEqual(AC.check(got, ctx).map((x) => x.id), ['obj1']);
  assert.deepStrictEqual(AC.check(got, ctx), [], '同一個不會再送');
  const vw = AC.view(got, { ...ctx, quests: 4 });
  assert.ok(vw.find((x) => x.id === 'obj1').got && vw.find((x) => x.id === 'cucumber').name === '？？？' && vw.find((x) => x.id === 'quest10').progress.n === 4);
  assert.strictEqual(new Set(AC.ACH.map((x) => x.id)).size, AC.ACH.length);
  // 連續上工：週末不算斷、平日沒上工就斷、計畫裡沒排的平日（放假）不算斷、同一天只打卡一次
  const st = AC.blankStreak();
  assert.strictEqual(AC.checkIn(st, '2026-10-01').cur, 1); // 週四
  assert.strictEqual(AC.checkIn(st, '2026-10-01'), null, '同一天');
  assert.strictEqual(AC.checkIn(st, '2026-10-02').cur, 2);
  const mon = AC.checkIn(st, '2026-10-05'); // 週末跳過
  assert.ok(mon.cur === 3 && mon.kept && mon.milestone === AC.STREAK.milestones[3] && mon.gold === AC.STREAK.base + 3);
  assert.strictEqual(AC.current(st, '2026-10-07'), 0, '週二沒上工：週三看是 0');
  assert.strictEqual(AC.checkIn(st, '2026-10-07').cur, 1, '斷了重來');
  const plan = { weekStart: '2026-10-05', weekEnd: '2026-10-09', days: [{ date: '2026-10-05' }, { date: '2026-10-07' }, { date: '2026-10-08' }] };
  const st2 = { cur: 4, best: 4, last: '2026-10-05', days: 4 };
  assert.ok(AC.isRest('2026-10-06', { plan }) && !AC.isRest('2026-10-07', { plan }) && AC.isRest('2026-10-10'));
  assert.strictEqual(AC.checkIn(st2, '2026-10-07', { plan }).cur, 5, '計畫裡沒排的平日（放假）不算斷');
  // 給獎勵時順便記次數（成就用）
  const s0 = G2.newState();
  for (const r of ['完成目標：a', '交付任務：b（準時）', '交付任務：c', '2026-10-01 下班回報', '完成專注 25 分鐘（今天第 1 顆🍅）', '今日運勢：大吉', '占卜魔法：乾', '雜貨舖：小魚乾', '成就：第一步']) G2.grant(s0, { xp: 1, gold: 1 }, r);
  assert.deepStrictEqual(s0.stats, { objectives: 1, quests: 2, onTime: 1, reports: 1, focus: 1, fortunes: 1, daikichi: 1, divinations: 1 });
  // 圖：每一種都畫得出來、漸層 id 不撞、同一張卡每次一樣
  // AI 畫的圖：每個商品和兩位店員都有 PNG、檔案真的在、打包會帶進去；SVG 備用圖也都畫得出來
  const fs2 = require('fs'), path2 = require('path');
  for (const x of [...S.ORNAMENTS, ...S.GIFTS, { id: 'mian' }, { id: 'duo' }]) {
    assert.ok(Art.PNG.has(x.id), x.id + ' 有 PNG');
    assert.ok(fs2.existsSync(path2.join(__dirname, '..', 'assets', 'shop', x.id + '.png')), `assets/shop/${x.id}.png`);
  }
  for (const o of S.ORNAMENTS) assert.ok(Art.ornament(o.id).startsWith(`<img class="art ${o.slot} ${o.id}" src="../../assets/shop/${o.id}.png"`) && Art.svg[o.slot](o.id).startsWith('<svg'), o.id);
  for (const g of S.GIFTS) assert.ok(Art.gift(g.id).includes(`assets/shop/${g.id}.png`) && Art.svg.gift(g.id).startsWith('<svg'), g.id);
  assert.ok(/class="art tw duo on"/.test(Art.twins('duo')) && /class="art tw mian "/.test(Art.twins('duo')) && /class="art tw mian on"/.test(Art.twins('mian')), '說話的店員亮起來');
  assert.ok(require('../package.json').build.files.includes('assets/shop/*.png'), '打包帶上雜貨舖的圖');
  for (const c of C.CARDS) assert.strictEqual(Art.constellation(c.id, c.n).length, c.n, c.id + ' 的星星數');
  assert.deepStrictEqual(Art.constellation('greatbell', 8), Art.constellation('greatbell', 8), '同一張卡每次一樣');
  const x1 = Art.svg.gift('tea'), x2 = Art.svg.gift('tea');
  assert.notStrictEqual(x1.match(/id="(\w+)"/)[1], x2.match(/id="(\w+)"/)[1], '漸層 id 每張不同');
  for (const [, ref] of Art.svg.hang('bell').matchAll(/url\(#(\w+)\)/g)) assert.ok(Art.svg.hang('bell').includes(`id="${ref.replace(/_\d+$/, '')}`), ref);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(Art.svg.desk('pigeon') + Art.svg.twins('duo') + Art.card(C.CARDS[0])), '圖裡沒有 emoji');
  console.log('雜貨舖規則測試通過 ✔');
})();

(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const { TEMPLATES } = require('../src/main/npc');
  const loreFile = path.join(__dirname, '..', 'lore', '艾琳.md');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-shop-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false, baseUrl: 'http://x' }, lore: { path: loreFile, embeddings: false } }));
  // 舊存檔（沒有 stats）：第一次打開從還留著的紀錄補算
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'save.json'), JSON.stringify({ version: 1, player: { xp: 500, gold: 40, questsDone: 3, onTimeStreak: 1 }, plans: { 舊計畫: { submitted: { a: { onTime: true }, b: { onTime: false } }, awardedObjectives: { x: true, y: true, z: true }, dailyDone: { r1: true }, dailyReported: { '2026-09-01': true } } }, history: [{ at: '2026-09-01T10:00:00Z', reason: '完成專注 25 分鐘', xp: 15, gold: 3 }, { at: '2026-09-01T09:00:00Z', reason: '今日運勢：大吉', xp: 10, gold: 12 }], memory: [], chat: [{ role: 'user', content: 'hi' }], onboarding: { done: true } }));
  const Y = new Date().getFullYear();
  let t = new Date(`${Y}-10-01T10:00:00`).getTime(); // 週四
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  assert.deepStrictEqual(E.state.stats, { objectives: 3, quests: 3, onTime: 1, rows: 1, reports: 1, focus: 1, fortunes: 1, daikichi: 1, divinations: 0 }, '補算舊存檔');
  let seed = 5; E.rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const fill = (k) => TEMPLATES[k].map(([x]) => x.replace(/\{self\}/g, '艾琳').replace(/\{call\}/g, '冒險者'));
  const like = (k, text) => fill(k).some((x) => new RegExp('^' + x.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.*') + '$').test(text));
  // 第一個動作：補發舊存檔已經達成的成就（第一步、準時交件、好運到），一次說一句
  const g0 = E.state.player.gold;
  const q = E.plan.quests[0];
  const r1 = await E.setObjective(q.id, 0, true);
  const ids = r1.achievements.map((a) => a.id);
  assert.ok(['obj1', 'ontime1', 'daikichi'].every((x) => ids.includes(x)), '補發：' + ids);
  assert.ok(r1.lines.some((l) => l.event === 'achievement' && like('achievement_many', l.text)));
  assert.ok(r1.streak && r1.streak.cur === 1 && r1.streak.gold === 3, '今天第一次上工');
  const achGold = r1.achievements.reduce((n, a) => n + a.gold, 0);
  assert.strictEqual(E.state.player.gold - g0, 5 + 3 + achGold, '目標 5＋打卡 3＋成就');
  assert.strictEqual((await E.setObjective(q.id, 1, true)).streak, undefined, '同一天只打卡一次');
  // 連續上工：週五、（週末）、週一
  t = new Date(`${Y}-10-02T10:00:00`).getTime(); await E.setObjective(q.id, 2, true);
  t = new Date(`${Y}-10-05T10:00:00`).getTime();
  const mon = await E.submit(q.id);
  assert.ok(mon.streak.cur === 3 && mon.streak.milestone === 10 && mon.lines.some((l) => l.event === 'streak' && like('streak_milestone', l.text)), '第 3 天的獎勵');
  assert.strictEqual(E.view().streak, 3);
  // 雜貨舖：錢不夠不扣錢、雙胞胎說話
  E.state.player.gold = 10;
  const poor = await E.buyGift('seal');
  assert.ok(poor.poor && E.state.player.gold === 10 && /差|再來/.test(poor.shop.twins.text) && !E.state.shop.gifts.seal);
  // 送禮：一天第一份加好感（照喜歡的程度，不受每日上限），第二份不加；蠟封章說收藏變幾個
  E.state.player.gold = 5000;
  const a0 = E.aff().points; E.aff().gainedToday = 99;
  const tea = await E.buyGift('tea');
  assert.ok(E.aff().points === a0 + 3 && E.state.player.gold === 5000 - 25 + 10, '奶茶 +3 好感（成就一點心意 +10 金幣）');
  assert.ok(like('gift_tea_low', tea.lines[0].text) && tea.achievements.some((x) => x.id === 'gift1'));
  assert.strictEqual(E.state.history.find((h) => /^雜貨舖/.test(h.reason)).gold, -25, '花錢記在紀錄裡');
  const seal = await E.buyGift('seal');
  assert.ok(E.aff().points === a0 + 3 && E.state.shop.seals === 28 && /28/.test(seal.lines[0].text), '第二份不加好感；收藏第 28 個');
  const cuke = await E.buyGift('cucumber');
  assert.ok(like('gift_cucumber', cuke.lines[0].text) && cuke.achievements.some((x) => x.id === 'cucumber'), '黃瓜：嚇一跳＋隱藏成就');
  assert.ok(!cuke.lines.some((l) => l.emotion === 'disdain'), '黃瓜不會鄙視（不扣好感）');
  // 熟了（第 4 階）：反應不一樣
  t += 86400000; E.aff().points = 200; E.aff().stage = 4;
  assert.ok(like('gift_ribbon_high', (await E.buyGift('ribbon')).lines[0].text));
  // AI 開著：照【禮物】說
  E.config.llm.enabled = true; E.npc.llm.enabled = true; E.npc.status.online = true;
  let sent = null;
  E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify({ line: '藍鈴花！冒險者怎麼知道艾琳喜歡這個？', emotion: 'happy' }) } }; };
  const fl = await E.buyGift('flower');
  assert.ok(/【禮物】藍鈴花束/.test(sent.messages.map((m) => m.content).join('\n')) && fl.lines[0].text === '藍鈴花！冒險者怎麼知道艾琳喜歡這個？');
  E.config.llm.enabled = false; E.npc.llm.enabled = false;
  // 裝飾：買了直接換上；已經有的不再收錢；換主題算成就；不能放錯位置
  const bell = E.buyDecor('bell');
  assert.ok(E.view().decor.hang === 'bell' && like('decor_on', bell.lines[0].text) && bell.achievements.some((x) => x.id === 'decor1'));
  const gb = E.state.player.gold;
  assert.ok(/已經有了/.test(E.buyDecor('bell').shop.twins.text) && E.state.player.gold === gb);
  const th = E.buyDecor('forest');
  assert.ok(E.view().decor.theme === 'forest' && th.achievements.some((x) => x.id === 'theme1'));
  assert.throws(() => E.equip('desk', 'bell'), /放不上去/);
  assert.throws(() => E.equip('desk', 'piggy'), /還沒買/);
  E.equip('hang', null); E.equip('theme', null);
  assert.ok(E.view().decor.hang === null && E.view().decor.theme === 'navy', '拿下、換回預設');
  // 星座卡
  const gd = E.state.player.gold;
  const d10 = E.drawCards(10);
  assert.ok(d10.draw.length === 10 && d10.draw.some((x) => x.r >= 3) && E.state.player.gold <= gd - 270 + 200, '十抽 270');
  assert.ok(E.collectionView().cards.owned >= 1 && E.state.history.some((h) => h.reason === '雜貨舖：星座卡 ×10'));
  E.state.collection.dust = 999;
  const miss = E.collectionView().cards.cards.find((c) => !c.count);
  assert.strictEqual(E.exchangeCard(miss.id).card.id, miss.id);
  // 成就牆、關掉成就
  const cv = E.collectionView();
  assert.ok(cv.achievements.find((a) => a.id === 'cucumber').name === '惡作劇' && cv.streak.best === 3);
  E.config.achievements = { enabled: false };
  E.state.stats.focus = 999;
  assert.strictEqual((await E.setObjective(E.plan.quests[1].id, 0, true)).achievements, undefined, '關掉就不發');
  E.config.achievements = { enabled: true };
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('雜貨舖與成就測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🐰 棉棉和朵朵出場：下午茶外送、道賀（抽卡券）、許願單 ----------
(async () => {
  const TW = require('../src/main/twins');
  const G3 = require('../src/main/game');
  const d = (x) => new Date(x);
  const Y = new Date().getFullYear();
  // 規則：下午茶的時段、平日、一天一次
  const tw = TW.blank(1);
  assert.ok(TW.teaDue(tw, d(`${Y}-10-07T15:10:00`), { today: `${Y}-10-07`, weekdaysOnly: false }), '三點多');
  assert.ok(!TW.teaDue(tw, d(`${Y}-10-07T14:59:00`), { today: 'x' }) && !TW.teaDue(tw, d(`${Y}-10-07T17:00:00`), { today: 'x' }), '時段外不來');
  const sat = new Date(`${Y}-10-03T15:10:00`); while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1);
  assert.ok(!TW.teaDue(tw, sat, { today: 'x' }) && TW.teaDue(tw, sat, { today: 'x', weekdaysOnly: false }), '週末看作息設定');
  tw.teaDay = 'x'; assert.ok(!TW.teaDue(tw, d(`${Y}-10-07T15:30:00`), { today: 'x', weekdaysOnly: false }), '一天一次');
  // 台詞：每一組都填得滿、名字對；道賀的抽卡券一次最多 3 張
  for (const kind of ['tea', 'level', 'streak', 'allclear', 'many', 'wish', 'wishMany']) {
    for (let i = 0; i < TW.SCRIPTS[kind].length; i++) {
      const rnd = () => (i + 0.5) / TW.SCRIPTS[kind].length;
      const data = { level: 5, title: '銅牌冒險者', levels: 1, streak: kind === 'streak' || kind === 'many' ? 7 : 0, allclear: kind === 'allclear' || kind === 'many', items: kind === 'wishMany' ? [{ id: 'a', name: '紅緞帶', price: 90 }, { id: 'b', name: '小銀鈴', price: 150 }] : [{ id: 'a', name: '紅緞帶', price: 90 }] };
      if (kind === 'streak' || kind === 'allclear') data.levels = 0;
      const v = TW.build(['tea', 'wish'].includes(kind) ? kind : kind === 'wishMany' ? 'wish' : 'congrats', data, rnd);
      assert.ok(v.lines.length >= 2 && v.lines.every((l) => TW.NAMES[l.who] === l.name && l.text && !/\{\w+\}/.test(l.text)), kind + ' 台詞填滿：' + JSON.stringify(v.lines));
    }
  }
  assert.strictEqual(TW.build('congrats', { level: 9, levels: 3, streak: 30, allclear: true }, () => 0).tickets, 3, '一次最多 3 張');
  assert.strictEqual(TW.build('congrats', { streak: 30 }, () => 0).tickets, 2, '30 天 2 張');
  assert.deepStrictEqual(TW.mergeCongrats({ level: 3, title: 'a', levels: 1 }, { allclear: true }), { level: 3, title: 'a', levels: 1, streak: undefined, allclear: true });
  for (const who of ['mian', 'duo']) assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'shop', `${who}_bust.png`)), who + ' 的半身圖');
  for (const t of Object.values(TW.ERIN_TEA).flat()) assert.ok(!/玩家|您/.test(t) && !/(^|[^我])我(?!們)/.test(t), '艾琳的口吻：' + t);
  // 許願單：買得起時通知一次；錢變少再存夠會再說一次；擁有了就拿掉
  const w = { wish: ['ribbon', 'bell'], wishReady: {} };
  const price = (id) => ({ ribbon: { name: '紅緞帶', price: 90 }, bell: null }[id]);
  assert.deepStrictEqual(TW.wishCheck(w, 100, price).map((x) => x.id), ['ribbon']);
  assert.deepStrictEqual(w.wish, ['ribbon'], '擁有的裝飾自動拿掉');
  assert.strictEqual(TW.wishCheck(w, 100, price).length, 0, '同一件不重複說');
  TW.wishCheck(w, 10, price); assert.strictEqual(TW.wishCheck(w, 95, price).length, 1, '花掉又存夠了：再說一次');

  // 引擎：放進排隊、畫面有空時拿出來（抽卡券、好感在那時候給）
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-twins-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false, baseUrl: 'http://x' }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false }, reminders: { items: [] } }));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'save.json'), JSON.stringify({ version: 1, player: { xp: 500, gold: 40 }, history: [{ at: '2026-09-01T10:00:00Z', reason: 'x', xp: 1, gold: 1 }], onboarding: { done: true } }));
  const wed = new Date(`${Y}-10-07T15:05:00`); while (wed.getDay() !== 3) wed.setDate(wed.getDate() + 1);
  let t = wed.getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  let seed = 7; E.rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lv0 = G3.levelInfo(500, E.config.rewards.levelStep).level;
  assert.strictEqual(E.state.twins.level, lv0, '舊存檔從現在的等級開始，不補道賀');
  assert.strictEqual(E.view().twins.waiting, 0);
  await E.tick(); await E.tick();
  assert.strictEqual(E.view().twins.waiting, 1, '三點後排一次下午茶（不重複）');
  E.aff().gainedToday = 0; const a0 = E.aff().points;
  const tea = E.twinsTake();
  assert.ok(tea.visit.kind === 'tea' && tea.visit.lines.length >= 2 && tea.visit.erin && /艾琳|冒險者/.test(tea.visit.erin.text), '外送');
  assert.strictEqual(E.aff().points - a0, 2, '好感 +2');
  assert.strictEqual(E.twinsTake().visit, null, '拿完就沒了');
  // 到了 17:00 還沒演（例如一直在專注）：過期不來
  E.state.twins.teaDay = ''; t = wed.getTime() + 110 * 60000; await E.tick(); assert.strictEqual(E.view().twins.waiting, 1);
  t = wed.getTime() + 116 * 60000; await E.tick(); assert.strictEqual(E.view().twins.waiting, 0, '17:00 過期');
  t = wed.getTime() + 60000;
  // 升級＋整週完成：同一次道賀（抽卡券在演出時才給）
  G3.grant(E.state, { xp: 400, gold: 0 }, 'x', E.config.rewards, E.now());
  E.allClearPending = true; E.settle({ lines: [] });
  assert.strictEqual(E.view().twins.waiting, 1, '合成一次');
  const lv1 = G3.levelInfo(E.state.player.xp, E.config.rewards.levelStep).level;
  assert.ok(lv1 > lv0);
  const cg = E.twinsTake();
  assert.ok(cg.visit.kind === 'congrats' && cg.visit.tickets === Math.min(3, lv1 - lv0 + 1) && E.view().twins.tickets === cg.visit.tickets, '抽卡券 ' + cg.visit.tickets);
  assert.ok(cg.visit.actions.some((a) => a.id === 'draw'));
  // 抽卡券：不花金幣、一張抽一次；用完了雙胞胎會說
  const g0 = E.state.player.gold; const k0 = E.view().twins.tickets;
  const dr = E.drawCards(10, { ticket: true });
  assert.ok(dr.ticket && dr.draw.length === 1 && E.state.player.gold === g0 + (dr.achievements || []).reduce((n, a) => n + a.gold, 0) && E.view().twins.tickets === k0 - 1, '用券抽一張');
  E.state.collection.tickets = 0;
  const no = E.drawCards(1, { ticket: true });
  assert.ok(!no.draw && /用完/.test(no.shop.twins.text), '沒有券');
  // 許願單：留著 → 金幣夠了來說一次 → 買了就拿掉
  E.state.player.gold = 10;
  const ws = E.wishToggle('ribbon');
  assert.ok(ws.shop.catalog.gifts.find((x) => x.id === 'ribbon').wished && /留著/.test(ws.shop.twins.text) && ws.shop.wish[0].name === '紅緞帶');
  assert.throws(() => E.wishToggle('cucumber'), /不用留/);
  E.wishToggle('bell'); E.wishToggle('lantern');
  assert.ok(/三樣/.test(E.wishToggle('chime').shop.twins.text) && E.state.twins.wish.length === 3, '最多三樣');
  E.state.player.gold = 120; E.settle({ lines: [] });
  const wv = E.twinsTake();
  assert.ok(wv.visit.kind === 'wish' && wv.visit.items.map((x) => x.id).join() === 'ribbon' && /紅緞帶/.test(wv.visit.lines.map((l) => l.text).join()), '金幣夠了');
  E.settle({ lines: [] }); assert.strictEqual(E.view().twins.waiting, 0, '不重複說');
  await E.buyGift('ribbon');
  assert.ok(!E.state.twins.wish.includes('ribbon'), '買了就拿掉');
  // 關掉：不排隊、畫面看到 0
  E.setTwins(false); E.state.twins.teaDay = ''; await E.tick();
  assert.strictEqual(E.view().twins.waiting, 0);
  assert.strictEqual(E.view().twins.enabled, false);
  console.log('雙胞胎出場測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🔮 今日運勢文案：每個等級有自己的開場與建議、口吻正確、所有組合都能填滿 ----------
(() => {
  const F = require('../src/main/fortune');
  const { TEMPLATES } = require('../src/main/npc');
  for (const r of F.RANKS) assert.ok(F.OPENERS[r.tier].length >= 5 && F.ADVICE[r.tier].length >= 8, r.name);
  assert.ok(F.ADVICE.common.length >= 20 && F.ITEMS.length >= 30);
  const all = [...Object.values(F.OPENERS).flat(), ...Object.values(F.ADVICE).flat(), ...F.ITEMS];
  assert.strictEqual(new Set(all).size, all.length, '文案不重複');
  for (const t of all) assert.ok(!/玩家|您/.test(t) && !/(^|[^我])我(?!們)/.test(t), '口吻：' + t);
  for (const t of Object.values(F.OPENERS).flat()) assert.ok(t.includes('{rank}'), '開場句要有等級：' + t);
  for (const t of Object.values(F.ADVICE).flat()) assert.ok(/^適合/.test(t) && !/[。！]$/.test(t), '建議是「適合…」且不帶句號：' + t);
  // 每個等級都抽得到自己的開場句；大吉的建議池含大吉專屬
  const seen = {};
  for (let i = 0; i < 3000; i++) { const d = F.draw(Math.random); (seen[d.rank.tier] = seen[d.rank.tier] || new Set()).add(d.opener); }
  for (const r of F.RANKS) assert.ok(seen[r.tier].size >= 4, `${r.name} 的開場句有在換：${seen[r.tier].size}`);
  for (const [tpl] of TEMPLATES.fortune) assert.ok(/\{opener\}/.test(tpl) && /\{advice\}/.test(tpl) && /\{item\}/.test(tpl) && /\{gold\}/.test(tpl));
  console.log('今日運勢文案測試通過 ✔');
})();

// ---------- 🖥 Windows 10 也顯示得出來：介面、台詞、設定、範例裡不能用 Emoji 13 以後才有的字 ----------
//   Windows 10 的 Segoe UI Emoji 只到 Emoji 12（2019），新的字會變成方塊（例如金幣 U+1FA99、盆栽 U+1FAB4）。
//   需要的圖示請畫成 SVG（例如 src/renderer/coin.svg），或換成舊的 emoji
(() => {
  const NEW_EMOJI = [[0x26A7, 0x26A7], [0x1F6D6, 0x1F6DF], [0x1F6FB, 0x1F6FF], [0x1F7F0, 0x1F7FF], [0x1F90C, 0x1F90C], [0x1F972, 0x1F972], [0x1F977, 0x1F979],
    [0x1F9A3, 0x1F9A4], [0x1F9AB, 0x1F9AD], [0x1F9CB, 0x1F9CC], [0x1FA74, 0x1FA77], [0x1FA7B, 0x1FA7F], [0x1FA83, 0x1FA8F], [0x1FA96, 0x1FAFF]];
  const isNew = (cp) => NEW_EMOJI.some(([a, b]) => cp >= a && cp <= b);
  assert.ok(isNew(0x1FA99) && isNew(0x1FAB4) && !isNew(0x1F4B0) && !isNew(0x1F9EA) && !isNew(0x1FA7A), '範圍本身');
  const root = path.join(__dirname, '..');
  const files = [];
  const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|html|css|svg|md)$/.test(f.name)) files.push(p); } };
  walk(path.join(root, 'src')); walk(path.join(root, 'lore'));
  files.push(path.join(root, 'plans', '_template.md'), path.join(root, 'plans', 'week_sample.md'), path.join(root, 'config.example.json'));
  const bad = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const ch of line) if (isNew(ch.codePointAt(0))) bad.push(`${path.relative(root, f)}:${i + 1} U+${ch.codePointAt(0).toString(16).toUpperCase()} ${ch}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'Windows 10 顯示不出來的 emoji：\n' + bad.join('\n'));
  // 金幣一律用圖示：COIN 定義在 renderer.js、CSS 有 .coin、圖檔存在
  assert.ok(/const COIN = '<i class="coin"/.test(fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8')));
  assert.ok(/\.coin \{[^}]*url\(coin\.svg\)/.test(fs.readFileSync(path.join(root, 'src/renderer/style.css'), 'utf8')));
  assert.ok(/^<svg[^>]*viewBox/.test(fs.readFileSync(path.join(root, 'src/renderer/coin.svg'), 'utf8')));
  console.log('Windows 10 字型測試通過 ✔');
})();

// ---------- 🧭 介面整理（10/7）：字級表、面板台詞口吻、首頁選單、狀態欄提示 ----------
(() => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'src/renderer/style.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const rjs = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  // 字級表：五級＋最小 12px（圖示、大數字另外寫，但不能比 12px 小）
  for (const k of ['xs: 12px', 's: 13px', 'm: 14px', 'l: 16px', 'xl: 20px']) assert.ok(css.includes(`--fs-${k}`), '字級表 ' + k);
  const tiny = [...css.matchAll(/([^{}]+)\{[^{}]*font-size:\s*([0-9.]+)px/g)].filter((m) => parseFloat(m[2]) < 12 && !/\.zzz span|\.mc-ring span(?!\.hit)/.test(m[1]));
  assert.deepStrictEqual(tiny.map((m) => `${m[1].trim()} ${m[2]}px`), [], '小於 12px 的字');
  for (const k of ['--r-s', '--r-m', '--r-l', '--gold-ink', '--surface', '--card', '--track']) assert.ok(new RegExp(`${k}:`).test(css), '共用變數 ' + k);
  // 每個主題都有自己的金色按鈕字色（不會在冰藍、櫻粉主題上出現咖啡色字）
  for (const th of ['sakura', 'forest', 'latte', 'night', 'frost']) assert.ok(new RegExp(`body\\[data-theme="${th}"\\][^}]*--gold-ink`).test(css), `主題 ${th} 的 --gold-ink`);
  // 面板開著時：面板佔滿上方、對話框變成泡泡
  assert.ok(/body\.panel-open #panel \{ flex: 1 1 auto; \}/.test(css) && /#dialog\.compact \{ position: absolute;/.test(css));
  // 首頁選單：常用四個＋一排七個（📯 團戰＋玩法），每個都有處理
  const acts = [...html.matchAll(/data-act="(\w+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(acts, ['submit', 'board', 'pd', 'daily', 'chat', 'magic', 'memories', 'journal', 'shop'], '主畫面：週任務板、委託、今日行程、聊聊＋魔法、回憶、日誌、雜貨舖');
  for (const a of acts) assert.ok(rjs.includes(`act === '${a}'`), '選單 ' + a + ' 有處理');
  // 狀態欄、對話框標題列：用 data-tip（滑過立刻出現），不用要等一秒的 title
  const hud = html.slice(html.indexOf('<div id="hud"'), html.indexOf('<!-- 滑過焦點行'));
  assert.ok(!/title="/.test(hud) && (hud.match(/data-tip="/g) || []).length >= 6, '狀態欄用 data-tip');
  // 面板台詞：口吻（艾琳／冒險者，不用我、您、玩家）；自己有人說話的面板不插嘴
  const PL = require('../src/renderer/panel-lines');
  const q = (o) => ({ id: 'q1', title: '整理第三季會議紀錄並寄給所有相關的人', status: 'available', objectives: [{}, {}, {}], doneCount: 1, daysLeft: 2, ...o });
  const views = [
    { quests: [], editable: true }, { quests: [], editable: false },
    { quests: [q({ status: 'done' })] }, { quests: [q()], active: null },
    { quests: [q()], active: q({ status: 'ready', doneCount: 3 }) }, { quests: [q()], active: q({ daysLeft: -1 }) },
    { quests: [q()], active: q({ daysLeft: 0 }) }, { quests: [q()], active: q() }, { quests: [q()], active: q({ objectives: [], doneCount: 0 }) },
  ];
  const said = [];
  for (const v of views) said.push(PL.line('board', { ...v, streak: 0 }));
  said.push(PL.line('report', { quests: [] }), PL.line('submit', { quests: [q()] }, { questId: 'q1' }), PL.line('submit', { quests: [] }, {}), PL.line('ach', { streak: 5 }), PL.line('ach', { streak: 0 }));
  for (const l of said) {
    assert.ok(l && l.text && l.emotion, '每種情況都有一句');
    assert.ok(!/玩家|您/.test(l.text) && !/(^|[^我])我(?!們)/.test(l.text), '口吻：' + l.text);
    assert.ok(['normal', 'happy', 'cheer', 'worried', 'thinking', 'surprised', 'shy'].includes(l.emotion), '表情：' + l.emotion);
  }
  assert.ok(/還差 2 個目標/.test(said[7].text) && said[7].text.includes('「整理第三季會議紀錄並寄給所有…」'), '任務名太長會截短：' + said[7].text);
  assert.ok(/交付/.test(said[4].text) && said[4].emotion === 'cheer');
  for (const k of ['shop', 'health', 'journal', 'notebook', 'log', 'daily', 'onboard']) assert.strictEqual(PL.line(k, { quests: [] }), null, k + ' 不插嘴');
  console.log('介面整理測試通過 ✔');
})();

// ---------- 📦 安裝的下載來源：先看快取，沒有就測速挑快的；bat 用結束碼 10 切到鏡像站，失敗換另一邊 ----------
(async () => {
  const P = require('../tools/pick-mirror');
  const http = require('http');
  const os = require('os');
  const cp = require('child_process');
  const root = path.join(__dirname, '..');
  const ver = P.electronVersion(root);
  assert.strictEqual(ver, require('../node_modules/electron/package.json').version, '跟裝好的 electron 同一版');
  const u = P.urls(ver, 'win32', 'x64');
  // 網址、快取資料夾跟 @electron/get 算出來的一樣（不一樣的話快取對不到、會重新下載）
  // @electron/get 5 起（Electron 42+）是 ESM、只開放主入口 → 用檔案路徑直接載入內部模組（舊版在 dist/cjs）
  const getDist = path.join(root, 'node_modules', '@electron', 'get', 'dist');
  const loadGet = (name) => import(require('url').pathToFileURL(path.join(getDist, fs.existsSync(path.join(getDist, 'cjs')) ? 'cjs' : '', `${name}.js`)).href);
  const { getArtifactRemoteURL } = await loadGet('artifact-utils');
  const { Cache } = await loadGet('Cache');
  const d = { version: `v${ver}`, platform: 'win32', arch: 'x64', artifactName: 'electron', isGeneric: false };
  const saved = process.env.ELECTRON_MIRROR;
  delete process.env.ELECTRON_MIRROR;
  assert.strictEqual(await getArtifactRemoteURL(d), u.github);
  process.env.ELECTRON_MIRROR = P.MIRROR;
  assert.strictEqual(await getArtifactRemoteURL(d), u.mirror);
  if (saved === undefined) delete process.env.ELECTRON_MIRROR; else process.env.ELECTRON_MIRROR = saved;
  for (const k of ['github', 'mirror']) assert.strictEqual(P.cacheKey(u[k]), Cache.getCacheDirectory(u[k]), k + ' 快取位置');
  // 挑選：鏡像站要快 1.5 倍才用；只有一邊通就用那邊；都不通照預設
  const R = (ok, mbps) => ({ ok, mbps, error: ok ? '' : 'X' });
  assert.strictEqual(P.decide(R(true, 1), R(true, 3)), 'mirror');
  assert.strictEqual(P.decide(R(true, 2), R(true, 2.5)), 'github');
  assert.strictEqual(P.decide(R(false), R(true, 0.5)), 'mirror');
  assert.strictEqual(P.decide(R(true, 0.2), R(false)), 'github');
  assert.strictEqual(P.decide(R(false), R(false)), 'github');
  // 流程：指定來源不測速；快取裡有就沿用；都沒有才測速
  const logs = [];
  const opt = (env, probeFn) => ({ root, env, platform: 'win32', arch: 'x64', log: (s) => logs.push(s), probeFn });
  const noProbe = () => { throw new Error('不該測速'); };
  assert.strictEqual(await P.main(opt({ ERIN_DOWNLOAD: 'Mirror ' }, noProbe)), 'mirror');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-pm-'));
  fs.mkdirSync(path.join(tmp, P.cacheKey(u.mirror)), { recursive: true });
  fs.writeFileSync(path.join(tmp, P.cacheKey(u.mirror), u.file), 'x');
  assert.strictEqual(await P.main(opt({ electron_config_cache: tmp }, noProbe)), 'mirror', '鏡像站下載過 → 沿用');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  const asked = [];
  const fake = (speed) => (x) => { asked.push(x); return Promise.resolve(speed[x === u.github ? 0 : 1]); };
  assert.strictEqual(await P.main(opt({ electron_config_cache: tmp }, fake([R(true, 0.3), R(true, 6)]))), 'mirror');
  assert.deepStrictEqual(asked, [u.github, u.mirror], '兩邊都測');
  assert.ok(logs.some((l) => /GitHub 官方：0\.30 MB\/s　npmmirror 鏡像站：6\.0 MB\/s/.test(l)), logs.join('|'));
  assert.strictEqual(await P.main(opt({ electron_config_cache: tmp, HTTPS_PROXY: 'http://p:8080' }, fake([R(false), R(false)]))), 'github');
  assert.ok(/有設 proxy/.test(logs[logs.length - 2]), '有 proxy 的說明');
  fs.rmSync(tmp, { recursive: true, force: true });
  // 真的連線：轉址、206 部分內容、404、一直不回應（逾時）
  const srv = http.createServer((req, res) => {
    if (req.url === '/go') { res.writeHead(302, { Location: '/zip' }); res.end(); return; }
    if (req.url === '/zip') { assert.ok(/^bytes=0-/.test(req.headers.range)); res.writeHead(206); res.end(Buffer.alloc(200 * 1024)); return; }
    if (req.url === '/hang') return; // 不回應
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const ok = await P.probe(`${base}/go`, { sample: 128 * 1024, timeout: 3000 });
  assert.ok(ok.ok && ok.bytes >= 128 * 1024 && ok.mbps > 0, '跟著轉址、量到速度');
  const nf = await P.probe(`${base}/nope`, { timeout: 3000 });
  assert.ok(!nf.ok && nf.error === 'HTTP 404');
  const hang = await P.probe(`${base}/hang`, { timeout: 300 });
  assert.ok(!hang.ok && hang.error === '逾時' && hang.ms < 2000, '逾時就放棄');
  if (srv.closeAllConnections) srv.closeAllConnections();
  srv.close();
  // 結束碼：0＝官方、10＝鏡像站
  const run = (v) => cp.spawnSync(process.execPath, [path.join(root, 'tools', 'pick-mirror.js')], { env: { ...process.env, ERIN_DOWNLOAD: v }, encoding: 'utf8' }).status;
  assert.strictEqual(run('mirror'), 10);
  assert.strictEqual(run('github'), 0);
  // 兩個 bat：先挑來源、看得到下載進度、失敗換另一邊；goto／call 的標籤都在；Windows 換行
  for (const f of ['安裝.bat', '打包.bat']) {
    const b = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(/\r\n/.test(b) && !/[^\r]\n/.test(b), f + ' 要用 CRLF');
    assert.ok(!/rem set ELECTRON_MIRROR/.test(b), f + ' 不用再手動拿掉 rem');
    assert.ok(/node tools\\pick-mirror\.js\r\nif errorlevel 10 call :usemirror\r\n/.test(b), f + ' 挑來源');
    assert.ok(/:usemirror\r\nset ELECTRON_MIRROR=https:\/\/npmmirror\.com\/mirrors\/electron\/\r\nset ELECTRON_BUILDER_BINARIES_MIRROR=https:\/\/npmmirror\.com\/mirrors\/electron-builder-binaries\/\r\n/.test(b), f + ' 鏡像站');
    assert.ok(/call npm ci --foreground-scripts\r\n/.test(b) && /call :switchsource\r\ncall npm install --foreground-scripts\r\n/.test(b), f + ' 看得到進度、失敗換來源');
    if (f === '安裝.bat') { // Electron 42 起 npm ci 不會順便下載本體 → 裝完套件要明確下載，失敗換來源再試
      const i = b.indexOf(':installed\r\n'), d = b.indexOf('node node_modules\\electron\\install.js\r\n'), tst = b.indexOf('call npm test');
      assert.ok(i >= 0 && d > i && tst > d, f + ' 裝完套件後明確下載 Electron');
      assert.ok(/call :switchsource\r\nnode node_modules\\electron\\install\.js\r\nif errorlevel 1 goto installfail\r\n/.test(b), f + ' 下載失敗換來源再試');
    }
    const labels = new Set([...b.matchAll(/^:(\w+)/gm)].map((m) => m[1]));
    for (const m of b.matchAll(/(?:goto|call) :?(\w+)/g)) if (!/^(npm|npx)$/.test(m[1])) assert.ok(labels.has(m[1]), `${f} 找不到標籤 ${m[1]}`);
  }
  console.log('安裝下載來源測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🤖 幫朋友安裝 Ollama：下載官方安裝程式 → 驗簽章 → 安靜安裝 → 等它啟動（全部用假的，不真的下載） ----------
(async () => {
  const OI = require('../src/main/ollamaInstall');
  const os = require('os');
  const { EventEmitter } = require('events');
  const { buildHealth } = require('../src/main/health');
  // 簽章：一定要 Valid 而且是 Ollama 簽的
  assert.ok(OI.parseSignature('Valid|CN=Ollama Inc., O=Ollama Inc., L=Palo Alto, S=California, C=US').ok);
  assert.ok(!OI.parseSignature('NotSigned|').ok && !OI.parseSignature('Valid|CN=Someone Else').ok && !OI.parseSignature('HashMismatch|CN=Ollama Inc.').ok);
  assert.ok(OI.parseSignature('警告訊息\r\nValid|CN=Ollama Inc.').ok, '只看最後一行');
  assert.strictEqual(OI.psQuote("C:\\Users\\O'Neil\\x.exe"), "'C:\\Users\\O''Neil\\x.exe'", '路徑裡的單引號');
  assert.ok(OI.signatureCommand('C:\\a b\\OllamaSetup.exe').includes("-LiteralPath 'C:\\a b\\OllamaSetup.exe'"));
  assert.ok(OI.supported('win32') && !OI.supported('linux') && !OI.supported('darwin'));
  assert.deepStrictEqual(OI.SILENT_ARGS.slice(0, 2), ['/VERYSILENT', '/SUPPRESSMSGBOXES']);
  assert.strictEqual(OI.gb(1.1 * 1024 ** 3), '1.1 GB');
  // 假的官網：size bytes 分 chunks 次送；len＝宣稱的大小；failAt＝第幾塊斷線；onChunk 每送一塊呼叫
  const SIZE = 3 * 1024 * 1024;
  const fakeFetch = ({ status = 200, size = SIZE, len = size, chunks = 6, failAt = -1, onChunk = () => {} } = {}) => async (url) => {
    assert.strictEqual(url, OI.SETUP_URL);
    let i = 0;
    const per = Math.ceil(size / chunks);
    const body = new ReadableStream({ pull(c) {
      if (i === failAt) { c.error(new Error('ECONNRESET')); return; }
      if (i * per >= size) { c.close(); return; }
      const n = Math.min(per, size - i * per); i++; onChunk(i); c.enqueue(new Uint8Array(n));
    } });
    return new Response(status === 200 ? body : null, { status, headers: len ? { 'content-length': String(len) } : {} });
  };
  const okSig = async () => ({ ok: true, status: 'Valid', subject: 'CN=Ollama Inc.' });
  const exitWith = (code, rec = []) => (f, args) => { rec.push([f, args]); const ch = new EventEmitter(); setImmediate(() => ch.emit('exit', code)); return ch; };
  const noSpawn = () => { throw new Error('不該執行安裝程式'); };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-oi-'));
  const left = () => fs.readdirSync(dir);
  // 1. 一路順利
  const phases = [], spawned = [];
  let calls = 0;
  const r = await OI.install({
    platform: 'win32', dir, fetchImpl: fakeFetch(),
    verifyImpl: async (f) => { assert.strictEqual(fs.statSync(f).size, SIZE, '驗章前檔案已經完整'); return okSig(); },
    spawnImpl: exitWith(0, spawned), versionImpl: async () => (++calls >= 3 ? '0.12.0' : null),
    waitOpts: { every: 5, kickAfter: 1e9 }, onProgress: (p) => phases.push(p),
  });
  assert.strictEqual(r.version, '0.12.0');
  assert.deepStrictEqual([...new Set(phases.map((p) => p.phase))], ['download', 'verify', 'install', 'start']);
  const dl = phases.filter((p) => p.phase === 'download').map((p) => p.percent);
  assert.ok(dl[dl.length - 1] === 100 && dl.every((x, i) => i === 0 || x >= dl[i - 1]), '下載進度一路往上到 100：' + dl);
  assert.ok(phases.every((p) => typeof p.text === 'string' && p.text), '每一步都有說明');
  assert.ok(spawned.length === 1 && path.basename(spawned[0][0]) === 'OllamaSetup.exe' && spawned[0][1].includes('/VERYSILENT'));
  assert.deepStrictEqual(left(), [], '裝完把安裝程式刪掉');
  // 2. 簽章不對：不安裝、檔案刪掉
  const e1 = await OI.install({ platform: 'win32', dir, fetchImpl: fakeFetch(), verifyImpl: async () => ({ ok: false, status: 'NotSigned', subject: '' }), spawnImpl: noSpawn }).catch((e) => e);
  assert.ok(e1.code === 'signature' && /不是 Ollama 官方簽章（NotSigned）/.test(e1.message), e1.message);
  assert.deepStrictEqual(left(), []);
  // 3. 下載的各種失敗：404、斷線、少了一截、太小；都不留半個檔案、不驗章、不安裝
  const dlFail = async (opts) => OI.install({ platform: 'win32', dir, fetchImpl: fakeFetch(opts), verifyImpl: async () => { throw new Error('不該驗章'); }, spawnImpl: noSpawn }).catch((e) => e);
  const e404 = await dlFail({ status: 404 });
  assert.ok(e404.code === 'download' && /404/.test(e404.message));
  const eReset = await dlFail({ failAt: 2 });
  assert.ok(eReset.code === 'download' && /下載中斷/.test(eReset.message), eReset.message);
  const eShort = await dlFail({ len: SIZE + 100 });
  assert.ok(eShort.code === 'download' && /不完整/.test(eShort.message));
  const eTiny = await dlFail({ size: 2000, chunks: 1 });
  assert.ok(eTiny.code === 'download' && /太小/.test(eTiny.message));
  assert.deepStrictEqual(left(), [], '失敗不留 .part');
  const eNet = await OI.install({ platform: 'win32', dir, fetchImpl: async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; }, spawnImpl: noSpawn }).catch((e) => e);
  assert.ok(eNet.code === 'download' && /連不到 Ollama 官網（ENOTFOUND）/.test(eNet.message));
  // 4. 下載到一半按取消
  const ctl = new AbortController();
  const eAbort = await OI.install({ platform: 'win32', dir, signal: ctl.signal, fetchImpl: fakeFetch({ chunks: 10, onChunk: (i) => { if (i === 3) ctl.abort(); } }), spawnImpl: noSpawn }).catch((e) => e);
  assert.ok(eAbort.code === 'canceled' && eAbort.message === '已取消', eAbort.message);
  assert.deepStrictEqual(left(), []);
  // 5. 安裝程式失敗（防毒擋住、空間不夠…）
  const eInst = await OI.install({ platform: 'win32', dir, fetchImpl: fakeFetch(), verifyImpl: okSig, spawnImpl: exitWith(2) }).catch((e) => e);
  assert.ok(eInst.code === 'install' && /代碼 2/.test(eInst.message));
  // 6. 裝好了但一直沒啟動：中途自己打開一次 ollama app.exe，最後說明怎麼做
  const launched = [];
  const eStart = await OI.install({
    platform: 'win32', dir, fetchImpl: fakeFetch(), verifyImpl: okSig, spawnImpl: exitWith(0), versionImpl: async () => null,
    findApp: () => 'C:\\Ollama\\ollama app.exe', launch: (exe) => launched.push(exe), waitOpts: { every: 5, kickAfter: 20, timeout: 80 },
  }).catch((e) => e);
  assert.ok(eStart.code === 'start' && /開始選單/.test(eStart.message));
  assert.deepStrictEqual(launched, ['C:\\Ollama\\ollama app.exe'], '只自己打開一次');
  // 7. 不是 Windows
  assert.strictEqual((await OI.install({ platform: 'darwin', dir }).catch((e) => e)).code, 'unsupported');
  fs.rmSync(dir, { recursive: true, force: true });
  // 8. 下載前問大小（HEAD，跟著轉址）
  const sz = await OI.installerSize({ fetchImpl: async (u, o) => { assert.ok(o.method === 'HEAD' && o.redirect === 'follow'); return new Response(null, { status: 200, headers: { 'content-length': String(1181116006) } }); } });
  assert.strictEqual(OI.gb(sz), '1.1 GB');
  // 9. 健康檢查：Windows 有「幫我安裝／幫我更新」，其他系統照舊開官網
  const hb = { name: '艾琳', plan: { file: 'p.md', exists: true, quests: 3 }, llm: { enabled: true, model: 'qwen3:4b' }, ramGB: 16, smart: { on: false }, charOK: true, saveOK: true, userDir: '/u' };
  const ai = (probe) => buildHealth({ ...hb, probe }).find((i) => i.id === 'ai');
  const miss = ai({ ollama: 'missing', models: [], embed: {}, canInstall: true, installSize: 1181116006 });
  assert.ok(miss.fixes[0].action === 'installOllama' && miss.fixes[0].label === '幫我安裝 Ollama（約 1.1 GB）' && miss.fixes.some((f) => f.action === 'openOllama'), JSON.stringify(miss.fixes));
  assert.strictEqual(ai({ ollama: 'missing', models: [], embed: {} }).fixes[0].action, 'openOllama');
  const old = buildHealth({ ...hb, probe: { ollama: 'running', models: ['qwen3:4b'], embed: { installed: true }, outdated: true, version: '0.6.2', minVersion: '0.9.0', canInstall: true } }).find((i) => i.id === 'ollamaVer');
  assert.ok(old.fixes[0].action === 'installOllama' && /更新/.test(old.fixes[0].label));
  console.log('幫忙安裝 Ollama 測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🔄 自動更新：安裝版背景下載、關掉時換上；免安裝版只提醒；開發版不檢查；發版檔案檢查 ----------
(async () => {
  const U = require('../src/main/updater');
  const RF = require('../tools/release-files');
  const os = require('os');
  const crypto = require('crypto');
  const { EventEmitter } = require('events');
  // 版本比較、安裝版判斷、模式
  assert.ok(U.isNewer('0.1.10', '0.1.9') && U.isNewer('v0.2.0', '0.1.9') && !U.isNewer('v0.1.2', '0.1.2') && !U.isNewer('0.1.1', '0.1.2') && !U.isNewer('abc', '0.1.0'));
  assert.ok(U.isInstalled('C:\\P\\Erin.exe', () => ['Erin.exe', 'Uninstall 艾琳的任務櫃台.exe']) && !U.isInstalled('C:\\P\\Erin.exe', () => ['Erin.exe']) && !U.isInstalled('x', () => { throw new Error('x'); }));
  assert.strictEqual(U.modeOf({ isPackaged: false, platform: 'win32', installed: true, hasUpdater: true }), 'dev');
  assert.strictEqual(U.modeOf({ isPackaged: true, platform: 'win32', installed: true, hasUpdater: true }), 'auto');
  assert.strictEqual(U.modeOf({ isPackaged: true, platform: 'win32', installed: false, hasUpdater: false }), 'portable');
  assert.strictEqual(U.modeOf({ isPackaged: true, platform: 'win32', installed: true, hasUpdater: false }), 'portable', '套件載入失敗就退回提醒');
  // Release 說明 → 純文字（GitHub 的 HTML、自己寫的 Markdown）
  assert.deepStrictEqual(U.notesText('<h2>新功能</h2><ul><li>艾琳幫你裝 Ollama</li><li><strong>修好</strong> 金幣 &amp; 圖示</li></ul>'), ['新功能', '・艾琳幫你裝 Ollama', '・修好 金幣 & 圖示']);
  assert.deepStrictEqual(U.notesText('## 新功能\r\n- **安裝** Ollama\n* `coin`\n\n'), ['新功能', '・安裝 Ollama', '・coin']);
  assert.strictEqual(U.notesText(Array.from({ length: 20 }, (_, i) => `- ${i}`).join('\n')).length, 8, '最多 8 行');
  assert.ok(/連不到 GitHub/.test(U.friendly(new Error('getaddrinfo ENOTFOUND github.com'))) && /latest\.yml/.test(U.friendly(new Error('HttpError: 404'))) && /太頻繁/.test(U.friendly(new Error('GitHub 回應 403'))));
  for (const k of ['offer', 'ready', 'portable', 'updated']) {
    const t = U.line(k, { v: '0.1.3' }).text;
    assert.ok(t.includes('0.1.3') && /冒險者/.test(t) && !/玩家|您/.test(t) && !/(^|[^我])我(?!們)/.test(t), '口吻：' + t);
  }
  // 假的計時器與 app
  const timers = [];
  const fakeTimers = { setTimeoutImpl: (fn, ms) => { timers.push({ fn, ms, once: true }); }, setIntervalImpl: (fn, ms) => { timers.push({ fn, ms }); } };
  const app = (v = '0.1.2', packaged = true) => ({ isPackaged: packaged, getVersion: () => v });
  const flushT = async () => { const ts = timers.splice(0); for (const t of ts) await t.fn(); };
  // 1. 安裝版：檢查 → 有新版 → 背景下載 → 下載好 → 艾琳說一次 → 現在更新
  const au = new EventEmitter();
  let checks = 0; const quits = [];
  au.checkForUpdates = async () => {
    checks++;
    au.emit('checking-for-update');
    au.emit('update-available', { version: '0.1.3', releaseNotes: '<p>修好金幣</p>' });
    for (const percent of [10, 55, 100]) au.emit('download-progress', { percent });
    au.emit('update-downloaded', { version: '0.1.3', releaseNotes: '<ul><li>修好金幣</li><li>幫忙裝 Ollama</li></ul>' });
  };
  au.quitAndInstall = (...a) => quits.push(a);
  const statuses = [], said = [];
  let t0 = 0;
  const up = U.createUpdater({ app: app(), platform: 'win32', execPath: 'C:\\P\\Erin.exe', readdir: () => ['Uninstall 艾琳的任務櫃台.exe'], loadUpdater: () => au, onStatus: (s) => statuses.push(s), onSay: (l) => said.push(...l), now: () => (t0 += 400), askFirst: () => false, ...fakeTimers }); // update.ask＝false：以前的做法
  assert.strictEqual(up.mode, 'auto');
  assert.ok(au.autoDownload === true && au.autoInstallOnAppQuit === true && au.allowPrerelease === false, '背景下載、關掉時安裝、不抓預覽版');
  assert.ok(up.start() && timers.length === 1 && timers[0].once && timers[0].ms === U.FIRST_DELAY, '只在開啟時檢查一次，不定時檢查');
  await flushT();
  assert.strictEqual(checks, 1, '開啟時檢查一次');
  const st = up.status();
  assert.ok(st.status === 'ready' && st.version === '0.1.3' && st.percent === 100 && st.current === '0.1.2');
  assert.deepStrictEqual(st.notes, ['・修好金幣', '・幫忙裝 Ollama']);
  assert.deepStrictEqual(statuses.map((s) => s.status).filter((s, i, a) => s !== a[i - 1]), ['checking', 'downloading', 'ready'], '狀態順序');
  assert.ok(statuses.filter((s) => s.status === 'downloading').length <= 3, '下載進度有節流');
  assert.strictEqual(said.length, 1, '下載好只說一次：' + said.map((l) => l.text).join('|'));
  assert.ok(/0\.1\.3/.test(said[0].text) && said[0].emotion === 'cheer');
  await up.check();
  assert.strictEqual(checks, 1, '已經下載好就不再檢查');
  assert.deepStrictEqual(up.install(), { installing: true });
  await flushT();
  assert.deepStrictEqual(quits, [[true, true]], '不跳視窗安裝、裝完重新打開');
  // 1b. 預設先問再裝：有新版 → 'offer'＋艾琳問一次，不下載、關掉時不裝；答應了才下載，下載好說一次；答應「現在更新」→ 下載完直接重新啟動
  const auA = new EventEmitter();
  let dlA = 0; const quitsA = [];
  auA.checkForUpdates = async () => { auA.emit('checking-for-update'); auA.emit('update-available', { version: '0.1.3', releaseNotes: '- 兩本書' }); if (auA.autoDownload) throw new Error('不該自動下載'); };
  auA.downloadUpdate = async () => { dlA++; auA.emit('download-progress', { percent: 50 }); auA.emit('update-downloaded', { version: '0.1.3' }); };
  auA.quitAndInstall = (...a) => quitsA.push(a);
  const saidA = [];
  const upA = U.createUpdater({ app: app(), platform: 'win32', execPath: 'x', readdir: () => ['Uninstall a.exe'], loadUpdater: () => auA, onSay: (l) => saidA.push(...l), ...fakeTimers });
  assert.ok(auA.autoDownload === false && auA.autoInstallOnAppQuit === false, '先問：不自動下載、關掉時不裝');
  let sA = await upA.check();
  assert.ok(sA.status === 'offer' && sA.version === '0.1.3' && dlA === 0 && saidA.length === 1 && /要換上嗎/.test(saidA[0].text), '有新版：先問');
  await upA.check();
  assert.strictEqual(saidA.length, 1, '問過了不再問');
  assert.deepStrictEqual(upA.install(), { installing: false }, '還沒下載不能裝');
  assert.deepStrictEqual(upA.accept(), { downloading: true });
  await flushT(); await new Promise((r) => setImmediate(r));
  sA = upA.status();
  assert.ok(dlA === 1 && sA.status === 'ready' && sA.accepted && auA.autoInstallOnAppQuit === true && saidA.length === 2 && /下次關掉/.test(saidA[1].text), '答應了才下載，關掉時換上：' + JSON.stringify(sA));
  assert.deepStrictEqual(upA.accept(), { downloading: false }, '下載好了不用再答應');
  const auB = new EventEmitter(); const quitsB = [];
  auB.checkForUpdates = async () => auB.emit('update-available', { version: '0.1.4' });
  auB.downloadUpdate = async () => auB.emit('update-downloaded', { version: '0.1.4' });
  auB.quitAndInstall = (...a) => quitsB.push(a);
  const upB = U.createUpdater({ app: app(), platform: 'win32', execPath: 'x', readdir: () => ['Uninstall a.exe'], loadUpdater: () => auB, ...fakeTimers });
  await upB.check(); upB.accept({ now: true });
  await new Promise((r) => setImmediate(r)); await flushT();
  assert.deepStrictEqual(quitsB, [[true, true]], '現在更新：下載完直接重新啟動換上');
  // 2. 已經按過「下次再說」的版本：不再說；關掉自動檢查：計時到了也不檢查
  const au2 = new EventEmitter(); let c2 = 0;
  au2.checkForUpdates = async () => { c2++; au2.emit('update-downloaded', { version: '0.1.3' }); };
  const said2 = [];
  let auto = false;
  const up2 = U.createUpdater({ app: app(), platform: 'win32', execPath: 'x', readdir: () => ['Uninstall a.exe'], loadUpdater: () => au2, onSay: (l) => said2.push(...l), dismissed: () => '0.1.3', isAuto: () => auto, ...fakeTimers });
  up2.start(); await flushT();
  assert.strictEqual(c2, 0, '關掉自動檢查');
  await up2.check();
  assert.ok(c2 === 1 && said2.length === 0 && up2.status().status === 'ready', '手動檢查還是可以，但按過的版本不說');
  // 3. 連不上
  const au3 = new EventEmitter();
  au3.checkForUpdates = async () => { const e = new Error('net::ERR_INTERNET_DISCONNECTED'); au3.emit('error', e); throw e; };
  const up3 = U.createUpdater({ app: app(), platform: 'win32', execPath: 'x', readdir: () => ['Uninstall a.exe'], loadUpdater: () => au3, ...fakeTimers });
  const s3 = await up3.check();
  assert.ok(s3.status === 'error' && /連不到 GitHub/.test(s3.error));
  assert.deepStrictEqual(up3.install(), { installing: false }, '沒下載好不能安裝');
  // 4. 免安裝版：問 GitHub 最新版本 → 提醒＋下載頁
  const said4 = [];
  const gh = (tag, status = 200) => async (url, o) => { assert.ok(url === U.API_LATEST && o.headers['User-Agent']); return new Response(JSON.stringify({ tag_name: tag, body: '## 0.1.3\n- 修好金幣', html_url: 'https://github.com/hankku43/erin-desk/releases/tag/' + tag }), { status }); };
  const up4 = U.createUpdater({ app: app(), platform: 'win32', execPath: 'x', readdir: () => ['Erin.exe'], loadUpdater: () => { throw new Error('不該載入'); }, fetchImpl: gh('v0.1.3'), onSay: (l) => said4.push(...l), ...fakeTimers });
  assert.strictEqual(up4.mode, 'portable');
  const s4 = await up4.check();
  assert.ok(s4.status === 'available' && s4.version === '0.1.3' && /tag\/v0\.1\.3$/.test(s4.url) && s4.notes.includes('・修好金幣'));
  assert.ok(said4.length === 1 && said4[0].emotion === 'surprised' && /免安裝版/.test(said4[0].text));
  assert.deepStrictEqual(up4.install(), { installing: false }, '免安裝版不能自己換');
  assert.strictEqual((await U.createUpdater({ app: app(), platform: 'win32', execPath: 'x', readdir: () => [], fetchImpl: gh('v0.1.2'), ...fakeTimers }).check()).status, 'latest');
  assert.ok(/太頻繁/.test((await U.createUpdater({ app: app(), platform: 'win32', execPath: 'x', readdir: () => [], fetchImpl: gh('v9.9.9', 403), ...fakeTimers }).check()).error));
  // 5. 開發版（從原始碼執行）：不載入、不檢查
  const up5 = U.createUpdater({ app: app('0.1.2', false), platform: 'win32', execPath: 'x', readdir: () => ['Uninstall a.exe'], loadUpdater: () => { throw new Error('不該載入'); }, fetchImpl: () => { throw new Error('不該連網'); }, ...fakeTimers });
  assert.ok(up5.mode === 'dev' && up5.start() === false && (await up5.check()).status === 'idle');
  // 6. 發版：要上傳的檔案、latest.yml 對得上
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-rel-'));
  const exe = Buffer.from('fake installer');
  const sha = crypto.createHash('sha512').update(exe).digest('base64');
  fs.writeFileSync(path.join(dir, 'Erin-Setup-0.1.3.exe'), exe);
  fs.writeFileSync(path.join(dir, 'Erin-Setup-0.1.3.exe.blockmap'), 'x');
  fs.writeFileSync(path.join(dir, 'latest.yml'), `version: 0.1.3\nfiles:\n  - url: Erin-Setup-0.1.3.exe\n    sha512: ${sha}\n    size: ${exe.length}\npath: Erin-Setup-0.1.3.exe\nsha512: ${sha}\nreleaseDate: '2026-10-08T00:00:00.000Z'\n`);
  let r = RF.check(dir, '0.1.3');
  assert.deepStrictEqual(r.problems, [], r.problems.join('|'));
  assert.ok(r.list.find((f) => f.name === 'Erin-0.1.3-portable.zip').ok === false, 'zip 是選用的');
  assert.ok(RF.check(dir, '0.1.4').problems.some((p) => /版本是 0\.1\.3/.test(p)), '舊的 latest.yml');
  fs.writeFileSync(path.join(dir, 'Erin-Setup-0.1.3.exe'), 'changed');
  assert.ok(RF.check(dir, '0.1.3').problems.some((p) => /檢查碼/.test(p)));
  fs.unlinkSync(path.join(dir, 'Erin-Setup-0.1.3.exe.blockmap'));
  assert.ok(RF.check(dir, '0.1.3').problems.some((p) => /blockmap/.test(p)));
  // 打出來的程式裡要有 app-update.yml 和 electron-updater（不然朋友不會自動更新）
  const res = path.join(dir, 'win-unpacked', 'resources');
  fs.mkdirSync(res, { recursive: true });
  const fakeAsar = (tree) => { const j = Buffer.from(JSON.stringify({ files: tree })); const h = Buffer.alloc(16); h.writeUInt32LE(j.length, 12); fs.writeFileSync(path.join(res, 'app.asar'), Buffer.concat([h, j])); };
  fakeAsar({ node_modules: { files: { 'lunar-javascript': { files: {} } } } });
  r = RF.check(dir, '0.1.3').problems;
  assert.ok(r.some((p) => /app-update\.yml/.test(p)) && r.some((p) => /沒有 electron-updater：先雙擊 安裝\.bat/.test(p)), r.join('|'));
  fs.writeFileSync(path.join(res, 'app-update.yml'), 'provider: github\n');
  fakeAsar({ node_modules: { files: { 'electron-updater': { files: {} } } } });
  assert.ok(!RF.check(dir, '0.1.3').problems.some((p) => /app-update|electron-updater/.test(p)));
  fs.rmSync(dir, { recursive: true, force: true });
  // 打包前：套件跟 package-lock.json 一樣嗎（選用的不算，巢狀的也要在）
  const DO = require('../tools/deps-ok');
  const droot = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-deps-'));
  fs.writeFileSync(path.join(droot, 'package-lock.json'), JSON.stringify({ packages: { '': {}, 'node_modules/a': { version: '1.0.0' }, 'node_modules/b': { version: '2.0.0', optional: true }, 'node_modules/a/node_modules/c': { version: '3.0.0' } } }));
  const pj = (rel, v) => { fs.mkdirSync(path.join(droot, rel), { recursive: true }); fs.writeFileSync(path.join(droot, rel, 'package.json'), JSON.stringify({ version: v })); };
  pj('node_modules/a', '1.0.0');
  assert.deepStrictEqual(DO.missing(droot).map((m) => [m.name, m.top, m.have]), [['c', false, null]]);
  pj('node_modules/a/node_modules/c', '2.9.0');
  assert.strictEqual(DO.missing(droot)[0].have, '2.9.0', '版本不一樣也算');
  pj('node_modules/a/node_modules/c', '3.0.0');
  assert.deepStrictEqual(DO.missing(droot), []);
  fs.rmSync(droot, { recursive: true, force: true });
  // 7. 打包設定：publish 到自己的 GitHub、本機打包不上傳、有 electron-updater；打包.bat 會列出要上傳的檔案
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const pub = pkg.build.publish[0];
  assert.ok(pub.provider === 'github' && pub.owner === U.OWNER && pub.repo === U.REPO);
  assert.ok(/--publish never/.test(pkg.scripts.dist) && pkg.dependencies['electron-updater'], 'npm run dist 不上傳、electron-updater 是執行時要用的');
  const bat = fs.readFileSync(path.join(__dirname, '..', '打包.bat'), 'utf8');
  assert.ok(/node tools\\release-files\.js/.test(bat) && /--publish never -c\.win\.signAndEditExecutable=false/.test(bat) && /node tools\\deps-ok\.js\r\nif not errorlevel 1 goto ready/.test(bat) && !/if exist node_modules\\electron-builder goto ready/.test(bat), '打包前檢查套件');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8')).update.auto, true);
  console.log('自動更新測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🎬 開場「雨夜的小白貓」：名字規則、說回來的那句、劇本結構、口吻、存檔 ----------
(() => {
  const os = require('os');
  const root = path.join(__dirname, '..');
  const OS = require('../src/renderer/opening-script');
  const OA = require('../src/renderer/opening-art');
  // 1. 接待員的名字：1～8 字，不能有 我／你／妳／您，不能叫「冒險者」；控制字元和 <>{} 拿掉
  assert.deepStrictEqual(OS.validateName('  小雪 '), { ok: true, name: '小雪', error: '' });
  assert.ok(!OS.validateName('').ok && !OS.validateName('   ').ok && !OS.validateName(null).ok, '空白');
  assert.ok(OS.validateName('一二三四五六七八').ok && !OS.validateName('一二三四五六七八九').ok, '最多 8 個字');
  for (const bad of ['我是艾琳', '小你', '妳妳', '您', '冒險者']) assert.ok(!OS.validateName(bad).ok && OS.validateName(bad).error, bad);
  assert.strictEqual(OS.validateName('莉{name}亞').name, '莉name亞', '大括號會被當成台詞的 {name}');
  assert.strictEqual(OS.validateName('<b>莉亞').name, 'b莉亞');
  assert.ok(OS.validateName('Erin').ok && OS.validateName('小 雪').name === '小 雪');
  // 2. 冒險者登記的名字：可以空著，最多 12 字
  assert.strictEqual(OS.cleanPlayerName('  阿明  '), '阿明');
  assert.strictEqual(OS.cleanPlayerName(null), '');
  assert.strictEqual(OS.cleanPlayerName('一二三四五六七八九十一二三四'), '一二三四五六七八九十一二');
  // 3. 序章那句話 → 現在她說回來的那句；沒選（跳過）用通用句
  assert.strictEqual(OS.ECHOES.length, 3);
  OS.ECHOES.forEach((e, i) => assert.strictEqual(OS.echoLine(i + 1), e.echo));
  for (const n of [0, undefined, 4, -1]) assert.strictEqual(OS.echoLine(n), OS.GENERIC_ECHO);
  assert.ok(OS.HEAT.warm > 0 && OS.HEAT.warm < OS.HEAT.hot && OS.HEAT.hot < 1, '溫度條：月光涼 < 星火溫 < 日焰燙');
  // 4. 劇本結構：id 不重複、每步剛好一種等待方式、道具和人物都畫得出來、順序對
  const ids = OS.STEPS.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id 不重複');
  const WAITS = ['auto', 'click', 'action', 'heat', 'choice', 'name', 'register', 'finale'];
  const SPECIAL = ['fireCg', 'book', 'bookDone'];
  const CATS = ['kitten', 'cloak', 'cloakEmpty', 'catSleep', 'catStartled'];
  for (const s of OS.STEPS) {
    assert.ok(['black', 'forest', 'guild'].includes(s.scene), s.id + ' 的場景');
    assert.strictEqual(Object.keys(s.wait).filter((k) => WAITS.includes(k)).length, 1, s.id + ' 的等待方式');
    for (const p of s.props || []) assert.ok(SPECIAL.includes(p) || OA.prop(p).length > 20, s.id + ' 的道具 ' + p);
    for (const a of s.actors || []) assert.ok(CATS.includes(a) || /^erin:(normal|surprised|happy|wave|tea|cheer)(@right)?$/.test(a), s.id + ' 的人物 ' + a);
    if (s.scene === 'forest') assert.ok(!(s.dlg && s.dlg.np), s.id + '：序章是你的心聲，沒有名牌');
  }
  const at = (id) => ids.indexOf(id);
  assert.ok(at('title') === 0 && at('finale') === ids.length - 1, '黑底字開頭、結尾縮到右下角');
  assert.ok(at('heat') < at('words') && at('words') < at('guild') && at('intro') < at('name') && at('name') < at('named') && at('named') < at('register') && at('register') < at('cheer'));
  assert.ok(OS.STEPS.filter((s) => s.scene === 'forest').every((s) => at(s.id) < at('guild')), '序章都在現在之前');
  assert.deepStrictEqual(OS.STEPS[at('words')].wait.choice, OS.ECHOES.map((e) => e.say));
  assert.ok(/星火溫/.test(OS.STEPS[at('warm')].dlg.text) && /星火溫/.test(OS.STEPS[at('tea')].dlg.text), '星火溫：你說的 ↔ 她說的');
  assert.ok(/星火溫/.test(OS.STEPS[at('cold')].wait.action), '動作按鈕：用火魔法加熱到星火溫');
  assert.strictEqual(OS.STEPS[at('name')].dlg.np, '？？？', '取名前名牌是 ？？？');
  assert.ok(!/規矩|取名/.test(JSON.stringify(OS.STEPS)), '劇情裡沒有「冒險者幫她取名」的規矩（10/8 使用者）');
  // 5. 口吻：她說的每一句（三種說回來的話＋沒選＋空著登記簿）用預設和改過的名字都對
  for (const name of [OS.DEFAULT_NAME, '小雪']) {
    const lines = OS.erinLines(name);
    assert.ok(lines.length >= 12, '台詞數量');
    for (const t of lines) {
      assert.ok(!/玩家|您/.test(t) && !/(^|[^我])我(?!們)/.test(t), '口吻：' + t);
      assert.ok(!/\{(name|echo)\}/.test(t), '都換掉了：' + t);
    }
    assert.ok(lines.some((t) => t.includes(`——接待員是${name}！`)) && lines.some((t) => t.includes(`交給${name}吧！`)), '自稱跟著名字變');
    for (const e of OS.ECHOES) assert.ok(lines.some((t) => t.startsWith(e.echo)), '說回來：' + e.echo);
  }
  assert.ok(!/艾琳/.test(OS.erinLines('小雪').join('')), '改名後台詞裡不會再出現艾琳');
  // 6. 登記簿：名字會跳脫、空著有標示、有受理章
  assert.ok(OA.regBook({ name: '<阿明>' }).includes('&lt;阿明&gt;') && !OA.regBook({ name: '<阿明>' }).includes('<阿明>'));
  assert.ok(/先空著/.test(OA.regBook({ blank: true })) && /受理/.test(OA.regBook({ blank: true })) && !/受理/.test(OA.regBook({})));
  // 7. 檔案：圖都在、打包會帶上、主視窗收得到 opening:done、開場頁載入三支腳本
  // 去背圖的寬高比要跟 opening-art.js 的 RATIO 一樣（換圖時忘了改會變形）；空斗篷、小鐵杯是 10/12 換上的正式圖
  const pngSize = (f) => { const b = fs.readFileSync(path.join(root, 'assets', 'opening', f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const [f, k] of [['kitten_wet.png', 'kitten_wet'], ['kitten_cloak.png', 'kitten_cloak'], ['cloak_empty.png', 'cloak_empty'], ['mini_sleep.png', 'mini_sleep'], ['mini_startled.png', 'mini_startled'], ['tin_tea.png', 'tin'], ['tin_empty.png', 'tin']]) {
    const [w, h] = pngSize(f);
    assert.ok(Math.abs(w / h - OA.RATIO[k]) < 0.02, `${f} 的寬高比 ${(w / h).toFixed(3)}，RATIO.${k}＝${OA.RATIO[k].toFixed(3)}`);
  }
  assert.ok(/tin_tea\.png/.test(OA.prop('tinWarm')) && /op-steam/.test(OA.prop('tinWarm')) && /tin_empty\.png/.test(OA.prop('tinEmpty')) && !/op-steam/.test(OA.prop('tinEmpty')), '小鐵杯用圖、熱氣用程式畫');
  for (const f of ['forest.jpg', 'guild.jpg', 'fire_tea.jpg', 'kitten_wet.png', 'kitten_cloak.png', 'cloak_empty.png', 'mini_sleep.png', 'mini_startled.png', 'tin_tea.png', 'tin_empty.png']) {
    assert.ok(fs.statSync(path.join(root, 'assets', 'opening', f)).size > 1000, '開場圖 ' + f);
  }
  const ojs = fs.readFileSync(path.join(root, 'src/renderer/opening.js'), 'utf8');
  for (const m of ojs.matchAll(/'([\w]+\.(?:png|jpg))'/g)) assert.ok(fs.existsSync(path.join(root, 'assets', 'opening', m[1])), 'opening.js 用到的圖 ' + m[1]);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.build.files.includes('assets/opening/*'), '打包帶上開場圖');
  assert.ok(/'opening:done'/.test(fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8')));
  const ohtml = fs.readFileSync(path.join(root, 'src/renderer/opening.html'), 'utf8');
  assert.ok(['opening-script.js', 'opening-art.js', 'opening.js'].every((f) => ohtml.includes(`src="${f}"`)) && /Content-Security-Policy/.test(ohtml));
  assert.ok(/id="actors"[\s\S]*id="front"[\s\S]*id="actors2"/.test(ohtml), '艾琳在櫃台後面、貓在櫃台前面');
  const mjs = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.ok(/重看開場/.test(mjs) && /QUEST_NPC_OPENING/.test(mjs), '選單可以重看；其他自動測試不演開場');
  // 8. 存檔：改名寫進 config（自稱跟著變）、登記的名字和那句話存進存檔、演過開場新手教學從「基本操作」開始
  const { Engine } = require('../src/main/engine');
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-op-app-'));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-op-user-'));
  fs.mkdirSync(path.join(appDir, 'plans')); fs.mkdirSync(path.join(appDir, 'lore'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(appDir, 'plans', 'week_sample.md'));
  fs.copyFileSync(path.join(root, 'lore', '艾琳.md'), path.join(appDir, 'lore', '艾琳.md'));
  fs.copyFileSync(path.join(root, 'config.example.json'), path.join(appDir, 'config.example.json'));
  const cfg0 = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));
  fs.writeFileSync(path.join(userDir, 'config.json'), JSON.stringify({ ...cfg0, lore: { ...(cfg0.lore || {}), embeddings: false } })); // 不碰 Ollama（別的測試在數向量呼叫次數）
  const E = new Engine({ appDir, userDir });
  E.npc.status.online = false;
  assert.ok(E.config.opening.enabled === true && cfg0.npc.selfName === '艾琳', '預設會演開場；範例設定的自稱寫死艾琳');
  assert.deepStrictEqual([E.view().onboarding.needed, E.view().onboarding.start, E.view().opening.done], [true, 'welcome', false]);
  let r = E.finishOpening({ name: '小雪', player: '  阿明 ', blank: false, echo: 2, skipped: false });
  assert.ok(r.renamed && E.config.npc.name === '小雪' && E.npc.names().self === '小雪', '改名：自稱跟著變（範例設定的 selfName 也跟著改）');
  assert.ok(E.config.npc.catchphrases.includes('交給小雪吧！') && !E.config.npc.catchphrases.join('').includes('艾琳'), '口頭禪裡的名字跟著改');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(userDir, 'config.json'), 'utf8')).npc.name, '小雪', '寫進 config.json');
  assert.strictEqual(E.state.playerName, '阿明');
  assert.ok(E.state.opening.done && E.state.opening.echo === 2 && !E.state.opening.skipped && E.state.opening.at);
  assert.deepStrictEqual([E.view().onboarding.needed, E.view().onboarding.start, E.view().npc.name], [true, 'basics', '小雪']);
  const saved = JSON.parse(fs.readFileSync(path.join(userDir, 'data', 'save.json'), 'utf8'));
  assert.ok(saved.opening.done && saved.playerName === '阿明', '存進存檔');
  // 重看：直接關＝什麼都不改；改回艾琳、沒選話＝那句話保留、記下重看時間
  const at0 = E.state.opening.at;
  E.finishOpening({ keep: true }, { replay: true });
  assert.ok(E.config.npc.name === '小雪' && E.state.playerName === '阿明' && !E.state.opening.replayedAt);
  r = E.finishOpening({ name: '艾琳', player: '阿明', echo: 0, skipped: true }, { replay: true });
  assert.ok(r.renamed && E.config.npc.name === '艾琳' && E.state.opening.echo === 2 && E.state.opening.at === at0 && E.state.opening.replayedAt && !E.state.opening.skipped);
  E.finishOpening({ name: '我', blank: true, echo: 3 }, { replay: true });
  assert.ok(E.config.npc.name === '艾琳' && E.state.playerName === '' && E.state.opening.echo === 3, '不合規則的名字不改；登記簿可以改成空著');
  // 舊存檔（新手教學已完成）：不會自動演
  const E2 = new Engine({ appDir, userDir });
  E2.state.onboarding = { done: true };
  assert.ok(!E2.view().onboarding.needed);
  for (const d of [appDir, userDir]) fs.rmSync(d, { recursive: true, force: true });
  console.log('開場測試通過 ✔');
})();

// ---------- ✏️ 接待員改名：內建台詞、角色設定、雜貨舖、成就、運勢、待機小字都跟著換；罵新名字一樣抓得到 ----------
(async () => {
  const os = require('os');
  const root = path.join(__dirname, '..');
  const RN = require('../src/renderer/rename');
  const A = require('../src/main/affection');
  const { NPC, TEMPLATES, voice } = require('../src/main/npc');
  const { Lore } = require('../src/main/lore');
  const { Engine } = require('../src/main/engine');
  const leftover = (s) => String(s).split('艾琳的任務櫃台').join('').includes('艾琳'); // 程式名稱、資料夾不算
  // 1. rename：換過再換一樣、程式名稱不動、冒險者寫的字不動、名字裡有艾琳也不會疊字
  assert.strictEqual(RN.rename('交給艾琳吧！資料在「文件\\艾琳的任務櫃台」', '小雪'), '交給小雪吧！資料在「文件\\艾琳的任務櫃台」');
  assert.strictEqual(RN.rename(RN.rename('艾琳的房間', '艾琳娜'), '艾琳娜'), '艾琳娜的房間', '換兩次也一樣');
  assert.strictEqual(RN.rename('幫艾琳買奶茶，艾琳說', '小雪', { protect: ['幫艾琳買奶茶'] }), '幫艾琳買奶茶，小雪說', '任務名不動');
  assert.strictEqual(RN.rename('艾琳', '艾琳'), '艾琳');
  assert.deepStrictEqual(RN.renameDeep({ a: ['艾琳的', { b: '艾琳' }], n: 3, f: null }, '小雪'), { a: ['小雪的', { b: '小雪' }], n: 3, f: null });
  assert.strictEqual(RN.toBase('小雪是白痴', '小雪'), '艾琳是白痴');
  assert.strictEqual(RN.toBase('今天下雪了', '雪'), '今天下雪了', '一個字的名字不換');
  // 2. 罵新名字一樣算失禮；稱讚新名字一樣算稱讚
  assert.strictEqual(A.classify('小雪是白痴'), null);
  assert.strictEqual(A.classify(RN.toBase('小雪是白痴', '小雪')), 'rude');
  assert.strictEqual(A.classify(RN.toBase('摸小雪的屁股', '小雪')), 'harass');
  // 3. AI 的回覆和內建台詞：自稱、AI 不小心說的「艾琳」、填進去的運勢句都換成新名字
  assert.strictEqual(voice('我是艾琳～交給艾琳吧！', { self: '小雪' }), '這裡是小雪～交給小雪吧！');
  const npc = new NPC({ npc: { name: '小雪', selfName: '小雪', callName: '冒險者' }, llm: { enabled: false } });
  for (const key of Object.keys(TEMPLATES)) {
    for (let i = 0; i < 12; i++) {
      const t = npc.template(key, { quest: '週報', opener: '🔮 「大吉」！艾琳的尾巴都豎起來了！今天', advice: '適合跟艾琳說說話', item: '奶茶', rank: '大吉', gold: 5, name: '成就', note: '生日', left: 1 }).text;
      assert.ok(!leftover(t), `${key}：${t}`);
    }
  }
  assert.ok(npc.template('fortune', { opener: '「大吉」！艾琳的尾巴都豎起來了！', advice: '適合喝茶', item: '鈴', gold: 3 }).text.includes('小雪的尾巴'), '運勢句換成新名字');
  assert.ok(!leftover(npc.template('greet', { quest: '幫艾琳買奶茶' }).text.replace('幫艾琳買奶茶', '')), '任務名裡的艾琳不動');
  // 4. 角色設定：讀進來就是新名字；打新名字或「艾琳」都找得到
  const lore = new Lore({ file: path.join(root, 'lore', '艾琳.md'), dataDir: os.tmpdir(), embeddings: false, npcName: '小雪' });
  const flat = JSON.stringify({ name: lore.name, core: lore.core, e: lore.entries.map((e) => [e.title, e.text, e.reply, e.topics]) });
  assert.ok(!leftover(flat) && flat.includes('小雪'), '角色設定沒有留下艾琳');
  const room = lore.entries.find((e) => /小雪的房間/.test(e.title));
  assert.ok(room, '標題也換了');
  assert.ok((await lore.retrieve('小雪的房間長什麼樣子')).some((h) => h.entry === room) && (await lore.retrieve('艾琳的房間長什麼樣子')).some((h) => h.entry === room), '新舊名字都找得到');
  assert.ok(lore.topicPool().every((t) => !leftover(t.text)), '話題');
  // 5. 引擎：⚙ 改名、雜貨舖、成就、星座卡、運勢、新手任務、AI 的系統提示
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-rn-app-'));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-rn-user-'));
  fs.mkdirSync(path.join(appDir, 'plans')); fs.mkdirSync(path.join(appDir, 'lore'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(appDir, 'plans', 'week_sample.md'));
  fs.copyFileSync(path.join(root, 'lore', '艾琳.md'), path.join(appDir, 'lore', '艾琳.md'));
  const cfg0 = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));
  fs.writeFileSync(path.join(userDir, 'config.json'), JSON.stringify({ ...cfg0, lore: { ...(cfg0.lore || {}), embeddings: false }, llm: { ...cfg0.llm, enabled: false } }));
  const E = new Engine({ appDir, userDir });
  E.npc.status.online = false;
  let r = E.renameNpc('我是誰');
  assert.ok(r.invalid && /我/.test(r.invalid) && E.config.npc.name === '艾琳', '不合規則：不改');
  assert.ok(E.renameNpc('艾琳').same, '一樣的名字');
  r = E.renameNpc(' 小雪 ');
  assert.ok(r.renamed === '小雪' && E.config.npc.name === '小雪' && E.npc.names().self === '小雪' && r.lines[0].event === 'renamed' && r.lines[0].text.includes('小雪'), '改名：' + JSON.stringify(r.lines));
  assert.strictEqual(E.lore.npcName, '小雪', '角色設定跟著重讀');
  assert.ok(!leftover(E.npc.systemPrompt()) && E.npc.systemPrompt().includes('小雪'), '系統提示（含角色核心設定）');
  E.state.player.gold = 9999;
  const views = [E.shopOpen().shop, E.collectionView(), E.drawFortune().fortune, E.view().tutorial, E.view()];
  for (const v of views) assert.ok(!leftover(JSON.stringify(v || {})), '還有艾琳：' + (JSON.stringify(v || {}).match(/.{0,20}艾琳.{0,20}/) || [''])[0]);
  const gift = await E.buyGift('tea');
  assert.ok(!leftover(JSON.stringify(gift.lines)) && !leftover(JSON.stringify(gift.shop)), '送禮');
  E.twinsQueue('tea', {});
  const tea = E.twinsTake();
  assert.ok(!tea.visit || (!leftover(JSON.stringify(tea.visit.lines)) && !leftover((tea.visit.erin || {}).text || '')), '下午茶外送');
  // 小本子：說到她的事不記（用新名字說也一樣）
  const before = E.nb().items.length;
  E.noteFrom('小雪喜歡吃魚形麵包', []);
  assert.strictEqual(E.nb().items.length, before, '說她喜歡什麼不記在冒險者的小本子');
  E.noteFrom('我喜歡吃魚形麵包', []);
  assert.strictEqual(E.nb().items.length, before + 1);
  // 罵新名字：扣好感
  const p0 = E.aff().points = 50;
  await E.chat('小雪是白痴');
  assert.ok(E.aff().points < p0, '罵新名字也會扣好感');
  // 6. 畫面：待機小字、面板台詞、說明小卡、改名表單
  const rjs = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.ok(/whisper\.textContent = typeof nmR === 'function' \? nmR\(text\)/.test(fs.readFileSync(path.join(root, 'src/renderer/idle.js'), 'utf8')), '待機小字');
  assert.ok(rjs.includes('rich(nmR(ln.text))') && rjs.includes('renameStatic(v.npc.name)') && rjs.includes("state.panel === 'rename'"), '面板台詞、說明小卡、改名表單');
  assert.ok(html.indexOf('src="rename.js"') > 0 && html.indexOf('src="rename.js"') < html.indexOf('src="renderer.js"') && html.includes('src="opening-script.js"'));
  assert.ok(/幫接待員改名字/.test(fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8')) && /renameNpc/.test(fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8')));
  // 畫面上寫死的「艾琳」：只剩預設值和程式／資料夾名稱
  for (const f of ['renderer.js', 'shop.js', 'notebook.js', 'journal.js', 'twins.js', 'update.js', 'onboard.js']) {
    const code = fs.readFileSync(path.join(root, 'src/renderer', f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''));
    const bad = code.filter((l) => leftover(l) && !/\|\| '艾琳'|Rename\.BASE|: '艾琳'|關於\|艾琳/.test(l));
    assert.deepStrictEqual(bad, [], `${f} 還寫死艾琳`);
  }
  for (const d of [appDir, userDir]) fs.rmSync(d, { recursive: true, force: true });
  console.log('接待員改名測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 📯 團戰（會議）：計畫檔 📯、自己建（重複／例外）、提醒、自動專注、改時間、取消 ----------
(async () => {
  const os = require('os');
  const R = require('../src/main/raids');
  const P = require('../src/main/planParser');
  const { Engine } = require('../src/main/engine');
  // 規則：哪幾天有、文字
  const wk = { id: 'w', title: '站會', date: '2026-10-12', start: '10:00', end: '10:30', repeat: 'weekly', days: [1, 3] };
  assert.deepStrictEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-19', '2026-10-05'].map((d) => R.occursOn(wk, d)), [true, false, true, true, false], '每週一、三；開始日之前沒有');
  assert.deepStrictEqual(['2026-10-16', '2026-10-17'].map((d) => R.occursOn({ ...wk, repeat: 'weekdays' }, d)), [true, false], '平日');
  assert.ok(R.occursOn({ ...wk, repeat: 'daily' }, '2026-10-18') && !R.occursOn({ ...wk, repeat: 'once' }, '2026-10-14'));
  assert.strictEqual(R.repeatText({ ...wk, days: [3, 1] }), '每週一、三');
  assert.strictEqual(R.remindText([15, 5, 0]), '前 15、5 分鐘和開始時');
  assert.strictEqual(R.remindText([10]), '前 10 分鐘');
  assert.ok(R.isRaidText('📯 週會') && R.isRaidText('⚔ 站會') && R.isRaidText('團戰：讀書會') && !R.isRaidText('寫週報'));
  assert.throws(() => R.makeItem({ title: 'x', date: '2026-10-12', start: '10:00', end: '09:00' }, { id: 'a' }), /結束時間要在開始之後/);
  assert.throws(() => R.makeItem({ title: ' ', date: '2026-10-12', start: '10:00' }, { id: 'a' }), /要有名稱/);
  assert.throws(() => R.makeItem({ title: 'x', date: '2026-10-01', start: '10:00' }, { id: 'a', today: '2026-10-12' }), /已經過了/);
  assert.deepStrictEqual(R.makeItem({ title: 'x', date: '2026-10-14', start: '10:00', repeat: 'weekly' }, { id: 'a' }).days, [3], '每週沒選星期：用那一天');
  // 提醒：一次只說最新的一句、錯過的不補、晚開也接得上
  const o = { key: 'a|w|2026-10-12|10:00', date: '2026-10-12', start: '10:00', end: '10:30', canceled: false };
  const at = (hm) => new Date(`2026-10-12T${hm}:00`);
  const due = (hm, fired = []) => R.dueReminder(o, at(hm), { remind: [15, 5, 0], fired });
  assert.strictEqual(due('09:44').kind, null);
  assert.deepStrictEqual([due('09:45').kind, due('09:45').mins, due('09:45').mark], ['soon', 15, [15]]);
  assert.strictEqual(due('09:46', [15]).kind, null, '說過就不再說');
  assert.deepStrictEqual([due('09:56', [15]).kind, due('09:56', [15]).lead, due('09:56', [15]).mins], ['soon', 5, 4]);
  assert.deepStrictEqual([due('09:57').kind, due('09:57').lead, due('09:57').mark.sort((a, b) => a - b)], ['soon', 5, [5, 15]], '晚開：只說 5 分鐘那句，15 分鐘那句也算說過');
  assert.deepStrictEqual([due('10:00', [15, 5]).kind, due('10:00', [15, 5]).late], ['start', false]);
  assert.deepStrictEqual([due('10:12').kind, due('10:12').late], ['start', true], '團戰中才打開：直接接上');
  assert.strictEqual(due('10:30').kind, null, '結束了就不說');
  assert.strictEqual(R.dueReminder({ ...o, canceled: true }, at('10:00')).kind, null, '取消的不提醒');
  // 計畫檔：📯（⚔、團戰：也算）、~~劃掉~~＝取消、名稱不含記號
  const plan = P.parsePlan('# 2026 測試週\n\n## 週一 10/12\n- 09:00–10:00 寫報告\n- [ ] 14:00–15:00 📯 週會 → 決議\n- ~~16:00–16:30 ⚔ 客戶電話~~\n- 17:00 團戰：讀書會（取消）\n');
  assert.deepStrictEqual(plan.days[0].rows.map((r) => [r.a, !!r.raid, !!r.canceled]), [['寫報告', false, false], ['週會', true, false], ['客戶電話', true, true], ['讀書會', true, true]]);
  const occ = R.occurrences({ planDays: plan.days, items: [wk], from: '2026-10-12', to: '2026-10-14' });
  assert.deepStrictEqual(occ.map((x) => `${x.date.slice(8)} ${x.start}–${x.end} ${x.title}${x.canceled ? '✕' : ''}`), ['12 10:00–10:30 站會', '12 14:00–15:00 週會', '12 16:00–16:30 客戶電話✕', '12 17:00–18:00 讀書會✕', '14 10:00–10:30 站會'], '只有開始時間的算一小時');

  // ---- 引擎 ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-raid-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '# 2026 團戰測試週\n\n## 寫完週報 🔧 📅 10/16\n- [ ] 收資料\n\n## 週一 10/12\n- 09:00–10:00 寫報告\n- 14:00–15:00 📯 週會 → 決議\n\n## 週三 10/14\n- 09:00–12:00 試做\n');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, achievements: { enabled: false }, streak: { enabled: false }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false }, reminders: { items: [] } }));
  let t = new Date('2026-10-12T09:00:00').getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  const set = (hm, d = '2026-10-12') => { t = new Date(`${d}T${hm}:00`).getTime(); };
  const file = () => fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  const ev = (lines) => lines.map((l) => l.event);
  let v = E.view();
  assert.deepStrictEqual(v.raids.list.map((x) => [x.source, x.title, x.start]), [['plan', '週會', '14:00']], '計畫檔的團戰');
  // 自己建：每週一、三的站會
  const add = await E.addRaid({ title: '專案站會', date: '2026-10-12', start: '10:00', end: '10:30', repeat: 'weekly', days: [1, 3] });
  assert.ok(ev(add.lines)[0] === 'raid_set' && /前 15、5 分鐘和開始時/.test(add.lines[0].text) && /每週一、三/.test(add.lines[0].text), add.lines[0].text);
  v = E.view();
  assert.deepStrictEqual(v.raids.list.map((x) => `${x.date.slice(8)} ${x.start} ${x.title}`), ['12 10:00 專案站會', '12 14:00 週會', '14 10:00 專案站會']);
  await assert.rejects(E.addRaid({ title: '', date: '2026-10-12', start: '10:00' }), /要有名稱/);
  // 提醒：前 15、前 5、開始時自動專注
  set('09:45'); assert.deepStrictEqual(ev(await E.tick()), ['raid_soon']);
  set('09:46'); assert.deepStrictEqual(ev(await E.tick()), [], '同一句不重複');
  set('09:55'); let ls = await E.tick();
  assert.ok(ev(ls)[0] === 'raid_soon_last' && /5 分鐘/.test(ls[0].text), ls[0].text);
  set('10:00'); ls = await E.tick();
  assert.deepStrictEqual(ev(ls), ['raid_start']);
  assert.ok(E.raidStarted && E.state.focus && E.state.focus.raid.title === '專案站會', '開始時自動專注');
  assert.ok(E.focusInfo().raid && E.focusInfo().leftMin === 30 && E.view().raids.list[0].active, '倒數到結束時間');
  assert.strictEqual(E.proactiveDue({ idleSec: 0 }), null, '團戰中不主動聊天');
  set('10:30'); const gold0 = E.state.player.gold;
  let r = E.completeFocus();
  assert.ok(ev(r.lines)[0] === 'raid_done' && r.reward.xp === 10 && E.state.player.gold === gold0 + 3 && !E.state.focus, '結束：星屑和金幣');
  // 只改這一次：週三那場改到 11:00–11:45；週一的不受影響
  const wed = E.view().raids.list.find((x) => x.date === '2026-10-14');
  r = await E.editRaid(wed.key, { start: '11:00', end: '11:45' }, 'one');
  assert.strictEqual(ev(r.lines)[0], 'raid_moved');
  let list = E.view().raids.list;
  assert.deepStrictEqual(list.filter((x) => x.source === 'app').map((x) => `${x.date.slice(8)} ${x.start}–${x.end}${x.moved ? '*' : ''}`), ['12 10:00–10:30', '14 11:00–11:45*']);
  // 只改這一次、換到別天：那天取消、另外加一場
  r = await E.editRaid(list.find((x) => x.date === '2026-10-14').key, { date: '2026-10-15', start: '09:30', end: '10:00' }, 'one');
  list = E.view().raids.list.filter((x) => x.source === 'app');
  assert.deepStrictEqual(list.map((x) => `${x.date.slice(8)} ${x.start}${x.canceled ? '✕' : ''}${x.repeat === 'once' ? '(一次)' : ''}`), ['12 10:00', '14 11:00✕', '15 09:30(一次)']);
  // 整個系列：改到 10:15，單獨改過的也回到新時間
  r = await E.editRaid(list[0].key, { start: '10:15', end: '10:45' }, 'all');
  list = E.view().raids.list.filter((x) => x.source === 'app' && x.repeat === 'weekly');
  assert.deepStrictEqual(list.map((x) => `${x.date.slice(8)} ${x.start}–${x.end}${x.canceled ? '✕' : ''}`), ['12 10:15–10:45', '14 10:15–10:45✕']);
  // 恢復這一次、取消這一次、整個系列刪掉
  await E.restoreRaid(list[1].key);
  assert.ok(!E.view().raids.list.find((x) => x.date === '2026-10-14' && x.repeat === 'weekly').canceled, '恢復');
  r = await E.cancelRaid(E.view().raids.list.find((x) => x.date === '2026-10-14' && x.repeat === 'weekly').key, 'one');
  assert.ok(ev(r.lines)[0] === 'raid_cancel' && E.view().raids.list.find((x) => x.date === '2026-10-14' && x.repeat === 'weekly').canceled);
  r = await E.cancelRaid(E.view().raids.list.find((x) => x.repeat === 'weekly').key, 'all');
  assert.ok(ev(r.lines)[0] === 'raid_cancel_all' && !E.view().raids.list.some((x) => x.repeat === 'weekly'), '整個系列刪掉');
  // 計畫檔的團戰：改時間寫回檔案、取消＝劃掉、恢復
  const wk1 = E.view().raids.list.find((x) => x.source === 'plan');
  await E.editRaid(wk1.key, { start: '14:30', end: '15:30' });
  assert.ok(/^- 14:30–15:30 📯 週會 → 決議$/m.test(file()), '改時間寫回計畫檔');
  const wk2 = E.view().raids.list.find((x) => x.source === 'plan');
  await E.cancelRaid(wk2.key);
  assert.ok(/^- ~~14:30–15:30 📯 週會 → 決議~~$/m.test(file()) && E.view().raids.list.find((x) => x.source === 'plan').canceled, '取消＝整格劃掉');
  set('14:15'); assert.deepStrictEqual(ev(await E.tick()), [], '取消了不提醒');
  await E.restoreRaid(E.view().raids.list.find((x) => x.source === 'plan').key);
  assert.ok(/^- 14:30–15:30 📯 週會 → 決議$/m.test(file()), '恢復');
  assert.ok(!E.todayInfo().rows.find((x) => x.raid).canceled);
  // 🍅 專注中遇到團戰：🍅 先停，換成團戰的專注
  set('14:20'); E.startFocus(25);
  set('14:30'); ls = await E.tick();
  assert.ok(ev(ls).includes('raid_start') && E.state.focus.raid && E.state.focus.raid.title === '週會', '團戰蓋過番茄鐘');
  assert.strictEqual(E.proactiveDue({ idleSec: 0 }), null);
  // 進行中改結束時間：倒數跟著改；剛開始就「結束了」不給獎勵
  await E.editRaid(E.view().raids.list.find((x) => x.source === 'plan').key, { end: '16:00' });
  assert.ok(E.state.focus && E.focusInfo().leftMin === 90, '延長：倒數到新的結束時間');
  set('14:35'); r = E.cancelFocus();
  assert.ok(ev(r.lines)[0] === 'raid_leave' && !r.reward && !E.state.focus, '剛開始就關掉：不算打完');
  // 重開程式在團戰中：直接接上（提醒紀錄清掉模擬第一次看到）
  E.state.raids.fired = {}; set('14:50'); ls = await E.tick();
  assert.deepStrictEqual(ev(ls), ['raid_late']);
  set('15:05'); r = E.cancelFocus();
  assert.ok(ev(r.lines)[0] === 'raid_done_early' && r.reward && r.reward.xp === 10, '待了 15 分鐘就提早結束：算打完');
  assert.ok(/^- \[x\] 14:30–16:00 📯 週會 → 決議$/m.test(file()), '計畫檔那一格自動勾起來');
  // 那一格已經勾過：團戰結束不重複給
  E.state.raids.fired = {}; set('15:10'); await E.tick();
  set('16:00'); r = E.completeFocus();
  assert.ok(ev(r.lines)[0] === 'raid_done_plain' && !r.reward, '已經勾過：不重複給獎勵');
  // 取消正在進行的那場：專注跟著結束
  await E.addRaid({ title: '臨時會', date: '2026-10-12', start: '16:10', end: '16:40' });
  set('16:10'); await E.tick();
  assert.ok(E.state.focus && E.state.focus.raid.title === '臨時會');
  await E.cancelRaid(E.view().raids.list.find((x) => x.title === '臨時會').key);
  assert.ok(!E.state.focus, '取消進行中的團戰：專注結束');
  // 改成過去的日期：丟錯，原本的不會被改到一半
  const lin = E.view().raids.list.find((x) => x.title === '臨時會');
  await assert.rejects(E.editRaid(lin.key, { date: '2026-10-01', start: '09:00', end: '09:30' }), /已經過了/);
  assert.ok(E.state.raids.items.find((x) => x.title === '臨時會').start === '16:10', '丟錯時沒改到');
  // 不要自動專注：開始時只提醒
  E.config.raids = { ...E.config.raids, autoFocus: false };
  await E.addRaid({ title: '輕鬆聊', date: '2026-10-12', start: '16:50', end: '17:00' });
  set('16:50'); ls = await E.tick();
  assert.ok(ev(ls).includes('raid_start_plain') && !E.state.focus, '不自動專注：只說時間到');
  E.config.raids.autoFocus = true;
  // 存檔再讀回來還在；過期的資料會清掉
  await E.addRaid({ title: '每日站會', date: '2026-10-12', start: '17:00', end: '17:15', repeat: 'daily' });
  const E2 = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date('2026-10-20T09:00:00') });
  assert.ok(E2.view().raids.list.filter((x) => x.title === '每日站會').length === 7, '每天：接下來 7 天都有');
  const st = { items: [{ id: 'x', title: '舊', date: '2026-09-01', start: '10:00', repeat: 'once', skip: {}, moved: {} }, { id: 'y', title: '新', date: '2026-09-01', start: '10:00', repeat: 'daily', skip: { '2026-09-02': true, '2026-10-19': true }, moved: {} }], fired: { 'a|y|2026-09-02|10:00': [0], 'a|y|2026-10-20|10:00': [15] } };
  R.prune(st, '2026-10-20');
  assert.deepStrictEqual([st.items.map((x) => x.id), Object.keys(st.items[0].skip), Object.keys(st.fired)], [['y'], ['2026-10-19'], ['a|y|2026-10-20|10:00']]);
  // 行事曆匯出不含取消的
  await E.cancelRaid(E.view().raids.list.find((x) => x.source === 'plan').key);
  assert.ok(!/週會/.test(E.exportICS().text), '取消的團戰不匯出');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('團戰測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 📆 週末、國定假日、請假：連續上工不斷、平日提醒不叫、重複團戰跳過 ----------
(async () => {
  const os = require('os');
  const CAL = require('../src/main/calendar');
  const AC = require('../src/main/achievements');
  const { Engine } = require('../src/main/engine');
  // 人事總處辦公日曆：補假、週末的節日、補行上班
  const k = (d, o) => { const x = CAL.dayInfo(d, o); return `${x.off ? 'off' : 'on'}:${x.kind || ''}:${x.name}`; };
  assert.strictEqual(k('2026-10-09'), 'off:holiday:國慶日補假');
  assert.strictEqual(k('2026-10-10'), 'off:holiday:國慶日', '落在週六的節日也叫得出名字');
  assert.strictEqual(k('2026-10-12'), 'on::');
  assert.strictEqual(k('2026-10-17'), 'off:weekend:週末');
  assert.strictEqual(k('2025-02-08'), 'on:work:補行上班', '補行上班的週六要上工');
  assert.ok(['2026-02-16', '2026-02-20', '2026-05-01', '2026-06-19', '2026-09-25', '2026-09-28', '2026-10-26', '2026-12-25', '2027-02-10', '2027-04-30', '2027-12-31'].every((d) => CAL.isOff(d)), '2026、2027 的假日');
  for (const y of CAL.YEARS) for (const md of Object.keys(CAL.TW[y].off)) assert.ok(CAL.validISO(`${y}-${md}`), `日期寫錯：${y}-${md}`);
  assert.strictEqual(k('2026-10-09', { region: 'none' }), 'on::', '不是台灣：只看週末');
  assert.strictEqual(k('2026-10-30', { holidays: { '2026-10-30': '公司週年' } }), 'off:holiday:公司週年', '自己加的放假日');
  assert.strictEqual(k('2026-10-09', { workdays: ['2026-10-09'] }), 'on:work:上班日', '自己加的上班日');
  assert.strictEqual(k('2026-10-13', { leave: { '2026-10-13': '特休' } }), 'off:leave:特休');
  assert.ok(!CAL.hasData('2031-01-01') && CAL.hasData('2026-05-01'));
  assert.deepStrictEqual(CAL.upcoming('2026-10-05', 22, { leave: { '2026-10-13': '特休' } }).map((d) => `${d.date.slice(5)} ${d.name}`), ['10-09 國慶日補假', '10-10 國慶日', '10-13 特休', '10-25 光復節', '10-26 光復節補假']);
  // 連續上工：國慶連假（10/9 五～10/11 日）不斷；請假不斷；補行上班的週六沒上工會斷
  const st = AC.blankStreak();
  AC.checkIn(st, '2026-10-08');
  assert.ok(AC.checkIn(st, '2026-10-12').kept && st.cur === 2, '國慶連假不算斷');
  assert.ok(!AC.checkIn(AC.blankStreak(), '2026-10-12').kept);
  const s2 = { ...AC.blankStreak() }; AC.checkIn(s2, '2026-10-12');
  assert.ok(!AC.checkIn(s2, '2026-10-14').kept, '10/13 沒請假：斷了');
  const s3 = { ...AC.blankStreak() }; AC.checkIn(s3, '2026-10-12');
  assert.ok(AC.checkIn(s3, '2026-10-14', { calendar: { leave: { '2026-10-13': '特休' } } }).kept, '10/13 請假：不斷');
  const s4 = { ...AC.blankStreak() }; AC.checkIn(s4, '2025-02-07');
  assert.ok(!AC.checkIn(s4, '2025-02-10').kept, '2/8 補行上班沒上工：斷了');
  assert.strictEqual(AC.current({ cur: 5, best: 5, last: '2026-10-08', days: 5 }, '2026-10-12'), 5, '畫面：連假後還是 5 天');

  // ---- 引擎 ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-cal-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '# 2026 假日測試週\n\n## 週五 10/9\n- 10:00–11:00 📯 計畫檔裡的會\n\n## 週一 10/12\n- 09:00–10:00 寫報告\n');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, achievements: { enabled: false }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false }, reminders: { weekdaysOnly: true, items: [{ time: '12:00', event: 'lunch' }] } }));
  let t = new Date('2026-10-08T09:00:00').getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  const set = (iso, hm) => { t = new Date(`${iso}T${hm}:00`).getTime(); };
  const ev = (ls) => ls.map((l) => l.event);
  // 平日提醒：國定假日不叫、平常的平日照叫
  set('2026-10-09', '12:00'); assert.ok(!ev(await E.tick()).includes('lunch'), '國慶日補假：不提醒午餐');
  set('2026-10-08', '12:00'); assert.ok(ev(await E.tick()).includes('lunch'), '平常的平日照叫');
  // 重複的團戰：平日／每週遇到國定假日跳過（可以照開）；計畫檔寫死那天的照樣有
  await E.addRaid({ title: '每日早會', date: '2026-10-08', start: '09:30', end: '09:45', repeat: 'weekdays' });
  await E.addRaid({ title: '週五回顧', date: '2026-10-09', start: '16:00', end: '16:30', repeat: 'weekly', days: [5] });
  await E.addRaid({ title: '天天打卡', date: '2026-10-08', start: '08:55', end: '09:00', repeat: 'daily' });
  set('2026-10-08', '18:00');
  let fri = E.raidOccurrences('2026-10-09', '2026-10-09');
  assert.deepStrictEqual(fri.map((o) => `${o.title}${o.canceled ? `✕${o.holiday || ''}` : ''}`), ['天天打卡', '每日早會✕國慶日補假', '計畫檔裡的會', '週五回顧✕國慶日補假'], '平日／每週遇到國定假日跳過；每天、計畫檔的不跳');
  E.state.raids.fired = {}; // 前面跳到 10/9 中午測過午餐：時間倒回來，提醒紀錄清掉
  set('2026-10-09', '09:30'); assert.ok(!ev(await E.tick()).includes('raid_start') && !E.state.focus, '放假跳過的不提醒、不開專注');
  set('2026-10-09', '09:45'); assert.deepStrictEqual(ev(await E.tick()), ['raid_soon'], '計畫檔寫死那天的照樣提醒');
  E.state.focus = null;
  const keep = fri.find((o) => o.title === '週五回顧');
  await E.restoreRaid(keep.key);
  assert.ok(!E.raidOccurrences('2026-10-09', '2026-10-09').find((o) => o.title === '週五回顧').canceled, '「照開」之後這天有');
  assert.ok(E.raidOccurrences('2026-10-16', '2026-10-16').some((o) => o.title === '週五回顧' && !o.canceled), '下週照常');
  // 請假：那天不提醒、團戰靜音、連續上工不斷；不能請過去的假
  set('2026-10-12', '08:00');
  let r = await E.setLeave('2026-10-13', true, '特休');
  assert.ok(ev(r.lines)[0] === 'leave_set' && /特休/.test(r.lines[0].text) && E.view().calendar.leave[0].date === '2026-10-13');
  await assert.rejects(E.setLeave('2026-10-01', true), /已經過了/);
  set('2026-10-13', '09:15'); let ls = await E.tick();
  assert.ok(!ev(ls).some((e) => /^raid/.test(e)), '請假那天團戰不提醒');
  set('2026-10-13', '09:30'); ls = await E.tick();
  assert.ok(!ls.length && !E.state.focus, '請假那天不開團戰專注');
  assert.strictEqual(E.raidOccurrences('2026-10-13', '2026-10-13').find((o) => o.title === '每日早會').muted, true);
  set('2026-10-13', '12:00'); assert.ok(!ev(await E.tick()).includes('lunch'), '請假不提醒午餐');
  assert.strictEqual(E.view().calendar.today.kind, 'leave');
  // 連續上工：10/8 打卡 → 10/9～10/11 放假、10/12 打卡 → 10/13 請假 → 10/14 打卡，連續 3 天
  E.state.streak = { cur: 1, best: 1, last: '2026-10-08', days: 1 };
  set('2026-10-12', '10:00'); assert.strictEqual(AC.checkIn(E.state.streak, '2026-10-12', E.streakOpts()).cur, 2);
  assert.strictEqual(AC.checkIn(E.state.streak, '2026-10-14', E.streakOpts()).cur, 3, '請假那天不算斷');
  // 取消請假
  set('2026-10-13', '08:00');
  r = await E.setLeave('2026-10-13', false);
  assert.ok(ev(r.lines)[0] === 'leave_unset' && !E.state.leave['2026-10-13'] && E.view().calendar.today.kind === null);
  // 正在團戰中請假：專注一起關
  E.state.raids.fired = {}; set('2026-10-13', '09:30'); await E.tick();
  assert.ok(E.state.focus && E.state.focus.raid, '團戰開始');
  await E.setLeave('2026-10-13', true);
  assert.ok(!E.state.focus, '請假：團戰專注關掉');
  // 放假那天不主動催行程
  set('2026-10-09', '10:30');
  E.config.window.idleChatterMinutes = 1; E.lastTouch = 0; E.state.focus = null;
  assert.notStrictEqual(E.proactiveDue({ idleSec: 0 }), 'daily', '國定假日不說「現在這格」');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('假日與請假測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 📏 提示太長：Ollama 會默默把前面一半切掉 → 艾琳照抄冒險者的話、回英文、亂判態度（10/12 的 bug） ----------
(async () => {
  const os = require('os');
  const { NPC, estTokens, badReply } = require('../src/main/npc');
  const A = require('../src/main/affection');
  // 估 token：跟 Qwen 分詞比過（中文 0.85／字、英文 0.25／字母、數字每位 1）
  const near = (s, real) => { const e = estTokens(s); return e >= real * 0.95 && e <= real * 1.2; };
  assert.ok(near('冒險者，今天的委託是整理第三季的會議紀錄，記得在週五前交給艾琳喔！', 26) && near('SKU-A12 > 0.85（含甜度、酸度、CO2／pH），Brix 評估口感，試吃 30 份內；查核點 2 是 10/31 前上架 500 瓶', 65), '中文、中英數字混合（Qwen 分詞器實際是 26、65）');
  assert.ok(estTokens('Hello world, this is a test of the tokenizer.') >= 11, '英文寧可多估');
  // 壞掉的回覆（10/12 真的出現過的）
  assert.strictEqual(badReply('你還好嗎?我有點擔心你', '你還好嗎?我有點擔心你'), '照抄了冒險者的話');
  assert.strictEqual(badReply('冒險者說：「對不起 不要生氣」', '對不起 不要生氣'), '照抄了提示裡的「說：」');
  assert.strictEqual(badReply("So the user says: 'He's a salary thief'. I need to respond to this based on the context.", '他是薪水小偷'), '回了英文');
  // 正常的回覆不算：引用一部分、夾幾個英文字
  for (const [l, u] of [['週五準備狂歡？好耶！', '週五 準備狂歡'], ['Excel 表格整理好了嗎？太好了，下一步核對價格吧', '表格整理好了'], ['嗯哼～', '嗯'], ['午安～', '午安']]) assert.strictEqual(badReply(l, u), null, l);
  // 態度：道歉、關心、說別人壞話、沒有罵人字眼 → AI 說騷擾／失禮也不扣；真的罵人照扣；騷擾要有相關的字，不然最多算失禮
  for (const t of ['你還好嗎?我有點擔心你', '對不起 不要生氣', '他是薪水小偷', '你喜歡德樣子', '已經把咖啡豆的庫存表整理好了，後續剩下核對價格']) {
    assert.strictEqual(A.guardAttitude('harass', t), 'ok', t); assert.strictEqual(A.guardAttitude('rude', t), 'ok', t);
  }
  assert.strictEqual(A.guardAttitude('rude', '你這個白癡'), 'rude');
  assert.strictEqual(A.guardAttitude('harass', '你好醜'), 'rude', '沒有騷擾的字 → 最多算失禮');
  assert.strictEqual(A.guardAttitude('harass', '給我看你的內褲'), 'harass');
  assert.strictEqual(A.guardAttitude('rude', '煩死了這個bug'), 'ok', '罵 bug 不是罵艾琳');
  // 送出去的提示一定放得進 num_ctx：先拿掉舊對話 → 長行縮短 → 從尾巴拿掉資料；角色設定和規則都在
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-ctx-'));
  const calls = [];
  let reply = { line: '收到～艾琳記下來了。', emotion: 'happy' };
  const npc = new NPC({ npc: { name: '艾琳', callName: '冒險者' }, llm: { enabled: true, baseUrl: 'http://x', model: 'qwen3:4b', numCtx: 2048 } });
  npc.status.online = true; npc.setLogFile(path.join(dir, 'llm.log'));
  npc.fetchJSON = async (_p, body) => { calls.push(body); return { message: { content: JSON.stringify(reply) }, prompt_eval_count: 1500, eval_count: 30 }; };
  const sys0 = npc.systemPrompt();
  const history = [
    { role: 'user', content: '早安' }, { role: 'assistant', content: JSON.stringify({ line: '早安，冒險者！', emotion: 'happy' }) },
    { role: 'user', content: '今天好忙' }, { role: 'assistant', content: JSON.stringify({ line: '辛苦了，先從最小的一項開始吧。', emotion: 'worried' }) },
  ];
  const extraUser = ['【可操作項目】', ...Array.from({ length: 120 }, (_, i) => `- q${i} 這是一個很長很長的任務目標說明，包含很多細節、數字 ${i}${i}${i} 和查核點，模型其實只需要知道它是哪一項就好了 ${'・'.repeat(10)}`), '【角色設定】最後面的設定'].join('\n');
  const r = await npc.say('chat', {}, { userText: '我做完第一項了', history, extraUser, maxTokens: 320 });
  const sent = calls[0].messages;
  const total = sent.reduce((n, m) => n + estTokens(m.content) + 6, 0);
  assert.ok(total <= 2048 - 320 - 64, `提示 ${total} tok 要放得進去`);
  assert.ok(sent[0].role === 'system' && sent[0].content.startsWith(sys0), '角色設定、規則完整保留');
  assert.ok(sent.length === 2 && sent[1].role === 'user', '舊對話先拿掉');
  assert.ok(/【狀態】/.test(sent[1].content) && /【可操作項目】/.test(sent[1].content) && /冒險者說：「我做完第一項了」$/.test(sent[1].content), '狀態、資料開頭、冒險者的話都在');
  assert.ok(!/最後面的設定/.test(sent[1].content) && /…/.test(sent[1].content), '長行縮短、從尾巴拿掉');
  assert.ok(r.source === 'llm' && r.text === '收到～艾琳記下來了。');
  const log = () => fs.readFileSync(path.join(dir, 'llm.log'), 'utf8');
  assert.ok(/提示太長（約 \d+ tok，上限 1664）：舊對話 4→0 句、長的資料行縮短、資料 122→\d+ 行，剩約 \d+ tok/.test(log()), log());
  // 放得下就不動
  calls.length = 0;
  await npc.say('chat', {}, { userText: '你好', history, extraUser: '【可操作項目】\n- q1 寫週報', maxTokens: 320 });
  assert.strictEqual(calls[0].messages.length, 6, '系統＋4 句舊對話＋這次');
  // Ollama 還是切了（讀到的剛好是 (num_ctx − 4) / 2 + 4）：日誌提醒
  npc.llm.numCtx = 4096; // 10/12 的情況：要 4096，提示超過一半，Ollama 卻只讀了 (4096 − 4) / 2 + 4 = 2050
  npc.fetchJSON = async (_p, body) => { calls.push(body); return { message: { content: JSON.stringify(reply) }, prompt_eval_count: 2050, eval_count: 30 }; };
  const mid = ['【可操作項目】', ...Array.from({ length: 60 }, (_, i) => `- q${i} ${'整理會議紀錄並寄給所有與會者確認'.repeat(2)}`)].join('\n');
  await npc.say('chat', {}, { userText: '你好', history, extraUser: mid, maxTokens: 320 });
  assert.ok(/⚠ 提示可能被 Ollama 截斷/.test(log().trim().split('\n').pop()), log().trim().split('\n').pop());
  assert.ok(!/提示太長/.test(log().trim().split('\n').pop()), '這次沒有超過，不用精簡');
  // 回覆壞掉：改用內建台詞（AI 的態度判斷也就不會被採用），日誌寫原因；壞掉的那一輪不再送給模型
  for (const [bad, why] of [[{ line: '我做完第一項了', emotion: 'disdain', attitude: 'harass' }, '照抄了冒險者的話'], [{ line: "So the user says: 'I finished the first item'. I need to respond.", emotion: 'disdain' }, '回了英文']]) {
    reply = bad;
    const b = await npc.say('chat', {}, { userText: '我做完第一項了', history: [], extraUser: '' });
    assert.ok(b.source === 'template' && !b.data, `${why} → 內建台詞`);
    assert.ok(log().includes(`失敗：${why}`), why);
  }
  reply = { line: '好的', emotion: 'happy' }; calls.length = 0;
  await npc.say('chat', {}, { userText: '再見', history: [{ role: 'user', content: '你還好嗎' }, { role: 'assistant', content: JSON.stringify({ line: '你還好嗎', emotion: 'disdain' }), source: 'llm' }, { role: 'user', content: '午安' }, { role: 'assistant', content: JSON.stringify({ line: '午安～', emotion: 'happy' }), source: 'llm' }] });
  const sentHist = JSON.stringify(calls[0].messages.slice(1, -1));
  assert.ok(!/你還好嗎/.test(sentHist) && /午安/.test(sentHist), '照抄的那一輪不給模型看');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('提示長度與壞掉的回覆測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 💬 閒聊不附任務清單：本機先判斷這句話可能跟工作有關嗎（附了才讓 AI 勾選）；清單本身也瘦身 ----------
(async () => {
  const os = require('os');
  const I = require('../src/main/intent');
  const CS = require('../src/main/chatScope');
  const { Engine } = require('../src/main/engine');
  // 清單瘦身：已勾掉的只留數量、太長的截短；說要取消勾選時才列出已完成的
  const long = '從菜單草稿整理出每一道新品的甜度、份量、價格與過敏原標示，再對照供應商報價確認成本與毛利';
  const cat0 = {
    quests: [{ key: 'q1', id: 'a', title: '秋季新品上市準備（含菜單、試吃、標示、上架申請、第一週的社群宣傳活動與門市人員教育訓練）', status: 'progress', active: true, doneCount: 2, total: 3 },
      { key: 'q2', id: 'b', title: '月底盤點', status: 'done', active: false, doneCount: 1, total: 1 }],
    objectives: [{ key: 'q1-0', questId: 'a', text: '試吃紀錄送出', done: true }, { key: 'q1-1', questId: 'a', text: '標示定稿', done: true }, { key: 'q1-2', questId: 'a', text: long, done: false },
      { key: 'q2-0', questId: 'b', text: '盤點表', done: true, questDone: true }],
    daily: [{ key: 'd0', slot: '09:00–10:00', label: '晨會', done: true }, { key: 'd1', slot: '14:00–15:00', label: '試吃會', done: false }],
  };
  const c1 = I.catalogText(cat0);
  assert.ok(!/試吃紀錄送出|標示定稿|晨會/.test(c1) && /（已完成 2 項）/.test(c1) && /（已完成 1 格）/.test(c1), c1);
  assert.ok(c1.includes(`q1-2 [ ] ${long.slice(0, 40)}…`) && c1.includes('任務 q1：秋季新品上市準備（含菜單、試吃、標示、上架申請、第一週的社群宣傳活動與門市人員教…（當前任務，2/3）') && /任務 q2：月底盤點（已交付/.test(c1), '長的截短、已交付只留名字');
  const c2 = I.catalogText(cat0, { showDone: true });
  assert.ok(/q1-0 \[x\] 試吃紀錄送出/.test(c2) && /d0 \[x\] 09:00–10:00 晨會/.test(c2) && !/已完成 2 項/.test(c2), '要取消勾選時列出已完成的');
  assert.ok(c1.length < I.catalogText(cat0, { showDone: true, clip: 0 }).length * 0.85, '瘦了');
  // 判斷：回報進度的各種說法都要附清單
  const plan = CS.planTerms(cat0);
  const need = (text, extra = {}) => CS.needCatalog({ text, plan, now: 1e9, ...extra });
  for (const t of ['試吃紀錄送出了', '那件事搞定了', '標示好了', '先做上架申請', '剛剛開完會', '取消剛剛那個勾', '要交付這個任務', 'PDF 存好了',
    '供應商報價還在等', '過敏原那邊卡住了', '明天要去試吃會', '今天的進度有點落後', '菜單草稿寫一半', '下班回報一下', '這週的週報']) assert.ok(need(t).need, `「${t}」要附清單（${need(t).why}）`);
  // 閒聊不附
  for (const t of ['週五 準備狂歡', '他是薪水小偷', '你還好嗎?我有點擔心你', '對不起 不要生氣', '今天天氣好熱', '梟長又睡過頭了嗎', '你最喜歡什麼顏色', '哈哈哈好可愛']) assert.ok(!need(t).need, `「${t}」是閒聊，不用附（${need(t).why}）`);
  // 前後文：艾琳 10 分鐘內剛講過工作、或上一句聊天在問進度 → 附；艾琳開的閒聊話題 → 不算
  assert.ok(need('嗯嗯', { lastWorkAt: 1e9 - 5 * 60000 }).need && !need('嗯嗯', { lastWorkAt: 1e9 - 15 * 60000 }).need);
  assert.ok(need('還好啦', { lastChat: { role: 'assistant', content: JSON.stringify({ line: '冒險者，今天的進度怎麼樣了？' }), at: 1e9 - 60000 } }).need);
  assert.ok(!need('還好啦', { lastChat: { role: 'assistant', content: JSON.stringify({ line: '你最喜歡什麼甜點？' }), at: 1e9 - 60000, topic: '甜點' } }).need);
  // 引擎：閒聊時提示沒有清單、回覆格式沒有動作欄位；講工作時照舊；llm.log 記附／沒附
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-scope-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: true, baseUrl: 'http://x' }, affection: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  let t = new Date(`${new Date().getFullYear()}-09-30T10:00:00`).getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.npc.status.online = true;
  let sent = null;
  E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify({ line: '好喔～', emotion: 'happy', actions: [] }) }, prompt_eval_count: 900 }; };
  const usr = () => sent.messages.at(-1).content;
  const lastLog = () => fs.readFileSync(path.join(dir, 'data', 'llm.log'), 'utf8').trim().split('\n').pop();
  await E.chat('今天天氣好熱');
  assert.ok(!/【可操作項目】/.test(usr()) && !('actions' in sent.format.properties) && /這次是閒聊，沒有附任務清單/.test(sent.messages[0].content), '閒聊：沒有清單、不能勾選');
  assert.ok(/【狀態】/.test(usr()) && /沒附清單（閒聊）/.test(lastLog()), lastLog());
  const short = JSON.stringify(sent.messages).length;
  t += 15 * 60000;
  const q = E.plan.quests.find((x) => x.objectives.some((o) => !o.done));
  const obj = q.objectives.find((o) => !o.done);
  await E.chat(`${obj.text}做完了`);
  assert.ok(/【可操作項目】/.test(usr()) && 'actions' in sent.format.properties && /【改進度規則】/.test(sent.messages[0].content), '講工作：附清單、可以勾選');
  assert.ok(/附清單：/.test(lastLog()), lastLog());
  assert.ok(JSON.stringify(sent.messages).length > short, '附清單的提示比較長');
  // 艾琳剛提醒過行程（工作事件）→ 接著回的話就算很短也附
  t += 15 * 60000;
  E.lastWorkAt = t - 2 * 60000;
  await E.chat('嗯嗯');
  assert.ok(/【可操作項目】/.test(usr()) && /艾琳剛講過工作/.test(lastLog()));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('閒聊不附清單測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 💗 好感升階動畫（漫畫）：哪幾階有、舊存檔只補演最新的一階、演完收進相簿、口吻、圖都在 ----------
(async () => {
  const os = require('os');
  const root = path.join(__dirname, '..');
  const SU = require('../src/renderer/stageup-script');
  const { Engine } = require('../src/main/engine');
  // 1. 舊存檔：升過的只補演最新的一階，更早的直接收進相簿；新版本多一階動畫也一樣
  assert.deepStrictEqual(SU.STAGES, [2, 3]);
  assert.deepStrictEqual(SU.migrate(undefined, 1), { pending: [], seen: {}, known: [2, 3] }, '還在第 1 階：不用演');
  assert.deepStrictEqual(SU.migrate(undefined, 2).pending, [2], '第 2 階：補演第 2 階');
  const m4 = SU.migrate(undefined, 4);
  assert.deepStrictEqual([m4.pending, !!m4.seen[2].unlocked], [[3], true], '第 4 階：只補演最新的第 3 階，第 2 階直接收進相簿');
  const up = SU.migrate({ pending: [], seen: { 2: { at: 'x' } }, known: [2] }, 3);
  assert.deepStrictEqual([up.pending, up.known], [[3], [2, 3]], '看過第 2 階、新版本多了第 3 階：補演第 3 階');
  assert.deepStrictEqual(SU.migrate({ pending: [], seen: { 2: { at: 'x' } }, known: [2] }, 2).pending, [], '還沒到第 3 階：不演');
  const seen = SU.migrate({ pending: [], seen: { 2: { at: 'x' } }, known: [2, 3] }, 3);
  assert.deepStrictEqual([seen.pending, seen.seen[2].at], [[], 'x'], '看過的不再演');
  assert.deepStrictEqual(SU.migrate({ pending: [2, 9], seen: {}, known: [2] }, 2).pending, [2], '不認得的階段拿掉');
  assert.strictEqual(SU.next({ pending: [2] }), 2); assert.strictEqual(SU.next({ pending: [] }), 0);
  assert.deepStrictEqual(SU.album({ seen: { 2: { at: '2026-10-12T00:00:00Z' }, 3: { at: null, unlocked: true } } }).map((x) => [x.n, x.title]), [[2, '其之二　常客'], [3, '其之三　熟面孔']]);
  // 2. 口吻：艾琳的台詞自稱用名字、叫對方冒險者；瑪格大姐的才有「你」
  const L = SU.LINES[2];
  for (const n of SU.STAGES) for (const k of SU.ERIN[n]) assert.ok(SU.LINES[n][k] && !/[我您]|玩家/.test(SU.LINES[n][k]), `第 ${n} 階艾琳的台詞：${k}`);
  for (const n of SU.STAGES) assert.ok(SU.LINES[n].end && SU.PAGE_LINES[n], `第 ${n} 階：收尾那句、整頁的字`);
  assert.ok(/艾琳/.test(SU.LINES[3].secret) && /這是秘密喔/.test(SU.LINES[3].secret) && SU.LINES[3].end !== SU.LINES[2].end, '第 3 階：秘密那句（＝stageup_3）、收尾換一句');
  assert.ok(SU.LINES[3].pickA && SU.LINES[3].pickB, '第 3 階：二選一');
  assert.ok(/艾琳/.test(L.star) && /冒險者/.test(L.star), '星星那句：用名字和冒險者（畫面會換成現在的名字）');
  const { TEMPLATES } = require('../src/main/npc');
  for (const [x] of TEMPLATES.stageup_tease) assert.ok(/\{self\}/.test(x) && /\{call\}/.test(x) && !/[我您]|玩家/.test(x), x);
  // 3. 引擎：升到第 2 階 → 預告＋待演＋心意；演完 → 收進相簿；跳過也算；重看只記時間；關掉動畫 → 照舊說那句話
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-stageup-'));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'week_sample.md'), path.join(dir, 'plan.md'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false }, lore: { path: path.join(root, 'lore', '艾琳.md'), embeddings: false } }));
  let t = new Date(`${new Date().getFullYear()}-09-30T10:00:00`).getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  const a = E.aff();
  Object.assign(a, { points: 29, stage: 1, maxStage: 1 });
  assert.strictEqual(E.view().affection.shows.next, 0);
  E.affect(3, '測試');
  let r = E.settle({ lines: [] });
  assert.ok(r.lines.some((l) => l.event === 'affection' && /晚點再跟冒險者說|有件事想跟冒險者說/.test(l.text)), '預告');
  assert.deepStrictEqual([E.view().affection.shows.next, E.state.player.gold, a.maxStage], [2, 20, 2]);
  r = E.finishShow(2, { skipped: true });
  assert.ok(r.first && r.title === '其之二　常客' && r.view.affection.shows.next === 0 && a.shows.seen[2].skipped, '跳過也收進相簿');
  t += 60000;
  r = E.finishShow(2, {});
  assert.ok(!r.first && a.shows.seen[2].replayedAt && a.shows.seen[2].skipped, '重看：只記時間');
  assert.deepStrictEqual(E.view().affection.shows.album.map((x) => x.n), [2]);
  assert.ok(!E.finishShow(3).first && !E.finishShow('x').first, '沒有動畫的階段');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'save.json'), 'utf8'));
  assert.ok(saved.affection.shows.seen[2], '存進存檔');
  // 掉下去再升回來：不再演、不再送
  Object.assign(a, { points: 20 }); E.settle({ lines: [] });
  Object.assign(a, { points: 35 }); r = E.settle({ lines: [] });
  assert.ok(r.lines.some((l) => /常客才有/.test(l.text)) && E.view().affection.shows.next === 0 && E.state.player.gold === 20, '再升回來');
  // 關掉動畫（config affection.shows=false）：照舊直接說那句、頭上不冒「!」
  E.saveConfigPatch({ affection: { shows: false } });
  Object.assign(a, { points: 10, stage: 1, maxStage: 1, shows: undefined }); E.settle({ lines: [] });
  Object.assign(a, { points: 35 }); r = E.settle({ lines: [] });
  assert.ok(r.lines.some((l) => /常客才有/.test(l.text)) && E.view().affection.shows.next === 0 && E.view().affection.shows.album.length === 0, '關掉動畫');
  fs.rmSync(dir, { recursive: true, force: true });
  // 4. 畫面：載入順序、選單、IPC、用到的圖都在
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.ok(html.indexOf('src="stageup-script.js"') > html.indexOf('src="renderer.js"') && html.indexOf('src="stageup.js"') > html.indexOf('src="stageup-script.js"') && html.includes('href="stageup.css"'), 'index.html');
  assert.ok(/🎬 回憶相簿/.test(fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8')) && /storyDone/.test(fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8')));
  const sjs = fs.readFileSync(path.join(root, 'src/renderer/stageup.js'), 'utf8');
  const files = [...new Set([...sjs.matchAll(/(?:ART|bgImg|ball|nb3)\('([^']+)'/g)].map((m) => m[1]))];
  assert.ok(files.length >= 18 && files.includes('mini_hide.webp') && files.includes('notebook_first_page.jpg') && files.includes('erin_lantern.webp'), files.join(','));
  for (const f of [...files, ...SU.STAGES.map((n) => SU.SHOWS[n].thumb)]) assert.ok(fs.existsSync(path.join(root, 'assets', 'stageup', f)), '圖：' + f);
  for (const f of [...sjs.matchAll(/SHOP\('([^']+)'\)/g)].map((m) => m[1])) assert.ok(fs.existsSync(path.join(root, 'assets', 'shop', f)), '雜貨舖的圖：' + f);
  for (const p of [...sjs.matchAll(/pose\('(\w+)'/g)].map((m) => m[1])) assert.ok(fs.existsSync(path.join(root, 'assets', 'character', p + '.png')), '立繪：' + p);
  console.log('好感升階動畫測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 📓 艾琳的筆記本（委託）：日子／時間、規則（含步驟）、草稿＋原本的計畫、寫進計畫檔、引擎流程（AI 用假的） ----------
(async () => {
  const os = require('os');
  const PD = require('../src/main/plandraft');
  const P = require('../src/main/planParser');
  const { Engine } = require('../src/main/engine');
  // 1. 哪一週
  assert.deepStrictEqual(PD.weekOf('2026-10-13', 'this'), { which: 'this', start: '2026-10-12', end: '2026-10-16', label: '10/12–10/16', name: '這週' });
  assert.strictEqual(PD.weekOf('2026-10-16', 'next').start, '2026-10-19');
  assert.deepStrictEqual(['2026-10-12', '2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18'].map(PD.defaultWhich), ['this', 'this', 'next', 'next', 'next'], '週四以後預設下週');
  assert.deepStrictEqual(['2026-10-12', '2026-10-19', '2026-10-05', '2026-10-26'].map((x) => PD.weekName(x, '2026-10-14')), ['這週', '下週', '上週', '10/26–10/30']);
  const ctx = { today: '2026-10-13', week: PD.weekOf('2026-10-13') };
  const day = (s) => (PD.findDay(s, ctx) || {}).date;
  assert.deepStrictEqual(['週五', '明天', '後天', '下週三', '這週一', '10/20', '10月21日'].map(day), ['2026-10-16', '2026-10-14', '2026-10-15', '2026-10-21', '2026-10-12', '2026-10-20', '2026-10-21']);
  const tm = (s) => { const t = PD.findTime(s); return t ? `${t.start}-${t.end}` : ''; };
  assert.deepStrictEqual(['下午兩點半到四點', '9:00-10:30', '3點', '早上十點', '中午訂便當', '中午前回信'].map(tm), ['14:30-16:00', '09:00-10:30', '15:00-', '10:00-', '12:00-', ''], '上班時間的 3 點＝15:00；中午前是截止');
  // 2. 規則速記
  const rx = (s) => PD.ruleExtract(s, ctx).map((x) => [x.kind, x.title || x.ref || '', x.due || x.date || '', x.start || x.time || '', x.end || '', x.raid ? '📯' : '', x.tier || '', (x.steps || []).join('→')].filter((v, i) => i < 2 || v !== '').join('|'));
  assert.deepStrictEqual(rx('週五前寫完週報'), ['quest|寫完週報|2026-10-16|major']);
  assert.deepStrictEqual(rx('一定要在週四中午前送出報價單'), ['quest|送出報價單|2026-10-15|main']);
  assert.deepStrictEqual(rx('週二下午兩點到三點開週會'), ['row|開週會|2026-10-13|14:00|15:00|📯']);
  assert.deepStrictEqual(rx('提醒我週四下午四點打給廠商'), ['reminder|打給廠商|2026-10-15|16:00']);
  assert.deepStrictEqual(rx('週三整天出差；週二請假'), ['theme|出差|2026-10-14', 'theme|請假|2026-10-13']);
  assert.deepStrictEqual(rx('週三下午做系統測試、週四修 bug、週五上線'), ['quest|做系統測試|2026-10-14|major', 'quest|修 bug|2026-10-15|major', 'quest|上線|2026-10-16|major'], '各有日子就拆');
  assert.deepStrictEqual(rx('下午三點打電話'), ['unsure|15:00 打電話'], '沒說哪天：不確定');
  assert.deepStrictEqual([rx('嗯……我想想'), rx('好，差不多就這些'), rx('好了再寄給主管').length], [[], [], 1]);
  // 步驟的各種說法
  assert.deepStrictEqual(rx('這個任務的步驟有要先做文獻整理後寫初稿再接著請主管看'), ['steps||文獻整理→寫初稿→請主管看'], '使用者的說法：接到上一個委託');
  assert.deepStrictEqual(rx('週五前寫完週報，步驟有先收資料、再整理，最後寄出'), ['quest|寫完週報|2026-10-16|major|收資料→整理→寄出']);
  assert.deepStrictEqual(rx('寫週報要先收資料再整理然後寄出'), ['quest|寫週報|major|收資料→整理→寄出']);
  assert.deepStrictEqual(rx('整理月報的步驟：\n1. 收齊數字\n2. 寫摘要\n3. 寄出'), ['quest|整理月報|major|收齊數字→寫摘要→寄出']);
  assert.deepStrictEqual(rx('做季報：1. 拉數據 2. 畫圖表 3. 寫重點'), ['quest|做季報|major|拉數據→畫圖表→寫重點']);
  assert.deepStrictEqual(rx('整理月報：收齊數字、寫摘要、寄出'), ['quest|整理月報|major|收齊數字→寫摘要→寄出']);
  assert.deepStrictEqual(rx('準備週會流程簡報'), ['quest|準備週會流程簡報|major'], '「流程」是名稱的一部分');
  assert.deepStrictEqual(rx('先寫週報再開會'), ['quest|寫週報|major', 'quest|開會|major'], '沒說是哪個委託：各算一件');
  assert.deepStrictEqual(rx('先跟進客戶再寫報告').length, 2, '「跟進」不拆');
  // 評分用的虛構句子：規則至少要九成
  const ev = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'plan_chat_eval.json'), 'utf8'));
  const ectx = { today: ev.today, week: PD.weekOf(ev.today, ev.week) };
  const n = (s) => String(s || '').replace(/\s/g, '');
  let exp = 0, hit = 0;
  for (const c of [...ev.cases, ...ev.holdout, ...ev.steps, ...ev.steps_holdout]) {
    const d = PD.blank(ectx.week, '');
    for (const say of [].concat(c.say)) PD.addItems(d, PD.ruleExtract(say, ectx));
    const got = [...PD.live(d.quests).map((q) => ({ kind: 'quest', title: q.title, due: q.due, steps: q.steps })), ...d.rows.map((r) => ({ kind: 'row', ...r })), ...d.reminders.map((m) => ({ kind: 'reminder', ...m })), ...Object.entries(d.themes).map(([date, t]) => ({ kind: 'theme', title: t, date })), ...d.unsure.map((u) => ({ kind: 'unsure', title: u.title }))];
    exp += c.expect.length;
    for (const e of c.expect) if (got.some((g) => g.kind === e.kind && n(g.title).includes(n(e.title)) && (!e.due || g.due === e.due) && (!e.date || g.date === e.date) && (!e.steps || (Array.isArray(e.steps) ? g.steps.length === e.steps.length : g.steps.length === e.steps)))) hit++;
  }
  assert.ok(ev.cases.length >= 40 && ev.steps.length >= 10 && hit / exp >= 0.9, `規則抽取 ${hit}/${exp}`);

  // 3. 草稿：新加、同名合併、步驟接到上一個、撤銷一句（改到的改回來）、自己改、不確定
  const d = PD.blank(ctx.week, '2026-10-13T09:00:00');
  const R1 = []; PD.addItems(d, PD.ruleExtract('週五前寫完週報', ctx), 'l1', R1);
  const R2 = []; PD.addItems(d, PD.ruleExtract('這個任務的步驟有要先收資料再寫初稿', ctx), 'l2', R2);
  assert.deepStrictEqual(d.quests[0].steps.map((s) => s.text), ['收資料', '寫初稿'], '步驟接到上一個委託');
  PD.removeLog(d, 'l2', R2);
  assert.deepStrictEqual(d.quests[0].steps, [], '撤銷那句：步驟拿掉、委託還在');
  PD.addItems(d, PD.ruleExtract('週二下午兩點到三點開週會；提醒我週四下午四點打給廠商；週三整天出差', ctx), 'l3');
  PD.addItems(d, PD.ruleExtract('寫完週報：收資料、寫初稿', ctx), 'l4');
  assert.ok(d.quests.length === 1 && d.quests[0].due === '2026-10-16' && d.quests[0].steps.length === 2, '同名委託合成一個（截止日留著）');
  const lone = PD.blank(ctx.week, '');
  PD.addItems(lone, PD.ruleExtract('這個任務的步驟有先收資料再寫初稿', ctx), 'x');
  assert.ok(lone.unsure.length === 1 && /要加在哪個委託/.test(lone.unsure[0].question), '沒有上一個委託：放不確定');
  PD.addItems(lone, [{ kind: 'quest', title: '寫週報', steps: [] }]);
  PD.resolveUnsure(lone, lone.unsure[0].id, 'steps', { quest: lone.quests[0].id });
  assert.deepStrictEqual(lone.quests[0].steps.map((s) => s.text), ['收資料', '寫初稿'], '不確定的步驟 → 選委託');
  const row = d.rows[0];
  assert.throws(() => PD.editItem(d, row.id, { end: '13:00' }), /結束時間/);
  PD.snapshot(d);
  PD.editItem(d, row.id, { start: '10:00', end: '11:00', title: '週會（改時間）' });
  assert.ok(row.touched && row.start === '10:00');
  assert.ok(PD.undo(d) && d.rows[0].start === '14:00', '復原');

  // 4. 原本的計畫＋這次的修改 → 一項一項寫進檔案（其他內容不動）
  const base = '# 2026 測試週 10/12–10/16\n\n## 寫完週報 🔧 📅 10/16\n> 說明要留著\n- [x] 收資料\n- [ ] 寫初稿\n\n## 整理客戶名單 🌿\n- [ ] 匯出\n\n## 週一 10/12｜進辦公室\n- 09:00–10:00 寫報告\n\n## 週二 10/13\n- 14:00–15:00 📯 週會 → 決議\n- ⏰ 16:00 打給廠商\n\n## 自己的筆記\n隨手寫的東西\n\n## 進度紀錄\n\n- 10/12｜完成：A｜卡點：｜明日：\n';
  const w = PD.blank(ctx.week, '');
  PD.syncPlan(w, P.parsePlan(base));
  assert.deepStrictEqual([w.quests.length, w.rows.length, w.reminders.length, w.themes['2026-10-12'], PD.changes(w)], [2, 2, 1, '進辦公室', 0], '原本的讀進來、沒有修改');
  assert.deepStrictEqual(w.quests[0].steps.map((s) => `${s.text}${s.done ? '✓' : ''}`), ['收資料✓', '寫初稿'], '勾選狀態');
  const ctxW = { today: '2026-10-13', week: w.week };
  PD.addItems(w, PD.ruleExtract('週報的步驟加上校對', ctxW), 'a');
  assert.ok(w.quests[0].steps.some((s) => s.text === '校對') && PD.questState(w.quests[0]) === 'dirty', '「週報」找到「寫完週報」');
  PD.applyEdits(w, PD.ruleEdit(w, '把週會移到週四', ctxW), ctxW);
  assert.ok(w.rows.find((r) => r.title === '週會').date === '2026-10-15', '規則改：移到週四');
  PD.applyEdits(w, PD.ruleEdit(w, '週會改十點', ctxW), ctxW);
  assert.deepStrictEqual(['start', 'end'].map((k) => w.rows.find((r) => r.title === '週會')[k]), ['10:00', '11:00'], '規則改：時間（長度不變）');
  PD.applyEdits(w, PD.ruleEdit(w, '刪掉整理客戶名單', ctxW), ctxW);
  assert.ok(w.quests[1].del && PD.questState(w.quests[1]) === 'del', '原本的：標成刪掉');
  assert.ok(PD.restoreItem(w, w.quests[1].id) && !w.quests[1].del && PD.removeItem(w, w.quests[1].id), '可以復原');
  assert.strictEqual(PD.ruleEdit(w, '把它改一下', ctxW), null, '看不出改哪個：交給 AI');
  PD.addItems(w, PD.ruleExtract('整理實驗報告：找文獻、寫初稿；週三整天出差', ctxW), 'b');
  PD.editItem(w, 't:2026-10-12', { title: '' });
  assert.strictEqual(PD.changes(w), 6, '修改處數：步驟、週會、刪委託、新委託、新主題、拿掉主題');
  const out = PD.applyToContent(base, w);
  const pp = P.parsePlan(out.content);
  assert.deepStrictEqual(out.stats, { added: 2, edited: 2, deleted: 2, missing: 0 }, JSON.stringify(out.stats));
  assert.ok(/> 說明要留著/.test(out.content) && /隨手寫的東西/.test(out.content) && /10\/12｜完成：A/.test(out.content), '說明、自己的段落、進度紀錄都留著：' + out.content);
  const wq = pp.quests.find((q) => q.title === '寫完週報');
  assert.deepStrictEqual(wq.objectives.map((o) => `${o.text}${o.done ? '✓' : ''}`), ['收資料✓', '寫初稿', '校對'], '勾過的留著、加上新步驟');
  assert.ok(!pp.quests.some((q) => q.title === '整理客戶名單') && pp.quests.some((q) => q.title === '整理實驗報告' && q.objectives.length === 2), '刪掉的、新的');
  const thu = pp.days.find((x) => x.date === '2026-10-15');
  assert.ok(thu && thu.rows.some((r) => r.a === '週會' && r.raid && r.start === '10:00' && r.b === '決議'), '週會搬到週四（產出、團戰記號留著）');
  assert.ok(!pp.days.find((x) => x.date === '2026-10-13').rows.length && pp.decisions.some((x) => x.time === '16:00'), '週二那格搬走、提醒留著');
  assert.ok(!pp.days.find((x) => x.date === '2026-10-12').theme && pp.days.find((x) => x.date === '2026-10-14').theme === '出差', '主題');
  // 寫完再讀：沒有修改
  const w2 = PD.blank(ctx.week, ''); PD.syncPlan(w2, pp);
  assert.strictEqual(PD.changes(w2), 0);
  // 檔案在外面被改了：沒改過的跟著更新，改過的保留
  PD.editItem(w2, w2.quests.find((q) => q.title === '寫完週報').id, { title: '寫完週報（新版）' });
  const ext = P.setObjective(out.content, wq.id, 1, true, new Date('2026-10-13T10:00:00'));
  PD.syncPlan(w2, P.parsePlan(ext));
  const q2 = w2.quests.find((q) => q.title === '寫完週報（新版）');
  assert.ok(q2 && q2.steps.find((s) => s.text === '寫初稿').done && PD.changes(w2) === 1, '勾選狀態跟著檔案、改名留著');
  // 新的一週（沒有檔案）：整份寫
  const nw = PD.blank(PD.weekOf('2026-10-13', 'next'), '');
  PD.addItems(nw, PD.ruleExtract('週一 9:00-10:00 站會；週五前交月報', { today: '2026-10-13', week: nw.week }));
  const md = PD.toMarkdown(nw, { title: '下週 10/19–10/23' });
  assert.ok(/^# 下週 10\/19–10\/23\n/.test(md) && /## 交月報 🔧 📅 10\/23/.test(md) && /09:00–10:00 📯 站會/.test(md), md);
  // 規則和 AI 怎麼配合（使用者電腦實測：AI 會自己編截止日、把步驟那句整句當成新委託）
  const rcx = { today: '2026-10-13', week: PD.weekOf('2026-10-13') };
  const need = (t) => PD.needsAI(t, PD.ruleExtract(t, rcx));
  assert.deepStrictEqual(['整理實驗報告', '這個任務的步驟有要先做文獻整理後寫初稿再接著請主管看', '週二下午兩點到三點開週會', '嗯……', '好，差不多就這些'].map(need), [false, false, false, false, false], '規則有把握：不問 AI');
  assert.deepStrictEqual(['把客戶的需求整理一下然後跟業務對齊再回覆對方', '下午三點打電話'].map(need), [true, true], '沒把握：問 AI');
  const ck = (t, items) => PD.checkAI(items, t, rcx, PD.ruleExtract(t, rcx));
  assert.strictEqual(ck('整理實驗報告', [{ kind: 'quest', title: '整理實驗報告', tier: 'major', due: '2026-10-16', steps: [] }])[0].due, '', '原話沒說日子：AI 編的截止日拿掉');
  assert.strictEqual(ck('這個任務的步驟有先收資料再寫初稿', [{ kind: 'quest', title: '這個任務的步驟有先收資料再寫初稿', tier: 'major', due: '', steps: [] }]), null, '整句當標題：不用 AI 的');
  assert.strictEqual(ck('整理月報：收齊數字、寫摘要', [{ kind: 'quest', title: '整理月報', tier: 'major', due: '', steps: [] }]), null, '規則有步驟、AI 沒有：用規則的');
  assert.deepStrictEqual(ck('把需求整理一下然後跟業務對齊', [{ kind: 'quest', title: '整理需求', tier: 'major', due: '', steps: ['整理', '跟業務對齊'] }]).map((x) => x.steps.length), [2], '沒把握的句子：用 AI 拆好的');
  assert.strictEqual(ck('週會', [{ kind: 'row', date: '2026-10-13', start: '14:00', end: '', title: '週會', raid: true }])[0].kind, 'quest', '原話沒說時間：AI 編的時段不算');
  assert.strictEqual(ck('下午三點打電話給供應商', [{ kind: 'quest', title: '三點打電話給供應商', tier: 'major', due: '', steps: [] }]), null, '有時間沒日子（使用者電腦評分 #10）：留著問哪一天');
  // AI 的格式：至少一項；步驟（kind steps）
  assert.strictEqual(PD.EXTRACT_SCHEMA.properties.items.minItems, 1, '不能回空清單');
  assert.deepStrictEqual(PD.normalizeAI({ items: [{ kind: 'steps', title: '上一個委託', steps: ['收資料', '寫初稿'] }] }, ctx), [{ kind: 'steps', ref: '', steps: ['收資料', '寫初稿'] }]);
  assert.ok(/【規則初步整理】.*"kind":"task"/.test(PD.extractUser('週五前寫完週報', ctx, { rule: PD.ruleExtract('週五前寫完週報', ctx), d })), '把規則的結果給 AI');

  // 5. 引擎：打開（原本的計畫）、說話、AI（假的）整理、改、勾目標、寫進去、獎勵、下週新檔
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-pd-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), base);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, achievements: { enabled: false }, streak: { enabled: false }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false }, reminders: { items: [] } }));
  let t = new Date('2026-10-13T09:00:00').getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  const ev2 = (r) => r.lines.map((l) => l.event).join(',');
  let r = E.pdOpen();
  assert.ok(ev2(r) === 'pd_open' && r.planDraft.week.start === '2026-10-12' && r.planDraft.target.kind === 'current' && r.planDraft.canPlay && r.planDraft.quests.length === 2, '週二：這週、看得到原本的計畫');
  assert.deepStrictEqual(r.planDraft.weeks.map((x) => x.which + x.label), ['this10/12–10/16', 'next10/19–10/23']);
  assert.ok(r.planDraft.quests[0].play && r.planDraft.quests[0].play.total === 2, '委託的進度');
  r = E.pdSay('整理實驗報告');
  r = E.pdSay('這個任務的步驟有要先做文獻整理後寫初稿再接著請主管看');
  assert.ok(/文獻整理→寫初稿→請主管看/.test(r.lines[0].text), r.lines[0].text);
  r = E.pdSay('把週會移到週四');
  assert.ok(r.lines[0].event === 'pd_edit' && E.pdView().rows.find((x) => x.title === '週會').date === '2026-10-15', '規則改，不用等 AI');
  E.pdUndoLog(r.logId);
  assert.strictEqual(E.pdView().rows.find((x) => x.title === '週會').date, '2026-10-13', '撤銷那句改的');
  r = E.pdSay('把那個改一下');
  assert.ok(!r.aiEdit, 'AI 關著：不排 AI');
  // AI 開著（假的）
  E.config.llm.enabled = true; E.npc.status = { online: true };
  const asked = [];
  E.npc.structured = async (event, o) => {
    asked.push({ event, user: o.user });
    if (event === 'plan_extract') return { items: [{ kind: 'task', title: '準備面試', steps: ['看履歷', '準備問題'] }] };
    if (event === 'plan_edit') { const ref = (o.user.match(/(q\d+) 委託「寫完週報」/) || [])[1]; return { ops: [{ op: 'edit', ref, day: '週四' }] }; }
    throw new Error('?');
  };
  r = E.pdSay('週五前寫完週報');
  assert.ok(!r.refine, '規則有把握：不排 AI');
  r = E.pdSay('準備面試要看履歷然後想問題還有約時間跟主管確認名單');
  assert.ok(r.refine, '規則沒把握：排隊給 AI');
  await E.pdRefine(r.logId);
  assert.ok(/【規則初步整理】/.test(asked[0].user) && E.pdView().quests.find((q) => q.title === '準備面試').steps.length === 2, 'AI 整理（有給規則的結果）');
  r = E.pdSay('週報的截止日請你調整一下');
  assert.ok(r.aiEdit, '規則看不懂的修改：排隊給 AI');
  r = await E.pdAiEditLog(r.logId);
  assert.ok(r.lines[0].event === 'pd_edit' && E.pdView().quests.find((q) => q.title === '寫完週報').due === '2026-10-15', 'AI 改');
  E.config.llm.enabled = false;
  // 勾目標（立刻寫進去、有獎勵）
  const gold0 = E.state.player.gold;
  const wid = E.pdView().quests.find((q) => q.title === '寫完週報').id;
  r = await E.pdCheck(wid, '寫初稿', true);
  assert.ok(r.reward && /- \[x\] 寫初稿/.test(fs.readFileSync(path.join(dir, 'plan.md'), 'utf8')), '勾目標立刻寫進檔案');
  assert.ok(E.pdView().quests.find((q) => q.id === wid).steps.find((s) => s.text === '寫初稿').done, '筆記本跟著更新（改過的截止日還在）');
  assert.strictEqual(E.pdView().quests.find((q) => q.id === wid).due, '2026-10-15');
  await assert.rejects(E.pdCheck(E.pdView().quests.find((q) => q.title === '整理實驗報告').id, '寫初稿', true), /先寫進計畫檔/);
  // 寫進計畫檔
  const changes = E.pdView().changes;
  r = await E.pdCommit();
  const txt = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  assert.ok(changes === 3 && /## 寫完週報 🔧 📅 10\/15/.test(txt) && /## 整理實驗報告/.test(txt) && /## 準備面試/.test(txt) && /隨手寫的東西/.test(txt), txt);
  assert.ok(r.reward && ev2(r).startsWith('pd_done') && /新增 2 項、改了 1 項/.test(r.lines[0].text) && E.pdView().changes === 0, r.lines[0].text);
  assert.ok(fs.readdirSync(path.join(dir, 'data', 'backups')).length >= 1, '寫之前備份');
  assert.ok(E.view().quests.some((q) => q.title === '整理實驗報告'), '週任務板跟著換');
  t += 60000; E.pdSay('週五前整理桌面'); r = await E.pdCommit();
  assert.ok(!r.reward, '同一週第二次不給');
  // 整頁擦掉、放棄修改
  E.pdWipe();
  assert.ok(E.pdView().quests.every((q) => q.st === 'del'), '整頁擦掉');
  E.pdDiscard();
  assert.strictEqual(E.pdView().changes, 0, '放棄修改');
  // 週四：預設下週（還沒有檔案 → 新檔）
  t = new Date('2026-10-15T17:00:00').getTime();
  r = E.pdOpen();
  assert.ok(r.planDraft.week.start === '2026-10-19' && r.planDraft.target.kind === 'new' && !r.planDraft.canPlay, '週四預設下週：' + JSON.stringify(r.planDraft.week));
  E.pdSay('週一 9:00-10:00 站會');
  await assert.rejects(E.pdCommit(), /存在哪裡/);
  const hint = E.pdNewFileHint('2026-10-19');
  assert.ok(/10\/19–10\/23/.test(hint.title), '新檔標題照原本的樣子換日期：' + hint.title);
  const nf = path.join(dir, 'plans', '下週.md');
  r = await E.pdCommit({ file: nf, title: hint.title });
  assert.ok(fs.existsSync(nf) && E.state.pendingPlan && E.state.pendingPlan.start === '2026-10-19' && ev2(r).startsWith('pd_done_next') && r.reward, '新檔＋排好週一換上');
  assert.ok(E.pdView().target.kind === 'file' && E.pdView().quests.length === 0 && E.pdView().rows.length === 1, '再打開：讀那個檔');
  assert.ok(E.planFile().endsWith('plan.md'), '這週的計畫還沒換');
  E.pdSwitch('this');
  assert.strictEqual(E.pdView().week.start, '2026-10-12', '切回這週');
  const sw = E.pdSwitchDue('2026-10-19');
  assert.ok(sw && sw.event === 'pd_switched' && E.planFile() === nf, '週一換上');
  // 每週一個資料夾的習慣：1026_week → 1102_week，檔名的日期跟著換
  const wd = path.join(dir, '1026_week'); fs.mkdirSync(wd);
  const pf = path.join(wd, '我的一週 10 26–10 30.md'); fs.writeFileSync(pf, base);
  E.usePlanFile(pf);
  const h2 = E.pdNewFileHint('2026-11-02');
  assert.ok(h2.dir === path.join(dir, '1102_week') && h2.name === '我的一週 11 2–11 6.md', JSON.stringify(h2));
  // 第一期的草稿（state.planDraft）搬過來
  E.state.planDraft = { week: { which: 'this', start: '2026-10-12', end: '2026-10-16', label: '10/12–10/16', name: '本週' }, quests: [{ id: 'q1', title: '舊草稿', tier: 'major', due: '', steps: [] }], rows: [], reminders: [], themes: {}, unsure: [], log: [], seq: 2, history: [] };
  assert.ok(E.pdDrafts()['2026-10-12'].quests.some((q) => q.title === '舊草稿') && !E.state.planDraft, '舊草稿');
  fs.rmSync(dir, { recursive: true, force: true });
  // 6. 畫面：載入順序、大視窗只開放 pd:*
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.ok(html.indexOf('src="pdnote.js"') > html.indexOf('src="renderer.js"'), 'index.html');
  const big = fs.readFileSync(path.join(root, 'src/renderer/plandraft.html'), 'utf8');
  assert.ok(/Content-Security-Policy/.test(big) && /plandraft\.js/.test(big) && !/https?:/.test(big), '大視窗：CSP、不連外');
  const pre = fs.readFileSync(path.join(root, 'src/main/plandraft-preload.js'), 'utf8');
  assert.ok(!/ipcRenderer\.(send|invoke)\(['"](?!pd:)/.test(pre), '大視窗只能叫 pd:*');
  const pjs = fs.readFileSync(path.join(root, 'src/renderer/plandraft.js'), 'utf8');
  for (const f of [...pjs.matchAll(/ART\('([^']+)'\)/g)].map((m) => m[1])) assert.ok(fs.existsSync(path.join(root, 'assets', 'stageup', f)), '筆記本的圖：' + f);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.files.includes('assets/stageup/*'), '安裝檔要包含 assets/stageup');
  console.log('週計畫筆記本測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 🌙 收工：下班提醒問「今天有卡住的嗎？」→ 回她的話記成今天的進度；這週最後一天下班後自動交冒險日誌 ----------
(async () => {
  const os = require('os');
  const { Engine } = require('../src/main/engine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-wrap-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '# 2026 收工測試週 10/12–10/16\n\n## 寫完週報 🔧 📅 10/16\n- [ ] 收資料\n- [ ] 寫初稿\n\n## 週五 10/16\n- 09:00–10:00 寫報告\n');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, achievements: { enabled: false }, streak: { enabled: false }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false }, reminders: { weekdaysOnly: true, items: [{ time: '16:50', event: 'wrapup' }] } }));
  let t = new Date('2026-10-15T16:51:00').getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  const q = E.plan.quests[0];
  await E.setObjective(q.id, 0, true);
  let out = await E.tick();
  const ln = out.find((l) => l.reply);
  assert.ok(ln && /卡住/.test(ln.text) && E.state.wrapAsk && E.state.wrapAsk.date === '2026-10-15', '下班提醒問卡點：' + JSON.stringify(out));
  t += 5 * 60000;
  let r = await E.chat('卡在等廠商報價，明天先寫測試');
  const p = E.plan.progressLog.find((x) => x.date === '2026-10-15');
  assert.ok(p && p.blocker === '卡在等廠商報價'.replace(/^卡在/, '') && p.next === '寫測試' && /收資料/.test(p.done), '記成今天的進度：' + JSON.stringify(p));
  assert.ok(r.lines.some((l) => l.event === 'daily_report'), '艾琳回收工的話');
  r = await E.chat('今天天氣真好');
  assert.ok(!r.lines.some((l) => l.event === 'daily_report'), '只接一次');
  // 週五（最後一天）：下班後半小時自動交日誌
  t = new Date('2026-10-16T17:10:00').getTime();
  out = await E.tick();
  assert.ok(!out.some((l) => l.journal), '還沒到');
  t = new Date('2026-10-16T17:25:00').getTime();
  out = await E.tick();
  const j = out.find((l) => l.journal);
  assert.ok(j && j.event === 'journal_ready', '自動交日誌：' + JSON.stringify(out.map((l) => l.event)));
  out = await E.tick();
  assert.ok(!out.some((l) => l.journal), '一週一次');
  // 說「沒有」：沒有卡點
  t = new Date('2026-10-16T16:51:00').getTime(); E.state.reminded = {}; delete E.state.wrapAsk;
  E.writePlan(E.planText.replace(/\n## 進度紀錄[\s\S]*$/, '\n'));
  await E.tick();
  t += 60000;
  await E.chat('沒有，很順利');
  assert.strictEqual(E.plan.progressLog.find((x) => x.date === '2026-10-16').blocker, '', '沒有卡點');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('收工測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---------- 📚 兩本書：📜 委託簿＋🕘 時刻簿；委託拆成時段、時段連到委託的步驟、同時段不只一件 ----------
(async () => {
  const os = require('os');
  const PD = require('../src/main/plandraft');
  const P = require('../src/main/planParser');
  const { Engine } = require('../src/main/engine');
  // 1. 計畫檔的寫法：「委託名稱：步驟」冒號前面剛好是委託名稱才算連結
  const base = '# 2026 時刻簿測試 10/12–10/16\n\n## 寫完週報 🔧 📅 10/16\n- [x] 收資料\n- [ ] 寫初稿\n- [ ] 請主管看\n\n## 週二 10/13\n- 09:00–10:00 寫完週報：寫初稿\n- 09:30–10:30 回信\n- 10:00–11:00 10/5 會議：提問清單\n- 14:00–15:00 📯 週會\n';
  const plan = P.parsePlan(base);
  const rows = plan.days[0].rows;
  assert.deepStrictEqual(rows.map((r) => [r.questId ? 'q' : '', r.step || '']), [['q', '寫初稿'], ['', ''], ['', ''], ['', '']], '計畫檔：時段連到委託');
  assert.deepStrictEqual([PD.linkOf('寫完週報', [{ id: 'a', title: '寫完週報' }]), PD.linkOf('寫完週報整理', [{ id: 'a', title: '寫完週報' }])].map((x) => x && x.step), ['', null], '整格是委託名稱也算；只有開頭一樣不算');
  // 2. 草稿：連結、並排、委託改名時段跟著改、重疊只有撞團戰才提醒
  const ctx = { today: '2026-10-13', week: PD.weekOf('2026-10-13') };
  const d = PD.blank(ctx.week, '');
  PD.syncPlan(d, plan);
  let v = PD.view(d, { today: '2026-10-13', raids: [{ date: '2026-10-13', start: '09:00', end: '09:30', title: '站會' }] });
  const r0 = v.rows.find((r) => r.title === '寫完週報：寫初稿');
  assert.ok(r0.link && r0.link.step === '寫初稿' && r0.link.hasStep && !r0.link.stepDone && r0.lanes === 2, '連結＋並排：' + JSON.stringify(r0));
  assert.deepStrictEqual(PD.layoutDay([{ key: 'a', start: '09:00', end: '10:00' }, { key: 'b', start: '09:30', end: '11:00' }, { key: 'c', start: '10:00', end: '10:30' }, { key: 'd', start: '11:00', end: '12:00' }]), { a: { lane: 0, lanes: 2, g: 0 }, b: { lane: 1, lanes: 2, g: 0 }, c: { lane: 0, lanes: 2, g: 0 }, d: { lane: 0, lanes: 1, g: 1 } }, '同時段並排');
  assert.ok(v.quests[0].slots === 1 && v.quests[0].slotDates[0] === '2026-10-13', '委託知道自己排了幾格');
  PD.addItems(d, [{ kind: 'row', date: '2026-10-13', start: '09:00', end: '10:00', title: '看信', raid: false }]);
  assert.strictEqual(PD.checks(d).length, 0, '同時段兩件事：不用紅筆');
  PD.addItems(d, [{ kind: 'row', date: '2026-10-13', start: '14:30', end: '15:30', title: '寫測試', raid: false }]);
  assert.ok(PD.checks(d).some((c) => /團戰「週會」/.test(c.text)), '撞團戰：要提醒');
  assert.ok(PD.checks(d, { raids: [{ date: '2026-10-13', start: '09:00', end: '09:30', title: '站會' }] }).some((c) => /站會/.test(c.text)), '撞自己建的團戰也提醒');
  PD.editItem(d, d.quests[0].id, { title: '寫好週報' });
  assert.ok(d.rows.some((r) => r.title === '寫好週報：寫初稿'), '委託改名：時段跟著改');
  const applied = PD.applyToContent(base, d).content;
  assert.ok(/## 寫好週報/.test(applied) && /09:00–10:00 寫好週報：寫初稿/.test(applied), applied);
  // 一次說好幾天：每一天各記一筆
  const xd = (t) => PD.ruleExtract(t, ctx).map((x) => `${x.kind} ${(x.date || x.due || '').slice(5)} ${x.start || x.time || ''} ${x.title}`.replace(/\s+/g, ' ').trim());
  assert.deepStrictEqual(xd('週三、週四出差'), ['theme 10-14 出差', 'theme 10-15 出差'], '週三、週四出差');
  assert.deepStrictEqual(xd('週三到週五外訓'), ['theme 10-14 外訓', 'theme 10-15 外訓', 'theme 10-16 外訓'], '週三到週五');
  assert.deepStrictEqual(xd('週二和週四 9 點站會'), ['row 10-13 09:00 站會', 'row 10-15 09:00 站會'], '週二和週四 9 點');
  assert.deepStrictEqual(xd('提醒我週二、週四下午四點填工時'), ['reminder 10-13 16:00 填工時', 'reminder 10-15 16:00 填工時'], '提醒好幾天');
  assert.deepStrictEqual(xd('明天、後天都要請假'), ['theme 10-14 請假', 'theme 10-15 請假']);
  assert.deepStrictEqual(xd('週三做測試、週四修 bug、週五上線'), ['quest 10-14 做測試', 'quest 10-15 修 bug', 'quest 10-16 上線'], '每段有自己的事：照舊拆開');
  // 排在截止日之後：提醒
  const late = PD.blank(ctx.week, '');
  PD.addItems(late, [{ kind: 'quest', title: '交企劃', tier: 'major', due: '2026-10-14', steps: ['寫大綱'] }, { kind: 'row', date: '2026-10-15', start: '09:00', end: '10:00', title: '交企劃：寫大綱', raid: false }]);
  assert.ok(PD.checks(late).some((c) => /截止日（週三 10\/14）之後/.test(c.text)), '排在截止日之後');
  // 3. 步驟的時間寫法
  assert.deepStrictEqual(PD.parseStepLines('收資料 30\n寫初稿 1.5 小時\n- 整理 45分\n改第2版\n請主管看'), [{ text: '收資料', min: 30 }, { text: '寫初稿', min: 90 }, { text: '整理', min: 45 }, { text: '改第2版', min: 0 }, { text: '請主管看', min: 0 }]);
  // 4. 拆時段：平均分、一步一格、跳過團戰、延到下一天、擠在同一格、照步驟的時間
  const s = PD.blank(ctx.week, '');
  PD.addItems(s, [{ kind: 'quest', title: '寫完週報', tier: 'major', due: '2026-10-16', steps: ['收資料', '寫初稿', '請主管看'] }, { kind: 'row', date: '2026-10-13', start: '10:00', end: '10:30', title: '站會', raid: true }]);
  const qid = s.quests[0].id;
  const fmt = (r) => r.rows.map((x) => `${x.date.slice(8)} ${x.start}-${x.end} ${x.step}`);
  const steps = ['收資料', '寫初稿', '請主管看'];
  let sp = PD.splitPlan(s, qid, { dates: ['2026-10-13'], from: '09:00', to: '12:00', unit: 60, steps, fill: 'spread' });
  assert.deepStrictEqual(fmt(sp), ['13 09:00-10:00 收資料', '13 10:30-11:30 寫初稿', '13 11:30-12:00 請主管看'], '跳過團戰（10:00 站會）');
  assert.ok(sp.skipped.length === 1 && /站會/.test(sp.skipped[0]));
  sp = PD.splitPlan(s, qid, { dates: ['2026-10-13'], from: '13:00', to: '19:00', unit: 60, steps, fill: 'spread' });
  assert.deepStrictEqual(fmt(sp), ['13 13:00-15:00 收資料', '13 15:00-17:00 寫初稿', '13 17:00-19:00 請主管看'], '格子比步驟多：平均分、連在一起的合成一段');
  sp = PD.splitPlan(s, qid, { dates: ['2026-10-13'], from: '13:00', to: '19:00', unit: 30, steps, fill: 'one' });
  assert.deepStrictEqual(fmt(sp), ['13 13:00-13:30 收資料', '13 13:30-14:00 寫初稿', '13 14:00-14:30 請主管看'], '一步一格');
  sp = PD.splitPlan(s, qid, { dates: ['2026-10-14'], from: '09:00', to: '11:00', unit: 60, steps: ['a1', 'a2', 'a3', 'a4', 'a5'], overflow: 'next', offDates: ['2026-10-15'] });
  assert.deepStrictEqual(fmt(sp), ['14 09:00-10:00 a1', '14 10:00-11:00 a2', '16 09:00-10:00 a3', '16 10:00-11:00 a4'], '延到下一天（跳過放假的週四），週五排完還不夠＝排不下');
  assert.deepStrictEqual(sp.leftover, ['a5']);
  sp = PD.splitPlan(s, qid, { dates: ['2026-10-14'], from: '09:00', to: '11:00', unit: 60, steps: ['a1', 'a2', 'a3', 'a4'], overflow: 'stack' });
  assert.deepStrictEqual(fmt(sp), ['14 09:00-10:00 a1', '14 09:00-10:00 a2', '14 10:00-11:00 a3', '14 10:00-11:00 a4'], '擠在同一格');
  assert.strictEqual(sp.stacked, 4);
  sp = PD.splitPlan(s, qid, { dates: ['2026-10-13'], from: '09:00', to: '12:00', unit: 'est', steps: [{ text: '收資料', min: 90 }, { text: '寫初稿', min: 60 }] });
  assert.deepStrictEqual(fmt(sp), ['13 09:00-10:00 收資料', '13 10:30-11:00 收資料', '13 11:00-12:00 寫初稿'], '照步驟寫的時間（被團戰切開）');
  sp = PD.splitPlan(s, qid, { dates: ['2026-10-13', '2026-10-14'], from: '14:00', to: '16:00', unit: 60, steps: [] });
  assert.deepStrictEqual(sp.rows.map((x) => x.title), ['寫完週報', '寫完週報'], '沒有步驟：整段做這個委託');
  assert.throws(() => PD.splitPlan(s, qid, { dates: ['2026-10-13'], from: '12:00', to: '09:00', unit: 60 }), /結束時間/);
  assert.throws(() => PD.splitPlan(s, qid, { dates: [], from: '09:00', to: '12:00', unit: 60 }), /哪幾天/);
  sp = PD.splitPlan(s, qid, { dates: ['2026-10-13'], from: '13:00', to: '16:00', unit: 60, steps: ['收資料', '寫初稿', '請主管看', '寄出'], overflow: 'stack' });
  const ids = PD.applySplit(s, qid, sp, ['收資料', '寫初稿', '請主管看', '寄出']);
  assert.ok(ids.length === 4 && s.quests[0].steps.length === 4 && s.rows.filter((r) => r.title.startsWith('寫完週報：')).length === 4, '套用：新步驟補進委託（4 個步驟擠進 3 格）');
  // 5. AI 建議步驟：格式檢查
  assert.deepStrictEqual(PD.normalizeSteps({ steps: [{ text: '收集資料', minutes: 40 }, { text: '寫完週報', minutes: 30 }, { text: '寫初稿', minutes: 5 }, { text: '寫初稿', minutes: 60 }] }, { title: '寫完週報' }), [{ text: '收集資料', min: 45 }, { text: '寫初稿', min: 15 }], 'AI 的步驟：去掉委託名稱、重複的，時間對齊 15 分');
  assert.deepStrictEqual(PD.normalizeSteps({ steps: [{ text: '只有一個', minutes: 30 }] }, { title: 'x' }), [], '少於兩個不算');

  // 6. 引擎：時刻簿、拆時段、做完一格自動勾步驟、同時好幾件
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-tb-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), base);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, achievements: { enabled: false }, streak: { enabled: false }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false }, reminders: { items: [] } }));
  let t = new Date('2026-10-13T09:40:00').getTime();
  const E = new Engine({ appDir: dir, dataDir: path.join(dir, 'data'), now: () => new Date(t) });
  E.state.onboarding = { done: true };
  // 同時好幾件
  const ti = E.todayInfo();
  assert.ok(ti.currents.length === 2 && ti.current.a === '寫完週報：寫初稿', '現在同時兩件：最早結束的當這一格');
  assert.ok(/寫完週報：寫初稿／回信/.test(E.facts().block), '艾琳說現在這格：兩件都說');
  // 打開時刻簿（今日行程的 🕘）
  let r = E.pdOpen('this', { book: 'time', day: '2026-10-13' });
  assert.ok(r.planDraft.book === 'time' && r.planDraft.bookDay === '2026-10-13' && r.planDraft.nowHM === '09:40', '直接翻到時刻簿的今天');
  E.pdBook('quests');
  assert.strictEqual(E.pdView().book, 'quests', '記住翻到哪一本');
  assert.ok(E.pdView().handFont === true, '手寫字型預設開');
  E.pdSetFont(false);
  assert.ok(E.pdView().handFont === false && JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).planDraft.handFont === false, '關掉手寫字型：存進設定');
  E.pdSetFont(true);
  // 拆時段
  const wq = E.pdView().quests.find((q) => q.title === '寫完週報').id;
  r = E.pdSplitPreview(wq, { dates: ['2026-10-14'], from: '09:00', to: '11:00', unit: 60, stepsText: '寫初稿\n請主管看' });
  assert.deepStrictEqual(r.preview.rows.map((x) => x.title), ['寫完週報：寫初稿', '寫完週報：請主管看'], '預覽');
  assert.strictEqual(E.pdView().changes, 0, '預覽不改草稿');
  r = E.pdSplit(wq, { dates: ['2026-10-14'], from: '09:00', to: '11:00', unit: 60, stepsText: '寫初稿\n請主管看' });
  assert.ok(r.lines[0].event === 'pd_split' && r.planDraft.book === 'time' && r.planDraft.bookDay === '2026-10-14' && r.planDraft.changes === 2, '排進去：翻到時刻簿那天');
  E.pdUndo();
  assert.strictEqual(E.pdView().changes, 0, '↶ 復原排進去的');
  E.pdSplit(wq, { dates: ['2026-10-14'], from: '09:00', to: '11:00', unit: 60, stepsText: '寫初稿\n請主管看' });
  await E.pdCommit();
  const txt = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  assert.ok(/## 週三 10\/14\n- 09:00–10:00 寫完週報：寫初稿\n- 10:00–11:00 寫完週報：請主管看/.test(txt), txt);
  // AI 建議步驟（假的）
  await assert.rejects(E.pdSuggestSteps(wq), /AI 現在沒開/);
  E.config.llm.enabled = true; E.npc.status = { online: true };
  E.npc.structured = async (event, o) => { assert.ok(event === 'plan_steps' && /【委託】寫完週報/.test(o.user) && /【已經有的步驟】收資料/.test(o.user)); return { steps: [{ text: '整理數字', minutes: 30 }, { text: '寫重點', minutes: 45 }] }; };
  r = await E.pdSuggestSteps(wq, { minutes: 120 });
  assert.deepStrictEqual(r.steps, [{ text: '整理數字', min: 30 }, { text: '寫重點', min: 45 }]);
  E.config.llm.enabled = false;
  // 做完一格 → 委託的那個步驟也勾起來（只勾一次）
  t = new Date('2026-10-13T10:05:00').getTime();
  const row = E.plan.days.find((x) => x.date === '2026-10-13').rows.find((x) => x.a === '寫完週報：寫初稿');
  const gold0 = E.state.player.gold;
  r = await E.toggleDaily(row.id, true);
  const after = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8');
  assert.ok(r.linked && r.linked.step === '寫初稿' && /- \[x\] 寫初稿/.test(after) && /- \[x\] 09:00–10:00 寫完週報：寫初稿/.test(after), '做完一格＝步驟也做完：' + after);
  assert.ok(r.reward && r.reward.xp > 0 && E.state.player.gold > gold0, '兩份獎勵加在一起');
  r = await E.toggleDaily(row.id, false);
  assert.ok(!r.linked && /- \[x\] 寫初稿/.test(fs.readFileSync(path.join(dir, 'plan.md'), 'utf8')), '取消那格：步驟不會跟著取消');
  // 筆記本裡勾那格（pdRowDone 走同一條路）
  const r2 = E.pdView().rows.find((x) => x.title === '寫完週報：請主管看');
  t = new Date('2026-10-14T10:30:00').getTime();
  r = await E.pdRowDone(r2.id, true);
  assert.ok(r.linked && E.pdView().quests.find((q) => q.title === '寫完週報').steps.every((x) => x.done), '筆記本勾時段：步驟也勾');
  fs.rmSync(dir, { recursive: true, force: true });
  // 7. 畫面：兩本書、書籤、時刻簿、拆時段小卡
  const root = path.join(__dirname, '..');
  const big = fs.readFileSync(path.join(root, 'src/renderer/plandraft.html'), 'utf8');
  for (const id of ['pageQuests', 'pageTime', 'tabs', 'dueCols', 'dayTabs', 'timeArea', 'unsureBox']) assert.ok(big.includes(`id="${id}"`), '筆記本畫面：' + id);
  const pre = fs.readFileSync(path.join(root, 'src/main/plandraft-preload.js'), 'utf8');
  for (const ch of ['pd:book', 'pd:splitPreview', 'pd:split', 'pd:suggest', 'pd:font']) assert.ok(pre.includes(ch), 'preload：' + ch);
  // ✍ 手寫字型（芫荽 Iansui，OFL）：CSS 用到的檔案都在、附授權、會打包進安裝檔、不會太大
  const fdir = path.join(root, 'assets', 'fonts', 'iansui');
  const fcss = fs.readFileSync(path.join(fdir, 'iansui.css'), 'utf8');
  const urls = [...fcss.matchAll(/url\((\.\/files\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(urls.length > 50 && urls.every((u) => fs.existsSync(path.join(fdir, u))) && !/\.woff\)/.test(fcss), '字型檔都在（只用 woff2）');
  assert.ok(/SIL OPEN FONT LICENSE/i.test(fs.readFileSync(path.join(fdir, 'OFL.txt'), 'utf8')), '附 OFL 授權');
  const fsize = fs.readdirSync(path.join(fdir, 'files')).reduce((n, f) => n + fs.statSync(path.join(fdir, 'files', f)).size, 0);
  assert.ok(fsize < 7 * 1024 * 1024, `字型不要太大：${(fsize / 1048576).toFixed(1)}MB`);
  assert.ok(/assets\/fonts\/iansui\/iansui\.css/.test(big) && JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.files.includes('assets/fonts/**/*'), '筆記本用手寫字、安裝檔包含字型');
  console.log('兩本書與時刻簿測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });

// ---- 🛡 下載模型的防呆：錯誤說人話、下載前檢查、網路斷掉自動接著下載 ----
(async () => {
  const S = require('../src/main/setup');
  const PG = require('../src/main/pullGuard');
  const os = require('os');
  // 1. 錯誤分類與中文說明（網址是假的）
  const R2 = 'max retries exceeded: Get "https://abc123example.r2.cloudflarestorage.com/ollama/docker/registry/v2/blobs/sha256/aa/aa00/data?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=FAKE&X-Amz-Signature=FAKE": dial tcp 192.0.2.10:443: connectex: A connection attempt failed because the connected party did not properly respond after a period of time, or established connection failed because connected host has failed to respond.';
  assert.deepStrictEqual(S.classifyPullError(R2), { kind: 'network', where: 'storage' });
  assert.ok(/連不上模型的下載伺服器（Cloudflare）/.test(S.friendlyPullError(R2)) && /已經下載的部分會留著/.test(S.friendlyPullError(R2)) && /手機熱點/.test(S.friendlyPullError(R2)), '連線逾時：中文說明');
  assert.ok(!/X-Amz|FAKE|https:/.test(S.techDetail(R2)) && /abc123example\.r2\.cloudflarestorage\.com/.test(S.techDetail(R2)) && S.techDetail(R2).length <= 221, '技術訊息拿掉長網址：' + S.techDetail(R2));
  assert.deepStrictEqual(S.classifyPullError('pull model manifest: Get "https://registry.ollama.ai/v2/library/qwen3/manifests/4b": dial tcp: lookup registry.ollama.ai: no such host'), { kind: 'network', where: 'registry' });
  assert.ok(/ Ollama 的模型網站/.test(S.friendlyPullError('pull model manifest: Get "https://registry.ollama.ai/v2/x": net/http: TLS handshake timeout')));
  for (const m of ['max retries exceeded: unexpected EOF', 'read tcp 10.0.0.2:5050->192.0.2.1:443: wsarecv: An existing connection was forcibly closed by the remote host.', 'part 3 stalled; retrying']) assert.strictEqual(S.classifyPullError(m).kind, 'network', m);
  assert.strictEqual(S.classifyPullError('write C:\\Users\\someone\\.ollama\\models\\blobs\\sha256-aa-partial: There is not enough space on the disk.').kind, 'disk');
  assert.ok(/硬碟空間不夠/.test(S.friendlyPullError('no space left on device')));
  assert.ok(!/someone/.test(S.techDetail('open C:\\Users\\someone\\.ollama\\models: Access is denied.')), '技術訊息不放使用者資料夾的名字');
  assert.strictEqual(S.classifyPullError('fetch failed: ECONNREFUSED').kind, 'ollama');
  assert.strictEqual(S.classifyPullError('下載沒有完成').kind, 'incomplete');
  assert.ok(/版本太舊/.test(S.friendlyPullError('pull model manifest: 412: requires a newer version of Ollama')));
  assert.ok(Object.keys(S.PULL_BRIEF).every((k) => S.PULL_BRIEF[k].length <= 12), '小提示要短');
  // SETUP.pull 丟出來的錯誤：中文 message＋原本的英文＋分類
  const lineFetch = (ls) => async () => { const ch = ls.map((l) => new TextEncoder().encode(JSON.stringify(l) + '\n')); let i = 0; return { ok: true, body: { getReader: () => ({ read: async () => (i < ch.length ? { value: ch[i++], done: false } : { done: true }) }) } }; };
  await assert.rejects(S.pull({ model: 'x', fetchImpl: lineFetch([{ status: 'pulling a', digest: 'a', total: 10, completed: 5 }, { error: R2 }]) }), (e) => e.kind === 'network' && e.where === 'storage' && e.raw === R2 && /Cloudflare/.test(e.message));
  await assert.rejects(S.pull({ model: 'x', fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } }), (e) => e.kind === 'ollama' && /Ollama 沒有回應/.test(e.message));
  await assert.rejects(S.pull({ model: 'x', fetchImpl: async () => ({ ok: true, body: { getReader: () => ({ read: async () => { throw new Error('other side closed'); } }) } }) }), (e) => e.kind === 'ollama');
  await assert.rejects(S.pull({ model: 'x', fetchImpl: lineFetch([{ status: 'pulling manifest' }]) }), (e) => e.kind === 'incomplete' && /沒有完成/.test(e.message));
  const ac = new AbortController(); ac.abort();
  await assert.rejects(S.pull({ model: 'x', signal: ac.signal, fetchImpl: async () => { throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }); } }), (e) => e.name === 'AbortError' && !e.kind, '取消不算錯誤');

  // 2. 模型名稱、資料夾、proxy
  assert.deepStrictEqual(PG.parseName('qwen3:30b-instruct'), { repo: 'library/qwen3', tag: '30b-instruct' });
  assert.deepStrictEqual(PG.parseName('qwen3-embedding:0.6b'), { repo: 'library/qwen3-embedding', tag: '0.6b' });
  assert.deepStrictEqual(PG.parseName('someone/cafe-bot'), { repo: 'someone/cafe-bot', tag: 'latest' });
  assert.deepStrictEqual(PG.parseName('registry.ollama.ai/library/gemma3:4b'), { repo: 'library/gemma3', tag: '4b' });
  for (const m of ['hf.co/someone/model:Q4', 'localhost:5000/x:y', 'qwen3@sha256:abc', '', null]) assert.strictEqual(PG.parseName(m), null, String(m));
  assert.strictEqual(PG.modelsDir({ OLLAMA_MODELS: 'D:\\models' }, '/home/u'), 'D:\\models');
  assert.strictEqual(PG.modelsDir({}, '/home/u'), path.join('/home/u', '.ollama', 'models'));
  assert.strictEqual(PG.envProxy({ HTTPS_PROXY: 'http://user:pw@proxy.example:3128' }), 'http://proxy.example:3128', '帳號密碼拿掉');
  assert.strictEqual(PG.envProxy({ https_proxy: 'proxy.example:8080' }), 'http://proxy.example:8080');
  assert.strictEqual(PG.envProxy({}), null);
  assert.strictEqual(PG.systemProxy('PROXY proxy.example:8080; DIRECT'), 'proxy.example:8080');
  assert.strictEqual(PG.systemProxy('DIRECT'), null);
  assert.strictEqual(PG.driveName('C:\\Users\\u\\.ollama\\models', 'win32'), 'C 槽');
  assert.strictEqual(PG.driveName('/home/u/.ollama/models', 'linux'), '這個磁碟');

  // 3. 已經在硬碟上的部分（下載好的、下載到一半的）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erin-pull-'));
  const blobs = path.join(tmp, 'models', 'blobs');
  fs.mkdirSync(blobs, { recursive: true });
  const D = (c) => `sha256:${c.repeat(64)}`;
  fs.writeFileSync(path.join(blobs, `sha256-${'a'.repeat(64)}`), 'x');
  fs.writeFileSync(path.join(blobs, `sha256-${'b'.repeat(64)}-partial`), '');
  fs.writeFileSync(path.join(blobs, `sha256-${'b'.repeat(64)}-partial-0`), JSON.stringify({ N: 0, Offset: 0, Size: 600, Completed: 600 }));
  fs.writeFileSync(path.join(blobs, `sha256-${'b'.repeat(64)}-partial-1`), JSON.stringify({ N: 1, Offset: 600, Size: 400, Completed: 150 }));
  fs.writeFileSync(path.join(blobs, `sha256-${'b'.repeat(64)}-partial-2`), '壞掉的');
  assert.strictEqual(PG.haveBytes(blobs, D('a'), 5000), 5000, '下載好的');
  assert.strictEqual(PG.haveBytes(blobs, D('b'), 1000), 750, '下載到一半：各段加起來');
  assert.strictEqual(PG.haveBytes(blobs, D('c'), 1000), 0);
  assert.strictEqual(PG.haveBytes(path.join(tmp, 'nope'), D('c'), 1000), 0, '還沒有資料夾');
  const free = PG.freeBytes(path.join(tmp, 'models', 'not', 'yet'));
  assert.ok(free === null || free > 0, '資料夾還不存在：往上找');

  // 4. 下載前檢查（連線都是假的）
  const GiB = PG.GiB;
  const layers = [{ digest: D('a'), size: 5000 }, { digest: D('b'), size: 1000 }, { digest: D('d'), size: 18 * GiB }];
  const manifest = { schemaVersion: 2, config: { digest: D('e'), size: 487 }, layers };
  const resp = (status, body, url) => ({ ok: status < 400, status, url: url || '', json: async () => body, arrayBuffer: async () => new ArrayBuffer(8) });
  const timeoutErr = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } });
  // fail：'registry'／'storage'（哪一段連不上）；seen 記錄網址
  const fakeNet = ({ fail = null, mf = manifest, status = 200, seen = [] } = {}) => async (url, opts) => {
    seen.push([url, opts && opts.headers]);
    if (/manifests/.test(url)) { if (fail === 'registry') throw timeoutErr(); return resp(status, mf); }
    if (fail === 'storage') throw timeoutErr();
    return resp(206, null, 'https://abc123example.r2.cloudflarestorage.com/ollama/x');
  };
  const big = { existsSync: fs.existsSync, readdirSync: fs.readdirSync, readFileSync: fs.readFileSync, statfsSync: () => ({ bavail: 100 * 1024, bsize: 1024 * 1024 }) }; // 100 GiB
  const small = { ...big, statfsSync: () => ({ bavail: 10 * 1024, bsize: 1024 * 1024 }) }; // 10 GiB
  const base = { model: 'qwen3:30b-instruct', env: { OLLAMA_MODELS: path.join(tmp, 'models') }, platform: 'win32', fsx: big };
  const seen = [];
  let r = await PG.preflight({ ...base, ollamaFetch: fakeNet({ seen }) });
  assert.ok(r.ok && r.code === null && r.need === 18 * GiB + 250 + 487, '都通：' + JSON.stringify(r));
  assert.ok(seen[0][0] === 'https://registry.ollama.ai/v2/library/qwen3/manifests/30b-instruct' && /manifest\.v2\+json/.test(seen[0][1].Accept), '先問檔案清單');
  assert.ok(seen[1][0] === `https://registry.ollama.ai/v2/library/qwen3/blobs/${D('e')}` && seen[1][1].Range === 'bytes=0-1023', '用最小的檔案測下載伺服器（只拿 1KB）');
  assert.ok(r.notes.some((x) => /abc123example\.r2\.cloudflarestorage\.com 回 206/.test(x)) && r.notes.some((x) => /還要下載 18\.0 GB/.test(x)), '紀錄：' + r.notes.join('；'));
  // 連不上下載伺服器（使用者遇到的那種）
  r = await PG.preflight({ ...base, ollamaFetch: fakeNet({ fail: 'storage' }) });
  assert.ok(!r.ok && r.code === 'network' && r.where === 'storage' && /Cloudflare/.test(r.message) && /仍然下載/.test(r.message) && r.brief === '連不上下載伺服器', '下載伺服器不通：' + r.message);
  // 連不上模型網站
  r = await PG.preflight({ ...base, ollamaFetch: fakeNet({ fail: 'registry' }) });
  assert.ok(!r.ok && r.where === 'registry' && /ollama\.com/.test(r.message));
  // 直接連不通、走 Windows 的 proxy 就通 → 說明怎麼幫 Ollama 設 HTTPS_PROXY
  let asked = null;
  r = await PG.preflight({ ...base, ollamaFetch: fakeNet({ fail: 'storage' }), systemFetch: fakeNet(), resolveProxy: async (u) => { asked = u; return 'PROXY proxy.example:8080; DIRECT'; } });
  assert.ok(!r.ok && r.proxy === 'proxy.example:8080' && /HTTPS_PROXY/.test(r.message) && /http:\/\/proxy\.example:8080/.test(r.message) && /編輯您帳戶的環境變數/.test(r.message) && r.brief === 'Ollama 沒有走 proxy', 'proxy：' + r.message);
  assert.ok(/blobs/.test(asked), '用同一個網址問 Windows 的 proxy');
  r = await PG.preflight({ ...base, platform: 'darwin', ollamaFetch: fakeNet({ fail: 'storage' }), systemFetch: fakeNet(), resolveProxy: async () => 'PROXY proxy.example:8080' });
  assert.ok(/環境變數 HTTPS_PROXY/.test(r.message) && !/編輯您帳戶/.test(r.message), 'Mac：不講 Windows 的設定');
  // 沒有 proxy（DIRECT）或 Windows 的 proxy 也不通：一般的說明
  r = await PG.preflight({ ...base, ollamaFetch: fakeNet({ fail: 'storage' }), systemFetch: fakeNet({ fail: 'storage' }), resolveProxy: async () => 'PROXY proxy.example:8080' });
  assert.ok(!r.ok && !r.proxy && /Cloudflare/.test(r.message) && r.notes.some((x) => /也不通/.test(x)));
  r = await PG.preflight({ ...base, ollamaFetch: fakeNet({ fail: 'storage' }), systemFetch: fakeNet(), resolveProxy: async () => 'DIRECT' });
  assert.ok(!r.ok && !r.proxy);
  // 已經設了 HTTPS_PROXY：不再比對 Windows 的設定，說明裡提醒確認 proxy
  r = await PG.preflight({ ...base, env: { ...base.env, HTTPS_PROXY: 'http://proxy.example:3128' }, ollamaFetch: fakeNet({ fail: 'storage' }), systemFetch: fakeNet(), resolveProxy: async () => { throw new Error('不該問'); } });
  assert.ok(!r.ok && !r.proxy && /proxy\.example:3128/.test(r.message) && r.notes[0].includes('HTTPS_PROXY'));
  // 硬碟空間不夠（下載到一半的不重複算）
  r = await PG.preflight({ ...base, fsx: small, ollamaFetch: fakeNet() });
  assert.ok(!r.ok && r.code === 'disk' && /還要下載約 18\.0 GB/.test(r.message) && /這個磁碟只剩 10\.0 GB/.test(r.message) && r.brief === '硬碟空間不夠', '硬碟：' + r.message);
  r = await PG.preflight({ ...base, fsx: small, model: 'qwen3:1.7b', ollamaFetch: fakeNet({ mf: { config: { digest: D('e'), size: 487 }, layers: [{ digest: D('f'), size: 1.4e9 }] } }) });
  assert.ok(r.ok, '小模型放得下');
  r = await PG.preflight({ ...base, fsx: { ...big, statfsSync: () => { throw new Error('ENOSYS'); } }, ollamaFetch: fakeNet() });
  assert.ok(r.ok && /剩 ？ GB/.test(r.notes.join()), '看不到剩多少：不擋');
  // 都下載好了：不用測下載伺服器
  const seen2 = [];
  r = await PG.preflight({ ...base, fsx: small, ollamaFetch: fakeNet({ seen: seen2, mf: { config: { digest: D('a'), size: 5000 }, layers: [] } }) });
  assert.ok(r.ok && seen2.length === 1 && r.notes.some((x) => /都已經在電腦裡/.test(x)));
  // manifest list：拿第一個（有 layers 直接用；沒有就再問一次）
  const seen3 = [];
  const list = { schemaVersion: 2, mediaType: 'application/vnd.ollama.manifest.list.v2+json', manifests: [{ digest: D('9'), size: 300 }] };
  const listNet = async (url, opts) => { seen3.push(url); if (/manifests\/30b/.test(url)) return resp(200, list); if (/manifests\/sha256/.test(url)) return resp(200, manifest); return resp(206, null, 'https://abc123example.r2.cloudflarestorage.com/x'); };
  r = await PG.preflight({ ...base, ollamaFetch: listNet });
  assert.ok(r.ok && r.need > 18 * GiB && seen3[1].endsWith(`/manifests/${D('9')}`), 'manifest list：' + seen3.join(' '));
  // 沒把握就不擋：模型網站回 404／500、不是官方模型、沒有連線工具
  for (const st of [404, 500]) { r = await PG.preflight({ ...base, ollamaFetch: fakeNet({ status: st }) }); assert.ok(r.ok && r.notes.some((x) => x.includes(String(st))), `回 ${st}：不擋`); }
  r = await PG.preflight({ ...base, model: 'hf.co/someone/model:Q4', ollamaFetch: async () => { throw new Error('不該連'); } });
  assert.ok(r.ok);
  r = await PG.preflight({ model: 'qwen3:4b' });
  assert.ok(r.ok);
  // 逾時（假的 fetch 一直不回，12 秒的限制用 abort 結束）→ 也算連不上；取消 → 丟出去
  const hang = (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const ac2 = new AbortController();
  setTimeout(() => ac2.abort(), 50);
  await assert.rejects(PG.preflight({ ...base, signal: ac2.signal, ollamaFetch: hang }), (e) => e.name === 'AbortError', '取消：不當作連不上');
  assert.ok(/12 秒/.test(PG.summary({ ok: false, brief: 'x', notes: ['模型網站連不上：逾時（12 秒沒有回應）'] })));
  assert.ok(/^通過；/.test(PG.summary({ ok: true, notes: ['a'] })) && /^擋下（硬碟空間不夠）；/.test(PG.summary({ ok: false, brief: '硬碟空間不夠', notes: [] })));
  fs.rmSync(tmp, { recursive: true, force: true });

  // 5. 網路斷掉自動接著下載
  const netErr = (m = R2) => Object.assign(new Error(S.friendlyPullError(m)), { raw: m, ...S.classifyPullError(m) });
  const runner = (script) => { let i = 0; return async (onProgress) => { const step = script[Math.min(i++, script.length - 1)]; for (const c of step.at || []) onProgress({ status: 'pulling', completed: c, total: 1000 * 1048576, percent: Math.floor(c / (1000 * 1048576) * 100) }); if (step.ok) { onProgress({ status: 'success', percent: 100 }); return true; } throw step.err || netErr(); }; };
  const MB = 1048576;
  let ev = [], logs = [];
  const nap = async () => {};
  let ok = await PG.pullWithRetry({ run: runner([{ at: [100 * MB, 300 * MB] }, { at: [50 * MB, 320 * MB, 500 * MB] }, { at: [520 * MB], ok: true }]), onProgress: (p) => ev.push(p), sleep: nap, waits: [3, 5], log: (m) => logs.push(m) });
  assert.strictEqual(ok, true);
  const retry = ev.filter((p) => p.status === 'retrying');
  assert.deepStrictEqual(retry.map((p) => [p.attempt, p.retryIn]), [[1, 3], [1, 2], [1, 1], [2, 5], [2, 4], [2, 3], [2, 2], [2, 1]], '倒數：' + JSON.stringify(retry.map((p) => [p.attempt, p.retryIn])));
  assert.ok(retry.every((p) => p.reason === '網路斷了一下'));
  const pcts = ev.filter((p) => p.status !== 'success').map((p) => p.percent);
  assert.ok(pcts.every((x, i) => i === 0 || x >= pcts[i - 1]), '百分比不倒退：' + pcts.join(','));
  assert.ok(ev.some((p) => p.status === 'resuming') && ev[ev.length - 1].status === 'success');
  assert.ok(logs.length === 2 && /第 1 次失敗（network，有進度）/.test(logs[0]) && !/X-Amz/.test(logs.join()), '紀錄：' + logs.join(' | '));
  // 一直沒有進度：第 1 次失敗＋重試 2 次都沒進度 → 放棄
  ev = []; let n = 0;
  await assert.rejects(PG.pullWithRetry({ run: async (onP) => { n++; onP({ status: 'pulling', completed: 0, total: 10, percent: 0 }); throw netErr(); }, onProgress: (p) => ev.push(p), sleep: nap, waits: [1] }), (e) => /^試了 3 次都沒辦法下載完。網路連不上/.test(e.message) && e.retried === 2);
  assert.strictEqual(n, 3);
  // 有進度就重新算：沒進度、有進度、沒進度、沒進度、沒進度 → 5 次
  n = 0;
  await assert.rejects(PG.pullWithRetry({ run: async (onP) => { n++; if (n === 2) onP({ status: 'pulling', completed: 50 * MB, total: 100 * MB, percent: 50 }); throw netErr(); }, sleep: nap, waits: [1] }));
  assert.strictEqual(n, 5, '有進度後重新算');
  // 最多重試 maxRetries 次（就算每次都有一點進度）
  n = 0;
  await assert.rejects(PG.pullWithRetry({ run: async (onP) => { n++; onP({ status: 'pulling', completed: n * 10 * MB, total: 1e12, percent: 0 }); throw netErr(); }, sleep: nap, waits: [1], maxRetries: 4 }), (e) => e.retried === 4);
  assert.strictEqual(n, 5);
  // 不是網路的問題：不重試
  for (const m of ['no space left on device', 'pull model manifest: file does not exist', 'pull model manifest: 412: requires a newer version of Ollama', 'fetch failed: ECONNREFUSED']) {
    n = 0;
    await assert.rejects(PG.pullWithRetry({ run: async () => { n++; throw netErr(m); }, sleep: nap }), (e) => !/試了/.test(e.message));
    assert.strictEqual(n, 1, '不重試：' + m);
  }
  // 「沒有完成」也會再接一次
  n = 0;
  ok = await PG.pullWithRetry({ run: async (onP) => { n++; if (n === 1) throw S.pullError('下載沒有完成'); onP({ status: 'success', percent: 100 }); return true; }, sleep: nap, waits: [1] });
  assert.ok(ok && n === 2);
  // 連不上模型網站：倒數時說「連不上模型網站」
  ev = [];
  await PG.pullWithRetry({ run: runner([{ err: netErr('pull model manifest: Get "https://registry.ollama.ai/v2/x": dial tcp: i/o timeout') }, { ok: true }]), onProgress: (p) => ev.push(p), sleep: nap, waits: [1] });
  assert.strictEqual(ev.find((p) => p.status === 'retrying').reason, '連不上模型網站');
  // 等待中按取消 → 停下來
  const ac3 = new AbortController(); n = 0;
  await assert.rejects(PG.pullWithRetry({ run: async () => { n++; throw netErr(); }, signal: ac3.signal, waits: [30], sleep: async () => { ac3.abort(); } }), (e) => e.kind === 'canceled');
  assert.strictEqual(n, 1);
  // 真的 sleep：取消時馬上結束（不用等 1 秒）
  const ac4 = new AbortController(); const t0 = Date.now();
  setTimeout(() => ac4.abort(), 30);
  await assert.rejects(PG.pullWithRetry({ run: async () => { throw netErr(); }, signal: ac4.signal, waits: [30] }), (e) => e.kind === 'canceled');
  assert.ok(Date.now() - t0 < 900, '取消不用等');
  assert.deepStrictEqual(PG.WAIT_STEPS, [10, 30, 60]);

  // 6. 接到 main／preload／畫面
  const root = path.join(__dirname, '..');
  const mainSrc = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.ok(/PG\.preflight\(/.test(mainSrc) && /PG\.pullWithRetry\(/.test(mainSrc) && /setup\.log/.test(mainSrc) && /mode: 'direct'/.test(mainSrc) && /force: !!\(opts && opts\.force\)/.test(mainSrc), 'main：檢查＋自動續傳＋紀錄');
  assert.ok(/setupPull: \(model, opts\)/.test(fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8')));
  const ob = fs.readFileSync(path.join(root, 'src/renderer/onboard.js'), 'utf8');
  assert.ok(/data-force="1"/.test(ob) && /retrying/.test(ob) && /checking/.test(ob) && (ob.match(/force: !!pl\.dataset\.force/g) || []).length === 2, '畫面：仍然下載、倒數、檢查中；新手教學和健康檢查都能按');
  console.log('下載模型防呆測試通過 ✔');
})().catch((e) => { console.error(e); process.exit(1); });
