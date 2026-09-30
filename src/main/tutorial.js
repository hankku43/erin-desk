// 🎓 新手任務：跟著做一遍就會用所有櫃台功能（跟計畫檔無關，不會寫進你的週計畫）
'use strict';

const TUTORIAL = [
  { key: 'objective', icon: '☑', label: '勾選一個目標', hint: '打開任務板，把做完的目標勾起來' },
  { key: 'chat', icon: '💬', label: '跟艾琳聊一句', hint: '按「💬 聊聊」，說什麼都可以' },
  { key: 'progress', icon: '🗣', label: '用聊天回報進度', hint: '在聊聊裡說「OO 做完了」，再按確認' },
  { key: 'submit', icon: '🏆', label: '交付一個任務', hint: '目標都完成後，按「🏆 交付任務」' },
  { key: 'fortune', icon: '🔮', label: '抽今日運勢', hint: '點左下等級列的 🔮' },
  { key: 'focus', icon: '🍅', label: '開始一次專注', hint: '點左下等級列的 🍅' },
  { key: 'mini', icon: '🐾', label: '讓艾琳變成貓咪再叫醒她', hint: '按 ▁ 縮小，再點一下小貓' },
];
const STEP_REWARD = { xp: 10, gold: 5 };
const GRADUATE_REWARD = { xp: 0, gold: 50 };

module.exports = { TUTORIAL, STEP_REWARD, GRADUATE_REWARD };
