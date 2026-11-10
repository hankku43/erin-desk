"""把好感升階動畫的去背圖（assets/stageup/erin_*.webp）對齊成櫃台立繪的畫框（跟 normal.png 一樣 1093×1200），
存成 assets/character/<表情>.webp，換表情時大小、位置才不會跳。

對齊方法：抓兩眼的藍色虹膜 → 兩眼中點、兩眼距離 → 縮放＋平移到 normal 的眼睛位置（不旋轉）。
閉著眼的圖抓不到，要在 MANUAL 給兩眼的座標（原圖像素）。

用法：python tools/align_expr.py            （全部重做）
      python tools/align_expr.py moved stamp （只做這幾個）
需要：pip install -r tools/requirements.txt（opencv-python、pillow、numpy）
"""
import os, sys
import numpy as np, cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'stageup')
DST = os.path.join(ROOT, 'assets', 'character')
# 表情名稱 → 動畫裡的圖
MAP = {
    'moved': 'erin_teary', 'fluster': 'erin_poof', 'sheepish': 'erin_hide_cup', 'stamp': 'erin_stamp',
    'focus': 'erin_gold_brush', 'notebook': 'erin_hug_notebook', 'gentle': 'erin_starlight', 'lantern': 'erin_lantern',
    'promise': 'erin_pinky', 'heartflame': 'erin_heart_flame', 'callname': 'erin_call_name',
}
MANUAL = {}  # 'name': ((左眼 x, y), (右眼 x, y))

def load(p): return np.array(Image.open(p).convert('RGBA'))

def eyes(rgba):
    h = rgba.shape[0]; top = int(h * 0.45)
    hsv = cv2.cvtColor(rgba[:top, :, :3], cv2.COLOR_RGB2HSV)
    m = ((hsv[..., 0] > 95) & (hsv[..., 0] < 125) & (hsv[..., 1] > 90) & (hsv[..., 2] > 70) & (rgba[:top, :, 3] > 200)).astype(np.uint8)
    n, _, st, cen = cv2.connectedComponentsWithStats(m)
    comps = sorted([(st[i, 4], cen[i]) for i in range(1, n) if st[i, 4] > 60], key=lambda x: -x[0])[:2]
    if len(comps) < 2: return None
    a, b = sorted([c for _, c in comps], key=lambda c: c[0])
    return np.array(a), np.array(b)

def main(names):
    ref = load(os.path.join(DST, 'normal.png')); er = eyes(ref)
    for name in names:
        src = MAP[name]
        im = load(os.path.join(SRC, src + '.webp'))
        e = MANUAL.get(name) or eyes(im)
        if e is None: print(name, '抓不到眼睛：請在 MANUAL 填座標'); continue
        e = (np.array(e[0], float), np.array(e[1], float))
        s = np.linalg.norm(er[1] - er[0]) / np.linalg.norm(e[1] - e[0])
        mr, ms = (er[0] + er[1]) / 2, (e[0] + e[1]) / 2
        M = np.float32([[s, 0, mr[0] - s * ms[0]], [0, s, mr[1] - s * ms[1]]])
        out = cv2.warpAffine(im, M, (ref.shape[1], ref.shape[0]), flags=cv2.INTER_AREA, borderValue=(0, 0, 0, 0))
        Image.fromarray(out).save(os.path.join(DST, name + '.webp'), 'WEBP', quality=90, method=6)
        print(f'{name:10s} ← {src:18s} scale={s:.3f}')

if __name__ == '__main__':
    main(sys.argv[1:] or list(MAP))
