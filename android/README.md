# Dueline for Android (Google Play)

A Trusted Web Activity: a thin Android app that opens https://dueline-app.web.app full screen in Chrome. The web app is the product; this folder only wraps it for Google Play. Changes to the site reach Play users immediately, with no new release.

Generated with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) from the live web manifest (`twa-manifest.json` holds the settings). Package `com.thealgothrim.dueline`.

## How the app proves it owns the site

`public/.well-known/assetlinks.json` on the website lists the SHA-256 fingerprints of the keys allowed to open it full screen:

- the upload key, which signs the builds uploaded to Play and test installs;
- Google's app-signing key (Play Console > Test and release > App integrity > App signing), which signs what Play delivers to phones.

If a fingerprint is missing, the app still works but shows a browser bar at the top.

## Releasing an update

Only needed when the Android wrapper changes (icons, name, notification setup). Website changes need nothing here.

1. Bump `appVersionCode` (and `appVersionName`) in `twa-manifest.json`, then regenerate the project with Bubblewrap.
2. `gradlew bundleRelease assembleRelease` with JDK 17 and the Android SDK (platform 36).
3. Sign the bundle with the upload key (`jarsigner`), then upload it to Play Console as a new release.

The upload key and its password are kept outside this repository and must never be committed.
