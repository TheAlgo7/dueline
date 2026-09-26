"""Production check: the whole reminder pipeline, for real.

  C:\\tmp\\webtools\\Scripts\\python.exe scripts/live-check.py <CRON_SECRET>

1. Opens https://dueline-app.web.app as a fresh guest (real Firebase Auth).
2. Adds a payment due today and turns reminders on (real Web Push subscription).
3. Sends a test push through /api/test-push.
4. Runs /api/tick as if it were 20:00 IST today, so the evening nudge is due,
   and checks it was pushed; runs it again and checks nothing is re-sent.
5. Deletes the account through the app's own Delete everything flow.
"""
import datetime as dt
import json
import os
import sys
import tempfile
import urllib.request
from playwright.sync_api import sync_playwright, expect

SITE = 'https://dueline-app.web.app'
API = 'https://dueline-api.vercel.app'
SECRET = sys.argv[1]
errors = []


def tick(at_ms: int, dry=False):
    req = urllib.request.Request(f'{API}/api/tick?at={at_ms}{"&dry=1" if dry else ""}', headers={'authorization': f'Bearer {SECRET}'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


with sync_playwright() as p:
    # Headless Chrome has no push service, and Playwright's permission grant
    # doesn't reach Chrome's push permission, so this uses a real Chrome window
    # parked offscreen with a throwaway profile that already allows notifications.
    profile_dir = tempfile.mkdtemp(prefix='dueline-chrome-')
    os.makedirs(os.path.join(profile_dir, 'Default'))
    with open(os.path.join(profile_dir, 'Default', 'Preferences'), 'w') as f:
        json.dump({'profile': {'content_settings': {'exceptions': {'notifications': {f'{SITE}:443,*': {'setting': 1}}}}}}, f)
    ctx = p.chromium.launch_persistent_context(
        profile_dir, channel='chrome', headless=False, viewport={'width': 412, 'height': 900},
        ignore_default_args=['--disable-background-networking'], args=['--window-position=-3000,0'],
    )
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto(SITE)
    page.get_by_role('button', name='Try it without an account').click()
    expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=15000)
    uid = page.evaluate("() => new Promise(r => { const req = indexedDB.open('firebaseLocalStorageDb'); req.onsuccess = () => { const tx = req.result.transaction('firebaseLocalStorage'); const all = tx.objectStore('firebaseLocalStorage').getAll(); all.onsuccess = () => r((all.result.find(x => x.value && x.value.uid) || {}).value?.uid); }; })")
    print('guest uid', uid[:6] + '…')

    try:
        page.get_by_role('button', name='Someone I pay').click()
        sheet = page.get_by_role('dialog')
        sheet.locator('#ob-title').fill('Live check')
        sheet.get_by_label('Amount in rupees').fill('1')
        sheet.locator('#ob-upi').fill('test@ybl')
        # Due tomorrow, so tomorrow's 9 AM "due today" reminder is always in the future.
        tomorrow = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date() + dt.timedelta(days=1)
        sheet.locator('#ob-start').fill(tomorrow.isoformat())
        sheet.get_by_role('button', name='Add payment').click()
        expect(page.locator('.hero-amount')).to_be_visible(timeout=10000)

        page.get_by_role('button', name='You', exact=True).click()
        page.get_by_role('switch', name='Reminders on this device').click()
        expect(page.get_by_text('This device will get reminders.')).to_be_visible(timeout=20000)
        print('push subscription: on')
        page.wait_for_timeout(4000)

        page.get_by_role('button', name='Send a test reminder').click()
        # Wait for the test's own answer, not the "Reminders are on" toast before it.
        page.locator('.toast', has_text='Sent.').or_(page.locator('.toast.late')).first.wait_for(timeout=25000)
        msg = page.locator('.toast').first.inner_text()
        assert 'Sent.' in msg, f'test push failed: {msg}'
        print('test push: accepted by push service')

        # 9:00 IST tomorrow = 03:30 UTC. Tick a few minutes before it.
        at = int(dt.datetime(tomorrow.year, tomorrow.month, tomorrow.day, 3, 20, tzinfo=dt.timezone.utc).timestamp() * 1000)
        dry = tick(at, dry=True)
        mine = [u for u in dry['users'] if uid.startswith(u['uid'])]
        print('dry tick:', mine)
        assert mine and mine[0]['planned'] >= 1, dry
        real = tick(at)
        mine = [u for u in real['users'] if uid.startswith(u['uid'])]
        print('tick:', mine)
        assert mine[0]['sent'] >= 1 and mine[0]['pushes'] >= 1, real
        again = tick(at)
        mine = [u for u in again['users'] if uid.startswith(u['uid'])]
        print('tick again:', mine)
        assert mine[0]['planned'] == 0 and mine[0]['sent'] == 0, again

    finally:
        # Clean up through the product's own erase flow, pass or fail.
        page.get_by_role('button', name='You', exact=True).click()
        page.get_by_role('button', name='Delete everything').click()
        page.locator('#del-typed').fill('DELETE')
        page.get_by_role('button', name='Delete my account and data').click()
        expect(page.get_by_role('button', name='Continue with Google')).to_be_visible(timeout=20000)
        print('account deleted')
    ctx.close()

# The Apple/Phone availability probes answer 400 while those aren't configured.
real_errors = [e for e in errors if 'favicon' not in e and 'status of 400' not in e]
if real_errors:
    print('CONSOLE ERRORS:', *real_errors, sep='\n  ')
    sys.exit(1)
print('LIVE OK')
