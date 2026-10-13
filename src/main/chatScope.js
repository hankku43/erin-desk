// 💬 聊天要不要附任務清單：送給 AI 之前，在本機先判斷這句話「可能跟工作有關嗎」（幾毫秒，不用 AI）
//   任何一個訊號成立就附清單（寧可多附）；全部都沒有才當作閒聊，不附清單、不讓 AI 產生勾選動作，提示短一半、回得比較快
//   1. 關鍵字解析已經認出動作（做完了哪一項、要交付、換任務）
//   2. 進度動詞：做完、好了、搞定、寄出、交付、取消勾選、先做…
//   3. 工作字眼：進度、卡住、會議、報告、截止、客戶、明天要…
//   4. 跟計畫用字重疊：這句話裡有任務、目標、行程裡出現過的詞（常見的詞不算）
//   5. 前後文：艾琳 10 分鐘內剛講過工作（提醒、行程、指派、進度…），或上一句聊天在問工作
//   6. （聰明艾琳）語意像某個目標：在 engine 用向量算，這裡只提供 cosine
'use strict';

const I = require('./intent');

const WORK_CUES = /進度|卡住|卡關|會議|開會|報告|簡報|回報|下班|日報|週報|截止|期限|deadline|來不及|延期|交件|寄給|回信|客戶|老闆|主管|專案|計畫|任務|委託|目標|行程|待辦|加班|改版|上線|測試|review|bug|debug|commit|論文|實驗|還沒做|還沒開始|開始做|做到|做一半|剩下|後續|接下來要|(今天|明天|後天|待會|等等|等一下|下午|早上|晚上|週[一二三四五六日])(要|得|還要)/i;
// 艾琳講工作的事件（說完 10 分鐘內，冒險者回話多半在接這件事）
const WORK_EVENTS = /^(greet|morning|afternoon|wrapup|custom|registered|assign|objective|submit|overdue|reminder|daily|daily_report|all_clear|raid)/;
// 艾琳上一句聊天在問工作
const WORK_ASK = /進度|任務|委託|目標|做完|完成了|勾起來|勾選|交付|行程|下班回報|收工回報|收工/;
// 太常見、計畫裡出現也不代表在講工作的兩字詞
const STOP = new Set(('今天 明天 昨天 後天 現在 等等 一下 一起 一個 一些 這個 那個 這樣 那樣 什麼 怎麼 為什麼 時候 時間 '
  + '可以 不要 不會 沒有 還有 還是 已經 還沒 開始 結束 準備 整理 確認 完成 處理 需要 應該 可能 如果 因為 所以 但是 '
  + '我們 你們 他們 自己 大家 知道 覺得 喜歡 看看 一點 有點 真的 好像 然後 之後 之前 以後 以前 早上 下午 晚上 '
  + '週一 週二 週三 週四 週五 週六 週日 星期 禮拜 上午 中午 冒險 艾琳 公會').split(/\s+/));

// 中文兩字詞＋英文／數字字（3 個以上字元）
function terms(s) {
  const out = new Set();
  const t = String(s || '').toLowerCase();
  for (const run of t.match(/[㐀-鿿]+/g) || []) for (let i = 0; i + 1 < run.length; i++) { const b = run.slice(i, i + 2); if (!STOP.has(b)) out.add(b); }
  for (const w of t.match(/[a-z0-9][a-z0-9._+-]{2,}/g) || []) out.add(w);
  return out;
}
// 計畫裡的詞：還沒交付的任務名、目標、今天的行程
function planTerms(cat) {
  const all = new Set();
  const add = (s) => { for (const x of terms(s)) all.add(x); };
  for (const q of cat.quests) if (q.status !== 'done') add(q.title);
  for (const o of cat.objectives) if (!o.questDone) add(o.text);
  for (const d of cat.daily) add(d.label);
  return all;
}
const overlap = (text, plan) => [...terms(text)].filter((x) => plan.has(x));

// 回傳 { need, why }：why 會寫進 llm.log，方便之後看有沒有漏
function needCatalog({ text, workItems = [], plan = new Set(), lastWorkAt = 0, lastChat = null, now = Date.now() }) {
  const t = String(text || '');
  if (workItems.length) return { need: true, why: '關鍵字認出動作' };
  if (I.RE_DONE.test(t) || I.RE_UNDO.test(t) || I.RE_SUBMIT.test(t) || I.RE_SWITCH.test(t)) return { need: true, why: '進度動詞' };
  const cue = t.match(WORK_CUES);
  if (cue) return { need: true, why: `工作字眼「${cue[0]}」` };
  const hit = overlap(t, plan);
  if (hit.length) return { need: true, why: `跟計畫用字重疊「${hit.slice(0, 3).join('、')}」` };
  if (lastWorkAt && now - lastWorkAt < 10 * 60000) return { need: true, why: '艾琳剛講過工作' };
  if (lastChat && !lastChat.topic && lastChat.at && now - lastChat.at < 10 * 60000) {
    let line = lastChat.content; try { line = JSON.parse(line).line; } catch (_) { /* 純文字 */ }
    if (WORK_ASK.test(String(line || ''))) return { need: true, why: '上一句在問工作' };
  }
  return { need: false, why: '閒聊' };
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

module.exports = { WORK_CUES, WORK_EVENTS, WORK_ASK, STOP, terms, planTerms, overlap, needCatalog, cosine };
