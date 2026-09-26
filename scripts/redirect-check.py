"""Redirect sign-in, as installed apps use it (emulators + a dev server started
with VITE_EMULATORS=1 VITE_SAME_SITE_AUTH=1 on port 5174).

  C:\\tmp\\webtools\\Scripts\\python.exe scripts/redirect-check.py

1. A guest with a payment saves to a new Google account by redirect:
   same uid afterwards, payment still there.
2. A second guest with a payment saves to that same Google account: the
   link fails as already-in-use after the page came back, and the guest's
   payment must be merged into the account, not lost.
"""
import datetime as dt
import sys
import time
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:5174'
results = []


def uid_of(page):
    return page.evaluate("""() => new Promise(r => { const q = indexedDB.open('firebaseLocalStorageDb'); q.onsuccess = () => {
      const all = q.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
      all.onsuccess = () => r((all.result.find(x => x.value && x.value.uid) || {}).value?.uid); }; })""")


def guest_with(page, title):
    page.goto(BASE)
    page.evaluate("localStorage.setItem('dueline.authRedirect', '1')")
    page.get_by_role('button', name='Try it without an account').click()
    expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
    page.get_by_role('button', name='Someone I pay').click()
    s = page.get_by_role('dialog')
    s.locator('#ob-title').fill(title)
    s.get_by_label('Amount in rupees').fill('500')
    s.locator('#ob-start').fill((dt.date.today() + dt.timedelta(days=4)).isoformat())
    s.get_by_role('button', name='Add payment').click()
    page.wait_for_timeout(700)


def save_with_google_by_redirect(page, email):
    page.get_by_role('button', name='You', exact=True).click()
    page.wait_for_timeout(600)
    page.get_by_role('button', name='Save with Google').click()
    # The whole page goes to the emulator's stand-in Google page, then comes back.
    page.wait_for_url('**/emulator/auth/handler**', timeout=10000)
    page.get_by_text('Add new account').click()
    page.locator('#email-input').fill(email)
    page.locator('#display-name-input').fill('Redirect Person')
    page.get_by_role('button', name='Sign in with Google.com').click()
    page.wait_for_url(f'{BASE}/**', timeout=15000)


def check(name, fn):
    try:
        fn()
        results.append((name, 'PASS', ''))
    except Exception as e:  # noqa: BLE001
        results.append((name, 'FAIL', (str(e).strip().splitlines() or [repr(e)])[0][:300]))


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome')
    email = f'redirect{int(time.time())}@example.com'

    def first():
        ctx = browser.new_context(viewport={'width': 393, 'height': 852})
        page = ctx.new_page()
        guest_with(page, 'Newspaper')
        guest = uid_of(page)
        save_with_google_by_redirect(page, email)
        page.get_by_role('button', name='You', exact=True).click()
        expect(page.get_by_text('Signed in with Google')).to_be_visible(timeout=10000)
        assert uid_of(page) == guest, 'redirect link must keep the guest uid'
        page.get_by_role('button', name='Due', exact=True).click()
        expect(page.locator('.row-title', has_text='Newspaper')).to_be_visible(timeout=5000)
        ctx.close()
    check('guest_links_google_by_redirect', first)

    def second():
        ctx = browser.new_context(viewport={'width': 393, 'height': 852})
        page = ctx.new_page()
        guest_with(page, 'Milk')
        save_with_google_by_redirect(page, email)
        page.get_by_role('button', name='You', exact=True).click()
        expect(page.get_by_text('Signed in with Google')).to_be_visible(timeout=15000)
        page.get_by_role('button', name='Due', exact=True).click()
        expect(page.locator('.row-title', has_text='Milk')).to_be_visible(timeout=8000)
        expect(page.locator('.row-title', has_text='Newspaper')).to_be_visible(timeout=8000)
        ctx.close()
    check('existing_account_merges_guest_after_redirect', second)
    browser.close()

for n, r, m in results:
    print(f'{r:4} {n}{"  " + m if m else ""}')
sys.exit(0 if all(r == 'PASS' for _, r, _ in results) else 1)
