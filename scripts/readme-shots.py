"""README screenshots and hero banner, from the real app with sample data.

  firebase emulators:start --only auth,firestore --project dueline-app
  VITE_EMULATORS=1 npx vite
  python scripts/readme-shots.py

Writes docs/readme/{due,pay,calendar,add,hero}.png. The data is an invented
household (a landlord, a parking attendant, a phone bill); nothing real.
"""
import datetime as dt
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:5173'
OUT = Path('docs/readme')
OUT.mkdir(parents=True, exist_ok=True)
T = dt.date.today()
D = lambda n: (T + dt.timedelta(days=n)).isoformat()
UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
FAR = str(4102444800000)  # hide the one-time banners


def add(page, *, kind=None, title, amount, due, upi=None, pay_to=None, variable=False, auto=False, account=None, suggestion=False):
    page.get_by_role('button', name='Add a payment').click()
    s = page.get_by_role('dialog')
    if kind:
        s.get_by_role('group', name='Kind').get_by_role('button', name=kind).click()
    s.locator('#ob-title').fill(title)
    if suggestion:
        s.get_by_role('button', name=f'Use {title}', exact=False).first.click()
    if variable:
        s.get_by_role('button', name='Changes').click()
    s.get_by_label('Amount in rupees').fill(str(amount))
    if auto:
        s.get_by_role('button', name='AutoPay', exact=True).click()
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
    ctx = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, user_agent=UA, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(BASE)
    page.evaluate(f"() => {{ localStorage.setItem('dueline.hide.push', '{FAR}'); localStorage.setItem('dueline.hide.guest', '{FAR}'); }}")
    page.reload()
    page.get_by_role('button', name='Try it without an account').click()
    expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)

    add(page, kind='Someone I pay', title='Car wash', amount=800, due=D(-2), upi='salim@ybl', pay_to='Salim')
    add(page, kind='Mobile', title='Jio', amount=799, due=D(0), suggestion=True)
    add(page, kind='Subscription', title='Claude', amount=1999, due=D(2), account='HDFC ••4821', suggestion=True)
    add(page, kind='Rent', title='Rent', amount=25000, due=D(4), upi='landlord@sbi', pay_to='Mr Sharma')
    add(page, kind='Someone I pay', title='Parking', amount=1500, due=D(5), upi='rahul@okaxis', pay_to='Rahul')
    add(page, kind='Credit card', title='HDFC Regalia', amount=30000, due=D(9), variable=True, account='HDFC Regalia ••4821')
    add(page, kind='Subscription', title='Netflix', amount=649, due=D(12), suggestion=True)

    page.goto(BASE)
    expect(page.locator('.hero-amount')).to_be_visible(timeout=8000)
    page.wait_for_timeout(1400)
    page.screenshot(path=str(OUT / 'due.png'))

    page.locator('.row', has_text='Parking').get_by_role('button', name='Pay').click()
    page.get_by_role('button', name='QR code').click()
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / 'pay.png'))
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)

    page.get_by_role('button', name='Calendar', exact=True).click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT / 'calendar.png'))

    page.get_by_role('button', name='Due', exact=True).click()
    page.wait_for_timeout(600)
    page.get_by_role('button', name='Add a payment').click()
    s = page.get_by_role('dialog')
    s.get_by_role('group', name='Kind').get_by_role('button', name='Subscription').click()
    s.locator('#ob-title').fill('Spotify')
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / 'add.png'))
    ctx.close()

    # Hero: the mark, the promise, and three real screens.
    import base64
    root = Path('.').resolve().as_posix()
    img = lambda n: 'data:image/png;base64,' + base64.b64encode((OUT / n).read_bytes()).decode()
    hero = f'''<html><head><style>
@font-face {{ font-family: Inter; src: url('file:///{root}/src/assets/fonts/inter-latin.woff2') format('woff2'); font-weight: 100 900; }}
@font-face {{ font-family: Inter; src: url('file:///{root}/src/assets/fonts/inter-extra.woff2') format('woff2'); font-weight: 100 900; unicode-range: U+20B9; }}
body {{ margin: 0; width: 1600px; height: 820px; background: #090807; font-family: Inter; color: #f5f3ef; overflow: hidden; position: relative; }}
.glow {{ position: absolute; right: -120px; top: -160px; width: 900px; height: 900px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255,189,74,0.16), rgba(255,189,74,0)); }}
.copy {{ position: absolute; left: 110px; top: 190px; width: 660px; }}
.wm {{ display: flex; align-items: center; gap: 18px; font-size: 44px; font-weight: 680; letter-spacing: -0.03em; }}
h1 {{ margin: 64px 0 0; font-size: 70px; line-height: 1.02; font-weight: 680; letter-spacing: -0.045em; font-variation-settings: 'opsz' 32; }}
h1 em {{ font-style: normal; color: #ffbd4a; }}
p {{ margin: 28px 0 0; font-size: 25px; line-height: 1.45; color: #b9b4ab; max-width: 30ch; }}
.phone {{ position: absolute; width: 300px; border-radius: 38px; overflow: hidden; border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 40px 90px -30px rgba(0,0,0,0.9); background: #090807; }}
.phone img {{ display: block; width: 100%; }}
.a {{ left: 800px; top: 120px; transform: rotate(-4deg); }}
.b {{ left: 1040px; top: 70px; z-index: 2; }}
.c {{ left: 1280px; top: 140px; transform: rotate(4deg); }}
</style></head><body><div class="glow"></div>
<div class="copy"><div class="wm"><svg width="60" height="60" viewBox="0 0 512 512"><circle cx="226" cy="300" r="96" fill="#ffbd4a"/><rect x="336" y="104" width="54" height="292" rx="27" fill="#f5f3ef"/></svg>Dueline</div>
<h1>Everything you need to pay, <em>on one line.</em></h1>
<p>Bills, cards, subscriptions and the people you pay by UPI.</p></div>
<div class="phone a"><img src="{img('calendar.png')}"></div>
<div class="phone b"><img src="{img('due.png')}"></div>
<div class="phone c"><img src="{img('pay.png')}"></div>
</body></html>'''
    pg = b.new_page(viewport={'width': 1600, 'height': 820})
    pg.set_content(hero)
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT / 'hero.png'))
    b.close()
print('written:', sorted(x.name for x in OUT.iterdir()))
