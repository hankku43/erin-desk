// 🤔 幫艾琳做決定：一天最多問一次，下面出現 2～3 個按鈕（也可以在聊天框直接說）；決定會記住，之後她會提起（純函式＋題庫）
// 全部是內建台詞，不問 AI、不加提示長度。daily＝每天的小事（三週後可能再問）；big＝一次性的大決定（記一輩子，待機小字也會提）
'use strict';

// 每一題：ask＝她問的話；options[]：label（按鈕）、keys（聊天裡說這些字也算）、reply（馬上回）、later（隔天以後提起一次）、whisper（待機小字）
// when：hours [開始, 結束)（只在這段時間問）、days（星期幾，0＝日）；free：可以在聊天框打自己想的名字（{pick}＝打的字）
const QUESTIONS = [
  // ---- 每天的小事 ----
  { id: 'tea', kind: 'daily', emotion: 'thinking',
    ask: '{call}，幫{self}決定一件事！今天的奶茶要照舊「剛剛好多一點點甜」，還是挑戰看看少糖？',
    options: [
      { id: 'sweet', label: '照舊，多一點點甜', keys: ['照舊', '甜', '一樣'], reply: '嗯哼，就知道{call}懂！今天也是剛剛好多一點點的甜。', emotion: 'happy', later: '上次聽{call}的，奶茶照舊多一點點甜……果然還是這個最好喝。' },
      { id: 'less', label: '試試少糖', keys: ['少糖', '挑戰', '試試'], reply: '少、少糖……好，{self}挑戰看看！', emotion: 'surprised', later: '上次試了少糖的奶茶……嗯，是大人的味道。今天還是加回來好了。' },
    ] },
  { id: 'ribbon', kind: 'daily', emotion: 'thinking',
    ask: '今天的緞帶要怎麼綁呢？{call}幫{self}選一個。',
    options: [
      { id: 'bow', label: '蝴蝶結', keys: ['蝴蝶結'], reply: '蝴蝶結！嗯，綁好了——左右一樣大嗎？', emotion: 'happy', later: '上次{call}選的蝴蝶結，瑪格大姐說很可愛。……嘿嘿。' },
      { id: 'tail', label: '綁低馬尾', keys: ['馬尾'], reply: '低馬尾……好，這樣頭髮就不會掃到委託書了。', emotion: 'happy', later: '上次綁低馬尾，寫字的時候真的方便很多。{call}好會選。' },
      { id: 'wrist', label: '綁在手腕上', keys: ['手腕'], reply: '綁在手腕上？……像護身符一樣。好，今天就這樣！', emotion: 'surprised', later: '上次緞帶綁在手腕上，蓋章的時候一直晃來晃去……很有趣。' },
    ] },
  { id: 'lunch', kind: 'daily', emotion: 'thinking', when: { hours: [10, 13] },
    ask: '午餐要吃什麼好呢……{call}幫{self}選！',
    options: [
      { id: 'stew', label: '胖狐狸食堂的燉肉', keys: ['燉肉', '狐狸', '食堂'], reply: '燉肉套餐！狐嬸會多給一小碟酸菜的。', emotion: 'happy', later: '上次聽{call}的去吃燉肉，狐嬸真的多給了一碟酸菜！' },
      { id: 'sandwich', label: '麵包坊的三明治', keys: ['三明治', '麵包'], reply: '霜糖麵包坊的三明治……可以邊走邊吃，好主意。', emotion: 'happy', later: '上次的三明治，{self}分了一點麵包屑給二號鴿子……牠高興到繞了三圈。' },
      { id: 'pancake', label: '茶舖的鬆餅', keys: ['鬆餅', '茶舖'], reply: '鬆、鬆餅當午餐？……好吧，偶爾一次！', emotion: 'surprised', later: '上次午餐吃鬆餅，下午整個人都甜甜的……要保密喔。' },
    ] },
  { id: 'snack', kind: 'daily', emotion: 'thinking', when: { hours: [13, 17] },
    ask: '下午茶的點心，{call}覺得配什麼好？',
    options: [
      { id: 'fishbread', label: '魚形麵包', keys: ['魚形', '魚'], reply: '魚形麵包！{self}要從尾巴開始吃。', emotion: 'happy', later: '上次的魚形麵包是紅豆的，跟媽媽做的有一點點像。' },
      { id: 'cookie', label: '藍鈴花餅乾', keys: ['餅乾', '藍鈴'], reply: '藍鈴花餅乾，聞起來像春天的野餐……好選擇。', emotion: 'happy', later: '上次的藍鈴花餅乾，{self}留了一片夾在小本子裡……騙你的，吃掉了。' },
      { id: 'marshmallow', label: '烤棉花糖', keys: ['棉花糖'], reply: '烤棉花糖！{self}可以用小魔法烤到剛剛好的焦。', emotion: 'cheer', later: '上次烤棉花糖，烤到一半梟長也湊過來了……他吃了兩個。' },
    ] },
  { id: 'flower', kind: 'daily', emotion: 'thinking',
    ask: '櫃台的花瓶空了。{call}覺得今天要放什麼？',
    options: [
      { id: 'bluebell', label: '藍鈴花', keys: ['藍鈴'], reply: '藍鈴花，跟{self}的眼睛同一個顏色……這是巧合。', emotion: 'shy', later: '上次放的藍鈴花，好多冒險者都問「誰選的」。{self}說是秘密。' },
      { id: 'sunflower', label: '向日葵', keys: ['向日葵'], reply: '向日葵！櫃台一下子亮起來了。', emotion: 'happy', later: '上次的向日葵一直朝著窗戶轉，{self}跟它比賽誰先轉過去。' },
      { id: 'stone', label: '不放花，放一顆幸運石', keys: ['幸運石', '石頭'], reply: '幸運石……是隆克給的那顆嗎？好，放上去！', emotion: 'surprised', later: '上次放的幸運石，隆克看到以後高興了一整個下午。' },
    ] },
  { id: 'wax', kind: 'daily', emotion: 'thinking',
    ask: '今天的蠟封要用什麼顏色？{call}選一個，{self}就用一整天。',
    options: [
      { id: 'red', label: '紅色', keys: ['紅'], reply: '紅色，最正式的顏色。今天的章會蓋得特別認真！', emotion: 'happy', later: '上次用紅色蠟封，梟長說「很好」——他一年只說三次的那種。' },
      { id: 'gold', label: '金色', keys: ['金'], reply: '金色！像星星一樣……今天每一件委託都是一顆星。', emotion: 'cheer', later: '上次的金色蠟封，在夕陽底下會發光，好漂亮。' },
      { id: 'navy', label: '深藍色', keys: ['藍', '深藍'], reply: '深藍色，跟背心同一個顏色。很穩重，{self}喜歡。', emotion: 'happy', later: '上次用深藍色蠟封，巴特爺爺以為是他的墨水打翻了。' },
    ] },
  { id: 'pigeonfood', kind: 'daily', emotion: 'thinking',
    ask: '鴿子們今天的點心，{call}覺得給什麼好？',
    options: [
      { id: 'crumbs', label: '麵包屑', keys: ['麵包屑'], reply: '麵包屑……二號一定會第一個衝過來。', emotion: 'happy', later: '上次給麵包屑，二號果然一個人吃掉一半，被一號瞪了。' },
      { id: 'millet', label: '小米', keys: ['小米'], reply: '小米，最健康的選擇。鴿子們會感謝你的。', emotion: 'happy', later: '上次給了小米，五號吃完以後送信特別快。' },
      { id: 'seeds', label: '葵花籽', keys: ['葵花'], reply: '葵花籽是大餐耶！今天的鴿子們運氣真好。', emotion: 'cheer', later: '上次給了葵花籽，鴿子們整個下午都在窗台上咕咕叫，很開心的樣子。' },
    ] },
  { id: 'evening', kind: 'daily', emotion: 'thinking', when: { hours: [14, 19] },
    ask: '收櫃台以後要去哪裡散步呢？{call}幫{self}選。',
    options: [
      { id: 'river', label: '沿著河邊走', keys: ['河'], reply: '河邊！傍晚的河面會有金色的光。', emotion: 'happy', later: '上次沿著河邊走，看到一隻好大的白鷺……{self}沒有撲上去，忍住了。' },
      { id: 'square', label: '鐘樓下的廣場', keys: ['鐘樓', '廣場'], reply: '廣場！說不定吟遊詩人又在唱那首有貓的歌。', emotion: 'happy', later: '上次去廣場，吟遊詩人真的在唱那首歌，{self}跟著哼了。' },
      { id: 'books', label: '慢慢先生的舊書攤', keys: ['書攤', '慢慢'], reply: '舊書攤……希望今天有開。至少開一半。', emotion: 'thinking', later: '上次去舊書攤，慢慢先生開了三分之一，還幫{self}留了一個舊信封。' },
    ] },
  { id: 'hair', kind: 'daily', emotion: 'thinking',
    ask: '今天頭髮要綁起來，還是放下來？',
    options: [
      { id: 'up', label: '綁起來', keys: ['綁'], reply: '綁起來！做事比較方便……耳朵也比較涼。', emotion: 'happy', later: '上次把頭髮綁起來，整天都很有精神。{call}的眼光不錯。' },
      { id: 'down', label: '放下來', keys: ['放下'], reply: '放下來……好，那今天{self}要很小心不要讓頭髮掃到墨水。', emotion: 'happy', later: '上次頭髮放下來，掃到了一次墨水……一次而已！' },
    ] },
  { id: 'song', kind: 'daily', emotion: 'thinking',
    ask: '等一下整理委託書的時候要哼歌……{call}想聽哪一首？',
    options: [
      { id: 'snow', label: '霜月村的雪歌', keys: ['雪歌', '霜月'], reply: '雪歌……是媽媽常唱的。那{self}小聲一點唱。', emotion: 'happy', later: '上次哼了雪歌，三號鴿子聽到一半就睡著了。' },
      { id: 'cat', label: '廣場那首有貓的歌', keys: ['貓', '廣場'], reply: '那首！「喵～喵喵～」……啊，唱出聲了。', emotion: 'shy', later: '上次哼那首有貓的歌，被瑪格大姐聽到了……她跟著唱了。' },
    ] },
  { id: 'stamp', kind: 'daily', emotion: 'thinking',
    ask: '{call}覺得蓋章要蓋得正正的，還是歪一點點比較可愛？',
    options: [
      { id: 'straight', label: '正正的', keys: ['正'], reply: '正正的才專業！{self}今天會把每一個章都蓋得正正的。', emotion: 'happy', later: '上次說好要蓋得正正的……二十個裡面只有一個歪了。很厲害吧？' },
      { id: 'tilt', label: '歪一點點', keys: ['歪'], reply: '歪、歪一點點……這樣真的可以嗎？那就偷偷歪一點點。', emotion: 'shy', later: '上次偷偷把章蓋歪一點點，結果大家都說今天的章很可愛。' },
    ] },
  { id: 'weekend', kind: 'daily', emotion: 'thinking', when: { days: [5], hours: [12, 20] },
    ask: '週末快到了！{call}覺得{self}週末要做什麼？',
    options: [
      { id: 'sunset', label: '去鐘樓看夕陽', keys: ['夕陽', '鐘樓'], reply: '鐘樓看夕陽……好，{self}會順便幫你看一眼。', emotion: 'happy', later: '週末去鐘樓看了夕陽！天空是奶茶色的，好想讓{call}也看看。' },
      { id: 'sleep', label: '在房間睡一整天', keys: ['睡'], reply: '睡、睡一整天……那{self}就縮成貓，睡到中午！', emotion: 'happy', later: '週末真的睡了一整天……醒來的時候尾巴壓麻了。' },
      { id: 'market', label: '去逛市集', keys: ['市集', '逛'], reply: '市集！說不定有遠方公會的蠟封章在賣。', emotion: 'cheer', later: '週末去逛了市集，雖然沒找到新的蠟封章，但買到很香的茶葉。' },
    ] },
  { id: 'pen', kind: 'daily', emotion: 'thinking', when: { days: [1] },
    ask: '開門日的第一張委託書，要用羽毛筆還是新買的鋼筆寫？',
    options: [
      { id: 'quill', label: '羽毛筆', keys: ['羽毛'], reply: '羽毛筆，梟長掉的那根……寫起來有一點點威嚴。', emotion: 'happy', later: '上次用梟長的羽毛筆寫，字變得好端正。' },
      { id: 'fountain', label: '新的鋼筆', keys: ['鋼筆'], reply: '新鋼筆！第一筆要寫得漂亮……好，寫好了。', emotion: 'cheer', later: '上次用新鋼筆，墨水不小心沾到手指……現在還有一點點藍。' },
    ] },
  // ---- 一次性的大決定 ----
  { id: 'pigeon7', kind: 'big', emotion: 'surprised',
    ask: '{call}！閣樓來了一隻新的小鴿子，是第七隻！要取什麼名字好呢？（想自己取的話，在聊天框打名字也可以）',
    free: { max: 6, reply: '「{pick}」……好名字！小鴿子歪了歪頭，好像很喜歡。', emotion: 'happy', later: '{pick}今天第一次送信，回來的時候還多叼了一片葉子。', whisper: '{pick}今天也在窗台上排隊……' },
    options: [
      { id: 'mochi', label: '麻糬', keys: ['麻糬'], reply: '麻糬！牠圓滾滾的，真的很像。', emotion: 'happy', later: '麻糬今天第一次送信，回來的時候還多叼了一片葉子。', whisper: '麻糬今天也在窗台上排隊……' },
      { id: 'cloud', label: '小雲', keys: ['小雲', '雲'], reply: '小雲……白白的，很適合牠。', emotion: 'happy', later: '小雲今天飛得好高，真的像一朵雲。', whisper: '小雲飛去哪裡了呢……' },
      { id: 'seven', label: '七號', keys: ['七號'], reply: '七號！照順序來……一號會很滿意的。', emotion: 'happy', later: '七號今天跟著一號學送信，一號教得很嚴格。', whisper: '七號又在跟一號學飛了……' },
    ] },
  { id: 'wish', kind: 'big', emotion: 'thinking',
    ask: '點星祭的燈籠要寫一個願望……{self}想寫跟{call}有關的。要寫哪一個？',
    options: [
      { id: 'health', label: '冒險者身體健康', keys: ['健康'], reply: '「冒險者身體健康」……寫好了。字有點歪，但很認真。', emotion: 'happy', later: '燈籠掛上去了！「冒險者身體健康」那一盞，在最高的地方。', whisper: '燈籠上的願望，會實現的……' },
      { id: 'smooth', label: '委託都順利', keys: ['順利'], reply: '「委託都順利」。嗯，這個{self}也可以幫忙實現。', emotion: 'cheer', later: '寫著「委託都順利」的燈籠掛上去了。最近{call}的委託真的都很順利呢。', whisper: '委託都順利、委託都順利……' },
      { id: 'together', label: '有一天一起出任務', keys: ['一起', '任務'], reply: '一、一起出任務……！好，寫上去了。不准反悔喔。', emotion: 'shy', later: '那盞寫著「有一天一起出任務」的燈籠……{self}每天都會看一眼。', whisper: '有一天，一起出任務……' },
    ] },
  { id: 'bluebelltea', kind: 'big', emotion: 'thinking',
    ask: '雲朵茶舖出了「藍鈴花奶茶」……{self}猶豫好久了。{call}覺得要試試看嗎？',
    options: [
      { id: 'try', label: '試試看！', keys: ['試', '要'], reply: '好！{self}現在就去買……如果難喝，要{call}負責喔。', emotion: 'cheer', later: '藍鈴花奶茶喝了！有一點花香、有一點甜……{self}可能會變成常客。', whisper: '藍鈴花奶茶，今天要不要再點一杯……' },
      { id: 'old', label: '還是喝原本的', keys: ['原本', '不要', '照舊'], reply: '嗯……也對，原本的最安心。謝謝{call}幫{self}下定決心。', emotion: 'happy', later: '後來朵朵送了一杯藍鈴花奶茶讓{self}試……還是原本的好喝。{call}說對了。', whisper: '原本的奶茶，果然最安心……' },
    ] },
  { id: 'mascot', kind: 'big', emotion: 'thinking',
    ask: '三號櫃台想擺一個吉祥物！{call}覺得哪一個好？',
    options: [
      { id: 'woodpigeon', label: '小鴿子木雕', keys: ['木雕', '鴿子'], reply: '小鴿子木雕！真的鴿子們看到會不會吃醋呢……', emotion: 'happy', later: '小鴿子木雕擺上去了，二號一直去啄它。', whisper: '木雕鴿子今天也很乖……比真的乖。' },
      { id: 'starlamp', label: '星星燈', keys: ['星星', '燈'], reply: '星星燈！晚上收櫃台的時候，會一閃一閃的。', emotion: 'cheer', later: '星星燈擺上去了，晚上的櫃台變得好溫暖。', whisper: '星星燈，一閃一閃……' },
      { id: 'luckycat', label: '招財貓', keys: ['招財', '貓'], reply: '招、招財貓……不是因為{self}是貓才選的喔？好啦，擺上去。', emotion: 'shy', later: '招財貓擺上去以後，委託真的變多了……是巧合吧？', whisper: '招財貓的手，舉得好累的樣子……' },
    ] },
  { id: 'cover', kind: 'big', emotion: 'thinking',
    ask: '小本子快寫滿了，下一本的封面要什麼顏色？{call}幫{self}挑。',
    options: [
      { id: 'sky', label: '天空藍', keys: ['天空', '藍'], reply: '天空藍！跟晨風鎮晴天的顏色一樣。', emotion: 'happy', later: '新的小本子買好了，天空藍的。第一頁……先不告訴{call}寫了什麼。', whisper: '天空藍的小本子，第一頁要寫什麼呢……' },
      { id: 'milktea', label: '奶茶色', keys: ['奶茶'], reply: '奶茶色……看起來就很好喝。好，就這個！', emotion: 'happy', later: '新的小本子是奶茶色的，{self}一看到就想喝奶茶。', whisper: '奶茶色的小本子……又想喝奶茶了。' },
      { id: 'night', label: '星空黑', keys: ['星空', '黑'], reply: '星空黑！上面還有小小的金色星星，好帥氣。', emotion: 'cheer', later: '新的小本子是星空黑的，打開的時候好像在看夜空。', whisper: '星空黑的小本子，像把夜空帶在身上。' },
    ] },
  { id: 'holiday', kind: 'big', emotion: 'thinking',
    ask: '{self}下個月有一次長假……{call}覺得要去哪裡？',
    options: [
      { id: 'home', label: '回霜月村看家人', keys: ['霜月', '回家', '家人'], reply: '回霜月村……嗯，媽媽一定會很高興。{self}會帶伴手禮回來給{call}。', emotion: 'happy', later: '{self}寫信跟媽媽說放假要回家了，媽媽回信說要做魚形麵包。', whisper: '霜月村的雪，現在多厚了呢……' },
      { id: 'sea', label: '去海邊', keys: ['海'], reply: '海、海邊！{self}從來沒看過海……好，就去！', emotion: 'surprised', later: '{self}開始準備去海邊的行李了……要帶陽傘，貓族的毛很怕曬。', whisper: '海，是什麼味道呢……' },
      { id: 'stay', label: '待在晨風鎮休息', keys: ['休息', '待在', '晨風'], reply: '待在晨風鎮……也好，可以每天睡到自然醒。', emotion: 'happy', later: '{self}決定長假待在鎮上了。狐嬸說要請{self}吃新菜。', whisper: '放假的時候，要睡到幾點呢……' },
    ] },
  { id: 'owlgift', kind: 'big', emotion: 'thinking',
    ask: '梟長的生日快到了，公會要合送一個禮物。{call}覺得送什麼好？',
    options: [
      { id: 'quill', label: '一支新羽毛筆', keys: ['羽毛筆', '筆'], reply: '新羽毛筆……梟長批公文用得到！很實用。', emotion: 'happy', later: '梟長收到羽毛筆了，他說「嗯」——然後一整天都在用。', whisper: '梟長的新羽毛筆，寫起來沙沙的……' },
      { id: 'cushion', label: '軟軟的靠墊', keys: ['靠墊', '墊'], reply: '靠墊！這樣梟長打瞌睡的時候就不會撞到桌子了。', emotion: 'happy', later: '梟長收到靠墊以後……打瞌睡的時間變長了。', whisper: '梟長抱著靠墊睡得好熟……' },
      { id: 'poster', label: '「不准打瞌睡」海報', keys: ['海報', '瞌睡'], reply: '噗……這個好。{self}來負責貼！', emotion: 'happy', later: '海報貼上去了，梟長看了很久……然後在海報下面睡著了。', whisper: '「不准打瞌睡」的海報，好像沒什麼用……' },
    ] },
];
const BY = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// 自己取的名字：1～maxLen 字，只能是中英數字（不能有我／你等指稱、標點、空白）
function cleanFree(text, max = 6) {
  const s = String(text || '').trim().replace(/^(就)?(叫|取名叫|取叫)(牠|它)?/, '').replace(/(吧|好了|好不好|如何|怎麼樣)?[！!。～~？?]*$/, '').replace(/^[「『"']|[」』"']$/g, '').trim();
  if (!s || s.length > max) return '';
  if (!/^[\p{Script=Han}A-Za-z0-9ー・]+$/u.test(s)) return '';
  if (/我|你|妳|您|冒險者|艾琳/.test(s)) return '';
  return s;
}

// 聊天裡說的話對到哪個選項：說出按鈕上的字或關鍵字；兩個以上都對到＝不確定（回 null）
function matchOption(q, text) {
  const t = String(text || '').replace(/\s/g, '');
  if (!t) return null;
  const hit = q.options.filter((o) => t.includes(o.label.replace(/\s/g, '')) || (o.keys || []).some((k) => t.includes(k)));
  if (hit.length === 1) return hit[0];
  const exact = hit.filter((o) => t.includes(o.label.replace(/\s/g, '')));
  return exact.length === 1 ? exact[0] : null;
}

// 現在適合問的題目：時段、星期、多久沒問；大決定一輩子問一次（回答過就不再問）
function fits(q, d) {
  const w = q.when || {};
  if (w.hours && !(d.getHours() >= w.hours[0] && d.getHours() < w.hours[1])) return false;
  if (w.days && !w.days.includes(d.getDay())) return false;
  return true;
}
function candidates(st, d, { cooldownDays = 21 } = {}) {
  const now = d.getTime();
  return QUESTIONS.filter((q) => {
    if (!fits(q, d)) return false;
    const ans = (st.answers || {})[q.id];
    if (q.kind === 'big') return !ans;
    const at = Math.max(ans ? ans.at || 0 : 0, (st.asked || {})[q.id] || 0);
    return !at || now - at >= cooldownDays * 86400000;
  });
}
// 挑一題：大決定大約每 5 天一次（還有沒問的才算）；其他時候問小事；有時段限制的那幾題，時候對了優先
function choose(st, d, rnd = Math.random, opts = {}) {
  const c = candidates(st, d, opts);
  if (!c.length) return null;
  const bigs = c.filter((q) => q.kind === 'big');
  const smalls = c.filter((q) => q.kind !== 'big');
  const lastBig = st.lastBigAt || 0;
  const wantBig = bigs.length && (!smalls.length || d.getTime() - lastBig >= 5 * 86400000);
  const pool = wantBig ? bigs : smalls;
  const timed = pool.filter((q) => q.when);
  const from = timed.length && rnd() < 0.6 ? timed : pool;
  return from[Math.floor(rnd() * from.length) % from.length];
}

// 已經做的決定 → 之後可以提起的一句（隔天以後、10 天內、還沒提過），一次一句
function dueLater(st, todayIso, now) {
  const out = [];
  for (const [id, a] of Object.entries(st.answers || {})) {
    const q = BY[id];
    if (!q || a.laterSaid || !a.day || a.day >= todayIso || now - (a.at || 0) > 10 * 86400000) continue;
    const opt = a.free ? q.free : q.options.find((o) => o.id === a.pick);
    if (opt && opt.later) out.push({ id, q, opt, a });
  }
  return out.sort((x, y) => (x.a.at || 0) - (y.a.at || 0));
}
// 待機小字：大決定一直記得；小事只記 3 天
function whispers(st, now) {
  const out = [];
  for (const [id, a] of Object.entries(st.answers || {})) {
    const q = BY[id];
    if (!q) continue;
    const opt = a.free ? q.free : q.options.find((o) => o.id === a.pick);
    if (opt && opt.whisper && (q.kind === 'big' || now - (a.at || 0) < 3 * 86400000)) out.push({ text: opt.whisper, pick: a.label });
  }
  return out;
}

// 很短、但不是名字的回話（不能拿來當鴿子的名字）
const NOT_NAME = /^(好|好啊|好喔|好的|嗯+|喔+|哦+|恩|可以|不要|不用|沒有|沒事|謝謝|謝啦|哈+|呵+|累|好累|好忙|在忙|晚點|等等|等一下|不知道|不曉得|還沒|再說|是|對|不是|ok|OK|好吧|算了|早安|午安|晚安|你好|嗨|hi|Hi)$/;

module.exports = { QUESTIONS, BY, NOT_NAME, cleanFree, matchOption, fits, candidates, choose, dueLater, whispers };
