# Dueline: product

## What it is

A single place for every payment that is coming up: credit-card bills, subscriptions, recharges, rent, the maid and the parking attendant paid by UPI, and the AutoPays that are already handled. It answers one question first, "what needs me?", separates it from what will happen automatically, and gets you to the fastest way to pay.

It is not a budgeting app, an expense tracker or a payment app. It sits above the payment apps.

## Who it's for

Family and friends first, then anyone in India who juggles cards, subscriptions and people they pay by UPI. Android first; on iPhone, Web Push needs the app installed to the Home Screen.

## Principles

1. **Needs you vs handled.** Every cycle is either something you must do or something already happening. The home number is only what needs you in the next 7 days.
2. **Expected is not confirmed.** An AutoPay is announced before and asked about after. The app never pretends money moved.
3. **Handoff, not custody.** Pay opens your UPI app with the amount filled in, a QR on a laptop, or the biller's page. No PIN, no card number, no account number required.
4. **Calm.** One morning reminder, one evening nudge only if something due today is unpaid, overdue steps at 1, 3, 7 and 14 days, then quiet. Three or more at once become one digest. Coral for late, never alarm red.
5. **Manual first.** No bank, email or SMS access to be useful. Privacy is a feature: rules-enforced per-person data, export anytime, delete means delete.
6. **Free to run, free to use.** Firebase Spark + Vercel Hobby. No billing anywhere.

## V1 (shipped 2026-09-26)

Fixed and variable amounts (estimates until the bill arrives), one-off and recurring (weekly, monthly incl. last day, quarterly, yearly, every N days/weeks/months/years, ends after N or on a date), manual vs AutoPay, UPI payees, payment links, per-cycle amount / move / snooze / skip, mark paid with reference, undo everywhere, AutoPay confirm, payday forecast, calendar, payees, search, history, Web Push reminders, offline, guest accounts that upgrade in place to Google or email, export, full account deletion.

## Later, deliberately

- Smart intake: statement emails, Android SMS/notification parsing (native territory), known-biller links.
- Shared obligations (split rent with a flatmate), a household view.
- Bharat Connect / BBPS integration only if this ever becomes a business.
- Light theme.
