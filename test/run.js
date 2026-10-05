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
  assert.ok(/^- 09:30–10:00 站會$/m.test(txt), '時段寫進 9/28');
  assert.ok(/^- 14:00–16:00 專案週會（3F 會議室）$/m.test(txt), '地點附在後面');
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
  assert.ok(/叫對方一律用「冒險者」/.test(sys) && /講到自己一律用「艾琳」/.test(sys), '系統提示寫明稱呼與自稱');
  assert.ok(!/玩家/.test(usr.replace(/不要叫「玩家」/, '')) && /冒險者說：「幫我登記」/.test(usr), '狀態與情境都用冒險者');
  assert.ok(/艾琳在喔，冒險者/.test(sent.messages[1].content), '舊聊天紀錄也先校正');
  const off = new NPC({ npc: { name: '艾琳', callName: '冒險者' }, llm: { enabled: false } });
  const t = off.template('reminder_set', { label: '9/30 16:30 提醒我打電話' });
  assert.ok(/艾琳會叫你/.test(t.text) && /提醒我打電話/.test(t.text), '內建台詞：自稱艾琳，提醒內容照原樣');
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
  assert.deepStrictEqual(calls.map((c) => c.body.options.num_ctx), [4096, 4096]);
  assert.ok(calls[0].timeout >= 90000 && calls[1].timeout === 45000, `聊天 ${calls[0].timeout}ms、閒話 ${calls[1].timeout}ms`);
  npc.warmUp(); await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(calls.at(-1).body.options.num_ctx, 4096, '暖機也用同一個 num_ctx');
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
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: false }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
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
  assert.deepStrictEqual([c1.record.result.ben.name, c1.record.method, E.state.history[0].reason, E.state.history[0].gold], ['天水訟', 'circle', '占卜魔法：天水訟', -10]);
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
  assert.ok(sent.format.properties.emotion.enum.includes('disdain'), 'schema 有 disdain');
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
  assert.ok(!/這次的情緒/.test(sys()) && sent.format.properties.emotion.enum.length === 8, '沒骰到就不加指示');
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
  // 戳一下：骰到就害羞，戳太多下骰到就鄙視
  E.saveConfigPatch({ lore: { emotionChance: 0.5 } }); E.npc.fetchJSON = async (_p, body) => { sent = body; return { message: { content: JSON.stringify(reply) } }; }; E.npc.status.online = true;
  E.rand = () => 0.05; E.pokeTimes = [];
  reply = { line: '尾、尾巴不可以抓啦……', emotion: 'shy' };
  r = await E.poke(); assert.strictEqual(r.lines[0].emotion, 'shy'); assert.ok(/這次的情緒：害羞/.test(sys()));
  await E.poke();
  reply = { line: '……冒險者，你是不是很閒？', emotion: 'disdain' };
  r = await E.poke(); assert.strictEqual(r.lines[0].emotion, 'disdain'); assert.ok(/這次的情緒：鄙視/.test(sys()));
  // AI 關著時，骰到害羞就挑害羞的內建台詞
  E.npc.status.online = false; E.pokeTimes = [];
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
  assert.ok(r.lines.some((l) => /常客才有/.test(l.text)), '升到第 2 階的台詞');
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
  // 依記憶體推薦模型
  assert.strictEqual(S.recommend(32).model, 'qwen3:4b');
  assert.strictEqual(S.recommend(16).model, 'qwen3:4b');
  assert.strictEqual(S.recommend(8).model, 'qwen3:1.7b');
  assert.strictEqual(S.recommend(4).model, null);
  assert.ok(S.hasModel(['qwen3:4b'], 'qwen3:4b') && S.hasModel(['qwen3:4b-q4_K_M'], 'qwen3:4b') && !S.hasModel(['qwen3:1.7b'], 'qwen3:4b'));
  // 偵測：Ollama 有開／沒開
  const fakeFetch = (models) => async (url) => { if (!models) throw new Error('ECONNREFUSED'); return { ok: true, json: async () => ({ models: models.map((name) => ({ name })) }) }; };
  let pr = await S.probe({ fetchImpl: fakeFetch(['qwen3:1.7b']), totalmem: 8 * 1024 ** 3 });
  assert.strictEqual(pr.ollama, 'running'); assert.strictEqual(pr.recommend, 'qwen3:1.7b');
  assert.ok(pr.choices.find((c) => c.name === 'qwen3:1.7b').installed && !pr.choices.find((c) => c.name === 'qwen3:4b').installed);
  pr = await S.probe({ fetchImpl: fakeFetch(null), totalmem: 16 * 1024 ** 3 });
  assert.ok(['missing', 'stopped'].includes(pr.ollama) && pr.recommend === 'qwen3:4b');
  // Ollama 版本：0.9.0 以前太舊（關不掉思考）；問不到版本、開發版都不算太舊
  assert.ok(S.versionLess('0.6.2', '0.9.0') && S.versionLess('0.8.9', '0.9.0') && !S.versionLess('0.9.0', '0.9.0') && !S.versionLess('0.12.3', '0.9.0') && !S.versionLess('1.0.0', '0.9.0'));
  assert.ok(!S.versionLess('0.0.0', '0.9.0') && !S.versionLess('', '0.9.0') && !S.versionLess('abc', '0.9.0') && S.versionLess('v0.5.7-rc1', '0.9.0'));
  const verFetch = (version) => async (url) => {
    if (/version$/.test(url)) { if (version === null) throw new Error('404'); return { ok: true, json: async () => ({ version }) }; }
    return { ok: true, json: async () => ({ models: [{ name: 'qwen3:4b' }] }) };
  };
  pr = await S.probe({ fetchImpl: verFetch('0.6.2'), totalmem: 16 * 1024 ** 3 });
  assert.ok(pr.version === '0.6.2' && pr.outdated && pr.minVersion === S.MIN_OLLAMA, '舊版 Ollama：' + JSON.stringify([pr.version, pr.outdated]));
  pr = await S.probe({ fetchImpl: verFetch('0.12.3'), totalmem: 16 * 1024 ** 3 });
  assert.ok(pr.version === '0.12.3' && !pr.outdated, '新版不提醒');
  pr = await S.probe({ fetchImpl: verFetch(null), totalmem: 16 * 1024 ** 3 });
  assert.ok(pr.ollama === 'running' && pr.version === null && !pr.outdated, '問不到版本：不提醒');
  assert.ok(/版本太舊/.test(S.friendlyPullError('pull model manifest: 412: The model you are attempting to pull requires a newer version of Ollama.')), '舊版下載新模型：中文說明');
  assert.strictEqual(S.friendlyPullError('file does not exist'), 'file does not exist');
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
  await assert.rejects(S.pull({ model: 'x', fetchImpl: streamFetch([{ error: 'pull model manifest: file does not exist' }]) }), /does not exist/);
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
  assert.strictEqual(st({ configError: 'config.json 格式錯誤：Unexpected token' }).config.status, 'error');
  assert.strictEqual(st({ plan: { file: 'x.md', exists: false } }).plan.status, 'error');
  assert.ok(st({ plan: { file: 'x.md', exists: true, quests: 0 } }).plan.fixes.some((f) => f.action === 'ui:newQuest'));
  const slowLog = parseLog(Array.from({ length: 5 }, () => '9/30 10:00:00\tchat\t60000ms\t載入模型 5ms').join('\n'));
  assert.strictEqual(st({ log: slowLog }).speed.status, 'warn');
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
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ plan: { path: 'plan.md' }, llm: { enabled: true, baseUrl: 'http://x' }, lore: { path: path.join(__dirname, '..', 'lore', '艾琳.md'), embeddings: false } }));
  const E = new Engine({ appDir: dir, now: () => new Date(`${new Date().getFullYear()}-09-30T10:00:00`) });
  E.deferSpeech = true;
  const heard = [], asked = [];
  E.onSpeech = (ls) => heard.push(...ls);
  E.npc.status.online = true;
  E.npc.fetchJSON = async (_p, body) => { asked.push(body); await new Promise((r) => setTimeout(r, 600)); return { message: { content: JSON.stringify({ line: `好的（第 ${asked.length} 句）`, emotion: 'happy' }) } }; };
  const q = E.plan.quests[0];
  // 連勾三個目標：每一個都馬上完成，不用等 AI
  const t0 = Date.now();
  const rs = [];
  for (let i = 0; i < 3; i++) rs.push(await E.setObjective(q.id, i, true));
  assert.ok(Date.now() - t0 < 450, '勾選不用等 AI（AI 一句要 600ms，等的話要 1.8 秒）：' + (Date.now() - t0) + 'ms');
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
