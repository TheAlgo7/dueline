"""End-to-end smoke test against the Vite dev server + Firebase emulators.

  firebase emulators:start --only auth,firestore --project dueline-app
  VITE_EMULATORS=1 npx vite
  C:\\tmp\\webtools\\Scripts\\python.exe scripts/e2e.py [screenshot-dir]

Walks the real flows as a guest on an Android-sized screen: onboarding, adding
five kinds of payment, paying one, the item sheet, calendar, payees, You.
Fails on any console error or uncaught exception.
"""
import datetime as dt
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/e2e')
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://localhost:5173'
TODAY = dt.date.today()
iso = lambda d: d.isoformat()
UA = 'Mozilla/5.0 (Linux; Android 16; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'

errors: list[str] = []


def shot(page, name, full=False):
    page.wait_for_timeout(450)
    page.screenshot(path=str(OUT / f'{name}.png'), full_page=full)


def add_payment(page, *, kind=None, title, amount=None, variable=False, upi=None, pay_to=None, due, auto=False, account=None, link=None, apply_suggestion=False):
    page.get_by_role('button', name='Add a payment').click()
    sheet = page.get_by_role('dialog')
    expect(sheet).to_be_visible()
    if kind:
        sheet.get_by_role('group', name='Kind').get_by_role('button', name=kind).click()
    sheet.locator('#ob-title').fill(title)
    if apply_suggestion:
        sheet.get_by_role('button', name=f'Use {title}').click()
    if variable:
        sheet.get_by_role('button', name='Changes').click()
    if amount is not None:
        sheet.get_by_label('Amount in rupees').fill(str(amount))
    if auto:
        sheet.get_by_role('button', name='AutoPay', exact=True).click()
    if upi:
        sheet.get_by_role('group', name='Method').get_by_role('button', name='UPI').click()
        sheet.locator('#ob-upi').fill(upi)
        if pay_to:
            sheet.locator('#ob-payto').fill(pay_to)
    if account:
        sheet.locator('#ob-account, #ob-acc2').first.fill(account)
    if link:
        sheet.locator('#ob-url, #ob-url2').first.fill(link)
    sheet.locator('#ob-start').fill(due)
    sheet.get_by_role('button', name='Add payment').click()
    expect(page.get_by_role('dialog')).to_have_count(0, timeout=4000)
    page.wait_for_timeout(250)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome')
    ctx = browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, user_agent=UA, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(f'console: {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

    page.goto(BASE)
    expect(page.get_by_role('heading', name='Everything you need to pay')).to_be_visible()
    shot(page, '01-welcome')

    page.get_by_role('button', name='Get started').click()
    expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
    shot(page, '02-onboarding')

    # First payment from the onboarding grid.
    page.get_by_role('button', name='Someone I pay').click()
    sheet = page.get_by_role('dialog')
    expect(sheet).to_be_visible()
    shot(page, '03-add-sheet')
    sheet.locator('#ob-title').fill('Parking')
    sheet.get_by_label('Amount in rupees').fill('1500')
    sheet.locator('#ob-upi').fill('rahul@okaxis')
    sheet.locator('#ob-payto').fill('Rahul')
    sheet.locator('#ob-start').fill(iso(TODAY + dt.timedelta(days=5)))
    shot(page, '04-add-filled')
    sheet.get_by_role('button', name='Add payment').click()
    expect(page.get_by_role('dialog')).to_have_count(0, timeout=4000)

    add_payment(page, kind='Mobile', title='Jio', apply_suggestion=True, amount=799, due=iso(TODAY), link=None)
    add_payment(page, title='Claude', apply_suggestion=True, amount=1999, account='HDFC ••4821', due=iso(TODAY + dt.timedelta(days=2)))
    add_payment(page, kind='Credit card', title='HDFC Regalia', amount=30000, account='HDFC Regalia ••4821', link='hdfcbank.com', due=iso(TODAY + dt.timedelta(days=9)))
    add_payment(page, kind='Someone I pay', title='Car wash', amount=800, upi='salim@ybl', pay_to='Salim', due=iso(TODAY - dt.timedelta(days=2)))
    add_payment(page, kind='Subscription', title='Netflix', apply_suggestion=True, amount=649, due=iso(TODAY - dt.timedelta(days=3)))

    page.goto(BASE)
    expect(page.locator('.hero-amount')).to_be_visible(timeout=8000)
    shot(page, '05-due')
    shot(page, '05-due-full', full=True)

    hero = page.locator('.hero-amount').inner_text()
    assert '3,099' in hero.replace('\n', ''), f'hero should be 799 + 1500 + 800 = 3,099, got {hero!r}'

    # Confirm section for the Netflix AutoPay that was due 3 days ago.
    expect(page.get_by_role('heading', name='Did these go through?')).to_be_visible()

    # Pay Jio from its row.
    jio_row = page.locator('.row', has_text='Jio')
    jio_row.get_by_role('button', name='Pay').click()
    expect(page.get_by_role('dialog', name='Pay Jio')).to_be_visible()
    shot(page, '06-pay-web')
    page.get_by_role('button', name='Already paid? Mark it paid').click()
    expect(page.get_by_role('dialog', name='Mark Jio paid')).to_be_visible()
    shot(page, '07-mark-paid')
    page.locator('#paid-ref').fill('UTR 4821 0931')
    page.get_by_role('dialog').get_by_role('button', name='Mark paid').click()
    expect(page.get_by_text('Paid Jio')).to_be_visible()
    shot(page, '08-after-paid')
    hero = page.locator('.hero-amount').inner_text()
    page.wait_for_timeout(700)
    hero = page.locator('.hero-amount').inner_text()
    assert '2,300' in hero.replace('\n', ''), f'after paying Jio the hero should be 2,300, got {hero!r}'

    # UPI pay sheet for Parking.
    page.locator('.row', has_text='Parking').get_by_role('button', name='Pay').click()
    expect(page.get_by_role('dialog', name='Pay Parking')).to_be_visible()
    link = page.get_by_role('link', name='Open UPI app').get_attribute('href')
    assert link.startswith('upi://pay?pa=rahul%40okaxis&pn=Rahul&am=1500.00&cu=INR'), link
    page.get_by_role('button', name='QR code').click()
    shot(page, '09-pay-upi')
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)

    # Item sheet.
    page.locator('.row', has_text='HDFC Regalia').locator('.row-hit').click()
    expect(page.get_by_role('dialog', name='HDFC Regalia')).to_be_visible()
    shot(page, '10-item-card')
    page.get_by_role('button', name="Enter this bill's amount").click()
    page.get_by_role('dialog').get_by_label('Amount in rupees').fill('48720')
    page.get_by_role('dialog').get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(400)
    shot(page, '11-item-card-amount')
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)

    # Confirm the Netflix AutoPay inline.
    page.locator('.row', has_text='Netflix').get_by_role('button', name='It went through').click()
    page.wait_for_timeout(500)

    page.get_by_role('button', name='Calendar', exact=True).click()
    expect(page.get_by_role('heading', name='Calendar')).to_be_visible()
    shot(page, '12-calendar', full=True)

    page.get_by_role('button', name='Payees', exact=True).click()
    expect(page.get_by_role('heading', name='Payees')).to_be_visible()
    shot(page, '13-payees')

    page.get_by_role('button', name='You', exact=True).click()
    expect(page.get_by_role('heading', name='You', exact=True)).to_be_visible()
    shot(page, '14-you', full=True)

    page.get_by_role('button', name='Payment history').click()
    expect(page.get_by_role('dialog', name='Payment history')).to_be_visible()
    shot(page, '15-history')
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)

    page.get_by_role('button', name='Due', exact=True).click()
    page.get_by_role('button', name='Search').click()
    page.get_by_role('dialog').get_by_label('Search').fill('ra')
    shot(page, '16-search')
    page.keyboard.press('Escape')

    # Reload: data must come back from the local cache and the emulator.
    page.reload()
    expect(page.locator('.hero-amount')).to_be_visible(timeout=8000)

    browser.close()

real = [e for e in errors if 'favicon' not in e]
print('screenshots in', OUT.resolve())
if real:
    print('ERRORS:')
    for e in real:
        print(' ', e)
    sys.exit(1)
print('E2E OK')
