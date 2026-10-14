// 隱藏好感度：數字不會出現在畫面上，只能從艾琳的態度感覺出來。這裡只放純函式與表格，狀態由 engine 保管
'use strict';

// 五個階段：門檻、名稱、給 AI 看的關係描述（叫法一律照口吻規則：冒險者／艾琳）
const STAGES = [
  { n: 1, name: '登記簿上的名字', desc: '剛登記不久的冒險者。有禮貌、專業，偶爾露出一點好奇；問到感情會搬出接待員手冊擋掉。' },
  { n: 2, name: '常客', desc: '常來的冒險者。比較放鬆，會開小玩笑、分享公會和霜月村的小事。' },
  { n: 3, name: '熟面孔', desc: '很熟的冒險者。會吐槽、會主動關心他的狀況，偶爾撒嬌。' },
  { n: 4, name: '可靠的夥伴', desc: '信任的夥伴。會說出自己的小煩惱，被稱讚時很容易害羞。' },
  { n: 5, name: '特別的冒險者', desc: '對艾琳來說很特別的人。被稱讚或聊到感情時會害羞到結巴，偶爾小聲承認在意他，但守著接待員的分寸。' },
];

const DEFAULTS = {
  enabled: true,
  shows: true,                       // 💗 升階時演漫畫（頭上冒「!」，點她才演）；false＝照舊直接說一句
  thresholds: [0, 30, 80, 160, 280], // 升到第 n 階需要的好感
  dailyCap: 10,                      // 一天最多加幾點（扣分沒有上限）
  shyChance: [0.2, 0.35, 0.5, 0.6, 0.7],   // 聊到稱讚／感情／秘密時真的害羞的機率（依階段）
  pokeDisdain: [0.7, 0.6, 0.5, 0.4, 0.3],  // 連戳時露出鄙視眼神的機率（越熟越包容）
  coldMinutes: 15,                   // 冷戰多久
  chatty: [0.8, 0.7, 0.6, 0.5, 0.4], // 主動找冒險者聊天的間隔倍率（乘上 window.idleChatterMinutes；越熟越常來）
  topicReplies: 3,                   // 一天最多幾次「回應艾琳的話題」會加好感
  gain: { objective: 1, submit: 3, onTime: 2, report: 2, focus: 1, greet: 1, kind: 1, apology: 2, topic: 1 },
  loss: { poke_annoyed: 1, poke_meow: 2, spam: 1, rude: 3, harass: 5, disdain: 2 },
  words: { harass: [], rude: [] },   // 自己加的關鍵字
};

function config(c = {}) {
  return {
    ...DEFAULTS, ...c,
    gain: { ...DEFAULTS.gain, ...(c.gain || {}) },
    loss: { ...DEFAULTS.loss, ...(c.loss || {}) },
    words: { ...DEFAULTS.words, ...(c.words || {}) },
  };
}

// 好感 → 階段。差一點點就不降（buffer），免得在門檻附近一下升一下降
function stageOf(points, prev = 0, thresholds = DEFAULTS.thresholds, buffer = 5) {
  let s = 1;
  thresholds.forEach((t, i) => { if (points >= t) s = i + 1; });
  if (prev && s < prev && points >= thresholds[prev - 1] - buffer) return prev;
  return Math.min(s, STAGES.length);
}
const stageInfo = (n) => STAGES[Math.max(1, Math.min(STAGES.length, n)) - 1];
const pick = (arr, stage) => arr[Math.max(1, Math.min(arr.length, stage)) - 1];

// ---- 冒險者說的話：騷擾／失禮／道歉／稱讚（離線也能用的關鍵字判斷） ----
const norm = (s) => String(s || '').replace(/\s+/g, '');
// 說自己很痛苦、想死：絕對不扣分，請 AI 溫柔關心
const CARE = /(我|自己).{0,3}(想|好想|要|快要|乾脆)(去)?死|不想活|活不下去|想消失|撐不下去/;
// 指向艾琳的字眼（罵人／騷擾要針對艾琳才算，抱怨工作、罵 bug 不算）
const TARGET = /你|妳|艾琳|貓娘|小貓咪|接待員|櫃台小姐/;
const HARASS_STRONG = /做愛|上床|約炮|打炮|色色|奶子|裸照|裸體|脫光|脫衣服給我看|陪我睡|一起洗澡/;
const HARASS_DIRECTED = /(你|妳|艾琳)的?(胸部?|奶|屁股|內褲|胸罩|大腿|私處)|摸(你|妳|艾琳)的?(胸|屁股|腿|大腿|身體)|舔(你|妳|艾琳)|脫(掉|光)?(你|妳|艾琳)的?(衣服|裙子)|給我看(你|妳)的?(胸|內褲|身體)/;
const RUDE_WORD = '白癡|白痴|智障|廢物|廢柴|蠢貨|蠢蛋|腦殘|低能|垃圾|醜八怪|賤人|婊子|混蛋|王八蛋|爛貓|臭貓|死貓|沒用的東西';
const RUDE_DIRECTED = new RegExp(`(你|妳|艾琳)(是|很|好|真|超|有夠|根本|就是|這個|這隻|這種)?(個|隻)?(${RUDE_WORD})|(${RUDE_WORD})(的)?(艾琳|貓娘|接待員)`);
const RUDE_ALONE = new RegExp(`^(${RUDE_WORD}|滾|笨)[!！。～~]*$`);
const RUDE_IMPERATIVE = /閉嘴|滾開|滾啦|滾吧|給我滾|去死|死開|少囉嗦|幹你|操你|你媽的?|妳媽的?|吵死了|煩死了你|你很煩|妳很煩|你好煩|妳好煩|討厭你|討厭妳/;
const APOLOGY = /對不起|抱歉|我錯了|原諒我|不好意思啦|不好意思剛剛|sorry/i;
const KIND = /謝謝|謝啦|謝囉|多謝|感謝|感恩|辛苦了|辛苦啦|你真好|妳真好|你人真好|妳人真好|好棒|好厲害|真厲害|超厲害|好聰明|可愛|好萌|喜歡你|喜歡妳|愛你|愛妳|最棒|最好了|幫大忙|靠你了|靠妳了|有你真好|有妳真好|好貼心|好溫柔/;

function classify(text, words = {}) {
  const t = norm(text);
  if (!t) return null;
  if (CARE.test(t)) return 'care';
  if (HARASS_STRONG.test(t) || HARASS_DIRECTED.test(t) || (words.harass || []).some((w) => w && t.includes(w))) return 'harass';
  if (RUDE_DIRECTED.test(t) || RUDE_ALONE.test(t) || RUDE_IMPERATIVE.test(t) || (words.rude || []).some((w) => w && t.includes(w))) return 'rude';
  if (APOLOGY.test(t)) return 'apology';
  if (KIND.test(t)) return 'kind';
  return null;
}

// AI 判斷的態度要再過一次（小模型會誤判，提示被截斷時更會亂判）：
//   道歉、稱讚、關心艾琳的話一律不算失禮；句子裡要找得到罵人或騷擾的字；
//   沒有指向艾琳的字眼時，只有 6 個字以內的一句（「滾」「醜八怪」「這專案爛透了」）才算；
//   AI 說騷擾但句子裡沒有任何跟騷擾有關的字 → 最多算失禮
const WORRY = /擔心|還好嗎|沒事吧|要不要緊|不要生氣|別生氣|消消氣|休息一下|保重/;
const NEG_HINT = new RegExp(`${RUDE_WORD}|滾|閉嘴|煩|討厭|笨|蠢|醜|吵|噁心|走開|囉嗦|爛|差勁|沒用|很遜|好遜|白目`);
const HARASS_HINT = /胸|奶|屁股|內褲|胸罩|大腿|身體|摸|舔|脫|陪我睡|一起睡|上床|床上|房間|開房|過夜|裸|色色|性感|親親|親一下|親你|親妳|老婆|嫁給我/;
function guardAttitude(att, text, { hasWork = false } = {}) {
  const t = norm(text);
  if (CARE.test(t)) return 'ok';
  if (att === 'rude' || att === 'harass') {
    if (hasWork || APOLOGY.test(t) || KIND.test(t) || WORRY.test(t)) return 'ok';
    const sexual = HARASS_HINT.test(t);
    if (!sexual && !NEG_HINT.test(t)) return 'ok';
    if (!TARGET.test(t) && t.length > 6) return 'ok';
    return att === 'harass' && !sexual ? 'rude' : att;
  }
  return ['ok', 'kind', 'apology'].includes(att) ? att : 'ok';
}

// ---- 洗版：亂打鍵盤、同一句一直重複、短時間丟一堆 ----
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
const spamKey = (s) => String(s || '').toLowerCase().replace(/[\s，。、；：！？!?,.;:~～…「」『』（）()]/g, '');
// recent：[{ text, at }]（10 分鐘內冒險者說過的話，含之前被判定洗版的）
function spamCheck(text, recent = [], now = Date.now()) {
  const t = spamKey(text);
  if (!t) return null;
  if (/^(.)\1{4,}$/u.test(t) && !/^[哈呵嘿嘻嗯喔哦啊欸唉嗚wｗ笑]+$/.test(t)) return 'repeat'; // 笑聲、嗯嗯嗯不算
  if (/^[a-z0-9]{5,}$/.test(t) && ROWS.some((r) => [...t].every((c) => r.includes(c)))) return 'mash';
  const last = recent.filter((h) => now - h.at < 10 * 60000);
  if (last.filter((h) => spamKey(h.text) === t).length >= 2) return 'same'; // 同一句第三次
  if (last.filter((h) => now - h.at < 60000).length >= 6) return 'flood';  // 一分鐘內第七句
  return null;
}

// 問「我們是什麼關係」這類問題（彩蛋：照目前階段回答）
const RELATION = /我們.{0,4}(什麼|甚麼|怎樣的?|哪種)關係|(你|妳)(覺得|認為)我.{0,4}(怎麼樣|如何|是誰|是你的誰)|我在(你|妳)心(中|裡|裏|目中)|(你|妳)對我.{0,3}(感覺|印象|看法)|好感度/;

const ATTITUDES = ['ok', 'kind', 'apology', 'rude', 'harass'];
// 這句要不要請 AI 判斷態度（10/14 AI 提示審視 D）：AI 說的失禮／騷擾，guardAttitude 只在句子裡有罵人或騷擾的字、
//   而且是對艾琳說（或 6 個字以內）時才採信——其他句子問了也不會用，就不問（每句聊天少 190 tok）。稱讚、道歉靠關鍵字
function needsJudge(text) {
  const t = norm(text);
  if (!t || CARE.test(t)) return false;
  if (!HARASS_HINT.test(t) && !NEG_HINT.test(t)) return false;
  return TARGET.test(t) || t.length <= 6;
}
const attitudeRules = (call, self) => [
  `【態度判斷】attitude 判斷${call}這句話對${self}的態度：ok＝一般（閒聊、問問題、抱怨工作或 bug、說自己累或難過都算 ok）；kind＝稱讚${self}或向${self}道謝；apology＝向${self}道歉；rude＝罵${self}、嘲笑${self}、對${self}很不禮貌；harass＝對${self}性騷擾、講露骨的性暗示。不確定就填 ok。`,
  `attitude 是 rude 或 harass 時，line 要冷淡地表示不喜歡、emotion 用 disdain；其他時候不要用 disdain。`,
  `${call}說自己很痛苦、不想活時，一律 ok：溫柔地關心他，建議他找信任的人或專業的人聊聊。`,
].join('\n');

module.exports = {
  STAGES, DEFAULTS, ATTITUDES, config, stageOf, stageInfo, pick, classify, guardAttitude, spamCheck, spamKey,
  attitudeRules, needsJudge, RELATION, TARGET, CARE,
};
