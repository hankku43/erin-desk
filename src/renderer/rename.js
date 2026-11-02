// ✏️ 接待員改名：內建的台詞、角色設定、商品說明都是用「艾琳」寫的，顯示前換成現在的名字
//   UMD：main（engine、npc、lore）和畫面（待機台詞、面板台詞、說明小卡）共用
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rename = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const BASE = '艾琳';
  const KEEP = ['艾琳的任務櫃台']; // 程式名稱、資料夾「文件\艾琳的任務櫃台」不跟著改（10/8 使用者：只換視窗標題）
  const isRenamed = (name) => typeof name === 'string' && !!name && name !== BASE;

  // 把文字裡的「艾琳」換成 name；KEEP 和 protect（冒險者自己寫的字）不動。換過的再換一次結果一樣（名字裡有「艾琳」也不會變成「艾琳娜娜」）
  function rename(text, name, { protect = [] } = {}) {
    if (typeof text !== 'string' || !isRenamed(name) || !text.includes(BASE)) return text;
    const keep = [];
    const hold = (m) => { keep.push(m); return `\u0002${keep.length - 1}\u0002`; };
    const guard = [...KEEP, ...protect.filter((x) => typeof x === 'string' && x.includes(BASE))];
    if (name.includes(BASE)) guard.push(name);
    let s = text;
    for (const t of [...new Set(guard)].sort((a, b) => b.length - a.length)) s = s.split(t).join(hold(t));
    s = s.split(BASE).join(name);
    return s.replace(/\u0002(\d+)\u0002/g, (_, n) => keep[+n]);
  }

  // 物件、陣列裡的每個字串都換（商品目錄、成就、星座卡說明）
  function renameDeep(v, name, opts) {
    if (!isRenamed(name)) return v;
    if (typeof v === 'string') return rename(v, name, opts);
    if (Array.isArray(v)) return v.map((x) => renameDeep(x, name, opts));
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = renameDeep(x, name, opts);
      return o;
    }
    return v;
  }

  // 冒險者打的字：新名字先當成「艾琳」再判斷（罵人、小本子、規則都是用「艾琳」寫的）
  // 一個字的名字不換（「雪」→ 下雪也會被當成在叫她）；名字裡有「艾琳」的本來就認得
  function toBase(text, name) {
    if (typeof text !== 'string' || !isRenamed(name) || Array.from(name).length < 2 || name.includes(BASE)) return text;
    return text.split(name).join(BASE);
  }

  // 💬 稱呼（第 5 階解鎖）：她叫對方的「冒險者」換成設定的稱呼
  //   當職業、身分用的不換：後面接「們、考試、公會、證…」（冒險者們、冒險者考試）、前面是「位、新手、成為、的…」（一位冒險者、新手冒險者、艾琳的冒險者）
  const CALL_BASE = '冒險者';
  const CALL_AFTER = /^(?:們|考|榜|階|等級|證|執照|資格|公會|協會|登記|生涯|小隊|隊伍|團|手冊|守則|界|學校|學院|大賽|試煉|裝備|制服|身分|職業|工作|之)/;
  const CALL_BEFORE = /(?:位|名|個|些|的|新手|見習|資深|老練|正式|真正|頂尖|成為|當上|當|做|變成|其他|別的|每個|那些|這些|有些|一些|年輕|厲害)$/;
  function call(text, to, { protect = [] } = {}) {
    if (typeof text !== 'string' || typeof to !== 'string' || !to || to === CALL_BASE || !text.includes(CALL_BASE)) return text;
    const keep = [];
    const hold = (m) => { keep.push(m); return `\u0003${keep.length - 1}\u0003`; };
    const guard = protect.filter((x) => typeof x === 'string' && x.includes(CALL_BASE));
    if (to.includes(CALL_BASE)) guard.push(to); // 稱呼裡本來就有「冒險者」（冒險者大人）：換過的再換一次結果一樣
    let s = text;
    for (const t of [...new Set(guard)].sort((a, b) => b.length - a.length)) s = s.split(t).join(hold(t));
    s = s.replace(/冒險者/g, (m, i, str) => (CALL_AFTER.test(str.slice(i + m.length)) || CALL_BEFORE.test(str.slice(Math.max(0, i - 4), i)) ? m : to));
    return s.replace(/\u0003(\d+)\u0003/g, (_, n) => keep[+n]);
  }

  return { BASE, KEEP, isRenamed, rename, renameDeep, toBase, CALL_BASE, call };
}));
