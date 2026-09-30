// .ics（iCalendar）讀寫：Google／Outlook 匯出的行事曆 → 事件清單；週計畫 → .ics
// 只處理 VEVENT。支援 RRULE 的 DAILY/WEEKLY/MONTHLY/YEARLY ＋ INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY/BYMONTH，
// EXDATE、RDATE、RECURRENCE-ID 覆寫；時區用 TZID（IANA 名稱），Outlook 的 Windows 時區名則靠檔案裡的 VTIMEZONE 偏移
'use strict';

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DAY = 86400000;
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ---------------------------------------------------------------- 讀
function unfold(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

// NAME;P=V;P2="a,b":value
function parseLine(line) {
  let inQ = false, colon = -1;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) { colon = k; break; }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon), value = line.slice(colon + 1);
  const parts = []; let cur = ''; inQ = false;
  for (const c of head) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ';' && !inQ) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: parts[0].toUpperCase(), params, value };
}

function unescapeText(s) {
  return String(s).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

// 某時區在 ts 這一刻與 UTC 的差（毫秒）；不是 IANA 名稱就回 null
const tzFmt = new Map();
function tzOffsetMs(ts, tz) {
  let f = tzFmt.get(tz);
  if (f === undefined) {
    try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (_) { f = null; }
    tzFmt.set(tz, f);
  }
  if (!f) return null;
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ts))) p[type] = value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
}

// 把「某時區的牆上時間」換成本機 Date
function wallToDate(y, mo, d, h, mi, s, tz, vtz) {
  if (!tz) return new Date(y, mo - 1, d, h, mi, s); // 沒時區＝浮動時間，當本機時間
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = tzOffsetMs(guess, tz);
  if (off === null) {
    const fixed = vtz && vtz[tz];
    if (fixed === undefined) return new Date(y, mo - 1, d, h, mi, s); // 不認識的時區：當本機時間
    return new Date(guess - fixed);
  }
  let ts = guess - off;
  const off2 = tzOffsetMs(ts, tz);
  if (off2 !== off) ts = guess - off2; // 剛好跨日光節約切換
  return new Date(ts);
}

function parseDT(prop, vtz) {
  if (!prop) return null;
  const v = prop.value.trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  if (m[7]) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
  return { date: wallToDate(y, mo, d, h, mi, s, prop.params.TZID, vtz), allDay: false };
}

function parseDuration(s) {
  const m = String(s || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseOffset(s) { // +0800 → 毫秒
  const m = String(s || '').match(/^([+-])(\d{2})(\d{2})(\d{2})?$/);
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * ((+m[2]) * 3600000 + (+m[3]) * 60000 + (+(m[4] || 0)) * 1000);
}

function parseRRule(s) {
  const r = {};
  for (const part of String(s).split(';')) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    r[k.toUpperCase()] = v;
  }
  const out = {
    freq: (r.FREQ || '').toUpperCase(), interval: Math.max(1, +(r.INTERVAL || 1)),
    count: r.COUNT ? +r.COUNT : null, until: r.UNTIL || null,
    byDay: r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/); return m ? { n: m[1] ? +m[1] : 0, wd: WD.indexOf(m[2]) } : null; }).filter((x) => x && x.wd >= 0) : [],
    byMonthDay: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : [],
    byMonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : [],
  };
  return out;
}

// 整份檔案 → { name, events }（events 還沒展開重複）
function parseICS(text) {
  const lines = unfold(text);
  const vtz = {}; // Windows 時區名 → 標準時間偏移（毫秒）
  const events = [];
  let name = '';
  const stack = [];
  let ev = null, tzBlock = null, tzSub = null, alarm = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const p = parseLine(raw);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const c = p.value.trim().toUpperCase();
      stack.push(c);
      if (c === 'VEVENT') ev = { props: {}, exdates: [], rdates: [], alarms: [] };
      else if (c === 'VTIMEZONE') tzBlock = { id: '', std: null, dst: null };
      else if ((c === 'STANDARD' || c === 'DAYLIGHT') && tzBlock) tzSub = { kind: c, offset: null };
      else if (c === 'VALARM' && ev) alarm = { trigger: null };
      continue;
    }
    if (p.name === 'END') {
      const c = p.value.trim().toUpperCase();
      stack.pop();
      if (c === 'VEVENT' && ev) { events.push(ev); ev = null; }
      else if (c === 'VTIMEZONE' && tzBlock) { if (tzBlock.id && tzBlock.std !== null) vtz[tzBlock.id] = tzBlock.std; tzBlock = null; }
      else if ((c === 'STANDARD' || c === 'DAYLIGHT') && tzBlock && tzSub) { if (tzSub.kind === 'STANDARD') tzBlock.std = tzSub.offset; else tzBlock.dst = tzSub.offset; tzSub = null; }
      else if (c === 'VALARM' && ev && alarm) { ev.alarms.push(alarm); alarm = null; }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === 'VCALENDAR' && p.name === 'X-WR-CALNAME') name = unescapeText(p.value);
    else if (tzSub) { if (p.name === 'TZOFFSETTO') tzSub.offset = parseOffset(p.value); }
    else if (tzBlock) { if (p.name === 'TZID') tzBlock.id = p.value.trim(); }
    else if (alarm) { if (p.name === 'TRIGGER') alarm.trigger = p; }
    else if (ev && top === 'VEVENT') {
      if (p.name === 'EXDATE') for (const v of p.value.split(',')) ev.exdates.push({ ...p, value: v });
      else if (p.name === 'RDATE') for (const v of p.value.split(',')) ev.rdates.push({ ...p, value: v });
      else ev.props[p.name] = p;
    }
  }
  return { name, events: events.map((e) => normalize(e, vtz)).filter(Boolean) };
}

function normalize(e, vtz) {
  const P = e.props;
  const st = parseDT(P.DTSTART, vtz);
  if (!st) return null;
  let en = parseDT(P.DTEND, vtz);
  const dur = P.DURATION ? parseDuration(P.DURATION.value) : null;
  let end;
  if (en) end = en.date;
  else if (dur !== null) end = new Date(st.date.getTime() + dur);
  else end = st.allDay ? new Date(st.date.getTime() + DAY) : new Date(st.date.getTime()); // 沒結束時間：全天算一天，其他算瞬間
  if (st.allDay && end <= st.date) end = new Date(st.date.getTime() + DAY);
  const status = (P.STATUS ? P.STATUS.value : '').toUpperCase();
  const alarmMinutes = e.alarms.map((a) => (a.trigger ? parseDuration(a.trigger.value) : null)).filter((x) => x !== null).map((ms) => Math.round(-ms / 60000));
  const rid = parseDT(P['RECURRENCE-ID'], vtz);
  return {
    uid: P.UID ? P.UID.value.trim() : '', summary: P.SUMMARY ? unescapeText(P.SUMMARY.value) : '（無標題）',
    description: P.DESCRIPTION ? unescapeText(P.DESCRIPTION.value) : '', location: P.LOCATION ? unescapeText(P.LOCATION.value) : '',
    start: st.date, end, allDay: st.allDay, cancelled: status === 'CANCELLED',
    rrule: P.RRULE ? parseRRule(P.RRULE.value) : null,
    exdates: e.exdates.map((x) => parseDT(x, vtz)).filter(Boolean).map((x) => x.date.getTime()),
    rdates: e.rdates.map((x) => parseDT(x, vtz)).filter(Boolean).map((x) => x.date),
    recurrenceId: rid ? rid.date.getTime() : null,
    alarmMinutes: alarmMinutes.length ? alarmMinutes[0] : null,
  };
}

// ---------------------------------------------------------------- 展開重複
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds());
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
function nthWeekdayOfMonth(y, m, wd, n, tpl) {
  const mk = (day) => new Date(y, m, day, tpl.getHours(), tpl.getMinutes(), tpl.getSeconds());
  if (n > 0) { const first = new Date(y, m, 1).getDay(); const day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7; return day <= daysInMonth(y, m) ? mk(day) : null; }
  if (n < 0) { const dim = daysInMonth(y, m); const last = new Date(y, m, dim).getDay(); const day = dim - ((last - wd + 7) % 7) + (n + 1) * 7; return day >= 1 ? mk(day) : null; }
  // n = 0：該月每個這個星期幾
  const out = []; const first = new Date(y, m, 1).getDay();
  for (let day = 1 + ((wd - first + 7) % 7); day <= daysInMonth(y, m); day += 7) out.push(mk(day));
  return out;
}

// 依 RRULE 產生開始時間（照時間順序），最多 limit 個或到 stopAt 為止
function* occurrences(start, rule, stopAt) {
  const { freq, interval, byDay, byMonthDay, byMonth } = rule;
  const guard = 5000; let n = 0;
  const monthOk = (d) => !byMonth.length || byMonth.includes(d.getMonth() + 1);
  if (freq === 'DAILY') {
    for (let k = 0; n < guard; k += interval, n++) { const d = addDays(start, k); if (d > stopAt) return; if (byDay.length && !byDay.some((b) => b.wd === d.getDay())) continue; if (monthOk(d)) yield d; }
  } else if (freq === 'WEEKLY') {
    const days = byDay.length ? byDay.map((b) => b.wd) : [start.getDay()];
    const weekBase = addDays(start, -((start.getDay() + 6) % 7)); // 週一開始
    for (let k = 0; n < guard; k += interval, n++) {
      const base = addDays(weekBase, k * 7);
      if (base > stopAt) return;
      for (const wd of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
        const d = addDays(base, (wd + 6) % 7);
        if (d < start) continue;
        if (d > stopAt) return;
        if (monthOk(d)) yield d;
      }
    }
  } else if (freq === 'MONTHLY') {
    for (let k = 0; n < guard; k += interval, n++) {
      const m0 = addMonths(start, k); const y = m0.getFullYear(), m = m0.getMonth();
      if (m0 > stopAt) return;
      if (!monthOk(m0)) continue;
      let cands = [];
      if (byDay.length) for (const b of byDay) { const r = nthWeekdayOfMonth(y, m, b.wd, b.n, start); if (Array.isArray(r)) cands.push(...r); else if (r) cands.push(r); }
      else if (byMonthDay.length) for (const md of byMonthDay) { const day = md > 0 ? md : daysInMonth(y, m) + md + 1; if (day >= 1 && day <= daysInMonth(y, m)) cands.push(new Date(y, m, day, start.getHours(), start.getMinutes(), start.getSeconds())); }
      else { const day = start.getDate(); if (day <= daysInMonth(y, m)) cands.push(new Date(y, m, day, start.getHours(), start.getMinutes(), start.getSeconds())); }
      cands.sort((a, b) => a - b);
      for (const d of cands) { if (d < start) continue; if (d > stopAt) return; yield d; }
    }
  } else if (freq === 'YEARLY') {
    for (let k = 0; n < guard; k += interval, n++) {
      const d = new Date(start.getFullYear() + k, start.getMonth(), start.getDate(), start.getHours(), start.getMinutes(), start.getSeconds());
      if (d > stopAt) return;
      if (d.getMonth() !== start.getMonth()) continue; // 2/29
      yield d;
    }
  } else yield start;
}

function untilTs(rule) {
  if (!rule.until) return null;
  const dt = parseDT({ value: rule.until, params: {} });
  if (!dt) return null;
  return dt.allDay ? dt.date.getTime() + DAY - 1 : dt.date.getTime(); // UNTIL 只寫日期就算到那天結束
}

// 把所有事件展開成範圍內的實例（rangeStart/rangeEnd 是 YYYY-MM-DD，含頭尾）
function expandAll(events, rangeStart, rangeEnd) {
  const rs = new Date(rangeStart + 'T00:00:00').getTime();
  const re = new Date(rangeEnd + 'T23:59:59.999').getTime();
  const overrides = new Map(); // uid → Set(recurrenceId ts)
  for (const e of events) if (e.recurrenceId !== null && e.uid) { if (!overrides.has(e.uid)) overrides.set(e.uid, new Set()); overrides.get(e.uid).add(e.recurrenceId); }
  const out = [];
  const inRange = (s, en) => s.getTime() <= re && en.getTime() > rs;
  const mk = (e, s, en, recurring) => ({ uid: e.uid, summary: e.summary, description: e.description, location: e.location, start: s, end: en, allDay: e.allDay, recurring, alarmMinutes: e.alarmMinutes, date: isoDate(s), startHM: e.allDay ? '' : hhmm(s), endHM: e.allDay ? '' : hhmm(en) });
  for (const e of events) {
    if (e.cancelled) continue;
    const dur = e.end.getTime() - e.start.getTime();
    if (!e.rrule) { if (inRange(e.start, e.end)) out.push(mk(e, e.start, e.end, e.recurrenceId !== null)); continue; }
    const until = untilTs(e.rrule);
    const stopAt = new Date(Math.min(re, until === null ? Infinity : until));
    const skip = overrides.get(e.uid) || new Set();
    let count = 0;
    const starts = [];
    for (const s of occurrences(e.start, e.rrule, stopAt)) {
      count++;
      if (e.rrule.count && count > e.rrule.count) break;
      starts.push(s);
    }
    for (const s of e.rdates) if (s <= stopAt) starts.push(s);
    starts.sort((a, b) => a - b);
    const seen = new Set();
    for (const s of starts) {
      const ts = s.getTime();
      if (seen.has(ts)) continue; seen.add(ts);
      if (e.exdates.includes(ts) || skip.has(ts)) continue;
      if (e.allDay && e.exdates.some((x) => isoDate(new Date(x)) === isoDate(s))) continue;
      const en = new Date(ts + dur);
      if (inRange(s, en)) out.push(mk(e, s, en, true));
    }
  }
  out.sort((a, b) => a.start - b.start || a.summary.localeCompare(b.summary));
  return out;
}

// ---------------------------------------------------------------- 寫
function escapeText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function fold(line) { // 每行最多 75 bytes，續行前面加一個空格
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > 75) { out.push(cur); cur = ' ' + ch; bytes = 1 + b; } else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join('\r\n');
}
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateStamp = (iso) => iso.replace(/-/g, '');
function toDate(v) { return v instanceof Date ? v : new Date(v.length === 10 ? v + 'T00:00:00' : v); }

// items：{ uid, summary, description, start, end, allDay, alarmMinutes }；全天用 start/end = YYYY-MM-DD（end 不含）
function buildICS(items, { name = '', prodId = '-//erin-desk//Quest NPC//ZH' } = {}) {
  const now = utcStamp(new Date());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodId}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (name) L.push(`X-WR-CALNAME:${escapeText(name)}`);
  for (const it of items) {
    L.push('BEGIN:VEVENT', `UID:${it.uid}`, `DTSTAMP:${now}`);
    if (it.allDay) { L.push(`DTSTART;VALUE=DATE:${dateStamp(it.start)}`, `DTEND;VALUE=DATE:${dateStamp(it.end)}`); }
    else { L.push(`DTSTART:${utcStamp(toDate(it.start))}`, `DTEND:${utcStamp(toDate(it.end))}`); }
    L.push(`SUMMARY:${escapeText(it.summary)}`);
    if (it.description) L.push(`DESCRIPTION:${escapeText(it.description)}`);
    if (it.location) L.push(`LOCATION:${escapeText(it.location)}`);
    if (it.alarmMinutes !== undefined && it.alarmMinutes !== null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${Math.max(0, it.alarmMinutes)}M`, `DESCRIPTION:${escapeText(it.summary)}`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

module.exports = { parseICS, expandAll, buildICS, parseDuration, parseRRule, isoDate, hhmm };
