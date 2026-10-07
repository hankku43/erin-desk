# 雜貨舖物品圖：合輯去背＋切割＋縮放（assets/raw/shop → assets/shop）
# 需要：pip install -r tools/requirements.txt（跟 remove_bg.py 一樣）
#
#   python tools/cut_sheet.py                    全部合輯重做
#   python tools/cut_sheet.py food desk          只做這幾張合輯
#   python tools/cut_sheet.py --one 新茶杯.png tea gift
#                                                單獨重生的一張圖（整張就是一個物品）；種類 gift／desk／hang
#   加 --key-only 只用背景色去背（有透明塑膠、玻璃時用，見下面）
#
# 去背：AI 圖的背景是一整片灰（#777 左右），用「跟背景色差多少」算透明度（煙、透明杯蓋會是半透明），
#       再用 rembg（isnet-general-use）補回物品裡面剛好跟背景一樣灰的地方（鴿子翅膀、銀鈴的陰影）。
#       透明的東西（珍奶杯蓋）rembg 會整塊當成實心 → 那張合輯用 key_only。
#       半透明的邊緣扣掉灰色（color decontamination），放在任何底色上都不會有灰邊。
# 切割：透明度 > 0.15 的連通區塊，指派給最近的物品中心（SHEETS 表裡的相對座標）；碎屑、繩子跟著最近的物品。
# 輸出（畫面大小的 2 倍左右）：
#   gift 96×96 置中｜desk 144×144 底部貼齊（放在艾琳腳邊）｜hang 120×220 繩子對準中線、上端淡出（不會像從半空中垂下來）
#   twins：店員頭像 120×150，圓形底色在下方、頭頂和耳朵可以超出圓（mian／duo）；
#          半身 mian_bust／duo_bust 高 400（下面淡出，攤位招牌、抽卡、外送、道賀用）
import os, sys, math, numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..', 'assets', 'raw', 'shop')
OUT = os.path.join(HERE, '..', 'assets', 'shop')

SIZE = {'gift': (96, 96), 'desk': (144, 144), 'hang': (120, 220)}

# 每張合輯：檔名、種類、物品中心（相對座標 0～1，看圖量的）
SHEETS = {
    'food': ('sheet_food.png', 'gift', True, [('tea', .18, .30), ('fish', .50, .28), ('fishbread', .83, .29), ('bubble', .30, .74), ('cucumber', .67, .74)]),
    'small': ('sheet_small.png', 'gift', False, [('flower', .26, .26), ('envelope', .75, .27), ('ribbon', .26, .69), ('seal', .75, .69)]),
    'hang': ('sheet_hang.png', 'hang', False, [('bell', .13, .43), ('chime', .37, .49), ('starcharm', .60, .45), ('lantern', .86, .50)]),
    'desk': ('sheet_desk.png', 'desk', False, [('bluebell', .17, .28), ('pillow', .50, .30), ('piggy', .82, .28), ('pigeon', .32, .74), ('sealbox', .72, .73)]),
}
# 店員頭像：圓的中心與直徑（原圖像素）、底色
TWINS = ('sheet_twins.png', [('mian', 440, 400, 560, (223, 236, 250)), ('duo', 1290, 425, 560, (253, 228, 234))])
# 店員半身（攤位招牌、抽卡、外送、道賀用）：原圖的左右範圍（兩個人用同一個縮放，頭的高度才對得上）、
# 碰到原圖邊緣的那一側（那裡是被切掉的袖子，淡出）
BUSTS = [('mian', 0, 790, 'left'), ('duo', 940, 1672, 'right')]
BUST_H = 400

_sess = None
def rembg_mask(pil):
    global _sess
    from rembg import new_session, remove
    if _sess is None: _sess = new_session('isnet-general-use')
    return np.asarray(remove(pil, session=_sess, only_mask=True)).astype(np.float32) / 255.0

def matte(path, key_only=False):
    """回傳 RGBA float（0～1 透明度、已扣掉灰色的顏色）"""
    pil = Image.open(path).convert('RGB')
    rgb = np.asarray(pil).astype(np.float32)
    edge = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)
    d = np.sqrt(((rgb - bg) ** 2).sum(-1))
    a = np.clip((d - 7) / 25, 0, 1)             # 跟背景差 7 以內＝背景，差 32 以上＝實心
    if not key_only:
        r = rembg_mask(pil)
        r = cv2.erode(r, np.ones((3, 3), np.uint8))  # 往內縮一點，邊緣交給色差
        a = np.maximum(a, r)
    a[a < 0.04] = 0
    a3 = a[..., None]
    F = np.where(a3 > 0.02, (rgb - (1 - a3) * bg) / np.maximum(a3, 0.02), rgb)
    return np.dstack([np.clip(F, 0, 255), a * 255]), bg

def split(rgba, items):
    """連通區塊 → 指派給最近的物品；回傳 {id: 只留這個物品的 RGBA}"""
    h, w = rgba.shape[:2]
    solid = (rgba[..., 3] > 0.15 * 255).astype(np.uint8)
    grown = cv2.dilate(solid, np.ones((9, 9), np.uint8))  # 讓繩子、碎屑、煙連在一起
    n, lab, stats, cent = cv2.connectedComponentsWithStats(grown)
    centers = np.array([[x * w, y * h] for _, x, y in items])
    owner = {}
    big = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 0.002 * w * h]
    for i in big:
        owner[i] = int(np.argmin(((centers - cent[i]) ** 2).sum(1)))
    # 小碎片：離哪個物品的外框近就跟誰，太遠（> 4% 寬）就丟掉
    boxes = {}
    for i, k in owner.items():
        x, y, bw, bh = stats[i, :4]
        b = boxes.get(k, [x, y, x + bw, y + bh])
        boxes[k] = [min(b[0], x), min(b[1], y), max(b[2], x + bw), max(b[3], y + bh)]
    for i in range(1, n):
        if i in owner: continue
        cx, cy = cent[i]
        best, bd = None, 1e9
        for k, (x0, y0, x1, y1) in boxes.items():
            dd = np.hypot(max(x0 - cx, 0, cx - x1), max(y0 - cy, 0, cy - y1))
            if dd < bd: best, bd = k, dd
        if best is not None and bd < 0.04 * w: owner[i] = best
    out = {}
    for k, (iid, _, _) in enumerate(items):
        labs = [i for i, o in owner.items() if o == k]
        if not labs:
            print(f'  ⚠ 找不到 {iid}'); continue
        m = np.isin(lab, labs)
        one = rgba.copy(); one[~m, 3] = 0
        ys, xs = np.nonzero(one[..., 3] > 0)
        out[iid] = one[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        print(f'  {iid}: {xs.max() - xs.min() + 1}×{ys.max() - ys.min() + 1}（{len(labs)} 塊）')
    if len(big) > len(items): print(f'  ⚠ 大區塊 {len(big)} 個，比物品數 {len(items)} 多：可能有物品被切成兩半或多畫了東西')
    return out

def resize(rgba, s):
    """縮放：先轉成預乘透明度（RGBa），邊緣才不會帶出暗邊"""
    im = Image.fromarray(rgba.round().clip(0, 255).astype(np.uint8), 'RGBA').convert('RGBa')
    nw, nh = max(1, round(rgba.shape[1] * s)), max(1, round(rgba.shape[0] * s))
    return im.resize((nw, nh), Image.LANCZOS).convert('RGBA')

def place(item, kind):
    W, H = SIZE[kind]
    h, w = item.shape[:2]
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if kind == 'hang':
        a = item[..., 3] > 128
        top = a[: max(4, h // 20)]
        cols = np.nonzero(top.any(0))[0]
        cx = cols.mean() if len(cols) else w / 2  # 繩子最上面的位置 → 對準畫布中線
        half = max(cx, w - cx)
        rows = a.sum(1)
        wide = np.nonzero(rows > 0.3 * rows.max())[0]
        cord = wide[0] if len(wide) else 0          # 繩子到這一列為止（下面是物品本體）
        # 繩子最多佔畫布上面 22%：繩子太長的（星星、燈籠）把本體放大，上面多的繩子切掉（反正會淡出）
        s = min(max((H - 2) / h, 0.78 * H / max(h - cord, 1)), (W / 2 - 2) / half)
        im = resize(item, s)
        canvas.alpha_composite(im, (int(round(W / 2 - cx * s)), min(0, H - 2 - im.height)))
        # 上端淡出：繩子那段（物品寬度還很窄的地方）的上 70% 慢慢變透明
        A = np.asarray(canvas).astype(np.float32)
        rows = (A[..., 3] > 128).sum(1)
        wide = np.nonzero(rows > 0.3 * rows.max())[0]
        end = (wide[0] if len(wide) else H // 4) * 0.7
        y = np.arange(H, dtype=np.float32)
        t = np.clip(y / max(end, 1), 0, 1)
        A[..., 3] *= (t * t * (3 - 2 * t))[:, None]
        return Image.fromarray(A.astype(np.uint8), 'RGBA')
    m = 3 if kind == 'gift' else 4
    s = min((W - 2 * m) / w, (H - 2 * m) / h)
    im = resize(item, s)
    x = (W - im.width) // 2
    y = (H - im.height) // 2 if kind == 'gift' else H - 2 - im.height  # 擺設：底部貼齊
    canvas.alpha_composite(im, (x, y))
    return canvas

def twins():
    fn, people = TWINS
    path = os.path.join(RAW, fn)
    if not os.path.exists(path): return
    print(fn)
    rgba, _ = matte(path, key_only=True)  # 頭髮邊緣用色差最乾淨
    W, H, R = 120, 150, 60
    cy0 = H - R  # 圓心
    for iid, cx, cy, dia, col in people:
        s = 2 * R / dia
        # 原圖裡要用到的範圍：圓的外框，上面多留出「超出圓」的空間
        x0, y0 = cx - dia / 2, cy - dia / 2 - (cy0 - R) / s
        X0, Y0 = math.floor(x0), math.floor(y0)
        crop = np.zeros((int(H / s) + 2, int(W / s) + 2, 4), np.float32)
        sx0, sy0 = max(0, X0), max(0, Y0)
        sx1, sy1 = min(rgba.shape[1], X0 + crop.shape[1]), min(rgba.shape[0], Y0 + crop.shape[0])
        crop[sy0 - Y0:sy1 - Y0, sx0 - X0:sx1 - X0] = rgba[sy0:sy1, sx0:sx1]
        im = resize(crop, s).crop((0, 0, W, H))
        A = np.asarray(im).astype(np.float32)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        dist = np.hypot(xx + 0.5 - W / 2, yy + 0.5 - cy0)
        inside = np.clip(R - dist, 0, 1)                         # 圓（反鋸齒）
        keep = np.where(yy < cy0, 1.0, inside)                   # 圓心以上可以超出圓（頭髮、耳朵）
        A[..., 3] *= keep
        disc = np.zeros((H, W, 4), np.float32)
        ring = np.clip(1 - np.abs(dist - (R - 1.5)) / 1.2, 0, 1)
        disc[..., :3] = col
        disc[..., 3] = inside * 255
        darker = np.array(col, np.float32) * 0.82
        disc[..., :3] = disc[..., :3] * (1 - ring[..., None]) + darker * ring[..., None]
        base = Image.fromarray(disc.astype(np.uint8), 'RGBA')
        base.alpha_composite(Image.fromarray(A.clip(0, 255).astype(np.uint8), 'RGBA'))
        base.save(os.path.join(OUT, f'{iid}.png'), optimize=True)
        print(f'  {iid}.png')
    # 半身：整張高度一起縮放；下面 24% 淡出（原圖在腰部被切掉），碰到原圖邊緣的那側也淡出
    sh = rgba.shape[0]
    s = BUST_H / sh
    for iid, x0, x1, cut in BUSTS:
        im = resize(rgba[:, x0:x1], s)
        A = np.asarray(im).astype(np.float32)
        h, w = A.shape[:2]
        y = np.arange(h, dtype=np.float32)
        t = np.clip((h - 1 - y) / (0.24 * h), 0, 1)
        A[..., 3] *= (t * t * (3 - 2 * t))[:, None]
        x = np.arange(w, dtype=np.float32)
        side = np.clip((x if cut == 'left' else (w - 1 - x)) / (0.10 * w), 0, 1)
        lower = np.clip((y - 0.55 * h) / (0.15 * h), 0, 1)[:, None]   # 只有下半身（袖子）那段淡出，頭髮不動
        A[..., 3] *= 1 - lower * (1 - (side * side * (3 - 2 * side))[None, :])
        ys, xs = np.nonzero(A[..., 3] > 8)
        out = Image.fromarray(A.clip(0, 255).astype(np.uint8), 'RGBA').crop((xs.min(), 0, xs.max() + 1, h))
        out.save(os.path.join(OUT, f'{iid}_bust.png'), optimize=True)
        print(f'  {iid}_bust.png {out.width}×{out.height}')

def do_sheet(key):
    fn, kind, key_only, items = SHEETS[key]
    path = os.path.join(RAW, fn)
    if not os.path.exists(path):
        print(f'略過 {fn}（沒有這個檔）'); return
    print(fn)
    rgba, bg = matte(path, key_only)
    for iid, item in split(rgba, items).items():
        place(item, kind).save(os.path.join(OUT, f'{iid}.png'), optimize=True)

def do_one(fn, iid, kind, key_only):
    path = fn if os.path.exists(fn) else os.path.join(RAW, fn)
    rgba, _ = matte(path, key_only)
    item = split(rgba, [(iid, .5, .5)])[iid]
    place(item, kind).save(os.path.join(OUT, f'{iid}.png'), optimize=True)
    print(f'  {iid}.png')

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    ko = '--key-only' in sys.argv
    if '--one' in sys.argv:
        do_one(args[0], args[1], args[2], ko)
    else:
        for k in (args or list(SHEETS) + ['twins']):
            if k == 'twins': twins()
            else: do_sheet(k)
