"""Deep QA pass against the dev server + emulators.

  firebase emulators:start --only auth,firestore --project dueline-app
  VITE_EMULATORS=1 npx vite
  python scripts/qa.py [out-dir]

Every scenario runs even if an earlier one failed; failures get a screenshot.
"""
import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/qa')
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://localhost:5173'
T = dt.date.today()
D = lambda n: (T + dt.timedelta(days=n)).isoformat()
UA = 'Mozilla/5.0 (Linux; Android 16; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
results: list[tuple[str, str, str]] = []
errors: list[str] = []
EMAIL, PW = f'qa{int(dt.datetime.now().timestamp())}@example.com', 'secret123'


# ---------------------------------------------------------------- helpers

def uid_of(page):
    return page.evaluate("""() => new Promise(r => { const q = indexedDB.open('firebaseLocalStorageDb'); q.onsuccess = () => {
      const all = q.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
      all.onsuccess = () => r((all.result.find(x => x.value && x.value.uid) || {}).value?.uid); }; })""")


def docs(uid, col):
    url = f'http://127.0.0.1:8080/v1/projects/dueline-app/databases/(default)/documents/users/{uid}/{col}?pageSize=300'
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer owner'})
    with urllib.request.urlopen(req) as r:
        body = json.loads(r.read())
    return {d['name'].split('/')[-1]: d['fields'] for d in body.get('documents', [])}


def val(field):
    (k, v), = field.items()
    if k == 'mapValue':
        return {kk: val(vv) for kk, vv in v.get('fields', {}).items()}
    if k == 'arrayValue':
        return [val(x) for x in v.get('values', [])]
    if k == 'integerValue':
        return int(v)
    if k == 'nullValue':
        return None
    return v


def obligations(uid):
    return {i: {k: val(v) for k, v in f.items()} for i, f in docs(uid, 'obligations').items()}


def occurrences(uid):
    return {i: {k: val(v) for k, v in f.items()} for i, f in docs(uid, 'occurrences').items()}


def rows(page, title):
    return page.locator('.row').filter(has=page.locator('.row-title', has_text=re.compile(f'^{re.escape(title)}$')))


def top(page):
    return page.get_by_role('dialog').last


def settle(page, ms=350):
    page.wait_for_timeout(ms)


def close_all(page):
    for _ in range(5):
        if page.get_by_role('dialog').count() == 0:
            return
        page.keyboard.press('Escape')
        settle(page, 300)


def tab(page, name):
    close_all(page)
    page.get_by_role('button', name=name, exact=True).click()
    settle(page, 900)  # tapping the active tab smooth-scrolls to the top


def tap(page, locator):
    locator.evaluate("el => el.scrollIntoView({block: 'center'})")
    settle(page, 250)
    locator.click()


def toast(page):
    page.locator('.toast').first.wait_for(timeout=5000)
    return page.locator('.toast').first.inner_text()


def add(page, *, title, amount=None, kind=None, variable=False, auto=False, upi=None, pay_to=None, due=None,
        repeat=None, custom=None, count=None, account=None, link=None, suggestion=False, remind=None):
    close_all(page)
    page.get_by_role('button', name='Add a payment').click()
    s = top(page)
    expect(s).to_be_visible()
    if kind:
        s.get_by_role('group', name='Kind').get_by_role('button', name=kind).click()
    s.locator('#ob-title').fill(title)
    if suggestion:
        s.get_by_role('button', name=re.compile(f'^Use {re.escape(title)}')).click()
    if variable:
        s.get_by_role('button', name='Changes').click()
    if amount is not None:
        s.get_by_label('Amount in rupees').fill(str(amount))
    if auto:
        s.get_by_role('button', name='AutoPay', exact=True).click()
    if upi:
        s.get_by_role('group', name='Method').get_by_role('button', name='UPI').click()
        s.locator('#ob-upi').fill(upi)
        if pay_to:
            s.locator('#ob-payto').fill(pay_to)
    if account:
        s.locator('#ob-account, #ob-acc2').first.fill(account)
    if link:
        s.locator('#ob-url, #ob-url2').first.fill(link)
    if due:
        s.locator('#ob-start').fill(due)
    if repeat:
        s.get_by_role('group', name='Repeats').get_by_role('button', name=repeat).click()
    if custom:
        s.get_by_label('Interval').fill(str(custom[0]))
        s.get_by_label('Unit').select_option(custom[1])
    if count:
        s.get_by_role('group', name='Ends').get_by_role('button', name='After').click()
        s.get_by_label('Number of payments').fill(str(count))
    if remind is not None:
        group = s.get_by_role('group', name='Remind me')
        for b in group.get_by_role('button').all():
            if b.get_attribute('aria-pressed') == 'true':
                b.click()
        for r in remind:
            group.get_by_role('button', name=r).click()
    s.get_by_role('button', name='Add payment').click()
    expect(page.get_by_role('dialog')).to_have_count(0, timeout=4000)
    settle(page, 250)


def open_item(page, title, nth=0):
    close_all(page)
    rows(page, title).nth(nth).locator('.row-hit').click()
    expect(top(page)).to_be_visible()
    settle(page)
    return top(page)


def scenario(page, name, fn):
    try:
        fn()
        results.append((name, 'PASS', ''))
        print('PASS', name, flush=True)
    except Exception as e:  # noqa: BLE001
        msg = (str(e).strip().splitlines() or [repr(e)])[0][:400]
        results.append((name, 'FAIL', msg))
        print('FAIL', name, '->', msg, flush=True)
        try:
            page.screenshot(path=str(OUT / f'FAIL-{name}.png'))
        except Exception:  # noqa: BLE001
            pass
    close_all(page)


# ---------------------------------------------------------------- run

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome')
    ctx = browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, user_agent=UA, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(f'console: {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(BASE)
    state = {}

    def s_onboard():
        page.get_by_role('button', name='Try it without an account').click()
        expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        state['uid'] = uid_of(page)
    scenario(page, 'onboard', s_onboard)

    def s_add_variety():
        add(page, kind='Someone I pay', title='Parking', amount=1500, upi='rahul@okaxis', pay_to='Rahul', due=D(5))
        add(page, kind='Mobile', title='Jio', suggestion=True, amount=799, due=D(0))
        add(page, title='Claude', suggestion=True, amount=1999, account='HDFC ••4821', due=D(2))
        add(page, kind='Credit card', title='HDFC Regalia', variable=True, amount=30000, account='HDFC Regalia ••4821', link='hdfcbank.com', due=D(9))
        add(page, kind='Someone I pay', title='Car wash', amount=800, upi='salim@ybl', pay_to='Salim', due=D(-2))
        add(page, kind='Rent', title='Rent', amount=25000, upi='landlord@sbi', pay_to='Mr Sharma', due=D(-60))
        add(page, kind='EMI / loan', title='Phone EMI', amount=2500, due=D(3), count=3)
        add(page, kind='Mobile', title='Recharge', amount=349, due=D(10), repeat='Custom', custom=(28, 'days'))
        page.goto(BASE)
        expect(page.locator('.hero-amount')).to_be_visible(timeout=8000)
        assert rows(page, 'Rent').count() >= 2, 'rent should show overdue cycles'
        page.screenshot(path=str(OUT / 'due.png'), full_page=True)
    scenario(page, 'add_variety', s_add_variety)

    def s_validation():
        page.get_by_role('button', name='Add a payment').click()
        s = top(page)
        s.get_by_role('button', name='Add payment').click()
        expect(s.get_by_text('Give it a name.')).to_be_visible()
        expect(s.get_by_text('Enter the amount.')).to_be_visible()
        s.locator('#ob-title').fill('X')
        s.get_by_label('Amount in rupees').fill('100')
        s.get_by_role('group', name='Method').get_by_role('button', name='UPI').click()
        s.locator('#ob-upi').fill('not-a-vpa')
        s.get_by_role('button', name='Add payment').click()
        expect(s.get_by_text('A UPI ID looks like name@bank.')).to_be_visible()
        s.get_by_label('Amount in rupees').fill('12.345')
        s.get_by_role('button', name='Add payment').click()
        expect(s.get_by_text("That amount doesn't look right.")).to_be_visible()
    scenario(page, 'validation', s_validation)

    def s_edit_amount():
        s = open_item(page, 'Parking')
        s.get_by_role('button', name=re.compile('^Edit ')).click()
        e = page.get_by_role('dialog', name='Edit payment')
        expect(e).to_be_visible()
        e.get_by_label('Amount in rupees').fill('1600')
        e.get_by_role('button', name='Save changes').click()
        settle(page, 500)
        close_all(page)
        expect(rows(page, 'Parking').first.locator('.row-amount')).to_have_text('₹1,600')
    scenario(page, 'edit_amount', s_edit_amount)

    def s_edit_anchor():
        obs = obligations(state['uid'])
        rent_id, rent = next((i, o) for i, o in obs.items() if o['title'] == 'Rent')
        original = rent['recurrence']['start']
        s = open_item(page, 'Rent', 0)
        s.get_by_role('button', name='Mark paid').click()
        page.get_by_role('dialog', name='Mark Rent paid').get_by_role('button', name='Mark paid').click()
        settle(page, 600)
        s = open_item(page, 'Rent', 0)
        s.get_by_role('button', name=re.compile('^Edit ')).click()
        e = page.get_by_role('dialog', name='Edit payment')
        shown = e.locator('#ob-start').input_value()
        assert shown > original, f'Next due should be the next unpaid cycle after {original}, shows {shown}'
        e.get_by_role('button', name='Save changes').click()
        settle(page, 600)
        after = obligations(state['uid'])[rent_id]['recurrence']['start']
        assert after == original, f'saving without changes moved the anchor {original} -> {after}'
    scenario(page, 'edit_keeps_anchor', s_edit_anchor)

    def s_emi():
        s = open_item(page, 'Phone EMI')
        expect(s.get_by_text(re.compile('1 of 3'))).to_be_visible()
        s.get_by_role('button', name='It already went through').click()
        settle(page, 600)
        tab(page, 'Calendar')
        tab(page, 'Due')
        obs = obligations(state['uid'])
        emi_id = next(i for i, o in obs.items() if o['title'] == 'Phone EMI')
        # Next cycle is a month out: open it through search.
        page.get_by_role('button', name='Search').click()
        top(page).get_by_label('Search').fill('Phone EMI')
        settle(page)
        top(page).locator('.row-hit').first.click()
        settle(page)
        expect(top(page).get_by_text(re.compile('2 of 3'))).to_be_visible()
        top(page).get_by_role('button', name=re.compile('^Edit ')).click()
        e = page.get_by_role('dialog', name='Edit payment')
        assert e.get_by_label('Number of payments').input_value() == '2', 'should show payments left'
        e.get_by_role('button', name='Save changes').click()
        settle(page, 600)
        assert obligations(state['uid'])[emi_id]['recurrence']['count'] == 3, 'total count must stay 3'
    scenario(page, 'emi_counts', s_emi)

    def s_move_undo():
        s = open_item(page, 'Parking')
        s.get_by_role('button', name='Move this one').click()
        s.get_by_label('New due date').fill(D(6))
        s.get_by_role('button', name='Move', exact=True).click()
        t = toast(page)
        assert 'Moved' in t, t
        page.locator('.toast').get_by_role('button', name='Undo').click()
        settle(page, 500)
        close_all(page)
        occ = [o for o in occurrences(state['uid']).values() if o.get('moveTo')]
        assert not occ, f'undo should clear the move: {occ}'
    scenario(page, 'move_undo', s_move_undo)

    def s_snooze():
        s = open_item(page, 'Car wash')
        s.get_by_role('button', name='Quiet the reminders').click()
        s.get_by_role('button', name='Tomorrow').click()
        settle(page, 500)
        expect(top(page).get_by_text(re.compile('Quiet until'))).to_be_visible()
    scenario(page, 'snooze', s_snooze)

    def s_skip_undo():
        s = open_item(page, 'Car wash')
        s.get_by_role('button', name='Skip this one').click()
        settle(page, 400)
        close_all(page)
        # The overdue cycle is gone; next month's Car wash is still there.
        expect(rows(page, 'Car wash').first).not_to_contain_text('late')
        page.locator('.toast').get_by_role('button', name='Undo').click()
        settle(page, 500)
        expect(rows(page, 'Car wash').first).to_contain_text('late')
    scenario(page, 'skip_undo', s_skip_undo)

    def s_paid_undo():
        rows(page, 'Jio').first.get_by_role('button', name='Pay').click()
        top(page).get_by_role('button', name='Already paid? Mark it paid').click()
        top(page).get_by_role('button', name='Mark paid').click()
        settle(page, 400)
        expect(rows(page, 'Jio').first).to_contain_text('Paid')
        page.locator('.toast').get_by_role('button', name='Undo').click()
        settle(page, 500)
        expect(rows(page, 'Jio').first).to_contain_text('Due today')
    scenario(page, 'paid_undo', s_paid_undo)

    def s_unsettle():
        s = open_item(page, 'Jio')
        s.get_by_role('button', name='Mark paid').click()
        top(page).get_by_role('button', name='Mark paid').click()
        settle(page, 500)
        s = open_item(page, 'Jio')
        s.get_by_role('button', name='Mark as not paid').click()
        settle(page, 500)
        close_all(page)
        expect(rows(page, 'Jio').first).to_contain_text('Due today')
    scenario(page, 'unsettle', s_unsettle)

    def s_variable():
        s = open_item(page, 'HDFC Regalia')
        s.get_by_role('button', name="Enter this bill's amount").click()
        s.get_by_label('Amount in rupees').fill('48720')
        s.get_by_role('button', name='Save', exact=True).click()
        settle(page, 400)
        close_all(page)
        amt = rows(page, 'HDFC Regalia').first.locator('.row-amount')
        expect(amt).to_have_text('₹48,720')
        assert 'est' not in (amt.get_attribute('class') or '')
    scenario(page, 'variable_amount', s_variable)

    def s_autopay_failed():
        add(page, kind='Subscription', title='Netflix', suggestion=True, amount=649, due=D(-3))
        expect(page.get_by_role('heading', name='Did these go through?')).to_be_visible()
        rows(page, 'Netflix').first.get_by_role('button', name='It failed').click()
        settle(page, 500)
        expect(rows(page, 'Netflix').first).to_contain_text('late')
        rows(page, 'Netflix').first.get_by_role('button', name='Pay').click()
        expect(top(page).get_by_role('link', name=re.compile('Open netflix.com'))).to_be_visible()
    scenario(page, 'autopay_failed', s_autopay_failed)

    def s_autopay_assumed():
        # A week without an answer: off the to-do list, but never shown as paid, and still confirmable.
        add(page, kind='Subscription', title='Spotify', amount=119, due=D(-10))
        sid = next(i for i, o in obligations(state['uid']).items() if o['title'] == 'Spotify')
        key = f"{sid}_{D(-10).replace('-', '')}"
        page.goto(f'{BASE}/?open={key}')
        sheet = page.get_by_role('dialog', name='Spotify')
        expect(sheet).to_contain_text('nobody confirmed it', timeout=8000)
        sheet.get_by_role('button', name='It went through').click()
        settle(page, 500)
        expect(sheet).to_contain_text('AutoPay went through')
        assert occurrences(state['uid'])[key]['status'] == 'autopaid'
    scenario(page, 'autopay_assumed', s_autopay_assumed)

    def s_stop_tracking():
        page.get_by_role('button', name='Search').click()
        top(page).get_by_label('Search').fill('Recharge')
        settle(page)
        top(page).locator('.row-hit').first.click()
        settle(page)
        top(page).get_by_role('button', name=re.compile('^Edit ')).click()
        page.get_by_role('button', name='Stop tracking').click()
        settle(page, 600)
        assert page.get_by_role('dialog').count() == 0, 'stop tracking should close the stack'
        page.get_by_role('button', name='Search').click()
        top(page).get_by_label('Search').fill('Recharge')
        expect(top(page).get_by_text(re.compile('^Stopped'))).to_be_visible()
    scenario(page, 'stop_tracking', s_stop_tracking)

    def s_delete():
        s = open_item(page, 'Phone EMI') if rows(page, 'Phone EMI').count() else None
        if not s:
            page.get_by_role('button', name='Search').click()
            top(page).get_by_label('Search').fill('Phone EMI')
            settle(page)
            top(page).locator('.row-hit').first.click()
            settle(page)
        top(page).get_by_role('button', name=re.compile('^Edit ')).click()
        page.get_by_role('button', name='Delete', exact=True).click()
        page.get_by_role('dialog', name='Edit payment').get_by_role('button', name='Delete', exact=True).click()
        settle(page, 700)
        assert page.get_by_role('dialog').count() == 0
        assert not any(o['title'] == 'Phone EMI' for o in obligations(state['uid']).values())
        assert not any(o.get('title') == 'Phone EMI' for o in occurrences(state['uid']).values())
    scenario(page, 'delete', s_delete)

    def s_payees():
        tab(page, 'Payees')
        expect(rows(page, 'Rahul').first).to_contain_text('1 recurring')
        page.get_by_role('button', name='Add a payee').click()
        s = top(page)
        s.locator('#pe-name').fill('Milkman')
        s.locator('#pe-upi').fill('milk@paytm')
        s.get_by_role('button', name='Add payee').click()
        settle(page, 500)
        rows(page, 'Milkman').first.get_by_role('button', name='Pay').click()
        s = top(page)
        s.get_by_label('Amount in rupees').fill('120')
        href = s.get_by_role('link', name='Open UPI app').get_attribute('href')
        assert 'pa=milk%40paytm' in href and 'am=120.00' in href, href
        s.get_by_role('button', name='Record this payment').click()
        settle(page, 600)
        expect(rows(page, 'Milkman').first).not_to_contain_text('recurring')
    scenario(page, 'payees', s_payees)

    def s_search():
        tab(page, 'Due')
        page.get_by_role('button', name='Search').click()
        s = top(page)
        expect(s.get_by_label('Search')).to_be_focused()
        s.get_by_label('Search').fill('rah')
        expect(s.locator('.row-title', has_text='Parking')).to_be_visible()
        expect(s.locator('.row-title', has_text='Rahul')).to_be_visible()
    scenario(page, 'search', s_search)

    def s_history():
        tab(page, 'You')
        tap(page, page.get_by_role('button', name='Payment history'))
        s = top(page)
        expect(s.get_by_text('Milkman')).to_be_visible()
        expect(s.get_by_text('Rent').first).to_be_visible()
        s.get_by_text('Rent').first.click()
        settle(page)
        expect(page.get_by_role('dialog', name='Rent')).to_be_visible()
    scenario(page, 'history', s_history)

    def s_back_button():
        tab(page, 'Due')
        open_item(page, 'Parking')
        top(page).get_by_role('button', name=re.compile('^Pay ')).click()
        settle(page)
        assert page.get_by_role('dialog').count() == 2
        page.go_back()
        settle(page, 500)
        assert page.get_by_role('dialog').count() == 1, 'back should close only the top sheet'
        page.go_back()
        settle(page, 500)
        assert page.get_by_role('dialog').count() == 0
        assert page.url.rstrip('/') == BASE, page.url
        expect(page.locator('.hero-amount')).to_be_visible()
    scenario(page, 'back_button', s_back_button)

    def s_tabs_back():
        tab(page, 'Calendar')
        tab(page, 'Payees')
        page.go_back()
        settle(page)
        expect(page.get_by_role('heading', name='Calendar')).to_be_visible()
    scenario(page, 'tabs_back', s_tabs_back)

    def s_deep_links():
        obs = obligations(state['uid'])
        parking = next(i for i, o in obs.items() if o['title'] == 'Parking')
        key = f"{parking}_{D(5).replace('-', '')}"
        page.goto(f'{BASE}/?open={key}&do=paid')
        expect(page.get_by_role('dialog', name='Mark Parking paid')).to_be_visible(timeout=8000)
        assert '?' not in page.url, 'query should be cleared'
        close_all(page)
        page.goto(f'{BASE}/?add=1')
        expect(page.get_by_role('dialog', name='New payment')).to_be_visible(timeout=8000)
        close_all(page)
        page.goto(f'{BASE}/calendar')
        expect(page.get_by_role('heading', name='Calendar')).to_be_visible(timeout=8000)
        page.goto(f'{BASE}/?open=nope_20260101')
        assert 'here anymore' in toast(page)
    scenario(page, 'deep_links', s_deep_links)

    def s_calendar():
        tab(page, 'Calendar')
        page.get_by_role('button', name='Next month').click()
        settle(page)
        page.get_by_role('button', name='Previous month').click()
        page.get_by_role('button', name='Previous month').click()
        settle(page)
        page.screenshot(path=str(OUT / 'calendar-prev.png'), full_page=True)
        paid = page.locator('.cal-dots i.paid').count()
        assert paid >= 1, 'last month should show the paid rent'
        page.get_by_role('button', name='Next month').click()
        page.screenshot(path=str(OUT / 'calendar.png'), full_page=True)
    scenario(page, 'calendar', s_calendar)

    def s_offline():
        tab(page, 'Due')
        ctx.set_offline(True)
        try:
            settle(page, 400)
            expect(page.get_by_text('Offline')).to_be_visible()
            rows(page, 'Car wash').first.get_by_role('button', name='Pay').click()
            top(page).get_by_role('button', name='Already paid? Mark it paid').click()
            top(page).get_by_role('button', name='Mark paid').click()
            settle(page, 500)
            # Paid today, so it stays under Today, dimmed.
            expect(page.locator('section', has=page.get_by_role('heading', name='Today')).locator('.row', has_text='Car wash')).to_contain_text('Paid')
        finally:
            ctx.set_offline(False)
        page.wait_for_timeout(3000)
        paid = [o for o in occurrences(state['uid']).values() if o.get('title') == 'Car wash' and o.get('status') == 'paid']
        assert paid, 'offline payment should sync once back online'
    scenario(page, 'offline_sync', s_offline)

    def s_you_settings():
        tab(page, 'You')
        page.get_by_label('Reminder time').select_option('8')
        page.get_by_label('Payday').select_option('1')
        page.get_by_role('button', name='Assume paid').click()
        settle(page, 600)
        prof = {k: val(v) for k, v in json.loads(urllib.request.urlopen(urllib.request.Request(
            f"http://127.0.0.1:8080/v1/projects/dueline-app/databases/(default)/documents/users/{state['uid']}",
            headers={'Authorization': 'Bearer owner'})).read())['fields'].items()}
        assert prof['remindHour'] == 8 and prof['payday'] == 1 and prof['autopayCheck'] == 'assume', prof
        tab(page, 'Due')
        expect(page.get_by_text(re.compile('^Before payday'))).to_be_visible()
        page.screenshot(path=str(OUT / 'due-payday.png'))
    scenario(page, 'settings', s_you_settings)

    def s_import():
        # One payment that already exists (skipped), two new ones, one with history and a payee.
        data = {
            'app': 'Dueline',
            'obligations': [
                {'id': 'x1', 'title': 'Spotify', 'category': 'subscription', 'amountType': 'fixed', 'amount': 11900, 'handling': 'auto', 'autoVia': 'card', 'method': 'card', 'recurrence': {'freq': 'months', 'interval': 1, 'start': D(4)}, 'remind': [1], 'active': True},
                {'id': 'x2', 'title': 'Claude Pro', 'category': 'subscription', 'amountType': 'variable', 'amount': 235000, 'handling': 'manual', 'method': 'card', 'url': 'https://claude.ai/settings/billing', 'recurrence': {'freq': 'months', 'interval': 1, 'start': D(-27)}, 'remind': [1, 0], 'active': True},
                {'id': 'x4', 'title': 'Laundry', 'category': 'person', 'amountType': 'fixed', 'amount': 60000, 'handling': 'manual', 'method': 'upi', 'payeeId': 'p8', 'payTo': 'Ramesh', 'recurrence': {'freq': 'months', 'interval': 1, 'start': D(2)}, 'remind': [1, 0], 'active': True},
                {'id': 'x3', 'title': 'Gym', 'category': 'person', 'amountType': 'fixed', 'amount': 150000, 'handling': 'manual', 'method': 'upi', 'payeeId': 'p9', 'upi': 'gym@okaxis', 'recurrence': {'freq': 'months', 'interval': 1, 'start': D(6)}, 'remind': [1, 0], 'active': True},
            ],
            'occurrences': [{'obligationId': 'x2', 'due': D(-27), 'status': 'paid', 'paidOn': D(-26), 'ref': 'R-1'}],
            'payees': [{'id': 'p9', 'name': 'Iron Gym', 'upi': 'gym@okaxis'}, {'id': 'p8', 'name': 'Ramesh', 'phone': '9876543210'}],
        }
        f = OUT / 'import.json'
        f.write_text(json.dumps(data), encoding='utf-8')
        tab(page, 'You')
        page.get_by_label('Import payments from a file').set_input_files(str(f))
        sheet = page.get_by_role('dialog', name='Import payments')
        expect(sheet).to_contain_text('3 new payments, 1 already in Dueline')
        sheet.get_by_role('button', name='Add 3 payments').click()
        assert 'Added 3 payments' in toast(page)
        tab(page, 'Due')
        expect(rows(page, 'Claude Pro').first.locator('.glyph[data-mark="Claude"] svg')).to_have_count(1)
        expect(rows(page, 'Gym').first).to_be_visible()
        obs = obligations(state['uid'])
        claude = next(i for i, o in obs.items() if o['title'] == 'Claude Pro')
        assert occurrences(state['uid'])[f"{claude}_{D(-27).replace('-', '')}"]['status'] == 'paid'
        assert sum(1 for o in obs.values() if o['title'] == 'Spotify') == 1
        gym = next(o for o in obs.values() if o['title'] == 'Gym')
        assert gym.get('payeeId') in docs(state['uid'], 'payees'), 'payee should be linked'
        # No UPI ID yet, only a number: Pay offers the number, then asks on return.
        rows(page, 'Laundry').first.get_by_role('button', name='Pay').click()
        pay = top(page)
        expect(pay).to_contain_text('your UPI app can find Ramesh by that number')
        pay.get_by_role('button', name='Copy number').click()
        # Copying isn't paying: no question unless the app is actually left and come back to.
        page.wait_for_timeout(13000)
        expect(pay.get_by_text('Did the payment go through?')).to_have_count(0)
        flip = """(v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
                            document.dispatchEvent(new Event('visibilitychange')); }"""
        page.evaluate(flip, 'hidden')
        page.wait_for_timeout(400)
        page.evaluate(flip, 'visible')
        page.evaluate('() => { delete document.visibilityState; }')
        expect(pay.get_by_text('Did the payment go through?')).to_be_visible(timeout=4000)
        close_all(page)
    scenario(page, 'import', s_import)

    def s_create_account():
        tab(page, 'You')
        tap(page, page.get_by_role('button', name='Use email or another way'))
        s = top(page)
        s.get_by_role('button', name='Email').click()
        s.locator('#acc-email').fill(EMAIL)
        s.locator('#acc-pw').fill(PW)
        s.get_by_role('button', name='Save with email').click()
        expect(page.get_by_text(EMAIL)).to_be_visible(timeout=8000)
        assert uid_of(page) == state['uid'], 'linking must keep the same uid'
    scenario(page, 'create_account', s_create_account)

    def s_signout_signin():
        tab(page, 'You')
        tap(page, page.get_by_role('button', name='Sign out'))
        expect(page.get_by_role('button', name='Continue with Google')).to_be_visible(timeout=8000)
        page.get_by_role('button', name='Email').click()
        s = top(page)
        s.locator('#acc-email').fill(EMAIL)
        s.locator('#acc-pw').fill(PW)
        s.get_by_role('button', name='Sign in', exact=True).click()
        expect(page.locator('.hero-amount')).to_be_visible(timeout=10000)
        assert rows(page, 'Parking').count() >= 1
    scenario(page, 'signout_signin', s_signout_signin)

    def s_guest_merge():
        tab(page, 'You')
        tap(page, page.get_by_role('button', name='Sign out'))
        page.get_by_role('button', name='Try it without an account').click()
        expect(page.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        add(page, kind='Someone I pay', title='Guest item', amount=100, due=D(1))
        tab(page, 'You')
        tap(page, page.get_by_role('button', name='Use email or another way'))
        s = top(page)
        s.get_by_role('button', name='Email').click()
        s.get_by_role('button', name='I have an account').click()
        s.locator('#acc-email').fill(EMAIL)
        s.locator('#acc-pw').fill(PW)
        s.get_by_role('button', name='Sign in', exact=True).click()
        expect(page.get_by_text(EMAIL)).to_be_visible(timeout=10000)
        tab(page, 'Due')
        expect(rows(page, 'Guest item').first).to_be_visible(timeout=6000)
        expect(rows(page, 'Parking').first).to_be_visible()
    scenario(page, 'guest_merge', s_guest_merge)

    def s_wrong_password():
        tab(page, 'You')
        tap(page, page.get_by_role('button', name='Sign out'))
        page.get_by_role('button', name='Email').click()
        s = top(page)
        s.locator('#acc-email').fill(EMAIL)
        s.locator('#acc-pw').fill('wrongpass')
        s.get_by_role('button', name='Sign in', exact=True).click()
        expect(s.get_by_text('Email or password is wrong.')).to_be_visible(timeout=8000)
        s.locator('#acc-pw').fill(PW)
        s.get_by_role('button', name='Sign in', exact=True).click()
        expect(page.locator('.hero-amount')).to_be_visible(timeout=10000)
    scenario(page, 'wrong_password', s_wrong_password)

    def s_desktop():
        dp = browser.new_page(viewport={'width': 1280, 'height': 820})
        dp.on('pageerror', lambda e: errors.append(f'desktop pageerror: {e}'))
        dp.goto(BASE)
        dp.get_by_role('button', name='Try it without an account').click()
        expect(dp.get_by_role('heading', name='What do you pay every month?')).to_be_visible(timeout=10000)
        dp.get_by_role('button', name='Someone I pay').click()
        dp.wait_for_timeout(500)
        dp.screenshot(path=str(OUT / 'desktop-add.png'))
        dp.close()
    scenario(page, 'desktop', s_desktop)

    def s_delete_account():
        tab(page, 'You')
        tap(page, page.get_by_role('button', name='Delete everything'))
        s = top(page)
        s.locator('#del-typed').fill('DELETE')
        s.locator('#del-pw').fill(PW)
        s.get_by_role('button', name='Delete my account and data').click()
        expect(page.get_by_role('button', name='Continue with Google')).to_be_visible(timeout=10000)
        assert not obligations(state['uid']), 'data should be gone'
    scenario(page, 'delete_account', s_delete_account)

    browser.close()

print('\n==== RESULTS')
for n, r, m in results:
    print(f'{r:4} {n}{"  " + m if m else ""}')
real = [e for e in errors if 'favicon' not in e]
if real:
    print('\n==== CONSOLE ERRORS')
    for e in dict.fromkeys(real):
        print(' ', e[:300])
print(f"\n{sum(r == 'PASS' for _, r, _ in results)}/{len(results)} passed")
