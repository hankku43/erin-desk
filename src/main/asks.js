// 💬 問句的比例（10/28 使用者：她主動找人說話時太多問句了 → 主動開口「問一半、分享一半」，聊天回覆也少反問）
//   純函式，engine 用、測試可以直接 require
'use strict';

// 這句話有沒有在問對方：有「？」就算；「欸？！」「咦？！」這種驚嘆不算
function hasQuestion(text) {
  const s = String(text || '').replace(/[？?]+[！!]+/g, '！');
  return /[？?]/.test(s);
}

// 切成一句一句（結尾的標點跟著那一句）
function sentences(text) {
  return String(text || '').match(/[^。！？!?…～~\n]+[。！？!?…～~\n」』）)]*|[。！？!?…～~\n」』）)]+/g) || [];
}
const plain = (s) => String(s || '').replace(/[\s。！？!?…～~「」『』（）()、，,：:；;—\-]/g, '');

// 把最後面的問句拿掉：剩下的至少 minLeft 個字才拿（整段都是問句就照舊，不然會什麼都不剩）
function dropTrailingQuestion(text, minLeft = 8) {
  const src = String(text || '');
  const parts = sentences(src);
  let n = parts.length;
  while (n > 0 && hasQuestion(parts[n - 1])) n -= 1;
  if (n === parts.length) return src;
  const rest = parts.slice(0, n).join('').trim();
  if (plain(rest).length >= minLeft) return rest.replace(/[，,、：:；;—]+$/, '。');
  // 整句拿掉就不剩什麼了：只拿掉最後一句裡、最後一個逗號後面那段問句（前面那段不能是「…的時候」「如果…」這種半句）
  if (n !== parts.length - 1) return src;
  const last = parts[parts.length - 1];
  const cl = last.split(/[，,]/);
  if (cl.length < 2 || hasQuestion(cl.slice(0, -1).join('，'))) return src;
  const keep = cl.slice(0, -1).join('，').trim();
  if (/(時|時候|的話|如果|要是|因為|當|若|而且|還是|或是|跟|和)$/.test(keep) || plain(rest + keep).length < minLeft) return src;
  return `${rest}${keep}。`;
}

const clamp01 = (x, d) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Math.max(0, Math.min(1, Number(x))) : d);

// 主動開口這次要不要問問題：ratio＝想要的比例（預設一半）；hist＝最近主動說的話有沒有問（舊→新）
//   不連著問三次、也不連著三次都只講自己的；其他時候比例不夠就多問一點、太多就少問一點
function wantAsk(hist, ratio = 0.5, rnd = Math.random) {
  const r = clamp01(ratio, 0.5);
  if (r <= 0) return false;
  if (r >= 1) return true;
  const h = (hist || []).slice(-6);
  const last2 = h.slice(-2);
  if (r <= 0.6 && last2.length === 2 && last2.every(Boolean)) return false;
  if (r >= 0.4 && last2.length === 2 && last2.every((x) => !x)) return true;
  const got = h.length ? h.filter(Boolean).length / h.length : r;
  const p = Math.max(0.1, Math.min(0.9, r + (r - got)));
  return rnd() < p;
}

// 聊天回覆可不可以反問：她上一句已經在問了就不行；其他時候照比例（預設 0.3）
function chatMayAsk(lastText, ratio = 0.3, rnd = Math.random) {
  if (hasQuestion(lastText)) return false;
  return rnd() < clamp01(ratio, 0.3);
}

module.exports = { hasQuestion, sentences, dropTrailingQuestion, wantAsk, chatMayAsk };
