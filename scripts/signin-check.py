"""Sign-in paths against the emulators (dev server with VITE_EMULATORS=1).

  python scripts/signin-check.py [out-dir]

Google (through the Auth emulator's stand-in Google page), guest -> Google
linking that keeps the same uid and data, phone codes (read back from the
emulator), and email from the welcome screen.
"""
import datetime as dt
import json
import sys
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/signin')
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://localhost:5173'
results, errors = [], []


def uid_of(page):
    return page.evaluate("""() => new Promise(r => { const q = indexedDB.open('firebaseLocalStorageDb'); q.onsuccess = () => {
      const all = q.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
      all.onsuccess = () => r((all.result.find(x => x.value && x.value.uid) || {}).value?.uid); }; })""")


def emulator_google(popup, email):
    popup.wait_for_load_state()
    popup.get_by_text('Add new account').click()
    popup.locator('#email-input').fill(email)
    popup.locator('#display-name-input').fill('Test Person')
    popup.get_by_role('button', name='Sign in with Google.com').click()


def phone_code(number):
    with urllib.request.urlopen('http://127.0.0.1:9099/emulator/v1/projects/dueline-app/verificationCodes') as r:
        codes = json.loads(r.read())['verificationCodes']
    return [c['code'] for c in codes if c['phoneNumber'] == number][-1]


def sign_out(page):
    page.get_by_role('button', name='You', exact=True).click()
    page.wait_for_timeout(700)
    b = page.get_by_role('button', name='Sign out')
    b.evaluate("el => el.scrollIntoView({block: 'center'})")
    page.wait_for_timeout(250)
    b.click()
    expect(page.get_by_role('button', name='Continue with Google')).to_be_visible(timeout=8000)


def scenario(page, name, fn):
    try:
        fn()
        results.append((name, 'PASS', ''))
        print('PASS', name, flush=True)
    except Exception as e:  # noqa: BLE001
        msg = (str(e).strip().splitlines() or [repr(e)])[0][:300]
        results.append((name, 'FAIL', msg))
        print('FAIL', name, '->', msg, flush=True)
        page.screenshot(path=str(OUT / f'FAIL-{name}.png'))


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome')
    ctx = browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    stamp = int(time.time())

    def s_welcome():
        expect(page.get_by_role('button', name='Continue with Google')).to_be_visible(timeout=8000)
        assert page.locator('.row').count() == 0, 'no sample payments on the sign-in screen'
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / 'welcome.png'))
    scenario(page, 'welcome_is_simple', s_welcome)

    def s_google():
        with page.expect_popup() as info:
            page.get_by_role('button', name='Continue with Google').click()
        emulator_google(info.value, f'g{stamp}@example.com')
        expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        page.get_by_role('button', name='You', exact=True).click()
        expect(page.get_by_text('Signed in with Google')).to_be_visible(timeout=5000)
        page.screenshot(path=str(OUT / 'you-google.png'))
        sign_out(page)
    scenario(page, 'google_sign_in', s_google)

    def s_guest_to_google():
        page.get_by_role('button', name='Try it without an account').click()
        expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        guest_uid = uid_of(page)
        page.get_by_role('button', name='Someone I pay').click()
        s = page.get_by_role('dialog')
        s.locator('#ob-title').fill('Maid')
        s.get_by_label('Amount in rupees').fill('4000')
        s.locator('#ob-start').fill((dt.date.today() + dt.timedelta(days=3)).isoformat())
        s.get_by_role('button', name='Add payment').click()
        page.wait_for_timeout(600)
        page.get_by_role('button', name='You', exact=True).click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / 'you-guest.png'))
        with page.expect_popup() as info:
            page.get_by_role('button', name='Save with Google').click()
        emulator_google(info.value, f'link{stamp}@example.com')
        expect(page.get_by_text('Signed in with Google')).to_be_visible(timeout=10000)
        assert uid_of(page) == guest_uid, 'linking must keep the guest uid'
        page.get_by_role('button', name='Due', exact=True).click()
        expect(page.locator('.row-title', has_text='Maid')).to_be_visible()
        sign_out(page)
    scenario(page, 'guest_saved_with_google', s_guest_to_google)

    def s_guest_merges_into_google():
        # Same Google account as google_sign_in: the guest's payment must move into it.
        page.get_by_role('button', name='Try it without an account').click()
        expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        page.get_by_role('button', name='Someone I pay').click()
        s = page.get_by_role('dialog')
        s.locator('#ob-title').fill('Dhobi')
        s.get_by_label('Amount in rupees').fill('300')
        s.locator('#ob-start').fill((dt.date.today() + dt.timedelta(days=2)).isoformat())
        s.get_by_role('button', name='Add payment').click()
        page.wait_for_timeout(600)
        page.get_by_role('button', name='You', exact=True).click()
        page.wait_for_timeout(600)
        with page.expect_popup() as info:
            page.get_by_role('button', name='Save with Google').click()
        pop = info.value
        pop.wait_for_load_state()
        # The emulator remembers the account from google_sign_in; pick it.
        pop.get_by_text(f'g{stamp}@example.com').first.click()
        expect(page.get_by_text('Signed in with Google')).to_be_visible(timeout=15000)
        page.get_by_role('button', name='Due', exact=True).click()
        expect(page.locator('.row-title', has_text='Dhobi')).to_be_visible(timeout=8000)
        sign_out(page)
    scenario(page, 'guest_merges_into_existing_google', s_guest_merges_into_google)

    def s_phone():
        page.get_by_role('button', name='Try it without an account').click()
        expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        page.get_by_role('button', name='You', exact=True).click()
        page.get_by_role('button', name='Use email or another way').click()
        s = page.get_by_role('dialog')
        s.get_by_role('button', name='Phone').click()
        digits = '98' + str(stamp)[-8:]
        s.locator('#acc-phone').fill(digits)
        page.screenshot(path=str(OUT / 'sheet-phone.png'))
        s.get_by_role('button', name='Send code').click()
        expect(s.locator('#acc-code')).to_be_visible(timeout=8000)
        s.locator('#acc-code').fill(phone_code('+91' + digits))
        s.get_by_role('button', name='Verify').click()
        expect(page.get_by_text('Signed in with Phone')).to_be_visible(timeout=8000)
        sign_out(page)
    scenario(page, 'phone_codes', s_phone)

    def s_email():
        page.get_by_role('button', name='Email').click()
        s = page.get_by_role('dialog')
        expect(s).to_be_visible()
        page.screenshot(path=str(OUT / 'sheet-email.png'))
        s.get_by_role('button', name='New account').click()
        s.locator('#acc-email').fill(f'e{stamp}@example.com')
        s.locator('#acc-pw').fill('secret123')
        s.get_by_role('button', name='Create account').click()
        expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        page.get_by_role('button', name='You', exact=True).click()
        expect(page.get_by_text('Signed in with Email')).to_be_visible(timeout=5000)
    scenario(page, 'email_from_welcome', s_email)

    browser.close()

print('\n'.join(f'{r:4} {n}{"  " + m if m else ""}' for n, r, m in results))
if errors:
    print('PAGE ERRORS:', *dict.fromkeys(errors), sep='\n  ')
print(f"{sum(r == 'PASS' for _, r, _ in results)}/{len(results)} passed")
