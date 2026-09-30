# 產生原創佔位角色「艾琳」的 6 種表情 SVG（可用自己的 PNG 取代）
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'character')
os.makedirs(OUT, exist_ok=True)

HAIR, HAIR_D, SKIN, SKIN_S = '#3aa39a', '#2a7f78', '#ffe3d3', '#f5c6b0'
EYE, VEST, BLOUSE, GOLD = '#3b2a5a', '#2f3e6b', '#fff7ec', '#f2b93b'

def base(face, extra=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 430" width="300" height="430">
<defs>
 <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{HAIR}"/><stop offset="1" stop-color="{HAIR_D}"/></linearGradient>
 <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4d85"/><stop offset="1" stop-color="{VEST}"/></linearGradient>
 <radialGradient id="eg" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#8a6fd1"/><stop offset="1" stop-color="{EYE}"/></radialGradient>
</defs>
<!-- 後髮 -->
<path d="M72 150 C60 240 70 300 92 330 L208 330 C230 300 240 240 228 150 Z" fill="url(#hg)"/>
<!-- 身體 -->
<path d="M132 225 h36 v22 h-36z" fill="{SKIN_S}"/>
<path d="M78 430 C80 330 100 262 150 248 C200 262 220 330 222 430 Z" fill="{BLOUSE}"/>
<path d="M96 430 C98 340 112 290 136 268 L150 330 L164 268 C188 290 202 340 204 430 Z" fill="url(#vg)"/>
<path d="M136 256 L150 276 L164 256 L158 250 L150 262 L142 250 Z" fill="#d94f6b"/>
<!-- 公會徽章 -->
<g transform="translate(176 318)"><path d="M0 -14 L12 -8 V4 C12 12 6 16 0 19 C-6 16 -12 12 -12 4 V-8 Z" fill="{GOLD}" stroke="#b8832a" stroke-width="1.5"/>
<path d="M0 -7 L2.4 -1.5 L8 -1.2 L3.6 2.2 L5 7.6 L0 4.6 L-5 7.6 L-3.6 2.2 L-8 -1.2 L-2.4 -1.5 Z" fill="#fff6d6"/></g>
<!-- 委託書 -->
<g transform="translate(82 330) rotate(-8)"><rect x="0" y="0" width="54" height="68" rx="4" fill="#f7e7c4" stroke="#c9a66b" stroke-width="2"/>
<path d="M9 16 h36 M9 28 h36 M9 40 h26" stroke="#b48b52" stroke-width="3" stroke-linecap="round"/>
<circle cx="40" cy="56" r="7" fill="#d94f6b"/></g>
<path d="M92 360 C100 350 118 350 126 362" stroke="{SKIN_S}" stroke-width="14" stroke-linecap="round" fill="none"/>
<!-- 臉 -->
<ellipse cx="150" cy="158" rx="72" ry="74" fill="{SKIN}"/>
<ellipse cx="80" cy="165" rx="9" ry="14" fill="{SKIN_S}"/><ellipse cx="220" cy="165" rx="9" ry="14" fill="{SKIN_S}"/>
{face}
<!-- 瀏海 -->
<path d="M74 150 C70 90 110 66 150 66 C192 66 232 90 226 150 C214 118 196 104 182 100 C186 116 180 126 172 132 C170 116 160 104 148 100 C146 116 136 128 122 134 C126 118 122 106 116 102 C98 112 84 128 74 150 Z" fill="url(#hg)"/>
<path d="M76 140 C78 180 74 210 66 236 C82 224 90 200 92 170 Z" fill="url(#hg)"/>
<path d="M224 140 C222 180 226 210 234 236 C218 224 210 200 208 170 Z" fill="url(#hg)"/>
<!-- 羽毛筆髮飾 -->
<g transform="translate(206 92) rotate(28)"><path d="M0 0 C14 -10 22 -34 16 -52 C4 -40 -4 -20 0 0 Z" fill="#fff" stroke="#9fb9d8" stroke-width="2"/>
<path d="M0 0 L12 -44" stroke="#9fb9d8" stroke-width="1.6"/><circle cx="0" cy="2" r="6" fill="{GOLD}"/></g>
{extra}
</svg>'''

def eyes_open(look=0, big=False):
    ry = 19 if big else 16
    rx = 14 if big else 12.5
    s = ''
    for cx in (122, 178):
        s += f'<ellipse cx="{cx}" cy="168" rx="{rx}" ry="{ry}" fill="#fff"/>'
        s += f'<ellipse cx="{cx+look}" cy="170" rx="{rx-3}" ry="{ry-2}" fill="url(#eg)"/>'
        s += f'<ellipse cx="{cx+look}" cy="172" rx="{rx-7}" ry="{ry-7}" fill="#2a1d44"/>'
        s += f'<circle cx="{cx+look-4}" cy="163" r="4.2" fill="#fff"/><circle cx="{cx+look+4}" cy="177" r="2" fill="#fff"/>'
        s += f'<path d="M{cx-rx-2} {168-ry+3} Q{cx} {168-ry-6} {cx+rx+2} {168-ry+3}" stroke="#3a2a3a" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    return s

def eyes_happy():
    return ''.join(f'<path d="M{cx-12} 172 Q{cx} 156 {cx+12} 172" stroke="#3a2a3a" stroke-width="4" fill="none" stroke-linecap="round"/>' for cx in (122, 178))

def brows(kind='normal'):
    if kind == 'worried':
        return '<path d="M108 138 Q118 132 134 140" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M192 138 Q182 132 166 140" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    if kind == 'up':
        return '<path d="M108 136 Q120 126 134 132" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M166 132 Q180 126 192 136" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    if kind == 'think':
        return '<path d="M108 140 Q120 136 134 140" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M166 134 Q180 128 192 134" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    return '<path d="M108 140 Q120 132 134 138" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M166 138 Q180 132 192 140" stroke="#2a7f78" stroke-width="3.5" fill="none" stroke-linecap="round"/>'

BLUSH = '<ellipse cx="104" cy="194" rx="12" ry="6" fill="#ff9aa8" opacity=".55"/><ellipse cx="196" cy="194" rx="12" ry="6" fill="#ff9aa8" opacity=".55"/>'
MOUTH = {
 'smile': '<path d="M140 204 Q150 212 160 204" stroke="#a04050" stroke-width="3" fill="none" stroke-linecap="round"/>',
 'open':  '<path d="M138 202 Q150 222 162 202 Z" fill="#b8404f"/><path d="M143 210 Q150 216 157 210" fill="#ff8a9a"/>',
 'o':     '<ellipse cx="150" cy="208" rx="6" ry="8" fill="#b8404f"/>',
 'flat':  '<path d="M142 207 Q150 205 158 208" stroke="#a04050" stroke-width="3" fill="none" stroke-linecap="round"/>',
 'wavy':  '<path d="M138 208 q4 -4 8 0 t8 0 t8 0" stroke="#a04050" stroke-width="3" fill="none" stroke-linecap="round"/>',
}
SPARK = lambda x, y, s=1: f'<path transform="translate({x} {y}) scale({s})" d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z" fill="{GOLD}"/>'
SWEAT = '<path d="M214 118 C220 128 222 136 216 140 C210 142 206 136 208 130 Z" fill="#9fd3ff" stroke="#6aa9e0" stroke-width="1.5"/>'
QMARK = '<text x="232" y="96" font-size="34" font-weight="bold" fill="#7a6bd1" font-family="sans-serif">?</text>'
EXCL = '<text x="228" y="92" font-size="40" font-weight="bold" fill="#e0556b" font-family="sans-serif">!</text>'

faces = {
 'normal':    (brows() + eyes_open() + BLUSH + MOUTH['smile'], ''),
 'happy':     (brows('up') + eyes_happy() + BLUSH + MOUTH['open'], ''),
 'thinking':  (brows('think') + eyes_open(look=5) + MOUTH['flat'], QMARK),
 'surprised': (brows('up') + eyes_open(big=True) + BLUSH + MOUTH['o'], EXCL),
 'cheer':     (brows('up') + eyes_happy() + BLUSH + MOUTH['open'], SPARK(58, 90) + SPARK(248, 130, .8) + SPARK(40, 200, .6)),
 'worried':   (brows('worried') + eyes_open(look=-2) + MOUTH['wavy'], SWEAT),
}
for name, (face, extra) in faces.items():
    with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8') as f:
        f.write(base(face, extra))
print('ok', list(faces))

# ---- 縮小化用：貓咪型態（白毛藍眼） ----
def cat(alert=False):
    ear_l = 'M52 78 L60 28 L92 62 Z' if alert else 'M50 82 L56 36 L90 64 Z'
    ear_r = 'M148 78 L140 28 L108 62 Z' if alert else 'M150 82 L144 36 L110 64 Z'
    eyes = ''
    for cx in (78, 122):
        ry = 15 if alert else 12
        eyes += f'<ellipse cx="{cx}" cy="98" rx="11" ry="{ry}" fill="#4fa8ff"/><ellipse cx="{cx}" cy="100" rx="4.5" ry="{ry-3}" fill="#123a66"/><circle cx="{cx-4}" cy="{92 if alert else 94}" r="3.5" fill="#fff"/>'
    mouth = '<path d="M92 116 Q100 132 108 116 Z" fill="#e57b8f"/>' if alert else '<path d="M92 116 q4 5 8 0 q4 5 8 0" stroke="#7a6a7a" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    paw = '<ellipse cx="150" cy="118" rx="14" ry="18" fill="#fbfbff" stroke="#c9cbe0" stroke-width="3" transform="rotate(-20 150 118)"/>' if alert else ''
    tail = 'M150 176 C186 170 190 128 172 112' if alert else 'M150 180 C190 178 196 140 178 128'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
<path d="{tail}" stroke="#c9cbe0" stroke-width="20" fill="none" stroke-linecap="round"/>
<path d="{tail}" stroke="#fbfbff" stroke-width="13" fill="none" stroke-linecap="round"/>
<ellipse cx="100" cy="160" rx="54" ry="34" fill="#fbfbff" stroke="#c9cbe0" stroke-width="3"/>
<ellipse cx="80" cy="190" rx="14" ry="8" fill="#fbfbff" stroke="#c9cbe0" stroke-width="3"/><ellipse cx="120" cy="190" rx="14" ry="8" fill="#fbfbff" stroke="#c9cbe0" stroke-width="3"/>
<path d="{ear_l}" fill="#fbfbff" stroke="#c9cbe0" stroke-width="3" stroke-linejoin="round"/><path d="{ear_r}" fill="#fbfbff" stroke="#c9cbe0" stroke-width="3" stroke-linejoin="round"/>
<path d="M60 70 L64 44 L82 62 Z" fill="#ffc2cf"/><path d="M140 70 L136 44 L118 62 Z" fill="#ffc2cf"/>
<ellipse cx="100" cy="100" rx="56" ry="46" fill="#fbfbff" stroke="#c9cbe0" stroke-width="3"/>
{eyes}
<path d="M96 110 L104 110 L100 115 Z" fill="#ff9aac"/>
{mouth}
<ellipse cx="66" cy="116" rx="9" ry="5" fill="#ffb3c1" opacity=".6"/><ellipse cx="134" cy="116" rx="9" ry="5" fill="#ffb3c1" opacity=".6"/>
<path d="M60 136 Q100 150 140 136" stroke="#d94f6b" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M100 142 L110 147 V154 C110 159 105 162 100 164 C95 162 90 159 90 154 V147 Z" fill="#f2b93b" stroke="#b8832a" stroke-width="1.5"/>
{paw}
</svg>'''
for name, alert in (('mini', False), ('mini_alert', True)):
    with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8') as f:
        f.write(cat(alert))
print('ok mini')
