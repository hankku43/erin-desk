# 雜貨舖物品圖：AI 生成提示詞

禮物、吊飾、擺設、店員頭像原本是 `src/renderer/art.js` 用 SVG 畫的（粗海軍藍框、扁平漸層），跟艾琳的立繪畫風不搭，2026-10-07 換成 AI 生成的圖：幾個物品畫在同一張合輯，再去背、切割。

## 要做的圖（4 張合輯＋1 張選填）

| 合輯 | 內容（程式裡的 id） | 比例 |
|---|---|---|
| 1 禮物・吃喝 | 溫奶茶 `tea`、小魚乾 `fish`、魚形麵包 `fishbread`、珍珠奶茶 `bubble`、黃瓜 `cucumber` | 3:2 |
| 2 禮物・小物 | 藍鈴花束 `flower`、蓋了蠟封章的舊信封 `envelope`、紅緞帶 `ribbon`、遠方公會的蠟封章 `seal` | 1:1 |
| 3 吊飾 | 小銀鈴 `bell`、玻璃風鈴 `chime`、星星吊飾 `starcharm`、點星祭燈籠 `lantern` | 3:2 |
| 4 擺設 | 藍鈴花盆栽 `bluebell`、魚形麵包抱枕 `pillow`、鈴鐺撲滿 `piggy`、三號鴿子 `pigeon`、蠟封章木盒 `sealbox` | 3:2 |
| 5 店員頭像（選填） | 棉棉 `mian`、朵朵 `duo` | 3:2 |

## 怎麼生

1. **附上 `assets/character/normal.png` 當風格參考**（最重要，畫風才對得上）。
   - ChatGPT／Gemini：上傳 normal.png，再貼提示詞。
   - Midjourney：normal.png 當 `--sref`，加 `--ar 3:2 --no text, letters, numbers, shadow`。
   - 沒辦法附圖的工具：把每段第一句（Match the art style…）刪掉。
2. **第一張滿意後，後面幾張把它也一起附上當參考**，四張才會像同一套。
3. 背景是純灰。工具能直接輸出透明背景（例如 ChatGPT）的話，把 `plain solid flat medium gray background (#808080)` 換成 `transparent background` 更好。
4. 不用每張都完美：哪個物品畫壞、數量不對、黏在一起，用最後的「單獨重生一個」只重做那一個。
5. 生好放 `assets/raw/shop/`，用 `python tools/cut_sheet.py` 去背、切割、縮放到 `assets/shop/<id>.png`（禮物 96×96、擺設 144×144、吊飾 120×220、店員頭像 120×150）。
   - 合輯檔名固定：`sheet_food.png`、`sheet_small.png`、`sheet_hang.png`、`sheet_desk.png`、`sheet_twins.png`；物品位置寫在 `tools/cut_sheet.py` 的 `SHEETS` 表（排列跟這份提示詞一樣）。重新生成、排列不同時要改那張表。
   - 只重生一個：`python tools/cut_sheet.py --one 新圖.png tea gift`（種類 gift／desk／hang）。有透明塑膠或玻璃的加 `--key-only`。
   - `src/renderer/art.js` 的 `PNG` 清單裡有的 id 用圖，其他的用原本的 SVG。

---

## 1 禮物・吃喝（3:2）

```
Match the art style of the attached reference image (art style only — do not draw the character).
A sheet of 5 separate item icons for a cozy fantasy anime game shop,
arranged in a loose grid: 3 items on the top row, 2 items on the bottom row.
Top row, left to right:
- a cream-white ceramic mug with two tiny cat ears on the rim, filled with warm milk tea, thin wisps of steam
- three small golden-brown dried fish tied together with brown twine
- a golden-brown fish-shaped pastry (taiyaki) with a small bite taken out, showing sweet red bean filling
Bottom row, left to right:
- a tall glass of bubble milk tea with dark tapioca pearls at the bottom, a wide pink straw, and a paper sleeve with a little cat-ear doodle
- a single fresh green cucumber
Style: soft anime cel shading, delicate thin dark-brown lineart, gentle highlights, warm pastel colors,
clear bold silhouettes that stay readable at small icon size, not too many tiny details,
slight top-down three-quarter view, every item complete and uncropped,
each item centered in its own area with wide empty space between items, items never touch or overlap,
plain solid flat medium gray background (#808080), no shadows, no ground, no table,
no text, no labels, no numbers, no watermark, no frame, no border
```

## 2 禮物・小物（1:1）

```
Match the art style of the attached reference image (art style only — do not draw the character).
A sheet of 4 separate item icons for a cozy fantasy anime game shop, arranged in a 2 x 2 grid.
Top row, left to right:
- a small bouquet of bluebell flowers (drooping bell-shaped blue-violet blossoms on green stems), wrapped in kraft paper and tied with a cream ribbon
- an old yellowed parchment envelope with slightly worn corners, sealed with a round red wax seal embossed with a star
Bottom row, left to right:
- a glossy red satin ribbon tied in a neat bow with two long tails
- a vintage wax seal stamp with a dark wooden handle and a brass head, standing upright beside a round deep-teal wax seal stamped with an owl emblem
Style: soft anime cel shading, delicate thin dark-brown lineart, gentle highlights, warm pastel colors,
clear bold silhouettes that stay readable at small icon size, not too many tiny details,
slight top-down three-quarter view, every item complete and uncropped,
each item centered in its own area with wide empty space between items, items never touch or overlap,
plain solid flat medium gray background (#808080), no shadows, no ground, no table,
no text, no labels, no numbers, no watermark, no frame, no border
```

## 3 吊飾（3:2）

```
Match the art style of the attached reference image (art style only — do not draw the character).
A sheet of 4 separate hanging ornaments for a cozy fantasy anime game, in one row, left to right.
Each ornament hangs from a short thin cord that goes straight up, with a small loop at the top of the cord.
All four are about the same height, each filling about two-thirds of the image height.
- a small silver bell with bright white highlights and pale blue reflections, a little red bow where the cord attaches, a tiny gold ball clapper peeking out below
- a Japanese-style glass wind chime: a round frosted pale-aqua glass dome (not see-through) painted with small blue and pink flowers, a thin clapper, and a long blank cream paper strip hanging below with a small blue star drawn on it
- a polished golden five-pointed star charm with a smaller golden star dangling below it on a short chain
- a small round paper lantern in soft rose pink with wooden top and bottom caps, a warm glow inside, a short cream tassel at the bottom
Style: soft anime cel shading, delicate thin dark-brown lineart, gentle highlights, warm pastel colors,
clear bold silhouettes that stay readable at small size, not too many tiny details,
straight front view, every ornament complete and uncropped including the cord loop,
wide empty space between ornaments, they never touch or overlap,
plain solid flat medium gray background (#808080), no shadows, no ceiling, no hooks, no ground,
no text, no labels, no numbers, no watermark, no frame, no border
```

## 4 擺設（3:2）

```
Match the art style of the attached reference image (art style only — do not draw the character).
A sheet of 5 separate desk ornaments for a cozy fantasy anime game, things that sit on a reception counter,
arranged in a loose grid: 3 items on the top row, 2 items on the bottom row.
Top row, left to right:
- a small terracotta flower pot with a bluebell plant: drooping bell-shaped blue-violet flowers and fresh green leaves
- a soft plush cushion shaped like a golden fish-shaped pastry (taiyaki), with a simple cute face (dot eye, small smile, pink blush), puffy fabric with stitched seams
- a round golden bell-shaped coin bank with a coin slot on top and a small red ribbon bow, sitting on a little wooden base
Bottom row, left to right:
- a plump pale gray messenger pigeon with iridescent mint-green neck feathers, sleeping peacefully with eyes closed, tucked into a round loaf shape, a tiny brass message tube on its leg
- a small wooden keepsake box with its lid half open, holding several round wax seals in red, gold, blue and green on dark blue velvet
Style: soft anime cel shading, delicate thin dark-brown lineart, gentle highlights, warm pastel colors,
clear bold silhouettes that stay readable at small size, not too many tiny details,
slight three-quarter front view, every item complete and uncropped,
each item centered in its own area with wide empty space between items, items never touch or overlap,
plain solid flat medium gray background (#808080), no shadows, no table, no ground,
no text, no letter Z, no labels, no numbers, no watermark, no frame, no border
```

## 5 店員頭像（選填，3:2）

雲朵茶舖的兔族雙胞胎：姊姊棉棉（垂耳、穩重）、妹妹朵朵（立耳、活潑）。

```
Match the art style of the attached reference image (art style only — do not draw the same character).
Two separate head-and-shoulders portraits, side by side with a wide gap between them,
of rabbit-girl twin sisters who run a cozy tea shop in a fantasy town.
They are twins with similar faces: soft rose-pink eyes, pale pink inner ears, light blush,
cream aprons with a small cloud embroidery over white blouses, facing the viewer and turned slightly toward each other.
Left: the older sister — long drooping lop rabbit ears, soft cream-white wavy bob hair, calm gentle smile with softly half-closed eyes.
Right: the younger sister — tall upright rabbit ears, short milk-tea brown hair with a small side ponytail, big bright eyes, cheerful open-mouth smile.
Soft anime cel shading, delicate thin lineart, warm pastel colors,
whole head and both ears inside the frame with empty space above,
plain solid flat medium gray background (#808080), no shadows,
no text, no labels, no watermark, no frame, no border
```

## 單獨重生一個

把上面那一項的描述（`- ` 後面那句）貼進 `<…>`。吊飾把 `slight top-down three-quarter view` 換成 `straight front view, hanging from a short thin cord with a small loop at the top`。

```
Match the art style of the attached reference image (art style only — do not draw the character).
A single item icon for a cozy fantasy anime game shop: <item description>.
Style: soft anime cel shading, delicate thin dark-brown lineart, gentle highlights, warm pastel colors,
clear bold silhouette that stays readable at small icon size, not too many tiny details,
slight top-down three-quarter view, complete and uncropped, centered with wide empty space around it,
plain solid flat medium gray background (#808080), no shadows, no ground, no table,
no text, no labels, no numbers, no watermark, no frame, no border
```
