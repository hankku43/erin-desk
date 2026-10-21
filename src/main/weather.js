// ☁ 天候水晶：用網路位置猜在哪裡 → 向 Open-Meteo（免金鑰）問現在的天氣和今明兩天的預報（純函式＋可注入的 fetch，方便測試）
// 只給狀態欄的水晶、點水晶時她說的一句、聊天問天氣時的內建回答用；不會加進給 AI 的提示（不增加 token）
// 送出去的只有：IP（查位置的服務本來就看得到）、四捨五入到小數點兩位的經緯度（約 1 公里）
'use strict';

const LOC_PROVIDERS = [
  { id: 'geojs', url: 'https://get.geojs.io/v1/ip/geo.json', parse: (j) => ({ lat: +j.latitude, lon: +j.longitude, city: j.city, region: j.region, country: j.country, tz: j.timezone }) },
  { id: 'ipwho', url: 'https://ipwho.is/', parse: (j) => (j.success === false ? null : { lat: +j.latitude, lon: +j.longitude, city: j.city, region: j.region, country: j.country, tz: j.timezone && j.timezone.id }) },
  { id: 'ipapi', url: 'https://ipapi.co/json/', parse: (j) => (j.error ? null : { lat: +j.latitude, lon: +j.longitude, city: j.city, region: j.region, country: j.country_name, tz: j.timezone }) },
];
const SOURCE = 'Open-Meteo.com';

// 台灣常見的英文地名 → 中文（查位置的服務多半回英文）
const PLACE_TW = {
  Taipei: '台北', 'Taipei City': '台北市', 'New Taipei': '新北', 'New Taipei City': '新北市', Taoyuan: '桃園', 'Taoyuan City': '桃園市', 'Taoyuan District': '桃園',
  Hsinchu: '新竹', 'Hsinchu City': '新竹市', 'Hsinchu County': '新竹縣', Zhubei: '竹北', Chutung: '竹東', Zhudong: '竹東', Miaoli: '苗栗', Taichung: '台中', 'Taichung City': '台中市',
  Changhua: '彰化', Nantou: '南投', Yunlin: '雲林', Chiayi: '嘉義', 'Chiayi City': '嘉義市', Tainan: '台南', 'Tainan City': '台南市', Kaohsiung: '高雄', 'Kaohsiung City': '高雄市',
  Pingtung: '屏東', Yilan: '宜蘭', Hualien: '花蓮', Taitung: '台東', Keelung: '基隆', Penghu: '澎湖', Kinmen: '金門', Lienchiang: '連江', Taiwan: '台灣',
};
const zhPlace = (s) => (s ? PLACE_TW[String(s).trim()] || String(s).trim() : '');
function placeName(loc) {
  if (!loc) return '';
  if (loc.place) return String(loc.place);
  const city = zhPlace(loc.city), region = zhPlace(loc.region);
  if (city && region && !region.includes(city) && !city.includes(region) && /[一-鿿]/.test(region + city)) return `${region}${city}`;
  return city || region || zhPlace(loc.country) || '';
}

// WMO 天氣代碼 → 種類（水晶上的小圖）、說法、魔法的說法
const KINDS = {
  clear: { name: '晴天', magic: '光之精靈很有精神' },
  night: { name: '晴朗的夜', magic: '星星都醒著' },
  partly: { name: '晴時多雲', magic: '雲朵羊群慢慢經過' },
  cloudy: { name: '陰天', magic: '雲之精靈把天空蓋起來午睡' },
  fog: { name: '起霧', magic: '霧之精靈出來散步' },
  drizzle: { name: '毛毛雨', magic: '雨之精靈在輕輕灑水' },
  rain: { name: '下雨', magic: '雨之精靈在敲窗戶' },
  heavy: { name: '大雨', magic: '雨之精靈在大掃除' },
  snow: { name: '下雪', magic: '霜之精靈來了' },
  thunder: { name: '雷雨', magic: '雷鳴獸在雲上打滾' },
};
function kindOf(code, isDay = true) {
  const c = Number(code);
  if (c === 0) return isDay ? 'clear' : 'night';
  if (c === 1 || c === 2) return 'partly';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 57) return 'drizzle';
  if (c === 61 || c === 63 || c === 80 || c === 81 || c === 66) return 'rain';
  if (c === 65 || c === 67 || c === 82) return 'heavy';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95) return 'thunder';
  return 'cloudy';
}
const WET = new Set(['drizzle', 'rain', 'heavy', 'thunder', 'snow']);

const r2 = (n) => Math.round(Number(n) * 100) / 100;
function forecastUrl(lat, lon) {
  const q = [
    `latitude=${r2(lat)}`, `longitude=${r2(lon)}`,
    'current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,precipitation,wind_speed_10m',
    'hourly=temperature_2m,precipitation_probability,weather_code',
    'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    'timezone=auto', 'forecast_days=2',
  ];
  return `https://api.open-meteo.com/v1/forecast?${q.join('&')}`;
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v) => (num(v) === null ? null : Math.round(Number(v)));

// Open-Meteo 的回應 → 畫面用的摘要。nowMs 用來找接下來幾個小時的降雨機率
function summarize(j, nowMs = Date.now()) {
  if (!j || !j.current) throw new Error('天氣資料格式不對');
  const c = j.current;
  const isDay = Number(c.is_day) !== 0;
  const day = (i) => {
    const d = j.daily || {};
    if (!d.time || !d.time[i]) return null;
    const code = (d.weather_code || [])[i];
    return { date: d.time[i], code, kind: kindOf(code, true), hi: round((d.temperature_2m_max || [])[i]), lo: round((d.temperature_2m_min || [])[i]), rain: round((d.precipitation_probability_max || [])[i]) };
  };
  // 接下來 3 小時：最高的降雨機率（Open-Meteo 的時間是當地時間、沒有時區字尾；用 utc_offset_seconds 換算）
  let soon = null;
  const h = j.hourly || {};
  if (Array.isArray(h.time)) {
    const off = Number(j.utc_offset_seconds) || 0;
    const ms = (t) => Date.parse(`${t}:00Z`) - off * 1000;
    let best = null;
    h.time.forEach((t, i) => {
      const at = ms(t);
      if (!(at > nowMs - 3600000 && at <= nowMs + 3 * 3600000)) return;
      const p = num((h.precipitation_probability || [])[i]);
      if (p !== null && (!best || p > best.prob)) best = { prob: p, inHours: Math.max(0, Math.round((at - nowMs) / 3600000)) };
    });
    soon = best;
  }
  const kind = kindOf(c.weather_code, isDay);
  return {
    temp: round(c.temperature_2m), feels: round(c.apparent_temperature), humidity: round(c.relative_humidity_2m),
    code: c.weather_code, kind, isDay, wind: round(c.wind_speed_10m), precip: num(c.precipitation),
    today: day(0), tomorrow: day(1), soon,
  };
}

// 給她說的話和滑過水晶看的字
const tempText = (n) => (n === null || n === undefined ? '?' : `${n}°`);
function dayText(d) {
  if (!d) return '';
  return `${KINDS[d.kind] ? KINDS[d.kind].name : ''} ${d.lo}～${d.hi}°${d.rain !== null && d.rain !== undefined ? `・降雨 ${d.rain}%` : ''}`;
}
// 一句建議（帶傘、加衣服、喝水、明天會下雨…）；tomorrow＝問的是明天
function advice(w, { tomorrow = false } = {}) {
  if (!w) return '';
  if (tomorrow) {
    const t = w.tomorrow;
    if (!t) return '';
    if (t.rain >= 60 || WET.has(t.kind)) return '明天出門記得帶傘喔。';
    if (t.lo !== null && t.lo <= 15) return '明天早上會涼，記得多帶一件外套。';
    if (t.hi !== null && t.hi >= 32) return '明天很熱，記得多喝水。';
    return '明天看起來是好天氣。';
  }
  const soonWet = w.soon && w.soon.prob >= 60;
  if (WET.has(w.kind)) return w.kind === 'thunder' ? '打雷的時候不要在外面亂跑喔。' : '出門記得帶傘喔。';
  if (soonWet) return `${w.soon.inHours <= 1 ? '等一下' : `大概 ${w.soon.inHours} 小時後`}可能會下雨，出門記得帶傘。`;
  if (w.today && w.today.rain >= 60) return '今天晚一點可能會下雨，傘放在包包裡比較安心。';
  if (w.temp !== null && w.temp <= 15) return '有點冷，多穿一件喔。';
  if (w.temp !== null && w.temp >= 32) return '好熱，記得多喝水。';
  if (w.wind !== null && w.wind >= 30) return '風之精靈在趕路，風很大喔。';
  if (w.tomorrow && (w.tomorrow.rain >= 60 || WET.has(w.tomorrow.kind))) return '不過明天可能會下雨。';
  return '';
}
// 滑過水晶的說明（多行）
function tipText(w, { place = '', by = 'ip', at = 0, dayInfo = null, error = '' } = {}) {
  const lines = [];
  if (w) {
    const k = KINDS[w.kind] || KINDS.cloudy;
    lines.push(`天候水晶${place ? `（${place}的天空）` : ''}`);
    lines.push(`現在：${k.name} ${tempText(w.temp)}${w.feels !== null && w.feels !== w.temp ? `（體感 ${tempText(w.feels)}）` : ''}・${k.magic}`);
    if (w.today) lines.push(`今天：${dayText(w.today)}`);
    if (w.tomorrow) lines.push(`明天：${dayText(w.tomorrow)}`);
  } else lines.push(error ? `天候水晶霧濛濛的（${error}）` : '天候水晶還在看天空…');
  if (dayInfo) {
    const parts = [dayInfo.lunar, dayInfo.term, ...(dayInfo.fests || []), dayInfo.days ? `認識第 ${dayInfo.days} 天` : ''].filter(Boolean);
    if (parts.length) lines.push(parts.join('・'));
  }
  if (w) lines.push(by === 'ip' ? '位置是用網路位置猜的（不準的話，在設定檔 config.json 的 weather 填經緯度）' : '位置是設定檔裡填的');
  if (w) lines.push(`天氣資料：${SOURCE}${at ? `（${new Date(at).getHours()}:${String(new Date(at).getMinutes()).padStart(2, '0')} 更新）` : ''}`);
  return lines.join('\n');
}

// 冒險者在聊天裡問天氣（問今天／明天）：用內建的回答，不問 AI
const RE_WEATHER = /天氣|會不會下雨|下雨嗎|要下雨|帶傘|幾度|氣溫|溫度多少|冷不冷|熱不熱|會冷嗎|會熱嗎|颱風|晴天嗎|出太陽/;
const RE_ASK = /[？?]|嗎|呢|如何|怎樣|怎麼樣|多少|會不會|是不是|要不要/;
function weatherQuestion(text) {
  const t = String(text || '');
  if (t.length > 40 || !RE_WEATHER.test(t) || !RE_ASK.test(t)) return null;
  return { tomorrow: /明天|明日/.test(t) };
}

// 抓天氣：位置（設定裡的或猜的）→ 預報。fetchJson(url) 要回 JSON（逾時、錯誤丟例外）
async function locate(fetchJson, { providers = LOC_PROVIDERS } = {}) {
  const errors = [];
  for (const p of providers) {
    try {
      const loc = p.parse(await fetchJson(p.url));
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lon) <= 180 && !(loc.lat === 0 && loc.lon === 0)) return { ...loc, by: 'ip', via: p.id };
      errors.push(`${p.id}：沒有位置`);
    } catch (e) { errors.push(`${p.id}：${e.message || e}`); }
  }
  const err = new Error('猜不出位置'); err.detail = errors; throw err;
}
async function fetchWeather(fetchJson, loc, nowMs = Date.now()) {
  const j = await fetchJson(forecastUrl(loc.lat, loc.lon));
  return summarize(j, nowMs);
}

module.exports = { LOC_PROVIDERS, SOURCE, KINDS, WET, kindOf, forecastUrl, summarize, advice, tipText, dayText, tempText, placeName, zhPlace, weatherQuestion, locate, fetchWeather };
