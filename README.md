# Dueline

Everything you need to pay, on one line. Card bills, rent, subscriptions and the people you pay by UPI: what needs you, what AutoPay already has covered, and a one-tap route to paying.

- App: https://dueline-app.web.app (Firebase Hosting)
- Reminder server: https://dueline-api.vercel.app (Vercel project `thealgothrim/dueline-api`)
- Firebase project: `dueline-app` (Spark, free), Firestore in `asia-south1` (Mumbai)

Designed and built by Gaurav Kumar, The Algothrim.

## How it fits together

```
Phone / laptop (PWA)                      Firebase (Spark)                 Vercel (Hobby)
React + Vite, offline-first  ── rules ──▶  Auth: guest, email (Google*)
Firestore local cache        ◀── sync ──▶  Firestore users/{uid}/...  ◀─── /api/tick   24 daily crons,
Service worker: shell + push                                                    one per UTC hour
          ▲                                                                /api/test-push
          └──────────────── Web Push (VAPID, via FCM/Apple/Mozilla) ◀──────────┘
```

- **One model.** An `Obligation` is the template (Parking, ₹1,500, monthly on the 1st). Its dates are computed from a `Recurrence`, never stored. An `OccurrenceDoc` exists only once something happens to one cycle (paid, skipped, amount entered, moved), keyed `${obligationId}_${YYYYMMDD}`. See `src/core/types.ts`.
- **Money is integer paise.** Dates are calendar days in the person's timezone; only timestamps are UTC.
- **Expected is not confirmed.** A passed AutoPay becomes "Did it go through?" unless the person chose "Assume paid" (or a week passes). `src/core/timeline.ts`.
- **One engine, two places.** `src/core/` is pure TypeScript used by the app and bundled into the server, so what the screen says is due and what the server reminds about can't drift.
- **Payment is a handoff.** `upi://pay` intents, a QR on laptops, or the biller's own page. Dueline never moves money and never stores a PIN or card number.

### Reminders without paying for anything

Vercel Hobby allows 100 cron jobs per project but each may run only once a day, so `vercel.json` registers 24 of them on `/api/tick`, one per UTC hour. Each tick:

1. lists push devices (one collection-group read),
2. plans notices per person with `src/core/notify.ts` (before, due today, evening nudge, overdue steps, AutoPay heads-up, AutoPay check),
3. keeps what's due within 45 minutes and under 18 hours late,
4. claims each by creating `users/{uid}/sent/{noticeId}` (create-only in the rules, so repeated ticks never double-send),
5. pushes, folding 3+ notices into one digest, and prunes subscriptions the push service reports gone (never ones younger than 10 minutes: FCM answers 410 for a few seconds after a subscription is created),
6. writes a heartbeat to `system/tick`, shown on the You screen as "Reminder server last checked …" (Vercel Hobby keeps only an hour of logs), and once a day prunes `sent` entries older than a month.

No service-account key exists (Spark plan). The server signs in as one email/password **reminder robot** whose uid is pinned in `firestore.rules`: it can read schedules and devices, create `sent` entries and prune devices, and cannot touch money data or payees.

## Develop

```bash
npm install
npm test                      # 46 engine tests (recurrence, timeline, reminders, money, UPI)
npm run test:rules            # 9 Firestore rules tests against the emulator (needs JDK 21, see below)
npm run dev                   # against production Firebase
VITE_EMULATORS=1 npm run dev  # against local emulators
```

Emulators: `firebase emulators:start --only auth,firestore --project dueline-app` with `JAVA_HOME` pointing at `C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot`.

End to end, using `C:\tmp\webtools` (Playwright, installed Chrome):

```bash
C:\tmp\webtools\Scripts\python.exe scripts/e2e.py            # dev server + emulators, phone-sized screenshots
C:\tmp\webtools\Scripts\python.exe scripts/qa.py             # 30 scenarios: edits keep the schedule anchor, EMI counts, move/snooze/skip/undo,
                                                               # failed AutoPay, stop/delete, payees, search, history, Android back, deep links,
                                                               # offline sync, settings, guest -> email, sign out/in, guest merge, delete account
C:\tmp\webtools\Scripts\python.exe scripts/live-check.py <CRON_SECRET>   # production: real push, real tick, dedupe, then deletes its account
```

## Deploy

```bash
npm run deploy:web    # build + Firebase Hosting
npm run deploy:rules  # Firestore rules
npm run deploy:api    # bundle server/ into api/*.js with esbuild, then vercel deploy --prod
```

`api/*.js` is generated from `server/*.ts` by `scripts/build-api.mjs` and committed, because Vercel deploys the files as-is. Edit `server/`, never `api/`.

Secrets live in `.env.local` (gitignored) and in the Vercel project's production env: `DUELINE_ROBOT_EMAIL`, `DUELINE_ROBOT_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. The VAPID public key is also in `src/lib/firebase.ts`; they must match or every push fails.

Manual checks: `curl -H "authorization: Bearer $CRON_SECRET" "https://dueline-api.vercel.app/api/tick?dry=1"` (add `&at=<ms>` to plan as if it were another time).

## One-time console steps (Gaurav)

- **Google sign-in (optional).** Firebase console, dueline-app, Authentication, Sign-in method, Google, Enable, choose a support email, Save. Nothing else is needed: sign-in uses popups through `dueline-app.firebaseapp.com`, which the auto-created OAuth client already trusts. Until then the button says Google isn't switched on yet, and guest + email accounts cover everything.
- **Delete the two empty projects** created by mistake during setup: `duelineapp` and `dueline-in` (Project settings, Delete project).

## Icons

`public/icons/*` and `public/og.png` are rendered from one SVG mark (a "d" drawn as a coin and a line) by `scripts/make-icons.py`.
