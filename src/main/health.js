// 🩺 健康檢查：把各種「為什麼不動了」整理成紅綠燈，每一項附上「幫我修」的動作
// 純函式：資料由 main.js 收集好傳進來，方便測試
'use strict';

const { hasModel, EMBED, MODELS } = require('./setup');

// llm.log 的一行：「9/30 13:24:55	chat	21650ms	載入模型 …」或「…	失敗：timeout」
function parseLog(text) {
  return String(text || '').split('\n').filter(Boolean).map((l) => {
    const [stamp, event, ms, rest = ''] = l.split('\t');
    return { stamp, event, ms: parseInt(ms, 10) || 0, fail: /^失敗/.test(rest) };
  }).filter((x) => x.event);
}

function buildHealth(x) {
  const name = x.name || '艾琳';
  const items = [];
  const add = (id, icon, title, status, detail, fixes = []) => items.push({ id, icon, title, status, detail, fixes });

  // 1. 設定檔
  if (x.configError) add('config', '⚙', '設定檔', 'error', `設定檔壞掉了（${x.configError.replace(/^config\.json 格式錯誤：/, '')}），現在先用預設值。`, [{ action: 'resetConfig', label: '還原成預設（舊的會另存一份）' }, { action: 'openConfig', label: '打開設定檔' }]);
  else add('config', '⚙', '設定檔', 'ok', '正常');

  // 2. 計畫檔
  const p = x.plan || {};
  const planFix = [{ action: 'ui:newPlan', label: '建立新的週計畫' }, { action: 'choosePlan', label: '選擇已經有的檔案' }];
  if (!p.exists) add('plan', '📜', '週計畫', 'error', `找不到計畫檔：${p.file || '（沒有設定）'}`, planFix);
  else if (!p.quests) add('plan', '📜', '週計畫', 'warn', '計畫檔裡還沒有任務。', [{ action: 'ui:newQuest', label: '＋ 登記一個任務' }, ...planFix]);
  else if (p.legacy) add('plan', '📜', '週計畫', 'warn', `舊格式的計畫檔（${p.quests} 個任務），還能用，但不能在程式裡編輯。`, planFix);
  else add('plan', '📜', '週計畫', 'ok', `${p.quests} 個任務`);

  // 3. AI 對話
  const llm = x.llm || {};
  const pr = x.probe;
  if (!llm.enabled) add('ai', '🤖', 'AI 對話', 'info', `關著，${name}用內建台詞說話（功能都能用）。`, [{ action: 'enableAI', label: '打開 AI 對話' }]);
  else if (!pr || pr.ollama === 'missing') add('ai', '🤖', 'AI 對話', 'error', `找不到 Ollama（${name}的「大腦」）。沒有它也能玩，只是${name}只會說內建台詞。`, [{ action: 'openOllama', label: '下載 Ollama' }, { action: 'disableAI', label: '先不用 AI' }]);
  else if (pr.ollama === 'stopped') add('ai', '🤖', 'AI 對話', 'warn', 'Ollama 裝好了，但現在沒有開。', [{ action: 'openOllama', label: '幫我打開 Ollama' }]);
  else if (!hasModel(pr.models, llm.model)) {
    const size = (MODELS[llm.model] || {}).size;
    add('ai', '🤖', 'AI 對話', 'error', `Ollama 開著，但還沒下載模型 ${llm.model}${size ? `（約 ${size}）` : ''}。`, [{ action: `pull:${llm.model}`, label: '下載模型' }, { action: 'disableAI', label: '先不用 AI' }]);
  } else add('ai', '🤖', 'AI 對話', 'ok', `使用 ${llm.model}`);

  // 4. 記憶體和模型大小
  if (x.ramGB) {
    const need = (MODELS[llm.model] || {}).minRamGB;
    if (llm.enabled && need && x.ramGB < need) add('ram', '🧮', '記憶體', 'warn', `電腦有 ${Math.round(x.ramGB)}GB 記憶體，${llm.model} 可能會很慢。`, [{ action: 'useModel:qwen3:1.7b', label: '改用輕量版 qwen3:1.7b' }]);
    else add('ram', '🧮', '記憶體', 'ok', `${Math.round(x.ramGB)}GB`);
  }

  // 5. 最近回應速度（看 llm.log 最後 10 次聊天）
  const log = (x.log || []).slice(-30);
  const chats = log.filter((l) => l.event === 'chat').slice(-10);
  const fails = log.slice(-10).filter((l) => l.fail).length;
  if (llm.enabled && chats.length >= 3) {
    const avg = Math.round(chats.reduce((n, l) => n + l.ms, 0) / chats.length / 1000);
    const light = llm.model !== 'qwen3:1.7b' ? [{ action: 'useModel:qwen3:1.7b', label: '改用輕量版（快一些）' }] : [];
    if (avg > 45) add('speed', '⏱', '回應速度', 'warn', `最近聊天平均要 ${avg} 秒才回。關掉其他吃記憶體的程式會好一點。`, light);
    else add('speed', '⏱', '回應速度', 'ok', `最近聊天平均 ${avg} 秒`);
  }
  if (llm.enabled && fails >= 3) add('fails', '⚠', 'AI 回覆', 'warn', `最近 10 次有 ${fails} 次沒回好，${name}改用了內建台詞。`, [{ action: 'reconnect', label: '重新連線' }]);

  // 6. 聰明艾琳（語意搜尋）
  const sm = x.smart || {};
  if (!sm.on) add('smart', '🧠', `聰明${name}`, 'info', '關著（聊天只用關鍵字找角色設定）。', [{ action: 'smartOn', label: '打開' }]);
  else if (sm.status === 'ready') add('smart', '🧠', `聰明${name}`, 'ok', '就緒');
  else if (pr && pr.ollama === 'running' && !pr.embed.installed) add('smart', '🧠', `聰明${name}`, sm.explicit ? 'warn' : 'info', `還沒下載語意模型（約 ${EMBED.size}），${sm.explicit ? '所以還用不了' : '選用：下載後換個說法問她也聽得懂'}。`, [{ action: `pull:${EMBED.name}`, label: '下載' }, ...(sm.explicit ? [{ action: 'smartOff', label: '關掉' }] : [])]);
  else add('smart', '🧠', `聰明${name}`, 'info', '等 Ollama 開了會自動準備。');

  // 7. 角色圖片、8. 存檔
  if (!x.charOK) add('char', '🖼', '角色圖片', 'warn', '找不到角色圖片，暫時用預設的樣子。', [{ action: 'openChar', label: '打開圖片資料夾' }]);
  if (!x.saveOK) add('save', '💾', '存檔', 'error', '存檔寫不進去，進度可能不會被記住（資料夾可能是唯讀的）。', [{ action: 'openFolder', label: '打開資料夾看看' }]);
  else add('save', '💾', '存檔', 'ok', '正常');

  // 9. 資料放在哪
  add('folder', '📁', '你的資料', 'info', x.userDir || '', [{ action: 'openFolder', label: '打開資料夾' }]);
  return items;
}

module.exports = { buildHealth, parseLog };
