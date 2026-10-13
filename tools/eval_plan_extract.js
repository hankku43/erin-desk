#!/usr/bin/env node
// 📓 筆記本（委託）抽取準確率評分
//   node tools/eval_plan_extract.js                     只評規則（一般句子）
//   node tools/eval_plan_extract.js --set steps         評「步驟」的說法（也可以 holdout、steps_holdout、all）
//   node tools/eval_plan_extract.js --ai -v             規則＋本機 AI（Ollama），用 config.json 的模型
//   node tools/eval_plan_extract.js --ai --model qwen3:8b --host http://127.0.0.1:11434
// 結果會另外存成 UTF-8 的 data/eval_last.txt 和 data/eval_last.json（--out 換位置），不用自己用「>」轉存
// 測試句子在 test/fixtures/plan_chat_eval.json（虛構的）。每一題用一本空的筆記本，一句一句說（say 是陣列＝分好幾句說），最後比對筆記本裡的東西
// AI 那一路跟 App 一樣：規則先記、把規則的結果一起給 AI 改正；AI 回空或失敗就留規則的。另外列出「AI 單獨」和「回空幾次」，才知道 AI 有沒有真的在做事
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
const setName = flag('--holdout') ? 'holdout' : opt('--set', 'cases');
const sets = setName === 'all' ? ['cases', 'holdout', 'steps', 'steps_holdout'] : [setName];
// 結果另外寫一份 UTF-8 的檔（Windows 的 PowerShell 用「>」轉存會變成 UTF-16、中文變亂碼）：預設 data/eval_last.txt＋.json（每題、AI 回了什麼）
const outFile = opt('--out', path.join(root, 'data', 'eval_last.txt'));
const outLines = [];
const say = (t = '') => { console.log(t); outLines.push(t); };

const norm = (s) => String(s || '').toLowerCase().replace(/[\s，。、；：:!！?？「」()（）]/g, '');
const has = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };
// 筆記本裡的東西 → 比對用的清單
function itemsOf(d) {
  return [
    ...PD.live(d.quests).map((q) => ({ kind: 'quest', title: q.title, due: q.due, tier: q.tier, steps: q.steps.map((s) => s.text) })),
    ...PD.live(d.rows).map((r) => ({ kind: 'row', title: r.title, date: r.date, start: r.start, end: r.end, raid: !!r.raid })),
    ...PD.live(d.reminders).map((m) => ({ kind: 'reminder', title: m.title, date: m.date, time: m.time })),
    ...Object.entries(d.themes).filter(([, t]) => t).map(([date, t]) => ({ kind: 'theme', title: t, date })),
    ...d.unsure.map((u) => ({ kind: 'unsure', title: u.title })),
  ];
}
// 一個項目對不對得上期待：種類一樣、寫了的欄位都對（title 用包含比對；steps 是數字＝幾個、陣列＝每個關鍵字都要在、而且個數一樣）
function fits(p, e) {
  if (p.kind !== e.kind) return false;
  for (const [k, v] of Object.entries(e)) {
    if (k === 'kind') continue;
    if (k === 'title') { if (!has(p.title, v)) return false; continue; }
    if (k === 'steps') {
      const st = p.steps || [];
      if (typeof v === 'number') { if (st.length !== v) return false; continue; }
      if (st.length !== v.length || !v.every((w, i) => has(st[i], w) || st.some((s) => has(s, w)))) return false;
      continue;
    }
    if (k === 'start') { if ((p.start || p.time || '') !== v) return false; continue; }
    if (k === 'time') { if ((p.time || p.start || '') !== v) return false; continue; }
    if (k === 'raid') { if (!!p.raid !== v) return false; continue; }
    if (k === 'tier') { if ((p.tier || 'major') !== v) return false; continue; }
    if ((p[k] || '') !== v) return false;
  }
  return true;
}
const rough = (p, e) => p.kind === e.kind && has(p.title, e.title);
function score(pred, exp, fn) {
  const used = new Set();
  let hit = 0;
  for (const e of exp) { const i = pred.findIndex((p, j) => !used.has(j) && fn(p, e)); if (i >= 0) { used.add(i); hit++; } }
  return hit;
}

async function askAI(text, ctx, rule, d) {
  const prefix = /^qwen3:(?!.*instruct)/.test(model) ? (llm.noThinkPrefix || '/no_think\n') : '';
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
      body: JSON.stringify({
        model, stream: false, think: false, keep_alive: '30m', format: PD.EXTRACT_SCHEMA,
        messages: [{ role: 'system', content: PD.EXTRACT_SYSTEM }, { role: 'user', content: `${prefix}${PD.extractUser(text, ctx, { rule, d })}` }],
        options: { temperature: 0.2, num_predict: 500, num_ctx: llm.numCtx || 6144 },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = await res.json();
    const content = String((r.message && r.message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const json = JSON.parse((content.match(/\{[\s\S]*\}/) || [content])[0]);
    return { items: PD.normalizeAI(json, ctx), raw: content, ms: Date.now() - t0, tok: r.eval_count || 0 };
  } finally { clearTimeout(timer); }
}

(async () => {
  const ctx = { today: fixture.today, week: PD.weekOf(fixture.today, fixture.week || 'this') };
  const useAI = flag('--ai');
  const blank = () => ({ exp: 0, pred: 0, hit: 0, rough: 0, perfect: 0 });
  const T = { rule: blank(), ai: blank(), both: blank() };
  const aiStat = { calls: 0, empty: 0, fail: 0, ms: 0, tok: 0, app: 0, appUsed: 0 };
  if (useAI) {
    try { const r = await fetch(`${host}/api/tags`); if (!r.ok) throw new Error(`HTTP ${r.status}`); } catch (e) { console.error(`連不到 Ollama（${host}）：${e.message}`); process.exit(2); }
    say(`模型：${model}（${host}）— 每句大約要等 5～40 秒`);
  }
  const misses = [];
  const detail = [];
  let n = 0;
  for (const set of sets) {
    for (const [i, c] of (fixture[set] || []).entries()) {
      n++;
      const says = Array.isArray(c.say) ? c.say : [c.say];
      const D = { rule: PD.blank(ctx.week, ''), ai: PD.blank(ctx.week, ''), both: PD.blank(ctx.week, '') };
      const raws = [];
      for (const say of says) {
        const rule = PD.ruleExtract(say, ctx);
        PD.addItems(D.rule, rule);
        if (!useAI || PD.isChatter(say) || PD.isEnough(say)) { PD.addItems(D.both, rule); continue; } // App：語助詞、「就這樣」不記也不問 AI
        let ai = null;
        aiStat.calls++;
        try {
          const r = await askAI(say, ctx, rule, D.both);
          aiStat.ms += r.ms; aiStat.tok += r.tok; raws.push(r.raw);
          ai = r.items;
          if (!ai.length) aiStat.empty++;
        } catch (e) { aiStat.fail++; raws.push(`（失敗：${e.name === 'AbortError' ? '逾時' : e.message}）`); }
        PD.addItems(D.ai, ai || []);
        // App 的做法：規則有把握就用規則；沒把握才看 AI，AI 的結果再檢查（自己編的日子、沒拆開的整句不用）
        let use = rule;
        if (PD.needsAI(say, rule)) { aiStat.app++; const ok = PD.checkAI(ai || [], say, ctx, rule); if (ok) { use = ok; aiStat.appUsed++; } }
        PD.addItems(D.both, use);
      }
      const add = (t, d) => { const pred = itemsOf(d); t.exp += c.expect.length; t.pred += pred.length; const h = score(pred, c.expect, fits); t.hit += h; t.rough += score(pred, c.expect, rough); if (h === c.expect.length && pred.length === c.expect.length) t.perfect++; return h === c.expect.length && pred.length === c.expect.length; };
      const okRule = add(T.rule, D.rule);
      let ok = okRule;
      if (useAI) { add(T.ai, D.ai); ok = add(T.both, D.both); }
      const final = useAI ? D.both : D.rule;
      if (!ok) misses.push({ n, say: says.join(' ／ '), expect: c.expect, got: itemsOf(final), raws });
      detail.push({ n, set, say: says, ok, okRule, expect: c.expect, rule: itemsOf(D.rule), ai: useAI ? itemsOf(D.ai) : null, raws });
      if (verbose || useAI) say(`${ok ? '✔' : '✘'} ${String(n).padStart(2)} ${says.join(' ／ ').replace(/\n/g, ' ⏎ ')}`);
    }
  }
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');
  const line = (name, t) => `${name}：全對 ${t.perfect}/${n} 題；項目精確率 ${pct(t.hit, t.pred)}、召回率 ${pct(t.hit, t.exp)}（只看種類＋名稱 ${pct(t.rough, t.exp)}）`;
  say(`\n【${sets.join('＋')}】${n} 題、期待 ${T.rule.exp} 項`);
  say(line('規則', T.rule));
  if (useAI) {
    say(line('AI 單獨', T.ai));
    say(line('規則＋AI（App 的做法）', T.both));
    say(`  AI：問了 ${aiStat.calls} 次，回空 ${aiStat.empty} 次、失敗 ${aiStat.fail} 次；平均 ${(aiStat.ms / Math.max(1, aiStat.calls - aiStat.fail) / 1000).toFixed(1)} 秒、${Math.round(aiStat.tok / Math.max(1, aiStat.calls - aiStat.fail))} tok／句`);
    say(`  App 只有規則沒把握時才用 AI：${aiStat.app} 句沒把握、其中 ${aiStat.appUsed} 句用了 AI 的結果`);
    if (aiStat.empty > aiStat.calls / 2) say('  ⚠ AI 大多回空：AI 其實沒在幫忙，請把這份結果傳給開發者');
  }
  if (verbose && misses.length) {
    say('\n沒全對的：');
    for (const m of misses) {
      say(`#${m.n} ${m.say.replace(/\n/g, ' ⏎ ')}\n   期待 ${JSON.stringify(m.expect)}\n   得到 ${JSON.stringify(m.got)}`);
      for (const r of m.raws) say(`   AI 回 ${String(r).slice(0, 300)}`);
    }
  }
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${outLines.join('\n')}\n`, 'utf8');
    fs.writeFileSync(outFile.replace(/\.txt$/i, '') + '.json', JSON.stringify({ at: new Date().toISOString(), model: useAI ? model : null, sets, totals: T, ai: aiStat, detail }, null, 1), 'utf8');
    console.log(`\n（結果也存在 ${path.relative(root, outFile)} 和 .json）`);
  } catch (e) { console.error(`存不了結果檔：${e.message}`); }
})();
