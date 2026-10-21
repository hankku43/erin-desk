// 待機小動作的「決定」：現在該做什麼（打瞌睡、醒來、喝奶茶、伸懶腰、哼歌……）
// 純函式，畫面（idle.js）負責演出來；測試直接 require 這個檔案
(function (root) {
  'use strict';
  const MIN = 60000;
  const AWAY_SEC = 300;          // 電腦多久沒動算「離開座位」
  const BUSY_SEC = 10;           // 電腦 10 秒內有動：你正在忙，她安靜一點
  const BREAK_MIN = 50;          // 連續在電腦前多久，提醒起來動一動
  const OVERTIME_AFTER = 60;     // 下班時間過了多久算加班
  const OVERTIME_EVERY = 45;     // 加班時多久關心一次

  // 小聲說的一句話（不開對話框），口吻照角色設定：自稱艾琳、叫冒險者
  const LINES = {
    wake: ['歡迎回來～', '冒險者回來啦！', '艾琳才、才沒有睡著喔。', '欸、冒險者回來了！艾琳沒有在打盹喔。', '剛剛鴿子送信來，艾琳幫你收著了～', '回來啦～奶茶剛好還溫溫的。', '歡迎回來～艾琳幫你顧著櫃台喔。', '回來啦！剛剛有一隻鴿子在你的位子上坐了一下。', '剛剛三號鴿子在窗台睡著了，艾琳也差點……', '冒險者回來了，艾琳的尾巴先知道的。', '歡迎回來，要不要先喝口水？', '啊，回來了！艾琳剛好在擦蠟封章。', '回來啦～剛剛沒什麼事，委託都乖乖的。'],
    morning: ['早安～（呵欠）', '今天也一起加油吧！', '早安～艾琳剛被梟長拍醒。', '今天的第一杯奶茶，開動～', '早上的風好大，耳朵都吹歪了。', '早安！頭髮梳了一百下，尾巴還是翹的。', '早上的鴿子排排站，好整齊～', '晨霧好大，鐘樓只剩一半。', '早上的鐘聲……慢五分鐘的那種。', '早安～霜糖麵包坊的香味飄過來了。', '開櫃台囉，今天也請多指教！', '早上的第一個蠟封章——啪！'],
    monday: ['開門日……艾琳也還沒完全醒。', '星期一了，一顆一顆來就好～', '開門日的委託板，貼得好滿……', '週末過得好嗎？艾琳的週末一下就過了。', '開門日要慢慢暖機，不急～', '耳朵還在週末，身體先來上班了。'],   // 星期一早上會混進來
    friday: ['週末前夜祭！再撐一下下～', '今天是星期五，艾琳的尾巴特別有精神。', '週末前夜祭！梟長也在偷看鐘。', '再一下下就是週末了，撐住～', '星期五的下午茶要多加一顆糖慶祝。', '這週也辛苦了，最後一天一起加油！'], // 星期五早上會混進來
    tea: ['三點了，奶茶時間～', '冒險者也喝點什麼吧？', '奶茶要「剛剛好多一點點」的甜～', '下午三點，喝點甜的吧～', '艾琳用小魔法把奶茶弄溫了。', '雙胞胎把奶茶送來了，杯套上有貓耳朵～', '三點的陽光好暖，尾巴都暖了。', '奶茶時間！今天是第三杯……不，第四杯。', '吃一口點心，下午的耳朵就會豎起來。', '下午茶要配一點甜的，這是規矩。', '朵朵說今天的奶茶特別好喝。', '下午三點，是一天最好的時間～'],
    break: ['坐好久了，起來動一動～', '喝口水、伸個懶腰吧！', '眼睛也要休息一下喔。', '尾巴都坐麻了……冒險者也是吧？', '看看窗外三十秒，眼睛會謝謝你喔。', '站起來走一走，委託不會跑掉的～', '轉轉脖子，喀喀——好多了吧？', '眨眨眼睛，石板看太久會乾喔。', '站起來倒杯水吧，艾琳等你。', '肩膀放鬆～耳朵也是。', '走到窗邊看看遠方，十秒就好。', '坐太久，尾巴……啊，冒險者沒有尾巴。那腰也要動一動！', '伸個懶腰～像貓一樣，往前拉長。'],
    overtime: ['已經很晚了，記得休息……', '加班也要吃點東西喔。', '艾琳陪你，但別太晚喔。', '鐘樓都敲過好幾次了……', '星星明天也還在，今天先到這裡好不好？', '艾琳把燈調暗一點，冒險者也早點休息喔。', '晚上的公會只剩油燈和梟長了……', '宵夜要吃點熱的喔。', '今天先寫到這裡，明天的冒險者會感謝你。', '艾琳的眼睛快閉起來了，冒險者也是吧？', '鐘樓又敲了……要不要定一個收工的時間？'],
    // 隨機小動作偶爾配一句自言自語（你在忙的時候不說，免得打擾）
    ambient: {
      hum: ['嗯哼～♪', '廣場那首有貓的歌……♪', '啦啦～今天的蠟封章擦得好亮～', '♪～霜月村的雪歌～', '嗯～嗯嗯～（吟遊詩人的新歌）', '啦～啦～奶茶剛剛好～', '♪星星一顆、星星兩顆～', '嗯哼～今天的委託都乖乖的～'],
      think: ['嗯……第二十八個蠟封章會是哪裡的呢？', '今天晚餐要吃燉肉，還是……', '鴿子們今天好安靜，有點可疑。', '二號鴿子是不是又胖了……', '點星祭的金邊，今年要描得更細。', '巴特爺爺的眼鏡……現在在哪裡呢？', '魚形麵包要從頭吃，還是從尾巴吃……', '狐嬸的新菜到底是什麼……', '慢慢先生今天會開幾分之幾的攤子？', '魚形麵包座今晚看得到嗎……'],
      write: ['記下來、記下來……', '「今天冒險者也很努力」——寫好了。', '奶茶的甜度……嗯，就是這樣。', '委託書的角落，畫一顆小星星……', '今天的奶茶：三杯。不對，四杯。', '小本子第三本，第二十頁……', '「冒險者今天很專心」——記下來。', '蠟封章擦好了：二十七個，一個不少。'],
      yawn: ['呼啊……午後好睏……', '艾琳沒有想睡，是眼睛在休息。', '好想縮成貓一下下……', '呼啊……尾巴也想睡了……', '再一杯奶茶就好……', '鴿子都在打盹，好會選時間……', '眼皮好重……艾琳是專業的接待員……', '縮成貓五分鐘……不行不行。'],
      heart: ['……冒險者認真的樣子，艾琳很喜歡。', '嘿嘿。', '今天也有你在呢。', '有冒險者在，櫃台就很熱鬧。', '嘿嘿，今天也一起努力了。', '小本子上你的那一頁，又多一行了。', '……艾琳在看你工作，不是在偷懶喔。', '星圖上那顆星，今天也亮亮的。'],
    },
  };
  const AMBIENT_SAY = 0.25;      // 閒著的時候，隨機小動作有多少機率配一句話
  const morningLines = (d) => (d.getDay() === 1 ? LINES.morning.concat(LINES.monday) : d.getDay() === 5 ? LINES.morning.concat(LINES.friday) : LINES.morning);

  // 隨機的小動作：emote＝頭旁邊飄的表情符號（emotes.js）、pose＝有圖就換那張圖、emotion＝沒圖時換的表情、anim＝身體的小動作
  const AMBIENT = {
    hum: { emote: 'notes', emotion: 'happy', anim: 'sway', ms: 3200 },
    think: { emote: 'think', emotion: 'thinking', ms: 2800 },
    lookL: { anim: 'lookL', ms: 2400 },
    lookR: { anim: 'lookR', ms: 2400 },
    write: { pose: 'write', emote: 'scribble', ms: 4800 },
    yawn: { pose: 'stretch', emote: 'zzz', anim: 'yawn', ms: 2600 },
    heart: { emote: 'heart', emotion: 'happy', ms: 2400 },
    sigh: { emote: 'sigh', anim: 'lookAway', ms: 2800 }, // 冷戰中：別過頭去
  };

  const minutesOf = (hhmm) => { const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
  function weighted(list, rnd) {
    const total = list.reduce((n, [, w]) => n + w, 0);
    let r = rnd() * total;
    for (const [k, w] of list) { r -= w; if (r < 0) return k; }
    return list[list.length - 1][0];
  }

  function newMemory(now) {
    return { start: now, away: false, awayAt: 0, activeSince: now, lastAt: now, nextGap: 40000, lastBreak: now, lastOvertime: 0, day: '', done: {} };
  }

  // ctx：{ now(ms), idleSec, locked, enabled, busy（正在說話／打字）, mini, focus, onboarding, cold, fond（很熟了）, wrap（下班時間 HH:MM） }
  const EXTRA_KINDS = new Set(['think', 'write', 'heart']);
  // 回傳要演的動作，或 null
  function decide(ctx, mem, rnd = Math.random) {
    const now = ctx.now;
    const d = new Date(now);
    const key = dayKey(d);
    if (mem.day !== key) { mem.day = key; mem.done = {}; }
    if (ctx.enabled === false || ctx.focus || ctx.onboarding) return null;
    // 1. 離開座位 → 打瞌睡；回來 → 醒來（說話中、縮成貓咪時也照樣）
    const away = !!ctx.locked || (ctx.idleSec || 0) >= AWAY_SEC;
    if (away && !mem.away) { mem.away = true; mem.awayAt = now; return { type: 'doze' }; }
    if (!away && mem.away) {
      mem.away = false;
      const gone = now - mem.awayAt;
      mem.activeSince = now; mem.lastBreak = now; mem.lastAt = now; mem.nextGap = 20000;
      return { type: 'wake', away: gone, whisper: gone >= 20 * MIN ? pick(LINES.wake, rnd) : null };
    }
    if (mem.away || ctx.busy || ctx.mini) return null;
    const since = now - mem.lastAt;
    const done = (k) => { mem.done[k] = true; mem.lastAt = now; mem.nextGap = 30000 + rnd() * 30000; };
    // 2. 跟著作息：早上伸懶腰、下午三點奶茶、坐太久提醒起來動、加班關心
    if (since >= 8000) {
      const t = d.getHours() * 60 + d.getMinutes();
      if (t >= 5 * 60 && t < 11 * 60 && !mem.done.morning && now - mem.start >= 5000) { done('morning'); return { type: 'morning', pose: 'stretch', emotion: 'happy', anim: 'stretch', emote: 'shine', whisper: pick(morningLines(d), rnd), ms: 3600 }; }
      if (t >= 15 * 60 && t < 16 * 60 && !mem.done.tea && !ctx.cold) { done('tea'); return { type: 'tea', pose: 'tea', emotion: 'happy', emote: 'steam', whisper: pick(LINES.tea, rnd), ms: 5200 }; }
      if (now - Math.max(mem.activeSince, mem.lastBreak) >= BREAK_MIN * MIN) { mem.lastBreak = now; done('break'); return { type: 'break', pose: 'stretch', anim: 'stretch', emote: 'sparkle', whisper: pick(LINES.break, rnd), ms: 4000 }; }
      const wrap = minutesOf(ctx.wrap);
      if (wrap !== null && t >= wrap + OVERTIME_AFTER && now - (mem.lastOvertime || 0) >= OVERTIME_EVERY * MIN) {
        mem.lastOvertime = now; done('overtime');
        return { type: 'overtime', emotion: 'worried', emote: 'sweat', whisper: pick(LINES.overtime, rnd), ms: 4200 };
      }
    }
    // 3. 隨機的小動作：你在忙就安靜一點（多半在寫小本子），閒的時候比較活潑；越熟越常冒 ♡
    if (since < mem.nextGap) return null;
    const busyUser = (ctx.idleSec || 0) < BUSY_SEC;
    let list;
    if (ctx.cold) list = [['sigh', 1]];
    else {
      const hour = d.getHours();
      const sleepy = hour >= 13 && hour < 15;
      list = busyUser
        ? [['write', 3], ['lookL', 1], ['lookR', 1], ['think', 1], ['hum', 1]]
        : [['hum', 2], ['think', 2], ['lookL', 1], ['lookR', 1], ['write', 1], ['yawn', sleepy ? 3 : 0.6]];
      if (ctx.fond) list.push(['heart', busyUser ? 1 : 2]);
    }
    let k = weighted(list, rnd);
    if (k === mem.last && list.length > 1) k = weighted(list.filter(([x]) => x !== k), rnd); // 不要連續同一個
    mem.last = k;
    mem.lastAt = now;
    mem.nextGap = (busyUser || ctx.cold ? 70000 : 35000) + rnd() * (busyUser ? 80000 : 55000);
    const lines = !busyUser && !ctx.cold && LINES.ambient[k];
    // 想事情、寫字、冒愛心的時候：一半機會說今天的節日、或之前冒險者幫她做的決定
    const extra = EXTRA_KINDS.has(k) && ctx.extra && ctx.extra.length ? ctx.extra : null;
    const say = lines && rnd() < AMBIENT_SAY ? (extra && rnd() < 0.5 ? pick(extra, rnd) : pick(lines, rnd)) : null;
    return say ? { type: k, ...AMBIENT[k], whisper: say } : { type: k, ...AMBIENT[k] };
  }

  const IdleBrain = { decide, newMemory, LINES, AMBIENT, AMBIENT_SAY, AWAY_SEC, BUSY_SEC, BREAK_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = IdleBrain;
  else root.IdleBrain = IdleBrain;
})(typeof window !== 'undefined' ? window : globalThis);
