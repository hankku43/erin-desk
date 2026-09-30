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
5. **統一尺寸**：6 張表情要同樣的畫布大小、角色放在同樣位置，切換表情時才不會跳動。

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

1. 去背後的 PNG 照上面的檔名放進 `assets/character/`。
2. 刪掉或移走同名的 `.svg`，也可以不刪，PNG 會優先使用。
3. 右鍵 → 離開，再重新啟動。
