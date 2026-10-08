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

  return { BASE, KEEP, isRenamed, rename, renameDeep, toBase };
}));
