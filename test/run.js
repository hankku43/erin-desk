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
