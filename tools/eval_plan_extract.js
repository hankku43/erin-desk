#!/usr/bin/env node
// 📓 用聊的寫週計畫：抽取準確率評分
//   node tools/eval_plan_extract.js                 只評規則
//   node tools/eval_plan_extract.js --ai            規則＋本機 AI（Ollama），用 config 的模型
//   node tools/eval_plan_extract.js --ai --model qwen3:8b --host http://127.0.0.1:11434 --verbose
//   加 --holdout：改評「調完規則才寫的」那組句子（看規則有沒有只配合測試集）
// 測試句子在 test/fixtures/plan_chat_eval.json（虛構的）。AI 那一路跟 App 一樣：先規則、AI 回得出來就用 AI 的結果
'use strict';
const fs = require('fs');
const path = require('path');
const PD = require('../src/main/plandraft');

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const root = path.join(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(opt('--file', path.join(root, 'test', 'fixtures', 'plan_chat_eval.json')), 'utf8'));
let cfg = {};
for (const f of [path.join(root, 'config.json'), path.join(root, 'config.example.json')]) { try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch (_) { /* 下一個 */ } }
const llm = cfg.llm || {};
const host = opt('--host', llm.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
const model = opt('--model', llm.model || 'qwen3:4b');
const verbose = flag('--verbose') || flag('-v');
const timeoutMs = Number(opt('--timeout', 120000));

const norm = (s) => String(s || '').toLowerCase().replace(/[\s，。、；：:!！?？「」()（）]/g, '');
const KIND = { task: 'quest', schedule: 'row', unclear: 'unsure' };
// 一個預測項目對不對得上一個期待項目：種類一樣、寫了的欄位都對（title 用包含比對）
function fits(p, e) {
  if ((KIND[p.kind] || p.kind) !== e.kind) return false;
  for (const [k, v] of Object.entries(e)) {
    if (k === 'kind') continue;
    if (k === 'title') { const a = norm(p.title), b = norm(v); if (!a || !(a.includes(b) || b.includes(a))) return false; continue; }
    if (k === 'steps') { if ((p.steps || []).length !== v) return false; continue; }
    if (k === 'due') { if ((p.due || '') !== v) return false; continue; }
    if (k === 'date') { if ((p.date || '') !== v) return false; continue; }
    if (k === 'start') { if ((p.start || p.time || '') !== v) return false; continue; }
    if (k === 'time') { if ((p.time || p.start || '') !== v) return false; continue; }
    if (k === 'end') { if ((p.end || '') !== v) return false; continue; }
    if (k === 'raid') { if (!!p.raid !== v) return false; continue; }
    if (k === 'tier') { if ((p.tier || 'major') !== v) return false; continue; }
  }
  return true;
}
// 只看種類＋名稱（欄位錯了但東西有抓到）
const roughFits = (p, e) => (KIND[p.kind] || p.kind) === e.kind && (() => { const a = norm(p.title), b = norm(e.title); return !!a && (a.includes(b) || b.includes(a)); })();
function score(pred, exp, fn) {
  const used = new Set();
  let hit = 0;
  for (const e of exp) { const i = pred.findIndex((p, j) => !used.has(j) && fn(p, e)); if (i >= 0) { used.add(i); hit++; } }
  return hit;
}

async function askAI(text, ctx) {
  const prefix = /^qwen3:(?!.*instruct)/.test(model) ? (llm.noThinkPrefix || '/no_think\n') : '';
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
      body: JSON.stringify({
        model, stream: false, think: false, keep_alive: '30m', format: PD.EXTRACT_SCHEMA,
        messages: [{ role: 'system', content: PD.EXTRACT_SYSTEM }, { role: 'user', content: `${prefix}${PD.extractUser(text, ctx)}` }],
        options: { temperature: 0.2, num_predict: 500, num_ctx: llm.numCtx || 6144 },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = await res.json();
    const content = String((r.message && r.message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const json = JSON.parse((content.match(/\{[\s\S]*\}/) || [content])[0]);
    return { items: PD.normalizeAI(json, ctx), ms: Date.now() - t0, evalTok: r.eval_count || 0 };
  } finally { clearTimeout(timer); }
}

(async () => {
  const ctx = { today: fixture.today, week: PD.weekOf(fixture.today, fixture.week || 'this') };
  const useAI = flag('--ai');
  const tally = { rule: { exp: 0, pred: 0, hit: 0, rough: 0 }, ai: { exp: 0, pred: 0, hit: 0, rough: 0, fail: 0, ms: 0, n: 0 } };
  if (useAI) {
    try { const r = await fetch(`${host}/api/tags`); if (!r.ok) throw new Error(`HTTP ${r.status}`); } catch (e) { console.error(`連不到 Ollama（${host}）：${e.message}`); process.exit(2); }
    console.log(`模型：${model}（${host}）— 每句大約要等 10～40 秒`);
  }
  const misses = [];
  const set = flag('--holdout') ? 'holdout' : 'cases'; // --holdout：調規則之後才寫的句子
  const cases = fixture[set] || [];
  for (const [i, c] of cases.entries()) {
    const rule = PD.ruleExtract(c.say, ctx);
    const add = (t, pred) => { t.exp += c.expect.length; t.pred += pred.length; t.hit += score(pred, c.expect, fits); t.rough += score(pred, c.expect, roughFits); };
    add(tally.rule, rule);
    let ai = null;
    if (useAI) {
      try { const r = await askAI(c.say, ctx); ai = r.items.length ? r.items : rule; tally.ai.ms += r.ms; tally.ai.n++; } catch (e) { tally.ai.fail++; ai = rule; if (verbose) console.log(`  ⚠ AI 失敗：${e.name === 'AbortError' ? '逾時' : e.message}`); }
      add(tally.ai, ai);
    }
    const final = ai || rule;
    const ok = score(final, c.expect, fits) === c.expect.length && final.length === c.expect.length;
    if (!ok) misses.push({ i: i + 1, say: c.say, expect: c.expect, got: final });
    if (verbose || useAI) process.stdout.write(`${ok ? '✔' : '✘'} ${String(i + 1).padStart(2)} ${c.say.replace(/\n/g, ' ⏎ ')}\n`);
  }
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');
  const line = (name, t) => `${name}：精確率 ${pct(t.hit, t.pred)}、召回率 ${pct(t.hit, t.exp)}（全對 ${t.hit}/${t.exp}；只看種類＋名稱 ${pct(t.rough, t.exp)}；共抽出 ${t.pred} 項）`;
  console.log(`\n${set === 'holdout' ? '（holdout）' : ''}${cases.length} 句、期待 ${tally.rule.exp} 項`);
  console.log(line('規則', tally.rule));
  if (useAI) console.log(`${line('規則＋AI', tally.ai)}\n  AI 平均 ${(tally.ai.ms / Math.max(1, tally.ai.n) / 1000).toFixed(1)} 秒／句，失敗 ${tally.ai.fail} 句`);
  if (verbose && misses.length) {
    console.log('\n沒全對的：');
    for (const m of misses) console.log(`#${m.i} ${m.say.replace(/\n/g, ' ⏎ ')}\n   期待 ${JSON.stringify(m.expect)}\n   得到 ${JSON.stringify(m.got.map(({ tierSet, ...x }) => ({ ...x, steps: x.steps ? x.steps.length : undefined })))}`);
  }
})();
