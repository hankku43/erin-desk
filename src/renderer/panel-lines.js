// 打開面板時艾琳說的一句話（內建台詞，不用等 AI）：跟這個面板有關，不留著上一句不相干的話
// UMD：renderer 用全域 PanelLines，測試用 require 檢查口吻（自稱「艾琳」、叫「冒險者」，不用「我／您／玩家」）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PanelLines = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  // 面板裡自己有人說話（雙胞胎、健康檢查的小對話），或開了之後艾琳本來就會講話（日誌、小本子、今日行程）：泡泡先收起來
  const QUIET = new Set(['shop', 'health', 'onboard', 'log', 'journal', 'notebook', 'daily', 'divine', 'questForm', 'rowForm', 'remForm']);
  const short = (s, n = 14) => { const t = String(s || '').replace(/`/g, ''); return t.length > n ? t.slice(0, n) + '…' : t; };

  function board(v) {
    const qs = v.quests || [];
    if (!qs.length) return v.editable ? { text: '任務板還是空的～按「＋ 新任務」登記第一筆委託吧！', emotion: 'normal' } : { text: '這份計畫檔裡還沒有任務喔。', emotion: 'thinking' };
    if (qs.every((q) => q.status === 'done')) return { text: '這週的委託全部完成了！冒險者好厲害～', emotion: 'cheer' };
    const a = v.active;
    if (!a) return { text: '要先做哪一個呢？按「📌 設為當前任務」，艾琳就幫你盯著那一個。', emotion: 'thinking' };
    const t = short(a.title);
    const left = (a.objectives || []).length - (a.doneCount || 0);
    if (a.status === 'ready') return { text: `「${t}」的目標都完成了，按「🏆 交付任務」就能領報酬喔！`, emotion: 'cheer' };
    if (a.daysLeft !== null && a.daysLeft !== undefined && a.daysLeft < 0) return { text: `「${t}」已經過了截止日……先把它處理掉好嗎？艾琳陪你。`, emotion: 'worried' };
    if (a.daysLeft === 0) return { text: `「${t}」今天截止！還差 ${left} 個目標，一起衝刺吧～`, emotion: 'worried' };
    if (left > 0) return { text: `先把「${t}」收尾吧，還差 ${left} 個目標，艾琳幫你盯著！`, emotion: 'happy' };
    return { text: `「${t}」還沒有目標，按「＋ 目標」寫下第一步吧。`, emotion: 'thinking' };
  }

  function line(kind, v, extra = {}) {
    if (!v || QUIET.has(kind)) return null;
    if (kind === 'board') return board(v);
    if (kind === 'report') return { text: '今天辛苦啦！寫幾句就好，艾琳會幫你整理進週報。', emotion: 'happy' };
    if (kind === 'submit') {
      const q = (v.quests || []).find((x) => x.id === extra.questId);
      return { text: q ? `報酬都準備好了～確認一下就可以交付「${short(q.title)}」囉！` : '報酬都準備好了～', emotion: 'cheer' };
    }
    if (kind === 'ach') {
      const n = Number(v.streak) || 0;
      return n >= 2 ? { text: `連續上工 ${n} 天了！牆上的徽章，艾琳每天都有幫你擦亮喔。`, emotion: 'happy' }
        : { text: '做完一件事就會點亮成就，第一個很快就來了！', emotion: 'normal' };
    }
    return null;
  }
  return { line, QUIET, short };
}));
