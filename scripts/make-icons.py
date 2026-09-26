"""Renders every Dueline icon from one SVG mark. Run with the webtools venv:
C:\tmp\webtools\Scripts\python.exe scripts/make-icons.py
The mark: a "d" drawn as a coin (what's due) and a line."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BG, ACCENT, INK = '#090807', '#ffbd4a', '#f5f3ef'
OUT = Path('public/icons'); OUT.mkdir(parents=True, exist_ok=True)

def mark(scale=1.0, bg=None, radius=0, coin=ACCENT, stem=INK, size=512):
    # Mark geometry on a 512 grid, centred, then scaled about the centre.
    g = f'<g transform="translate(256 256) scale({scale}) translate(-256 -256)"><circle cx="226" cy="300" r="96" fill="{coin}"/><rect x="336" y="104" width="54" height="292" rx="27" fill="{stem}"/></g>'
    back = f'<rect width="512" height="512" rx="{radius}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 512 512">{back}{g}</svg>'

# Scalable favicon / in-app mark: rounded tile so it reads on light and dark tab bars.
(OUT / 'mark.svg').write_text(mark(scale=0.82, bg=BG, radius=116), encoding='utf-8')

# App icons are full-bleed squares with the mark inside the maskable safe
# zone. Launchers shape them; nothing is transparent. (Transparent corners made
# Samsung Internet sit the icon on a white plate, a white frame on the launch
# screen and home screen.)
renders = {
    'icon-192.png': (192, mark(0.72, BG, 0, size=192)),
    'icon-512.png': (512, mark(0.72, BG, 0, size=512)),
    'maskable-192.png': (192, mark(0.72, BG, 0, size=192)),
    'maskable-512.png': (512, mark(0.72, BG, 0, size=512)),
    'apple-touch-icon.png': (180, mark(0.74, BG, 0, size=180)),
    'favicon-32.png': (32, mark(0.9, BG, 116, size=32)),
    # Android status-bar badge: alpha only, white.
    'badge-96.png': (96, mark(0.95, None, 0, coin='#ffffff', stem='#ffffff', size=96)),
}

OG = f'''<html><head><style>
@font-face {{ font-family: Inter; src: url('file:///{Path('src/assets/fonts/inter-latin.woff2').resolve().as_posix()}') format('woff2'); font-weight: 100 900; }}
@font-face {{ font-family: Inter; src: url('file:///{Path('src/assets/fonts/inter-extra.woff2').resolve().as_posix()}') format('woff2'); font-weight: 100 900; unicode-range: U+20B9; }}
body {{ margin:0; width:1200px; height:630px; background:{BG}; color:{INK}; font-family: Inter; display:flex; }}
.l {{ padding: 84px 0 0 84px; width: 600px; flex: none; }}
.wm {{ display:flex; align-items:center; gap:18px; font-size:40px; font-weight:680; letter-spacing:-0.03em; }}
h1 {{ margin: 70px 0 0; font-size: 66px; line-height: 1.02; font-weight: 680; letter-spacing: -0.045em; font-variation-settings: 'opsz' 32; }}
h1 em {{ font-style: normal; color: {ACCENT}; }}
p {{ margin-top: 24px; font-size: 24px; color: #b9b4ab; line-height: 1.4; }}
.r {{ margin: 196px 0 0 96px; width: 340px; flex: none; }}
.row {{ display:flex; justify-content:space-between; align-items:center; padding: 20px 0; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 24px; }}
.t {{ font-weight: 600; }} .m {{ font-size: 18px; color: #8f897f; margin-top: 4px; }}
.a {{ font-weight: 620; text-align:right; }} .pay {{ color:{ACCENT}; font-size: 18px; font-weight: 650; margin-top: 4px; }} .auto {{ color:#89c9df; font-size:18px; margin-top:4px; }}
</style></head><body><div class="l"><div class="wm">{mark(1, None, size=56)}Dueline</div>
<h1>Everything you need to pay, <em>on one line.</em></h1><p>Card bills, rent, subscriptions and the people you pay by UPI.</p></div>
<div class="r"><div class="row"><div><div class="t">Jio Postpaid</div><div class="m">Due today</div></div><div><div class="a">₹799</div><div class="pay">Pay</div></div></div>
<div class="row"><div><div class="t">Claude</div><div class="m">Tomorrow</div></div><div><div class="a">₹1,999</div><div class="auto">AutoPay</div></div></div>
<div class="row" style="border:0"><div><div class="t">Parking</div><div class="m">Thu, 1 Oct</div></div><div><div class="a">₹1,500</div><div class="pay">Pay</div></div></div></div>
</body></html>'''

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    for name, (size, svg) in renders.items():
        pg = b.new_page(viewport={'width': size, 'height': size})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
        pg.screenshot(path=str(OUT / name), omit_background=True)
        pg.close()
    pg = b.new_page(viewport={'width': 1200, 'height': 630})
    pg.set_content(OG)
    pg.wait_for_timeout(400)
    pg.screenshot(path='public/og.png')
    b.close()
print('icons written:', sorted(x.name for x in OUT.iterdir()))
