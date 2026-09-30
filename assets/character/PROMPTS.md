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
| `disdain.png` | 貓娘・鄙視（俏皮的吐槽、不以為然） | 同上 |
| `mini.png` | 貓咪型態・平常（縮小化時，**必要**） | 1:1，建議 512×512 |
| `mini_alert.png` | 貓咪型態・有新訊息 | 同上 |

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
| disdain | `unimpressed deadpan expression, half-closed eyes (jitome) staring straight at the viewer, one eyebrow slightly raised, lips pressed into a small flat line with the corners turned down, chin slightly lifted, cat ears turned outward and flattened sideways, tail swishing to one side, playful teasing disdain, not angry` | 半瞇眼（ジト目）盯著鏡頭，一邊眉毛微挑，嘴巴抿成一條小直線、嘴角往下，下巴微抬，耳朵往兩側壓平，尾巴甩向一邊；俏皮的不以為然，不是生氣 |

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

**disdain.png（鄙視）**

```
這是我的角色定裝照。請畫同一個角色：同樣的臉、髮型、服裝、配件、畫風、構圖和畫面比例，背景維持純灰色平塗。
只改表情，手和卷軸維持原本的姿勢：
- 半瞇眼（ジト目），眼睛直直盯著鏡頭
- 一邊眉毛微微挑起，嘴巴抿成一條小直線、嘴角往下
- 下巴微微抬起，像在說「……你認真的嗎？」
- 貓耳往兩側壓平（飛機耳），尾巴甩向一邊
- 是俏皮的吐槽、不以為然：不要生氣、不要兇、不要臉紅，也不要加漫畫的陰影線
不要加文字或符號。
```

小提醒：

- 鄙視最容易畫成「生氣」，出現皺眉瞪人、露牙的話，補一句「表情再淡一點，比較像無言，不是生氣」。
- 害羞如果卷軸遮到整張臉，補一句「卷軸往下一點，只遮住嘴巴」。
- 兩張都挑「頭和身體位置最接近定裝照」的那張，對齊時比較不會變形。

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
   - 只加新的表情：`python tools/remove_bg.py shy disdain`（對齊到現有的 `assets/character/normal.png`，舊圖不動）
   - 需要先 `pip install "rembg[cpu]" opencv-python pillow numpy`
3. 去背後的 PNG 會出現在 `assets/character/`。舊的 `.svg` 可以不刪，PNG 會優先使用。
4. 右鍵 → 離開，再重新啟動。

還沒做的表情會暫時用相近的圖代替：害羞 → happy，鄙視 → thinking，其他 → normal。
