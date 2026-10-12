// 💗 好感升階動畫：哪幾階有動畫、標題、台詞、舊存檔怎麼補演（純資料／純函式，main、畫面、測試共用）
// 第 2～4 階＝主視窗裡的漫畫（一格一格放大看，最後拉遠成整頁）；第 5 階＝舞台模式（之後做）
// 分鏡定稿：dist/stageup/erin-stageup2-storyboard-v4.png（10/12）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StageupScript = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  // 已經做好動畫的階段（之後做好第 3、4、5 階再加進來；舊存檔會自動補演最新的一階）
  const SHOWS = {
    2: { stage: 2, no: '其之二', name: '常客', shots: 7, thumb: 'mini_peek.webp' },
  };
  const STAGES = Object.keys(SHOWS).map(Number).sort((a, b) => a - b);
  const title = (n) => (SHOWS[n] ? `${SHOWS[n].no}　${SHOWS[n].name}` : '');

  // 台詞：用「艾琳／冒險者」寫，畫面顯示前換成現在的名字（瑪格大姐的話不用換）
  // 口吻：艾琳自稱用名字、叫對方「冒險者」，不說「我、您、玩家」
  const LINES = {
    2: {
      marga1: '……那個常來\n三號櫃台的，\n就是你常說的那位？',
      huh: '欸？！',
      deny: '才、才沒有常說。\n只是……登記簿上的\n一位冒險者而已。',
      tail: '……尾巴。',
      meow: '喵嗚……',
      marga2: '好啦好啦，\n不說了。',
      star: '欸，冒險者最近常來呢。\n艾琳在小本子上\n幫你畫了一顆星星……\n這是常客才有的喔。',
      hehe: '嘿嘿。',
      nar: '（尾巴又在搖了。）',
      end: '……嘿嘿。', // 漫畫收起來之後，她小聲說的那句
    },
  };
  // 整頁上的小對話框（字比較少）
  const PAGE_LINES = {
    2: { marga1: '……就是你常說的那位？', deny: '才、才沒有常說。只是……登記簿上的一位冒險者而已。', marga2: '好啦好啦，不說了。', star: '……這是常客才有的喔。' },
  };
  const WHO = { marga: '瑪格大姐' };

  // 存檔裡的 affection.shows：{ pending: [還沒演的階段], seen: { 階段: { at, skipped, unlocked } }, known: [這個版本認得的動畫] }
  //   新版本多了一階動畫（或舊存檔第一次打開）：已經升過的只把「最新的那一階」排進 pending，更早的直接收進相簿
  function migrate(shows, maxStage = 1) {
    const sh = shows && typeof shows === 'object' ? shows : {};
    const out = {
      pending: Array.isArray(sh.pending) ? [...new Set(sh.pending.map(Number).filter((n) => SHOWS[n]))] : [],
      seen: sh.seen && typeof sh.seen === 'object' ? { ...sh.seen } : {},
      known: Array.isArray(sh.known) ? sh.known.map(Number) : [],
    };
    if (sh.promise != null) out.promise = sh.promise; // 第 4 階的回答（之後用）
    const fresh = STAGES.filter((n) => !out.known.includes(n));
    out.known.push(...fresh);
    const reached = fresh.filter((n) => n <= maxStage && !out.seen[n] && !out.pending.includes(n));
    if (reached.length) {
      const latest = Math.max(...reached);
      for (const n of reached) {
        if (n === latest) out.pending.push(n);
        else out.seen[n] = { at: null, unlocked: true };
      }
    }
    out.pending = out.pending.filter((n) => !out.seen[n]).sort((a, b) => a - b);
    return out;
  }
  // 接下來要演哪一階：照順序（舊存檔在 migrate 已經只留最新的一階）
  const next = (shows) => (shows && shows.pending && shows.pending.length ? Math.min(...shows.pending) : 0);
  // 回憶相簿：看過（或補收進來）的階段
  const album = (shows) => STAGES.filter((n) => shows && shows.seen && shows.seen[n]).map((n) => ({
    n, title: title(n), thumb: SHOWS[n].thumb, at: shows.seen[n].at || null, unlocked: !!shows.seen[n].unlocked,
  }));

  return { SHOWS, STAGES, LINES, PAGE_LINES, WHO, title, migrate, next, album };
}));
