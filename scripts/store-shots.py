"""Google Play listing images, from the real app with invented sample data.

  firebase emulators:start --only auth,firestore --project dueline-app
  VITE_EMULATORS=1 npx vite
  python scripts/store-shots.py <out-dir>

Writes 1080x1920 phone screenshots (Play wants no side longer than twice the
other) and a 1024x500 feature graphic. The household is invented; nothing real.
"""
import base64
import datetime as dt
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:5173'
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'store-shots')
OUT.mkdir(parents=True, exist_ok=True)
T = dt.date.today()
D = lambda n: (T + dt.timedelta(days=n)).isoformat()
UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
FAR = str(4102444800000)  # hide the one-time banners


def add(page, *, kind, title, amount, due, upi=None, pay_to=None, variable=False, account=None, suggestion=False):
    page.get_by_role('button', name='Add a payment').click()
    s = page.get_by_role('dialog')
    s.get_by_role('group', name='Kind').get_by_role('button', name=kind).click()
    s.locator('#ob-title').fill(title)
    if suggestion:
        s.get_by_role('button', name=f'Use {title}', exact=False).first.click()
    if variable:
        s.get_by_role('button', name='Changes').click()
    s.get_by_label('Amount in rupees').fill(str(amount))
    if upi:
        s.locator('#ob-upi').fill(upi)
        if pay_to:
            s.locator('#ob-payto').fill(pay_to)
    if account:
        s.locator('#ob-account, #ob-acc2').first.fill(account)
    s.locator('#ob-start').fill(due)
    s.get_by_role('button', name='Add payment').click()
    expect(page.get_by_role('dialog')).to_have_count(0, timeout=5000)
    page.wait_for_timeout(250)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    # 360x640 CSS pixels at 3x = 1080x1920.
    ctx = b.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=3, user_agent=UA, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(BASE)
    page.evaluate(f"() => {{ localStorage.setItem('dueline.hide.push', '{FAR}'); localStorage.setItem('dueline.hide.guest', '{FAR}'); }}")
    page.reload()
    page.get_by_role('button', name='Try it without an account').click()
    expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)

    add(page, kind='Someone I pay', title='Parking', amount=1500, due=D(1), upi='rahul@okaxis', pay_to='Rahul')
    add(page, kind='Mobile', title='Jio', amount=799, due=D(0), suggestion=True)
    add(page, kind='Subscription', title='Spotify', amount=119, due=D(3), suggestion=True)
    add(page, kind='Rent', title='Rent', amount=25000, due=D(4), upi='landlord@sbi', pay_to='Mr Sharma')
    add(page, kind='Someone I pay', title='Maid', amount=4000, due=D(5), upi='sunita@ybl', pay_to='Sunita')
    add(page, kind='Credit card', title='HDFC Regalia', amount=30000, due=D(9), variable=True, account='HDFC Regalia ••4821')
    add(page, kind='Subscription', title='Netflix', amount=649, due=D(12), suggestion=True)
    add(page, kind='Subscription', title='Claude', amount=1999, due=D(16), suggestion=True)

    page.goto(BASE)
    expect(page.locator('.hero-amount')).to_be_visible(timeout=8000)
    page.wait_for_timeout(1400)
    page.screenshot(path=str(OUT / '1-due.png'))

    page.locator('.row', has_text='Parking').get_by_role('button', name='Pay').click()
    page.get_by_role('button', name='QR code').click()
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / '2-pay.png'))
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)

    page.get_by_role('button', name='Calendar', exact=True).click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT / '3-calendar.png'))

    page.get_by_role('button', name='Due', exact=True).click()
    page.wait_for_timeout(600)
    page.locator('.row', has_text='HDFC Regalia').first.locator('.row-hit').click()
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / '4-bill.png'))
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)

    page.get_by_role('button', name='Add a payment').click()
    s = page.get_by_role('dialog')
    s.get_by_role('group', name='Kind').get_by_role('button', name='Subscription').click()
    s.locator('#ob-title').fill('YouTube Premium')
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / '5-add.png'))
    ctx.close()

    # Feature graphic, 1024x500: the mark, the promise, two real screens.
    root = Path('.').resolve().as_posix()
    img = lambda n: 'data:image/png;base64,' + base64.b64encode((OUT / n).read_bytes()).decode()
    art = f'''<html><head><style>
@font-face {{ font-family: Inter; src: url('file:///{root}/src/assets/fonts/inter-latin.woff2') format('woff2'); font-weight: 100 900; }}
body {{ margin: 0; width: 1024px; height: 500px; background: #090807; font-family: Inter; color: #f5f3ef; overflow: hidden; position: relative; }}
.glow {{ position: absolute; right: -80px; top: -160px; width: 640px; height: 640px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255,189,74,0.17), rgba(255,189,74,0)); }}
.copy {{ position: absolute; left: 64px; top: 118px; width: 470px; }}
.wm {{ display: flex; align-items: center; gap: 14px; font-size: 32px; font-weight: 680; letter-spacing: -0.03em; }}
h1 {{ margin: 40px 0 0; font-size: 50px; line-height: 1.03; font-weight: 680; letter-spacing: -0.045em; }}
h1 em {{ font-style: normal; color: #ffbd4a; }}
.phone {{ position: absolute; width: 196px; border-radius: 26px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 30px 70px -24px rgba(0,0,0,0.9); }}
.phone img {{ display: block; width: 100%; }}
.a {{ left: 590px; top: 70px; transform: rotate(-4deg); }}
.b {{ left: 790px; top: 40px; }}
</style></head><body><div class="glow"></div>
<div class="copy"><div class="wm"><svg width="44" height="44" viewBox="0 0 512 512"><circle cx="226" cy="300" r="96" fill="#ffbd4a"/><rect x="336" y="104" width="54" height="292" rx="27" fill="#f5f3ef"/></svg>Dueline</div>
<h1>Everything you need to pay, <em>on one line.</em></h1></div>
<div class="phone a"><img src="{img('2-pay.png')}"></div>
<div class="phone b"><img src="{img('1-due.png')}"></div>
</body></html>'''
    pg = b.new_page(viewport={'width': 1024, 'height': 500})
    pg.set_content(art)
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT / 'feature-graphic.png'))
    b.close()
print('written:', sorted(x.name for x in OUT.iterdir()))
