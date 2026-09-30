// 角色設定檢索：讀 lore/*.md，用 BM25（中文 bigram＋關鍵字）找出跟冒險者的話最相關的幾條設定
// 可選：Ollama 的 embedding 模型做語意比對（混合排序），向量會快取在 data/lore_vectors.json
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMOTIONS = ['normal', 'happy', 'thinking', 'surprised', 'cheer', 'worried'];

// ---- 文字處理 ----
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[\s，。、；：！？!?,.;:()（）「」『』【】\[\]"'～~—\-_／/…·]/g, '');
}
function isCJK(ch) { return /[㐀-鿿]/.test(ch); }

// 中文切成兩字一組，英數切成單字
function tokens(s) {
  const out = [];
  const t = normalize(s);
  let ascii = '';
  const flush = () => { if (ascii.length >= 2) out.push(ascii); ascii = ''; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (isCJK(ch)) {
      flush();
      if (i + 1 < t.length && isCJK(t[i + 1])) out.push(ch + t[i + 1]);
      else if (t.length === 1 || !(i > 0 && isCJK(t[i - 1]))) out.push(ch); // 落單的字也算
    } else if (/[a-z0-9]/.test(ch)) ascii += ch;
    else flush();
  }
  flush();
  return out;
}

// ---- 解析 markdown ----
function parseLore(md) {
  const text = String(md).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const lines = text.split('\n');
  let name = '', core = [], entries = [], cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    if (h1 && !cur) { name = h1[1].trim(); continue; }
    if (h2) {
      cur = { id: `l${entries.length + 1}`, title: h2[1].trim(), keywords: [], text: [], reply: '', emotion: 'normal' };
      entries.push(cur);
      continue;
    }
    if (!cur) { if (line.trim()) core.push(line.trim()); continue; }
    const kw = line.match(/^關鍵字[:：]\s*(.+)/);
    const rp = line.match(/^台詞[:：]\s*(.+)/);
    const em = line.match(/^表情[:：]\s*(\w+)/);
    if (kw) cur.keywords = kw[1].split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean);
    else if (rp) cur.reply = rp[1].trim();
    else if (em) cur.emotion = EMOTIONS.includes(em[1]) ? em[1] : 'normal';
    else if (line.trim()) cur.text.push(line.trim());
  }
  for (const e of entries) e.text = e.text.join('\n');
  return { name, core: core.join('\n'), entries };
}

// ---- BM25 ----
class BM25 {
  constructor(docs, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1; this.b = b;
    this.docs = docs; // [{ id, tokens: [] }]
    this.df = new Map();
    this.tf = docs.map((d) => {
      const m = new Map();
      for (const t of d.tokens) m.set(t, (m.get(t) || 0) + 1);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      return m;
    });
    this.len = docs.map((d) => d.tokens.length);
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, docs.length);
    this.N = docs.length;
  }
  idf(t) { const n = this.df.get(t) || 0; return Math.log(1 + (this.N - n + 0.5) / (n + 0.5)); }
  score(qtokens) {
    const out = new Array(this.N).fill(0);
    const uniq = [...new Set(qtokens)];
    for (let i = 0; i < this.N; i++) {
      const tf = this.tf[i];
      for (const t of uniq) {
        const f = tf.get(t); if (!f) continue;
        out[i] += this.idf(t) * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / this.avg));
      }
    }
    return out;
  }
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

class Lore {
  constructor({ file, dataDir, llm, embeddings = 'auto', embedModel = 'qwen3-embedding:0.6b', log = () => {} }) {
    this.file = file; this.dataDir = dataDir; this.llm = llm || {};
    this.embeddings = embeddings; this.embedModel = embedModel; this.log = log;
    this.name = ''; this.core = ''; this.entries = [];
    this.vectors = null; // Map(entryId → vector)
    this.embedStatus = 'off';
    this.load();
  }

  load() {
    try {
      const parsed = parseLore(fs.readFileSync(this.file, 'utf8'));
      this.name = parsed.name; this.core = parsed.core; this.entries = parsed.entries;
    } catch (e) {
      this.name = ''; this.core = ''; this.entries = [];
      this.error = `讀不到角色設定檔：${this.file}`;
    }
    // 關鍵字重複三次加權；標題也算
    this.bm25 = new BM25(this.entries.map((e) => ({
      id: e.id,
      tokens: [...tokens(e.title), ...tokens(e.keywords.join(' ')), ...tokens(e.keywords.join(' ')), ...tokens(e.keywords.join(' ')), ...tokens(e.text)],
    })));
    this.vectors = null;
  }

  // 冒險者的話裡直接包含某條的關鍵字 → 強命中
  keywordHits(query) {
    const q = normalize(query);
    const hits = new Map();
    for (const e of this.entries) {
      let n = 0, longest = 0;
      for (const k of e.keywords) {
        const nk = normalize(k);
        if (nk.length >= 2 && q.includes(nk)) { n++; longest = Math.max(longest, nk.length); }
        else if (nk.length === 1 && isCJK(nk) && q.length <= 4 && q.includes(nk)) { n++; } // 單字關鍵字只在很短的句子裡才算
      }
      if (n) hits.set(e.id, n + longest * 0.25);
    }
    return hits;
  }

  // ---- 向量（可選）----
  async fetchJSON(pathname, body, timeoutMs = 30000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.llm.baseUrl.replace(/\/$/, '') + pathname, {
        method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  async embed(texts, timeoutMs = 120000) {
    const r = await this.fetchJSON('/api/embed', { model: this.embedModel, input: texts, keep_alive: '30m' }, timeoutMs);
    return r.embeddings;
  }

  // 「聰明艾琳」開關：config 的 lore.embeddings 不是 false/'off' 就算開
  smartOn() { return this.embeddings !== false && this.embeddings !== 'off'; }

  // 給選單看的狀態
  statusText() {
    const st = this.embedStatus;
    if (!this.smartOn()) return '狀態：已關閉，只用關鍵字';
    if (st === 'ready') return `狀態：🟢 向量就緒（${this.vectors ? this.vectors.size : 0} 條設定）`;
    if (st === 'loading') return '狀態：⏳ 正在計算向量…';
    if (st === 'no-ollama') return '狀態：⚪ 連不到 Ollama，先只用關鍵字';
    if (st === 'no-model') return `狀態：⚪ 還沒裝 ${this.embedModel}（ollama pull ${this.embedModel}）`;
    if (String(st).startsWith('error')) return `狀態：⚠ ${this.embedMessage || '向量計算失敗'}，先只用關鍵字`;
    return '狀態：尚未檢查';
  }

  // 關掉：馬上改回純關鍵字
  disableSmart() { this.embeddings = false; this.vectors = null; this.embedStatus = 'off'; }

  // 啟動時在背景算好所有設定的向量；模型沒裝就安靜地只用 BM25
  // 同時只算一次；回傳最後的狀態（off / no-ollama / no-model / ready / error）
  prepareEmbeddings() {
    if (!this.preparing) this.preparing = this.doPrepare().finally(() => { this.preparing = null; });
    return this.preparing;
  }

  async doPrepare() {
    if (!this.smartOn() || !this.entries.length || !this.llm.baseUrl) { this.embedStatus = 'off'; this.vectors = null; return this.embedStatus; }
    try {
      const tags = await this.fetchJSON('/api/tags', null, 4000);
      const names = (tags.models || []).map((m) => m.name);
      const has = names.some((n) => n === this.embedModel || n.split(':')[0] === this.embedModel.split(':')[0]);
      if (!has) { this.embedStatus = 'no-model'; this.vectors = null; return this.embedStatus; }
    } catch (_) { this.embedStatus = 'no-ollama'; this.vectors = null; return this.embedStatus; }
    const cachePath = path.join(this.dataDir, 'lore_vectors.json');
    let cache = {};
    try { const c = JSON.parse(fs.readFileSync(cachePath, 'utf8')); if (c.model === this.embedModel) cache = c.items || {}; } catch (_) { /* 沒有快取 */ }
    const hashOf = (e) => crypto.createHash('sha1').update(`${e.title}\n${e.keywords.join('、')}\n${e.text}`).digest('hex');
    const todo = this.entries.filter((e) => !cache[hashOf(e)]);
    try {
      this.embedStatus = 'loading';
      for (let i = 0; i < todo.length; i += 8) {
        const batch = todo.slice(i, i + 8);
        const vecs = await this.embed(batch.map((e) => `${e.title}\n${e.keywords.join('、')}\n${e.text}`));
        batch.forEach((e, j) => { cache[hashOf(e)] = vecs[j]; });
      }
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({ model: this.embedModel, items: cache }));
      this.vectors = new Map(this.entries.map((e) => [e.id, cache[hashOf(e)]]));
      if (!this.smartOn()) { this.vectors = null; this.embedStatus = 'off'; return this.embedStatus; } // 算到一半被關掉
      this.embedStatus = 'ready';
      this.log(`角色設定向量就緒（${this.embedModel}）`);
    } catch (e) {
      this.embedStatus = 'error';
      this.embedMessage = `向量計算失敗：${e.message}`;
      this.vectors = null;
    }
    return this.embedStatus;
  }

  // ---- 檢索 ----
  // 回傳 [{ entry, score, strong }]，最多 k 條；找不到相關的就回空陣列
  async retrieve(query, k = 3) {
    if (!this.entries.length || !String(query || '').trim()) return [];
    const qt = tokens(query);
    const lex = this.bm25.score(qt);
    const kw = this.keywordHits(query);
    const lexMax = Math.max(...lex, 0);

    // 語意分數（有向量才算）
    let sem = null;
    if (this.vectors) {
      try {
        const [qv] = await this.embed([query], 8000);
        sem = this.entries.map((e) => cosine(qv, this.vectors.get(e.id) || []));
      } catch (_) { sem = null; }
    }

    const rows = this.entries.map((e, i) => {
      const kwScore = kw.get(e.id) || 0;
      const lexN = lexMax > 0 ? lex[i] / lexMax : 0;         // 0～1
      const semS = sem ? sem[i] : 0;                          // cosine，通常 0.3～0.8
      // 關鍵字直接命中最重要，其次語意，再來 bigram 重疊
      const score = kwScore * 1.0 + (sem ? Math.max(0, semS - 0.35) * 3 : 0) + lexN * 0.6;
      const strong = kwScore >= 1 || (sem ? semS >= 0.6 : false); // 離線台詞只在關鍵字直接命中（或語意很近）時才用
      const relevant = kwScore > 0 || (sem ? semS >= 0.45 : lex[i] >= 3);
      return { entry: e, score, strong, relevant, lex: lex[i], sem: semS, kw: kwScore };
    }).filter((r) => r.relevant).sort((a, b) => b.score - a.score);
    return rows.slice(0, k);
  }

  // 給 AI 看的參考段落
  contextText(hits) {
    if (!hits.length) return '';
    return '【角色設定參考】（依此回答，沒提到的細節可以用符合設定的方式發揮，但不要矛盾）\n' +
      hits.map((h) => `▶ ${h.entry.title}：${h.entry.text.replace(/\n+/g, ' ')}`).join('\n');
  }
}

module.exports = { Lore, parseLore, tokens, BM25 };
