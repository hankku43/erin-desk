// 👋 冒險者跟她道別（10/29 使用者：說「掰掰明天見」她卻不知道怎麼回）
//   以前道別也照一般聊天問 AI：「下班」算工作字眼 → 附上整張任務清單、又還在「回她的話題」→ 模型接著聊話題，
//   再說一次「掰掰明天見」→ 整句重複 → 內建的「沒聽懂，再說一次」。現在先用規則認出道別，不問 AI、馬上回。
//   純函式，engine 用、測試可以直接 require
'use strict';
const { hasQuestion } = require('./asks');

const CLAUSE = /[，,。！!～~、…\s]+/;
// 晚安、要去睡了
const NIGHT = /(晚安|晚安安|good\s*night|gn|(要|先|去|我)睡(覺)?(了|囉|啦)|睡覺去|去睡(覺)?(了|囉|啦)?)$/i;
// 暫時離開：等等見、先去吃飯／開會
const LATER = /(等等見|等下見|待會見|待會兒見|晚點見|等一下見|一會兒見|先去(吃飯|吃午餐|吃午飯|午休|開會|忙|洗澡|上課|上廁所)(了|囉|啦)?|(去|要去)(吃飯|吃午餐|吃午飯|開會)(了|囉|啦)|吃飯去(了|囉)?|開會去(了|囉)?|暫離|離開一下)$/;
// 今天結束：下班、收工、回家、明天見
const DAY = /((要|準備|先|終於|我)?下班(了|啦|囉|嘍|嚕|去)?|收工(了|啦|囉|嘍)?|(要|先|我)?回家(了|啦|囉|嘍)|明天見|明日見|下週見|下禮拜見|下星期見|週一見|禮拜一見|星期一見|下次見)$/;
// 單純的掰掰
const BYE = /^((掰+|掰掰|拜拜|拜|bye+|bye\s*bye|byebye|88|881|再見|再會)|(我|那我)?(要|先)?(走(了|囉|啦)|閃(了|囉|啦|人)?|下線(了|囉|啦)?|撤(了|囉|退)))(了|啦|囉|嘍|喔|哦|喵|呦|唷)*$/i;
// 道別時常一起說的客套話：不影響「這句就是在道別」
const FILLER = /^(好+|好喔|好啦|好的|嗯+|恩+|那|那我|那就|我|我要|先|今天|今天先這樣|先這樣|就這樣|謝謝(妳|你|艾琳)?|感謝|辛苦(了|啦|囉)?|(妳|你)也辛苦了|大家辛苦了|你也是|妳也是|哈+|嘿+|呵+|艾琳|冒險者|ok|okay|喵+|耶|呀|啦|囉|喔|哦|～|~|掰)$/i;

// 這句是不是在道別：{ kind: 'night'|'later'|'day'|'bye', pure }，不是就 null
//   pure＝整句只有道別（和客套話），可以直接回；不 pure＝夾著別的事（「報告交了，下班囉」），交給 AI 但請它最後道別
function detect(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40 || hasQuestion(t) || /[嗎呢][～~。！!…\s]*$/.test(t)) return null;
  const parts = t.split(CLAUSE).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  let kind = null, other = 0;
  const rank = { night: 4, later: 3, day: 2, bye: 1 };
  for (const p of parts) {
    const k = NIGHT.test(p) ? 'night' : LATER.test(p) ? 'later' : DAY.test(p) ? 'day' : BYE.test(p) ? 'bye' : null;
    if (k) { if (!kind || rank[k] > rank[kind]) kind = k; } else if (!FILLER.test(p)) other += 1;
  }
  if (!kind) return null;
  return { kind, pure: other === 0 };
}

const hm = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
// 要說哪一種道別：晚上 → 晚安；午餐時間的暫離 → 午休；暫離 → 待會見；
//   今天結束（或快下班時的掰掰）→ 明天見，明天放假（週五、連假前）→ 週末見；白天的掰掰 → 當成暫離
function templateKey(det, now = new Date(), { wrap = '', offNext = false, cold = false } = {}) {
  if (!det) return null;
  if (cold) return 'farewell_cold';
  const m = now.getHours() * 60 + now.getMinutes();
  const late = m >= 21 * 60 || m < 5 * 60;
  if (det.kind === 'night') return 'farewell_night';
  const lunch = m >= 11 * 60 + 30 && m < 13 * 60 + 30;
  if (det.kind === 'later') return lunch ? 'farewell_lunch' : 'farewell_later';
  const w = hm(wrap);
  const endOfDay = det.kind === 'day' || m >= (w === null ? 17 * 60 : w - 30) || late;
  if (!endOfDay) return lunch ? 'farewell_lunch' : 'farewell_later';
  if (late && det.kind === 'bye') return 'farewell_night';
  return offNext ? 'farewell_weekend' : 'farewell_day';
}

// 說完再見之後多久不主動找冒險者聊天：今天結束＝到隔天早上 5 點；暫時離開＝30 分鐘
function quietUntil(key, now = new Date()) {
  if (key === 'farewell_later' || key === 'farewell_lunch') return now.getTime() + 30 * 60000;
  const d = new Date(now); d.setHours(5, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

module.exports = { detect, templateKey, quietUntil };
