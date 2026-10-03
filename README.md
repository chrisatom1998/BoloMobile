# Bolo mobile

Bolo is an Expo app for practicing practical Hindi on Android and iOS. It includes 102 short lessons across 11 guided plans, 30 standalone written scenarios, bundled offline Hindi lesson audio, adaptive phrase review, persisted scene mastery, personal practice recommendations, daily and weekly progress, optional reminders, consent-gated generated AI voice playback, typed coaching, Asha GPT-Live conversation, and focused pronunciation checks.

On iOS, users choose Hindi immersion or Hindi with English help and can switch to beginner, conversation, or lesson mode before an Asha session. Before text or audio leaves the device, Bolo presents a versioned AI data-use consent notice. Start Conversation requests microphone permission and opens a full-duplex WebRTC media stream. Its microphone track stays enabled during the active chat so the learner can speak naturally or interrupt Asha; Mute disables it until unmuted. The app sends its SDP offer to Bolo's trusted server, which creates a `gpt-live-1` session with a separate Responses delegation backend. The permanent OpenAI key never enters the app. Live voice does not create a recording file or capture microphone audio in the background. End Chat gracefully closes the session, and the stream and its tracks are released at End Chat, when leaving the screen, or when the app leaves the foreground. Other platforms retain their existing voice journey. Typed chat, saved phrases, lessons, and progress remain available. See [`docs/asha-live.md`](docs/asha-live.md) for setup and data flow.

## Run locally

Use Node.js 22.23.2, pinned in `.nvmrc`, and npm. With nvm or nvm-windows, run `nvm install 22.23.2` followed by `nvm use 22.23.2`. The IPA inspection tests also require Python 3 (`python3`) and Bash (`bash`) on `PATH`; on Windows, run verification from Git Bash.

```powershell
npm ci
npm run verify
npx expo start --dev-client
```

Install a development build on your device before connecting to the local server. To create one with the checked-in EAS development profile, run `node scripts/run-eas-from-app-root.mjs build --platform android --profile development` (use `--platform ios` for iOS), then install the resulting build. Expo Go cannot load the app's custom WebRTC native module.

Bolo resolves endpoints from reviewed Expo configuration. `BOLO_API_URL` serves lessons, typed coaching, audio, reports, and deletion. `BOLO_LIVE_API_URL` selects Asha's `/api/live-call` route and currently resolves to the same complete AppDeploy API. Keeping the two settings explicit lets release validation inspect the live-voice endpoint without changing legacy routes. Preview and production EAS environments must set both reviewed URLs; release validation and signed-IPA inspection verify them and reject `EXPO_PUBLIC_*` runtime overrides. These endpoint values are embedded in the app bundle and are public URLs, never credentials.

The existing AppDeploy backend implements the rate-limited `POST /api/live-call` and configuration-only `/api/live-status` routes described in [`docs/asha-live.md`](docs/asha-live.md), alongside every existing text, audio, report, support, deletion, and legal-page route. The Live route exchanges a completed WebRTC offer with OpenAI's `/v1/live/sessions` endpoint and returns only the answer SDP and session ID. Responses-delegated Bolo tools execute through a permission-scoped native dispatcher so saved phrases and progress remain in Bolo's existing local stores. The consent-gated session temporarily supplies the bounded lesson/chat fields and minimal tool results listed in the architecture document; saved-phrase lists/counts, review schedules, daily totals, and full scene history are excluded. Saves wait for the existing phrase-picker confirmation; progress requires a completed interaction; duplicate and stale calls cannot repeat a mutation. The random installation `clientId` remains an abuse/rate-limit partition, not authentication. Typed coaching remains on the existing Responses path. `src/data/voice-profile.json` continues to define the separate rendered/bundled lesson voice; Asha's live audio is carried directly by GPT-Live.

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

# Upload the exact inspected iOS build to App Store Connect
$env:EAS_BUILD_ID = '<inspected EAS build UUID>'
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
