# 批次去背＋去灰邊＋對齊＋統一畫布（assets/raw → assets/character）
# 需要：pip install "rembg[cpu]" opencv-python pillow numpy
#
#   python tools/remove_bg.py              全部重做（所有表情一起對齊，畫布可能會變）
#   python tools/remove_bg.py shy disdain  只加新的表情：對齊到現有的 assets/character/normal.png，舊圖不動
import os, sys, numpy as np, cv2
from PIL import Image
from rembg import new_session, remove

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..', 'assets', 'raw')
OUT = os.path.join(HERE, '..', 'assets', 'character')
os.makedirs(OUT, exist_ok=True)
sess = new_session('isnet-anime')

def matte(name):
    im = Image.open(os.path.join(RAW, name + '.png')).convert('RGB')
    m = remove(im, session=sess, only_mask=True)
    rgb = np.asarray(im).astype(np.float32)
    a = np.asarray(m).astype(np.float32) / 255.0
    # 背景色：確定是背景的像素中位數
    bg = np.median(rgb[a < 0.02], axis=0) if (a < 0.02).sum() > 1000 else np.array([112, 112, 112], np.float32)
    # 去灰邊（color decontamination）：C = aF + (1-a)B → F = (C - (1-a)B) / a
    a3 = a[..., None]
    F = np.where(a3 > 0.02, (rgb - (1 - a3) * bg) / np.maximum(a3, 0.02), rgb)
    F = np.clip(F, 0, 255)
    a = np.where(a < 0.03, 0, a)
    rgba = np.dstack([F, a * 255]).astype(np.uint8)
    return rgba, bg

def align(src, ref, pad):
    """把 src 對齊到 ref（相似變換：縮放+旋轉+平移），用 ORB 特徵 + RANSAC"""
    g1 = cv2.cvtColor(src[..., :3], cv2.COLOR_RGB2GRAY)
    g2 = cv2.cvtColor(ref[..., :3], cv2.COLOR_RGB2GRAY)
    m1 = (src[..., 3] > 128).astype(np.uint8) * 255
    m2 = (ref[..., 3] > 128).astype(np.uint8) * 255
    orb = cv2.ORB_create(6000)
    k1, d1 = orb.detectAndCompute(g1, m1)
    k2, d2 = orb.detectAndCompute(g2, m2)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    ms = bf.knnMatch(d1, d2, k=2)
    good = [m for m, n in (x for x in ms if len(x) == 2) if m.distance < 0.75 * n.distance]
    p1 = np.float32([k1[m.queryIdx].pt for m in good])
    p2 = np.float32([k2[m.trainIdx].pt for m in good]) + pad
    M, inl = cv2.estimateAffinePartial2D(p1, p2, method=cv2.RANSAC, ransacReprojThreshold=4)
    s = np.sqrt(M[0, 0] ** 2 + M[1, 0] ** 2)
    return M, s, int(inl.sum()), len(good)

def group(names, ref_name, out_h, square=False):
    mats = {n: matte(n)[0] for n in names}
    ref = mats[ref_name]
    H, W = ref.shape[:2]
    pad = int(max(H, W) * 0.15)
    CW, CH = W + 2 * pad, H + 2 * pad
    warped = {}
    for n in names:
        if n == ref_name:
            M = np.float32([[1, 0, pad], [0, 1, pad]]); info = 'ref'
        else:
            M, s, ninl, ng = align(mats[n], ref, pad)
            info = f'scale={s:.3f} inliers={ninl}/{ng} t=({M[0,2]-pad:.0f},{M[1,2]-pad:.0f})'
            if ninl < 25:  # 對不齊時退回：只依照底部置中
                info += ' → 失敗，改用置中'
                M = np.float32([[1, 0, pad + (W - mats[n].shape[1]) / 2], [0, 1, pad + H - mats[n].shape[0]]])
        print(n, info)
        warped[n] = cv2.warpAffine(mats[n], M, (CW, CH), flags=cv2.INTER_LANCZOS4, borderValue=(0, 0, 0, 0))
    # 所有圖的聯集範圍
    alpha = np.max([w[..., 3] for w in warped.values()], axis=0)
    ys, xs = np.where(alpha > 8)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    m = 12
    x0, y0 = max(0, x0 - m), max(0, y0 - m)
    x1, y1 = min(CW, x1 + m), min(CH, y1 + m)
    # 半身圖的底部是原圖邊緣：取「每張圖最低點」的最小值，讓每張都貼齊底部、不會浮起來
    bottoms = [np.where(w[..., 3].max(axis=1) > 8)[0].max() for w in warped.values()]
    if not square: y1 = min(bottoms) + 1
    # 原圖底部被裁掉的角色（半身）：底部不留邊
    for n, w in warped.items():
        crop = w[y0:y1, x0:x1]
        img = Image.fromarray(crop, 'RGBA')
        if square:
            side = max(img.size); c = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            c.paste(img, ((side - img.width) // 2, side - img.height)); img = c
        r = out_h / img.height
        img = img.resize((round(img.width * r), out_h), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png'), optimize=True)
        print('  saved', n, img.size)

def add_to(names, ref_name='normal'):
    """只處理新的表情：對齊到已經做好的 assets/character/<ref>.png，畫布大小不變、舊圖不動"""
    ref = np.asarray(Image.open(os.path.join(OUT, ref_name + '.png')).convert('RGBA'))
    H, W = ref.shape[:2]
    rb = np.where(ref[..., 3].max(axis=1) > 8)[0]
    for n in names:
        src = matte(n)[0]
        M, s, ninl, ng = align(src, ref, 0)
        info = f'scale={s:.3f} inliers={ninl}/{ng} t=({M[0,2]:.0f},{M[1,2]:.0f})'
        if ninl < 25:  # 對不齊時退回：角色高度跟 normal 一樣、底部置中
            sb = np.where(src[..., 3].max(axis=1) > 8)[0]
            sc = (rb.max() - rb.min()) / max(1, sb.max() - sb.min())
            M = np.float32([[sc, 0, (W - src.shape[1] * sc) / 2], [0, sc, H - sb.max() * sc]])
            info += ' → 對不齊，改用高度＋置中'
        out = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LANCZOS4, borderValue=(0, 0, 0, 0))
        # 半身圖的底部要貼齊畫布，不然角色會浮起來；差一點點就往下推
        gap = H - 1 - np.where(out[..., 3].max(axis=1) > 8)[0].max()
        if 0 < gap <= H * 0.04:
            M[1, 2] += gap
            out = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LANCZOS4, borderValue=(0, 0, 0, 0))
            info += f'，往下推 {gap}px 貼齊底部'
        elif gap > H * 0.04:
            info += f'，⚠ 底部空了 {gap}px：新圖的角色可能比定裝照小，建議重新生成構圖更接近的圖'
        print(n, info)
        Image.fromarray(out, 'RGBA').save(os.path.join(OUT, n + '.png'), optimize=True)
        print('  saved', n, (W, H))

GIRL = ['normal', 'happy', 'cheer', 'thinking', 'surprised', 'worried', 'shy', 'disdain']
has_raw = lambda n: os.path.exists(os.path.join(RAW, n + '.png'))
if len(sys.argv) > 1:
    names = sys.argv[1:]
    missing = [n for n in names if not has_raw(n)]
    if missing: sys.exit('assets/raw/ 裡找不到：' + '、'.join(n + '.png' for n in missing))
    if any(n.startswith('mini') for n in names): sys.exit('貓咪型態請用全部重做（不加參數）')
    add_to(names)
else:
    group([n for n in GIRL if has_raw(n)], 'normal', 1200)
    group(['mini', 'mini_alert'], 'mini', 512, square=True)
