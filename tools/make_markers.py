# 產生角色頭上的提示圖示（配合白髮藍眼貓娘的粉嫩動漫風）
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui')
os.makedirs(OUT, exist_ok=True)

def bubble(kind):
    if kind == 'ready':   # 可交付：天空藍（貓娘眼睛色）＋問號
        c1, c2, line, glyph_bg = '#e3f4ff', '#86ccff', '#4a8fd1', '#3a7cc4'
        glyph = ('<path d="M25.5 27.5 C25.5 22 29 19.5 32.5 19.5 C36.6 19.5 39.5 22.2 39.5 25.8 '
                 'C39.5 29.2 37.2 30.6 35.2 31.8 C33.6 32.8 33 33.8 33 36"/>')
        dot = '<circle cx="33" cy="43" r="2.9"/>'
    else:                 # 新訊息：櫻花粉＋驚嘆號
        c1, c2, line, glyph_bg = '#ffe8ee', '#ff9fb8', '#d9607f', '#c24d6e'
        glyph = '<path d="M32 20 L32 35.5"/>'
        dot = '<circle cx="32" cy="43" r="3"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<defs>
 <radialGradient id="g" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></radialGradient>
 <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c2"/><stop offset="1" stop-color="#f2b93b"/></linearGradient>
</defs>
<!-- 貓耳 -->
<path d="M12.5 22 L13.5 5.5 L26 14.5 Z" fill="url(#g)" stroke="{line}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M51.5 22 L50.5 5.5 L38 14.5 Z" fill="url(#g)" stroke="{line}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M15.5 17 L16 10 L21.5 14 Z" fill="#ffc7d4"/>
<path d="M48.5 17 L48 10 L42.5 14 Z" fill="#ffc7d4"/>
<!-- 對話泡泡（圓潤的貓頭形＋小尾巴） -->
<path d="M32 10.5 C46 10.5 54.5 19 54.5 31 C54.5 42.5 46 50 36 50.8 L32 58 L28 50.8 C18 50 9.5 42.5 9.5 31 C9.5 19 18 10.5 32 10.5 Z"
      fill="url(#g)" stroke="{line}" stroke-width="2.4" stroke-linejoin="round"/>
<!-- 光澤 -->
<path d="M17 24 C18.5 18.5 23 15.5 28 14.8" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/>
<circle cx="15.8" cy="28.5" r="1.6" fill="#fff" opacity=".85"/>
<!-- 符號：深色描邊＋白色本體 -->
<g fill="none" stroke="{glyph_bg}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round">{glyph}</g>
<g fill="{glyph_bg}">{dot.replace('r="2.9"', 'r="4.9"').replace('r="3"', 'r="5"')}</g>
<g fill="none" stroke="#ffffff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round">{glyph}</g>
<g fill="#ffffff">{dot}</g>
<!-- 腮紅 -->
<ellipse cx="17.5" cy="38.5" rx="3.6" ry="2" fill="#ff8fa9" opacity=".45"/>
<ellipse cx="46.5" cy="38.5" rx="3.6" ry="2" fill="#ff8fa9" opacity=".45"/>
<!-- 金色小星星（公會徽章色） -->
<path transform="translate(52.5 45.5)" d="M0 -6.5 L1.6 -1.6 L6.5 0 L1.6 1.6 L0 6.5 L-1.6 1.6 L-6.5 0 L-1.6 -1.6 Z" fill="url(#gold)" stroke="#c48a1f" stroke-width=".8"/>
<circle cx="8" cy="46" r="1.8" fill="#fff3c2" stroke="#e0a93a" stroke-width=".6"/>
</svg>'''

for k in ('ready', 'alert'):
    with open(os.path.join(OUT, f'marker_{k}.svg'), 'w', encoding='utf-8') as f:
        f.write(bubble(k))
print('ok')
