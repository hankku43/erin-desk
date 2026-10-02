# 角色圖片 AI 生成提示詞：白髮藍眼貓娘＋貓咪縮圖

## 要做的圖

| 檔名 | 內容 | 比例／尺寸 |
|---|---|---|
| `normal.png` | 貓娘・平常（**必要**） | 3:4，建議 900×1200 |
| `happy.png` | 貓娘・開心 | 同上 |
| `cheer.png` | 貓娘・歡呼（交付任務、升級時） | 同上 |
| `thinking.png` | 貓娘・思考 | 同上 |
| `surprised.png` | 貓娘・驚訝 | 同上 |
| `worried.png` | 貓娘・擔心（逾期時） | 同上 |
| `shy.png` | 貓娘・害羞（被稱讚、被說中心事） | 同上 |
| `disdain.png` | 貓娘・鄙視（ゴミを見るような目：看垃圾一樣的冷眼） | 同上 |
| `mini.png` | 貓咪型態・平常（縮小化時，**必要**） | 1:1，建議 512×512 |
| `mini_alert.png` | 貓咪型態・有新訊息 | 同上 |
| `blink.png`、`write.png`、`tea.png`、`stretch.png`、`wave.png`、`sleep.png` | 待機動作圖（選填，見下面「待機動作圖」） | 跟貓娘立繪一樣 |

## 生成步驟

1. **先做 `normal`**。多生幾張，挑一張最喜歡的當「定裝照」。
2. **其他表情都拿定裝照去改**，不要每張重新生成，不然每張臉都會不一樣：
   - ChatGPT／Gemini：上傳定裝照，說「同一個角色、同樣姿勢和構圖，只把表情改成……」
   - Midjourney：用定裝照當角色參考（`--cref` 或 Omni Reference），權重調高
   - Stable Diffusion：img2img 或 inpaint 只重畫臉部，也可以加 IP-Adapter
3. **貓咪型態也用定裝照當參考**，讓毛色、眼睛顏色和項圈跟貓娘對得上。
4. **去背**：大多數 AI 沒辦法直接輸出透明背景，所以提示詞會要求純灰色背景，生成後再用 remove.bg、Photoshop「移除背景」或 `rembg` 去背，存成 **PNG**。
   - 不要用白色或綠色背景：白頭髮會跟白背景黏在一起，綠背景會讓白髮邊緣泛綠。
5. **統一尺寸**：所有表情要同樣的畫布大小、角色放在同樣位置，切換表情時才不會跳動。`tools/remove_bg.py` 會一起處理去背和對齊（見最後一段）。

## 貓娘立繪：共用提示詞

每張都用這段，最後接上各表情的補充句子。

```
anime style illustration, upper body portrait from the waist up, front view, facing the viewer, centered,
a cat girl who works as a guild receptionist,
long fluffy white hair with soft bangs, bright sky-blue eyes, white cat ears with pale pink inner ears,
a fluffy white cat tail visible beside her waist,
cream white blouse, navy blue vest, small red ribbon bow tie,
a small gold shield-shaped guild badge with a star on the vest,
holding a rolled parchment quest scroll in one hand,
cute, friendly, clean lineart, cel shading, soft pastel colors,
whole head and ears inside the frame with some empty space above,
plain solid flat medium gray background, no text, no watermark
```

用 Stable Diffusion 的話，再加上負面提示詞：

```
lowres, blurry, bad anatomy, extra fingers, extra arms, human ears, four ears, cropped head, cut off ears,
text, watermark, signature, busy background, gradient background, multiple characters
```

## 各表情補充

改圖時可以直接用中文說明；要生成新圖的話，把英文句子接在共用提示詞後面。

| 檔名 | 接在最後的英文 | 中文說明（改圖時用） |
|---|---|---|
| normal | `gentle closed-mouth smile, eyes open, looking at the viewer, ears relaxed` | 溫柔微笑、看著鏡頭，耳朵自然放鬆 |
| happy | `big happy smile, eyes closed in upward curves (^_^), light blush, ears perked up` | 開心大笑，眼睛瞇成 ^_^，臉紅，耳朵豎起 |
| cheer | `very excited, one fist raised in celebration, open-mouth smile, small sparkles around her, tail raised high` | 單手握拳歡呼，張嘴笑，身旁有星星閃光，尾巴翹高 |
| thinking | `thinking pose, index finger on her chin, eyes looking up to the side, slight pout, one ear tilted` | 食指抵下巴，眼睛往斜上看，微嘟嘴，一邊耳朵歪斜 |
| surprised | `surprised, wide round eyes, small open mouth, ears standing straight up, tail fur puffed out` | 睜大眼睛，嘴巴小小張開，耳朵直豎，尾巴毛炸開 |
| worried | `worried, eyebrows drawn together, nervous small smile, ears drooping flat, a small sweat drop` | 眉頭皺起，勉強的苦笑，耳朵垂下，額頭一滴汗 |
| shy | `shy and flustered, deep blush across her cheeks and nose, eyes glancing away to the side, holding the rolled scroll up in front of her mouth to hide an embarrassed smile, cat ears folded down to the sides, tail curled in front of her waist, a few thin blush lines on her cheeks` | 臉頰到鼻樑整片泛紅，眼神往旁邊飄，把卷軸舉到嘴巴前面遮住害羞的笑，耳朵往兩側垂低，尾巴捲到腰前 |
| disdain | `looking at the viewer as if she were looking at garbage (gomi wo miru you na me), cold contemptuous stare, chin raised and head tilted back slightly so she looks down at the viewer, half-lidded eyes, dull eyes with no highlights, small pupils, soft dark shadow over the upper half of her face down to her eyes, expressionless face, mouth closed in a flat line with the corners slightly down, eyebrows level (not angry), cat ears pinned back, tail hanging still` | 日本動漫的「ゴミを見るような目」：下巴抬起、從上往下俯視，半瞇眼、眼睛沒有高光、瞳孔縮小，額頭到眼睛一層陰影，面無表情、嘴巴閉成一直線，耳朵往後壓平，尾巴垂著不動 |

### 害羞、鄙視：改圖時直接貼的完整說明

用 ChatGPT／Gemini 改圖時，上傳 **`assets/raw/normal.png`**（還帶灰背景的原圖）當參考，比上傳去背後的圖更穩：透明背景常被當成黑色或白色，白頭髮邊緣會跑掉。

**shy.png（害羞）**

```
這是我的角色定裝照。請畫同一個角色：同樣的臉、髮型、服裝、配件、畫風、構圖和畫面比例，背景維持純灰色平塗。
只改表情和拿卷軸的那隻手：
- 害羞：臉頰到鼻樑整片泛紅，臉頰上有幾條細細的紅暈斜線
- 眼神往旁邊飄，不敢看鏡頭，眉毛微微往下
- 把手上的卷軸舉到嘴巴前面，遮住害羞的笑（卷軸不要擋到眼睛）
- 貓耳往兩側垂低，尾巴捲到腰前
不要加文字、愛心或其他符號。
```

**disdain.png（鄙視：ゴミを見るような目）**

```
這是我的角色定裝照。請畫同一個角色：同樣的臉、髮型、服裝、配件、畫風、構圖、鏡頭角度和畫面比例，背景維持純灰色平塗。
只改表情，手和卷軸維持原本的姿勢：
- 日本動漫的「ゴミを見るような目」：像在看垃圾一樣，冷冰冰、毫無溫度的鄙視眼神
- 下巴微微抬起、頭稍微往後仰，半瞇著眼從上往下俯視鏡頭
- 眼睛沒有高光、瞳孔縮小，眼神空洞冷淡
- 額頭到眼睛落下一層淡淡的陰影（漫畫「臉上一片陰影」的效果），陰影只畫在臉上
- 面無表情，嘴巴緊閉成一條線，嘴角微微往下
- 眉毛平直、稍微壓低，不要皺眉，不是生氣
- 貓耳往後壓平，尾巴垂著不動
- 臉不要紅、不要笑、不要流汗
不要加文字、符號，頭上的背景也不要加直線。
```

用 Stable Diffusion 的話，可以再加這些標籤：`jitome, half-closed eyes, empty eyes, no highlights, looking down, shaded face, expressionless, disgust, contempt`

小提醒：

- **畫成生氣**（皺眉瞪人、露牙）：補一句「不是生氣，是冷漠：眉毛放平、嘴巴閉上」。
- **畫成想睡**（半瞇眼但眼神很軟）：補一句「不是想睡，眼神要冷，往下看著我；瞳孔再小一點，不要高光」。
- **陰影太重**（整張臉黑掉）：補一句「陰影淡一點，只蓋到眼睛上方，眼睛要看得清楚」。
- **頭仰太多**（位置跟定裝照差很多）：補一句「頭只要往後仰一點點，位置不要動」。
- 害羞如果卷軸遮到整張臉，補一句「卷軸往下一點，只遮住嘴巴」。
- 兩張都挑「頭和身體位置最接近定裝照」的那張，對齊時比較不會變形。

## 待機動作圖（選填）

艾琳待機時會自己動：打瞌睡、醒來揮手、喝奶茶、寫小本子、伸懶腰、眨眼。**沒有這些圖也會動**（改用表情加上頭上的泡泡）；放了圖，那個動作就會換成這張圖演出來，生好一張就多一個動作。

| 檔名 | 什麼時候用 | 重點 | 建議順序 |
|---|---|---|---|
| `blink.png` | 每隔幾秒眨一下眼 | **跟 normal 一模一樣，只有眼睛閉上** | 1（效果最明顯） |
| `write.png` | 你在忙的時候，她低頭寫小本子 | 拿筆記本和羽毛筆、低頭 | 2 |
| `tea.png` | 下午三點的奶茶時間 | 雙手捧著奶茶杯 | 3 |
| `stretch.png` | 早上、坐太久、下午想睡時伸懶腰打哈欠 | 雙手往上伸、閉眼打哈欠 | 4 |
| `wave.png` | 你離開座位回來時揮手 | 一隻手舉起來揮 | 5 |
| `sleep.png` | 你離開座位時打瞌睡 | 閉眼、頭微微歪（沒有的話用 `blink.png` 代替） | 6 |

改圖的方法跟害羞、鄙視一樣：上傳 **`assets/raw/normal.png`**（還帶灰背景的原圖），貼上下面的英文說明（ChatGPT、Gemini 都看得懂）。每段開頭那幾句都一樣，是要它**別動構圖**：切換動作時頭和身體的位置一樣，才不會看起來在跳。

**blink.png（眨眼）**

```
This is my character reference. Draw the exact same character with the same face, hair, outfit, accessories, art style, composition, camera angle and aspect ratio. Keep the head and body in exactly the same position. Keep the plain flat gray background.
Change ONLY the eyes: both eyes gently closed, as if caught mid-blink, with soft downward-curved eyelashes.
Everything else must stay identical: mouth, eyebrows, blush, ears, hair, hands and the scroll.
No text, no symbols.
```

**write.png（寫小本子）**

```
This is my character reference. Draw the exact same character with the same face, hair, outfit, accessories, art style, composition, camera angle and aspect ratio. Keep the head and body in the same position as much as possible. Keep the plain flat gray background.
Change ONLY her hands, gaze and expression:
- She holds a small leather notebook in one hand and writes in it with a feather quill held in the other hand (no scroll in this image).
- She looks down at the notebook with a focused, slightly happy expression and a small smile.
- Tilt her head down only slightly; her face must still be clearly visible.
No text or symbols, and no writing visible on the notebook pages.
```

**tea.png（奶茶時間）**

```
This is my character reference. Draw the exact same character with the same face, hair, outfit, accessories, art style, composition, camera angle and aspect ratio. Keep the head and body in the same position as much as possible. Keep the plain flat gray background.
Change ONLY her hands and expression:
- Put the scroll away. Instead, she holds a white mug of milk tea with both hands in front of her chest.
- Two or three thin wisps of steam rise from the mug.
- She has a blissful closed-eye smile, a light blush, and relaxed ears.
No text or symbols.
```

**stretch.png（伸懶腰、打哈欠）**

```
This is my character reference. Draw the exact same character with the same face, hair, outfit, accessories, art style, composition, camera angle and aspect ratio. Keep the head and body in exactly the same position. Keep the plain flat gray background.
Change ONLY her arms and expression:
- She stretches with both arms raised straight above her head (no scroll in this image). Both hands must be fully inside the frame.
- Eyes closed, yawning with her mouth open, a tiny tear at the corner of one eye.
- Cat ears stretched back, tail standing straight up.
No text or symbols.
```

**wave.png（揮手）**

```
This is my character reference. Draw the exact same character with the same face, hair, outfit, accessories, art style, composition, camera angle and aspect ratio. Keep the head and body in the same position as much as possible. Keep the plain flat gray background.
Change ONLY her free hand and expression:
- Raise her free hand beside her face and wave at the viewer, palm facing forward.
- Bright happy smile, eyes open and looking at the viewer, ears perked up.
- Her other hand keeps holding the scroll exactly as in the reference.
No text or symbols.
```

**sleep.png（打瞌睡）**

```
This is my character reference. Draw the exact same character with the same face, hair, outfit, accessories, art style, composition, camera angle and aspect ratio. Keep the head and body in the same position as much as possible. Keep the plain flat gray background.
Change ONLY her expression and head angle:
- She is dozing off: both eyes closed, a very relaxed face, mouth slightly open.
- Tilt her head slightly to one side (only a little).
- Cat ears relaxed and drooping to the sides, tail curled up.
- She hugs the scroll loosely against her chest.
Do not draw any "Z" letters or speech bubbles (the app adds those).
```

用 Stable Diffusion 的話，把這些英文接在共用提示詞後面（write、tea、stretch 要拿掉共用提示詞裡的「holding a rolled parchment quest scroll」；blink、wave、sleep 照樣留著）：

| 檔名 | 接在最後的英文 |
|---|---|
| blink | `eyes gently closed mid-blink, soft curved eyelashes, gentle closed-mouth smile, everything else the same as the reference` |
| write | `holding a small leather notebook in one hand and a feather quill in the other, writing in it, looking down at the notebook with a focused little smile` |
| tea | `holding a white mug of milk tea with both hands in front of her chest, thin wisps of steam, blissful closed-eye smile, light blush` |
| stretch | `stretching with both arms raised above her head, eyes closed, yawning with mouth open, a tiny tear at the corner of one eye, ears stretched back, tail straight up, hands inside the frame` |
| wave | `waving at the viewer with her free hand raised beside her face, palm facing forward, bright open-eyed smile, ears perked up` |
| sleep | `dozing off, eyes closed, relaxed sleepy face, mouth slightly open, head tilted slightly to one side, ears drooping, holding the scroll loosely against her chest` |

小提醒：

- **blink 只會用到眼睛**：`remove_bg.py` 處理 blink 時，只把閉上的眼睛那一塊貼到 normal 上，其他地方跟 normal 一模一樣，所以頭髮、手、身體畫得稍微不一樣也沒關係，**只要眼睛的位置跟定裝照差不多**。眼睛位置差很多（頭歪了、臉變大）才需要重做；重做時可以補一句 `Do not change anything except the eyes.`，工具能框選局部修改的話（ChatGPT 有）只框兩隻眼睛最穩。
- **stretch 手跑出畫面外**：補一句 `Raise the hands only a little above the head. Both hands must be completely inside the frame.`
- 每張都挑「頭和身體位置最接近定裝照」的那張。
- 放進程式：原圖放 `assets/raw/`，跑 `python tools/remove_bg.py blink write`（只寫你做好的那幾張），再重新啟動。

## 貓咪型態（縮小化用）

縮圖在桌面上只會顯示 140×140px，所以要**造型簡單、輪廓清楚、線條粗**，縮小後才認得出來。

**mini.png**

```
chibi style, a small round fluffy white cat, bright sky-blue eyes, pale pink inner ears and nose,
sitting and facing the viewer, relaxed happy expression,
wearing a thin red ribbon collar with a tiny gold shield-shaped charm,
simple rounded shape, thick clean outline, flat cel shading, sticker icon style, readable at small size,
whole body inside the frame, plain solid flat medium gray background, no text, no watermark
```

**mini_alert.png**：用 mini 當參考圖修改。

```
same white cat, sitting upright, ears perked straight up, eyes wide and sparkling,
one front paw raised as if waving, mouth open as if meowing
```

中文說明：同一隻貓，耳朵豎直、眼睛發亮，舉起一隻前腳揮手，像在喵喵叫。畫面上不用加驚嘆號，程式會自己加。

## 放進程式

1. 把生成的原圖（灰背景）照上面的檔名放進 `assets/raw/`。
2. 去背＋對齊：
   - 全部重做：`python tools/remove_bg.py`（所有表情一起重新對齊，畫布可能會變）
   - 只加新的表情或動作圖：`python tools/remove_bg.py shy disdain`、`python tools/remove_bg.py blink tea`（對齊到現有的 `assets/character/normal.png`，舊圖不動）
   - 需要先 `pip install -r tools/requirements.txt`（套件版本都鎖好了）
3. 去背後的 PNG 會出現在 `assets/character/`。舊的 `.svg` 可以不刪，PNG 會優先使用。
4. 右鍵 → 離開，再重新啟動。

還沒做的表情會暫時用相近的圖代替：害羞 → happy，鄙視 → thinking，其他 → normal。
