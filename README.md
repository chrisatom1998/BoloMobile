# Bolo mobile

Bolo is an Expo app for practicing practical Hindi on Android and iOS. It includes 30 offline written scenarios, bundled offline Hindi lesson audio, adaptive phrase review, persisted scene mastery, personal practice recommendations, daily and weekly progress, optional reminders, consent-gated AI voice playback, typed coaching, GPT-Live voice conversation, and focused pronunciation checks.

Users choose whether Asha replies in English or Hindi from the visible language control. Before text or audio leaves the device, Bolo presents a versioned AI data-use consent notice. Listen sends selected lesson or reply text for server-generated AI speech; there is no device text-reader fallback. Bolo keeps up to 100 recent Asha chat messages in unencrypted on-device storage so completed typed and voice turns remain visible after leaving or relaunching the app. Users can clear only that local chat from Practice with Asha, while Settings deletes all local data and reports associated with the random app identifier. Starting live voice requests microphone permission and opens a WebRTC media stream. Your microphone stays on continuously until you mute it by tapping the orb. Tap again to unmute; you can speak while Asha is speaking. The stream is released when the user taps End (the close control), leaves the screen, or the app leaves the foreground. Live voice does not create a recording file or capture microphone audio in the background. GPT-Live speech returns over that encrypted connection after the backend exchanges the WebRTC connection offer for a session answer; the standard OpenAI API key remains on Bolo's backend. Pronunciation recordings are deleted from the device after each request, AI feedback can be reported, and users can delete local history and reports associated with their random app identifier from Settings.

## Run locally

Use Node.js 22.23.2, pinned in `.nvmrc`, and npm. With nvm or nvm-windows, run `nvm install 22.23.2` followed by `nvm use 22.23.2`. The IPA inspection tests also require Python 3 (`python3`) and Bash (`bash`) on `PATH`; on Windows, run verification from Git Bash.

```powershell
npm ci
npm run verify
npx expo start --dev-client
```

Install a development build on your device before connecting to the local server. To create one with the checked-in EAS development profile, run `node scripts/run-eas-from-app-root.mjs build --platform android --profile development` (use `--platform ios` for iOS), then install the resulting build. Expo Go cannot load the app's custom WebRTC native module.

Bolo resolves its API endpoint from the reviewed Expo configuration. Staging builds may set the build-time `BOLO_API_URL` value in their EAS environment; production validation requires the resolved URL to exactly match the runtime fallback and rejects the former `EXPO_PUBLIC_BOLO_API_URL` client override. The configured endpoint is embedded in the app bundle, so it must always be a public URL rather than a secret.

The portable backend reference in `backend/live.ts` implements `POST /api/live-call`: it validates the random client identifier, reply language, bounded SDP offer and recent history, rate-limits session creation, and authenticates `POST /v1/live/calls` with the server-held `OPENAI_API_KEY`. The model is pinned to `gpt-live-1`; the mobile app receives only `{answerSdp, sessionId}`. It no longer requests a Realtime client secret. `GET /api/live-status` checks backend configuration and model access without creating a session. Typed coaching and phrase TTS keep their separate existing endpoints. `src/data/voice-profile.json` defines Asha's supported voice, `marin`.

GPT-Live is a continuous bidirectional conversation. The orb mutes or unmutes the microphone; it does not commit audio or request a generated turn. Microphone and assistant playback states are independent. Input and output captions can update simultaneously, and revisable timestamped transcript rows are saved without inventing response-completion events. Live transcript deltas never trigger separate TTS requests. Typed coaching and replay are disabled until the live session ends.

Before distributing this iOS update, configure a trusted server implementing `/api/live-call` and `/api/live-status`. Set `BOLO_LIVE_API_URL=https://your-live-server.example` in the EAS build environment; Expo embeds this public base URL as `extra.boloLiveApiUrl`. The Live client never falls back to the existing typed-coaching backend. An unset URL produces a visible configuration error. The reference backend is not deployed by this iOS migration. On that server, configure an OpenAI key with `gpt-live-1` access, then run the non-session capability check and a real WebRTC smoke test from an EAS development build on a device. Verify microphone mute/unmute, overlapping speech, Romanized captions, language selection, disconnect/reconnect, interruption/background cleanup, and transcript persistence. A passing capability check does not establish successful SDP negotiation or native audio playback. No native device or production GPT-Live session verification is implied by the source migration. Consent version 9 re-discloses continuous microphone behavior and history sent during live startup.

To refresh bundled lesson audio after an intentional Asha voice-profile change, run `node scripts/generate-offline-hindi-audio.mjs`. It sends only the app's checked-in lesson phrases to the reviewed endpoint, writes content-addressed AAC/M4A assets, and is safe to rerun after an interrupted generation.

`react-native-webrtc` is custom native code, so GPT-Live speech-to-speech requires an EAS development or production build and is not available in Expo Go.

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
