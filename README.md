# Bolo mobile

Bolo is an Expo app for practicing practical Hindi on Android and iOS. It includes 30 offline written scenarios, bundled offline Hindi lesson audio, adaptive phrase review, persisted scene mastery, personal practice recommendations, daily and weekly progress, optional reminders, consent-gated AI voice playback, typed coaching, GPT Realtime voice turns, and focused pronunciation checks.

Users choose whether Asha replies in English or Hindi from the visible language control. Before text or audio leaves the device, Bolo presents a versioned AI data-use consent notice. Listen sends selected lesson or reply text for server-generated AI speech; there is no device text-reader fallback. Bolo keeps up to 100 recent Asha chat messages in unencrypted on-device storage so completed typed and voice turns remain visible after leaving or relaunching the app. Users can clear only that local chat from Practice with Asha, while Settings deletes all local data and reports associated with the random app identifier. Starting live voice requests microphone permission and opens a WebRTC media stream with its audio track disabled. Tap the glowing orb to begin each turn, then tap the orb again to send the turn. Microphone transmission is enabled only during an active turn, remains disabled between turns, and the stream is released when the user taps End (the close control), leaves the screen, or the app leaves the foreground. Live voice does not create a recording file or capture microphone audio in the background. GPT Realtime speech returns over that encrypted connection using a short-lived client secret; the standard OpenAI API key remains on Bolo's backend. Pronunciation recordings are deleted from the device after each request, AI feedback can be reported, and users can delete local history and reports associated with their random app identifier from Settings.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```powershell
npm install
npm run verify
npx expo start
```

Bolo resolves its API endpoint from the reviewed Expo configuration. Staging builds may set the build-time `BOLO_API_URL` value in their EAS environment; production validation requires the resolved URL to exactly match the runtime fallback and rejects the former `EXPO_PUBLIC_BOLO_API_URL` client override. The configured endpoint is embedded in the app bundle, so it must always be a public URL rather than a secret.

The audited AppDeploy backend source implements `POST /api/realtime-token`, validates and persistently rate-limits the random client identifier, and requests a `gpt-realtime-2.1` client secret from `POST /v1/realtime/client_secrets` with a privacy-preserving `OpenAI-Safety-Identifier`. It returns only OpenAI's short-lived `value` and `expires_at`; it never returns or embeds the standard `OPENAI_API_KEY`. Typed coaching uses the Responses API with `store: false`, moderation, bounded history, and a pinned model. `src/data/voice-profile.json` defines Asha's one supported voice: `marin`. The deployed `phrase-audio` endpoint uses OpenAI `gpt-4o-mini-tts` with that same voice; Realtime uses it directly; and the bundled lesson clips are regenerated from that reviewed endpoint. The client chunks generated replies at the verified 240-character endpoint boundary and keeps a bounded in-memory cache. The production backend and Realtime token configuration were verified on July 14, 2026.

To refresh bundled lesson audio after an intentional Asha voice-profile change, run `node scripts/generate-offline-hindi-audio.mjs`. It sends only the app's checked-in lesson phrases to the reviewed endpoint, writes content-addressed AAC/M4A assets, and is safe to rerun after an interrupted generation.

`react-native-webrtc` is custom native code, so Realtime speech-to-speech requires an EAS development or production build and is not available in Expo Go.

## Public release configuration

The permanent App Store and Play identity is `com.bolo.hindi`. Production builds are linked to the publisher's EAS project with these non-secret values:

```powershell
$env:BOLO_APP_IDENTIFIER = 'com.bolo.hindi'
$env:BOLO_EAS_PROJECT_ID = '573b5aad-b676-44aa-8ec4-34b831b6d5ff'
$env:BOLO_EXPO_OWNER = 'appdevcmjatom'
```

The same values are configured in the EAS `production` environment so cloud builds resolve the identical app identity. Apple and Google treat this identifier as permanent; changing it creates a different app.

Apple metadata also requires publisher-owned review details when `eas metadata:push` runs:

```powershell
$env:BOLO_PUBLISHER_NAME = '<legal seller or developer name>'
$env:BOLO_REVIEW_FIRST_NAME = '<review contact first name>'
$env:BOLO_REVIEW_LAST_NAME = '<review contact last name>'
$env:BOLO_REVIEW_EMAIL = '<monitored review email>'
$env:BOLO_REVIEW_PHONE = '<review contact phone>'
$env:BOLO_SUPPORT_EMAIL = '<public monitored support email>'
```

These values are deliberately absent from source control. Google Play's support email is entered manually in Play Console. The public pages used by both listings are already live:

- Privacy: https://74e39779183cf78fed.v2.appdeploy.ai/?page=privacy
- Support: https://74e39779183cf78fed.v2.appdeploy.ai/?page=support
- Terms: https://74e39779183cf78fed.v2.appdeploy.ai/?page=terms

## Build and submit

```powershell
# Installable Android test build
npm run build:android:preview

# Installable iOS test build
npm run build:ios:preview

# Signed store builds: Android App Bundle and iOS archive
npm run build:production

# Signed iOS store archive only
npm run build:ios:production

# Upload Android to the internal test track first
npm run submit:android:internal

# Upload the approved Android build to a production draft
npm run submit:android:production

# Upload iOS to App Store Connect
npm run submit:ios:production

# Push the checked-in Apple listing after the first binary exists
npm run metadata:push
```

These scripts pin the tested EAS CLI, force `BoloMobile` as the upload root, and run release validation before every production build or submission. Do not replace them with raw `eas` or `npx eas-cli` commands from this nested parent repository.

Google requires the first Play Console upload to be completed manually before API submissions work. The production submit profile creates a draft rather than releasing automatically. App Store release is manual with phased release configured after approval.

## Store materials

- `assets/store/` contains final 1024×1024 Apple art, the 512×512 Play icon, and the 1024×500 Play feature graphic.
- `store/listings.json` contains Apple and Google listing copy.
- `store.config.json` and `store.config.js` provide Apple EAS Metadata with fail-closed review identity.
- `store/privacy-declarations.md` maps verified data flows to Apple App Privacy and Google Data safety.
- `store/console-checklist.md` covers the remaining console and account steps.
- `store/screenshots/README.md` defines the exact shipping-build screenshot set. Screenshots must come from the signed Android and iOS builds, not a web render or mockup.

The v1 iOS scope is phone-only. Re-enabling iPad support also requires iPad layout testing and a 13-inch iPad screenshot set.

The original artwork can be regenerated with `python scripts/generate-store-assets.py`; regeneration needs Pillow and a Devanagari font. Generated PNG files are checked in, so Pillow is not a runtime or build dependency.

## Release verification

```powershell
npm run verify
npx expo-doctor
npx expo export --platform android
npx expo export --platform ios

# Requires publisher identity variables and eight signed-build screenshots
npm run release:validate
```

`release:validate` verifies the permanent identifiers, EAS linkage, review identity, live legal URLs, Apple metadata, and exact screenshot dimensions. A failure is intentional until every publisher-owned input is present.

Before public submission, the publisher must still:

- Confirm the legal seller/developer name, permanent identifier, monitored support email, territories, price, trader status, and recommended 13+ audience.
- Capture the required screenshots from signed builds and test consent, chat persistence across End/leave/relaunch, microphone behavior, recording cleanup, speech playback, reporting, deletion, and English/Hindi reply selection on physical Android and iOS devices.
- Complete Apple App Privacy, Apple age rating, Google Data safety, IARC content rating, target-audience, AI, and other store-console declarations using the checked-in guidance.
- Confirm production agreements and processor status for AppDeploy and OpenAI, and operate a real review schedule for AI reports and support requests.
- Complete Google's 12-tester/14-day closed test when the developer account is subject to the personal-account testing rule.
