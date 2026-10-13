// 📓 艾琳的筆記本（委託）：主視窗只負責打開大視窗（說話、改、勾都在那邊）
// （renderer.js 之後載入；用到 api、toast、$）

// 聊天裡說「幫我排這週」「來寫下週的計畫」「打開委託」：直接打開筆記本
const PD_RE = /^(?:幫我|我們|一起|來|想|要)?\s*(?:來)?\s*(?:寫|排|規劃|安排|整理|列|打開|看看?)\s*(?:一下)?\s*(?:個|一份)?\s*(?:這週|本週|下週|下周|這禮拜|下禮拜|這星期|下星期)?\s*(?:的)?\s*(?:週計畫|周計畫|計畫|行程|工作|委託|筆記本)\s*(?:吧|好了|好嗎)?[!！。?？]*$|^(?:幫我|一起|來)\s*(?:排|寫|規劃)\s*(?:這週|本週|下週|下周|這禮拜|下禮拜)/;
const pdWhich = (t) => (/下週|下周|下禮拜|下星期/.test(t) ? 'next' : /這週|本週|這禮拜|這星期/.test(t) ? 'this' : undefined);

async function openPdNote(which, opts) {
  const r = await api.pdOpen(which, opts);
  if (!r || !r.ok) toast(`⚠ ${(r && r.error) || '筆記本打不開'}`, 3000);
}
// 聊天框：說要排計畫就打開筆記本。有處理回 true
async function pdChat(text) {
  if (!PD_RE.test(text)) return false;
  $('#chatInput').value = '';
  await openPdNote(pdWhich(text));
  return true;
}
