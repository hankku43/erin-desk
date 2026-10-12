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
    3: { stage: 3, no: '其之三', name: '熟面孔', shots: 7, thumb: 'thumb_3.webp' },
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
    3: { // 分鏡：dist/stageup/erin-stageup3-storyboard-v1.png（10/12）
      hum: '嗯～嗯嗯～♪',
      sneak: '（偷偷加一顆……）',
      oops: '……啊。',
      hold: '忍、忍住……！\n不能在冒險者面前\n變回貓……！',
      nope: '這、這頁\n不能看！',
      ask: '冒、冒險者……\n什麼都沒看到，\n對吧？',
      pickA: '「……沒看到。」', // 冒險者的回答（二選一，不存檔）
      pickB: '「看到了喔。」',
      replyA: '……呼。\n那、那就好。',
      replyB: '忘、忘掉！\n現在馬上忘掉！',
      lantern: '……啊，冒險者是\n回來拿這個的吧？\n路上暗，小心喔。',
      call: '……冒險者。',
      secret: '艾琳發現，現在看到\n冒險者走進公會，\n尾巴會自己先搖起來。\n……這是秘密喔。',
      nar: '（秘密，尾巴已經說出來了。）',
      end: '……尾、尾巴，不准搖。', // 低頭瞪著自己甩個不停的尾巴
    },
  };
  // 艾琳說的台詞（口吻測試用；其他是狀聲字、旁白、冒險者的回答）
  const ERIN = { 2: ['huh', 'deny', 'star', 'hehe', 'end'], 3: ['hum', 'oops', 'hold', 'nope', 'ask', 'replyA', 'replyB', 'lantern', 'call', 'secret', 'end'] };
  // 整頁上的小對話框（字比較少）
  const PAGE_LINES = {
    2: { marga1: '……就是你常說的那位？', deny: '才、才沒有常說。只是……登記簿上的一位冒險者而已。', marga2: '好啦好啦，不說了。', star: '……這是常客才有的喔。' },
    3: { hold: '忍、忍住……！不能變回貓……！', nope: '這、這頁不能看！', lantern: '……路上暗，小心喔。', secret: '……這是秘密喔。' },
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

  return { SHOWS, STAGES, LINES, PAGE_LINES, WHO, ERIN, title, migrate, next, album };
}));
