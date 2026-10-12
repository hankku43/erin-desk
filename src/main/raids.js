// 📯 團戰（會議）：計畫檔時間表裡標了 📯 的那一格，加上在程式裡自己建的（可以每天／平日／每週重複）
// 開始前提醒（預設前 15、前 5 分鐘和開始時），開始時自動進專注，結束給一點獎勵（engine.js 接）
// 純函式，不碰檔案
'use strict';

const MARK = '📯';
// 時間表那一格的文字開頭是 📯（或 ⚔、「團戰：」）就是團戰
const RE_MARK = /^(?:📯|⚔️?|團戰[:：]?)\s*/u;
const REPEATS = { once: '只有這次', daily: '每天', weekdays: '平日', weekly: '每週' };
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const DEFAULTS = { enabled: true, remind: [15, 5, 0], autoFocus: true, xp: 10, gold: 3, defaultMinutes: 60, earlyMinutes: 10 };
const DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d); };
const dowOf = (iso) => new Date(`${iso}T00:00:00`).getDay();
const validHM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const validISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
function plusMinutes(hm, min) {
  const [h, m] = hm.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + min);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
const mdOf = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
// 計畫檔那一格沒有固定 id：用名稱算一個短雜湊（key 的格式一律是「來源|id|日期|開始」）
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
const dateOfKey = (key) => String(key || '').split('|')[2] || '';

function isRaidText(text) { return RE_MARK.test(String(text || '').trim()); }
function stripMark(text) { return String(text || '').trim().replace(RE_MARK, '').trim(); }

function blank() { return { items: [], fired: {} }; }

// 這個系列在某一天有沒有一場
function occursOn(item, iso) {
  if (!item || iso < item.date) return false;
  if (item.until && iso > item.until) return false;
  const dow = dowOf(iso);
  if (item.repeat === 'daily') return true;
  if (item.repeat === 'weekdays') return dow >= 1 && dow <= 5;
  if (item.repeat === 'weekly') return (item.days && item.days.length ? item.days : [dowOf(item.date)]).includes(dow);
  return iso === item.date;
}

function repeatText(item) {
  if (!item || !item.repeat || item.repeat === 'once') return '';
  if (item.repeat === 'weekly') {
    const days = (item.days && item.days.length ? item.days : [dowOf(item.date)]).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return `每週${days.map((d) => WEEKDAY_ZH[d]).join('、')}`;
  }
  return REPEATS[item.repeat] || '';
}

// 某一段日期內的每一場（計畫檔的＋自己建的），照時間排好
// planDays：plan.days（每一格 row 有 raid、canceled）；items：state.raids.items
// offDay(iso)：calendar.dayInfo。平日／每週重複的遇到國定假日自動跳過（holiday＝假日名稱，可以「恢復」＝keep）；請假那天每一場都靜音（muted，不提醒、不專注）
function occurrences({ planDays = [], items = [], from, to, defaultMinutes = DEFAULTS.defaultMinutes, offDay = null }) {
  const out = [];
  const offOf = (iso) => (offDay ? offDay(iso) : null) || {};
  for (const d of planDays) {
    if (d.date < from || d.date > to) continue;
    for (const r of d.rows || []) {
      if (!r.raid) continue;
      const end = r.end || plusMinutes(r.start, defaultMinutes);
      const off = offOf(d.date);
      out.push({ key: `p|${hash(r.a)}|${d.date}|${r.start}`, source: 'plan', rowId: r.id, line: r.line, date: d.date, start: r.start, end, title: r.a, output: r.b || '', canceled: !!r.canceled, repeat: 'once', repeatText: '', done: r.done === true, ...(off.kind === 'leave' ? { muted: true, leave: off.name } : {}) });
    }
  }
  for (const it of items) {
    for (let iso = from > it.date ? from : it.date; iso <= to; iso = addDays(iso, 1)) {
      if (!occursOn(it, iso)) continue;
      const mv = (it.moved || {})[iso] || {};
      const start = mv.start || it.start;
      const end = mv.end || it.end || plusMinutes(start, defaultMinutes);
      const title = mv.title || it.title;
      const off = offOf(iso);
      const holiday = off.kind === 'holiday' && (it.repeat === 'weekdays' || it.repeat === 'weekly') && !(it.keep || {})[iso] ? off.name : '';
      out.push({ key: `a|${it.id}|${iso}|${start}`, source: 'app', id: it.id, date: iso, start, end, title, output: '', canceled: !!(it.skip || {})[iso] || !!holiday, repeat: it.repeat || 'once', repeatText: repeatText(it), moved: !!(it.moved || {})[iso], ...(holiday ? { holiday } : {}), ...(off.kind === 'leave' ? { muted: true, leave: off.name } : {}) });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start) || a.title.localeCompare(b.title));
}

// 現在在不在這一場裡、還多久開始
function status(o, now) {
  const s = new Date(`${o.date}T${o.start}:00`).getTime(), e = new Date(`${o.date}T${o.end}:00`).getTime();
  const t = now.getTime();
  if (o.canceled) return 'canceled';
  if (t >= e) return 'past';
  if (o.muted) return 'leave';
  if (t >= s) return 'now';
  if (s - t <= 60 * 60000) return 'soon';
  return 'later';
}

// 該說哪一句提醒：fired＝這一場已經處理過的提醒（分鐘數）。一次只說最新的那一句，錯過的就算了（晚開程式不會一次倒出來）
// 回傳 { kind: 'soon'|'start'|null, lead, mins, mark: [要記成已處理的分鐘數] }
function dueReminder(o, now, { remind = DEFAULTS.remind, fired = [] } = {}) {
  if (o.canceled || o.muted) return { kind: null, mark: [] }; // 取消的、請假那天的不提醒
  const s = new Date(`${o.date}T${o.start}:00`).getTime(), e = new Date(`${o.date}T${o.end}:00`).getTime();
  const t = now.getTime();
  const leads = [...new Set(remind.map(Number).filter((x) => x >= 0))].sort((a, b) => a - b);
  const due = leads.filter((l) => t >= s - l * 60000);
  if (!due.length) return { kind: null, mark: [] };
  const newest = due[0];
  const mark = due.filter((l) => !fired.includes(l));
  if (fired.includes(newest)) return { kind: null, mark };
  if (t >= e) return { kind: null, mark };
  if (newest > 0 && t >= s) return { kind: null, mark };
  if (newest === 0) return { kind: 'start', lead: 0, mins: 0, late: t - s > 2 * 60000, mark };
  return { kind: 'soon', lead: newest, mins: Math.max(1, Math.round((s - t) / 60000)), mark };
}

// 「前 15、5 分鐘和開始時」
function remindText(remind = DEFAULTS.remind) {
  const leads = [...new Set(remind.map(Number).filter((x) => x >= 0))].sort((a, b) => b - a);
  const pre = leads.filter((x) => x > 0);
  const parts = [];
  if (pre.length) parts.push(`前 ${pre.join('、')} 分鐘`);
  if (leads.includes(0)) parts.push('開始時');
  return parts.join('和') || '不提醒';
}

function whenText(o, today) {
  const day = o.date === today ? '今天' : o.date === addDays(today, 1) ? '明天' : `${mdOf(o.date)}（${WEEKDAY_ZH[dowOf(o.date)]}）`;
  return `${day} ${o.start}–${o.end}`;
}

// 日期、時間檢查；有錯丟 Error（訊息給人看）
function checkTimes({ date, start, end }) {
  if (!validISO(date)) throw new Error('日期格式不對');
  if (!validHM(start)) throw new Error('開始時間格式不對');
  if (end && !validHM(end)) throw new Error('結束時間格式不對');
  if (end && end <= start) throw new Error('結束時間要在開始之後');
}
function cleanTitle(t) { return String(t || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 80); }

// 新增：檢查欄位、整理好；有錯丟 Error（訊息給人看）
function makeItem(f, { id, today }) {
  const title = cleanTitle(f.title);
  if (!title) throw new Error('團戰要有名稱');
  checkTimes(f);
  const { repeat, days } = normRepeat(f);
  if (repeat === 'once' && today && f.date < today) throw new Error('日期已經過了');
  return { id, title, date: f.date, start: f.start, end: f.end || '', repeat, days, skip: {}, moved: {}, createdAt: today || f.date };
}

function normRepeat(f) {
  const repeat = REPEATS[f.repeat] ? f.repeat : 'once';
  const days = repeat === 'weekly' ? [...new Set((f.days || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  if (repeat === 'weekly' && !days.length) days.push(dowOf(f.date));
  return { repeat, days };
}

// 清掉用不到的資料：一個月前的例外、一週前的一次性團戰、太舊的提醒紀錄
function prune(st, today) {
  const old = addDays(today, -30), week = addDays(today, -7);
  st.items = (st.items || []).filter((it) => !(it.repeat === 'once' && it.date < week) && !(it.until && it.until < week));
  for (const it of st.items) {
    for (const k of Object.keys(it.skip || {})) if (k < old) delete it.skip[k];
    for (const k of Object.keys(it.moved || {})) if (k < old) delete it.moved[k];
    for (const k of Object.keys(it.keep || {})) if (k < old) delete it.keep[k];
  }
  for (const k of Object.keys(st.fired || {})) { const d = dateOfKey(k); if (!d || d < addDays(today, -1)) delete st.fired[k]; }
  return st;
}

module.exports = { MARK, RE_MARK, REPEATS, WEEKDAY_ZH, DEFAULTS, isRaidText, stripMark, blank, occursOn, repeatText, occurrences, status, dueReminder, remindText, whenText, makeItem, checkTimes, cleanTitle, normRepeat, prune, plusMinutes, addDays, validHM, validISO, dateOfKey };
