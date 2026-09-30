// 程式內新增／編輯／刪除巡禮：新任務、目標、時段、提醒，每一步截圖，最後印出計畫檔（xvfb 用）
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp';
const BG = process.env.SHOT_BG || 'linear-gradient(135deg,#5b7fa6,#9bb7cf)';

module.exports = ({ win, engine, app }) => {
  const wc = win.webContents;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name + '.png'), (await win.capturePage()).toPNG()); console.log('shot', name); };
  const click = (sel) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.click();})()`);
  const type = (sel, val) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) throw new Error('no '+${JSON.stringify(sel)}); el.value=${JSON.stringify(val)}; el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const questId = (title) => js(`state.view.quests.find((q)=>q.title===${JSON.stringify(title)}).id`);
  const showDel = async () => { await js(`document.querySelectorAll('.del').forEach((b)=>b.style.opacity=1)`); await wait(450); }; // 截圖看得到 hover 才出現的 ✕
  const scrollEnd = async () => { await js(`document.querySelector('.panel-body').scrollTop = 99999`); await wait(450); };
  const planFile = () => engine.planFile();
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT ' + msg); };
  wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  wc.once('did-finish-load', async () => {
    try {
      await js(`document.documentElement.style.background=${JSON.stringify(BG)}`);
      await wait(2500);
      const before = fs.readFileSync(planFile(), 'utf8');

      // ---- 新任務 ----
      await click('[data-act=board]'); await wait(600); await shot('e01_board_addbtn');
      await click('[data-new=quest]'); await wait(400); await shot('e02_quest_form');
      await type('#qfTitle', '週報 + 下週計畫');
      await click('.tp.side'); await wait(100);
      await type('#qfDue', '2026-10-02');
      await type('#qfNote', '週五下班前寄給組長');
      await type('#qfObjs', '本週完成事項整理\n下週三件大事列出來');
      await wait(200); await shot('e03_quest_form_filled');
      await click('#qfSave'); await wait(2500); await shot('e04_quest_added');
      let txt = fs.readFileSync(planFile(), 'utf8');
      assert(/^## 週報 \+ 下週計畫 🌿 📅 10\/2$/m.test(txt), '新任務標題寫進檔案');
      assert(/^> 週五下班前寄給組長$/m.test(txt), '台詞寫進檔案');
      assert(/^- \[ \] 下週三件大事列出來$/m.test(txt), '目標寫進檔案');
      const qid = await questId('週報 + 下週計畫');
      assert(qid, '新任務有 id');

      // ---- 加目標（Enter 送出）----
      await click(`[data-obj-add="${qid}"]`); await wait(300);
      await type(`[data-obj-input="${qid}"]`, '寄出週報');
      await shot('e05_obj_input');
      await js(`document.querySelector('[data-obj-input="${qid}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
      await wait(800); await shot('e06_obj_added');
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(/^- \[ \] 寄出週報$/m.test(txt), '新目標寫進檔案');
      await click('[data-obj-cancel]'); await wait(200);

      // ---- 編輯任務 ----
      await click(`[data-edit-quest="${qid}"]`); await wait(400); await shot('e07_edit_form');
      await type('#qfTitle', '週報與下週計畫');
      await click('.tp.main'); await wait(100);
      await click('#qfSave'); await wait(800); await shot('e08_quest_edited');
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(/^## 週報與下週計畫 ⭐ 📅 10\/2$/m.test(txt), '改名＋改類型寫進檔案');
      assert(!/^## 週報 \+ 下週計畫/m.test(txt), '舊標題不見了');
      const qid2 = await questId('週報與下週計畫');
      assert(qid2 && qid2 !== qid, '改名後 id 變了');

      // ---- 刪目標 ----
      await showDel(); await shot('e09_obj_delete_btn');
      await click(`[data-del-obj="${qid2}"][data-idx="2"]`); await wait(800);
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(!/寄出週報/.test(txt), '目標刪掉了');
      await shot('e10_obj_deleted');

      // ---- 刪任務（先確認）----
      await click(`[data-del-quest="${qid2}"]`); await wait(450); await shot('e11_quest_confirm');
      await click('[data-del-no]'); await wait(200);
      assert(/週報與下週計畫/.test(fs.readFileSync(planFile(), 'utf8')), '按取消不會刪');
      await click(`[data-del-quest="${qid2}"]`); await wait(200);
      await click(`[data-del-quest-yes="${qid2}"]`); await wait(800); await shot('e12_quest_deleted');
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(!/週報與下週計畫/.test(txt) && !/本週完成事項整理/.test(txt), '任務連目標一起刪掉');

      // ---- 今日行程：新增時段 ----
      await click('[data-act=daily]'); await wait(1800); await shot('e13_daily_tools');
      await click('[data-new=row]'); await wait(400); await shot('e14_row_form');
      await type('#rfStart', '17:00'); await type('#rfEnd', '17:30');
      await type('#rfText', '整理今天的筆記'); await type('#rfOut', '筆記歸檔');
      await click('#rfSave'); await wait(800); await scrollEnd(); await shot('e15_row_added');
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(/^- 17:00–17:30 整理今天的筆記 → 筆記歸檔$/m.test(txt), '時段寫進檔案');

      // ---- 勾選時段 → 回寫 - [x] ----
      const rowId = await js(`state.view.today.rows.find((r)=>r.a==='整理今天的筆記').id`);
      await click(`input[data-row="${rowId}"]`); await wait(1500);
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(/^- \[x\] 17:00–17:30 整理今天的筆記 → 筆記歸檔$/m.test(txt), '勾選寫回 - [x]');
      await shot('e16_row_checked');

      // ---- 提醒 ----
      await click('[data-new=rem]'); await wait(400); await shot('e17_rem_form');
      await type('#mfTime', '16:30'); await type('#mfText', '報價還沒回覆'); await type('#mfAction', '打電話追一次');
      await click('#mfSave'); await wait(2500); await scrollEnd(); await shot('e18_rem_added');
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(/^- ⏰ 16:30 報價還沒回覆 → 打電話追一次$/m.test(txt), '提醒寫進檔案');

      // ---- 刪時段、刪提醒 ----
      await scrollEnd(); await showDel(); await shot('e19_daily_delete_btns');
      await click(`[data-del-row="${rowId}"]`); await wait(450); await shot('e20_row_confirm');
      await click(`[data-del-row-yes="${rowId}"]`); await wait(800);
      const remId = await js(`state.view.decisions.find((d)=>d.condition==='報價還沒回覆').id`);
      await click(`[data-del-rem="${remId}"]`); await wait(200);
      await click(`[data-del-rem-yes="${remId}"]`); await wait(800); await scrollEnd(); await shot('e21_daily_cleaned');
      txt = fs.readFileSync(planFile(), 'utf8');
      assert(!/整理今天的筆記/.test(txt) && !/報價還沒回覆/.test(txt), '時段與提醒都刪掉');
      assert(txt.trim() === before.trim(), '全部加完再刪完，檔案跟一開始一樣');

      console.log('DONE');
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
