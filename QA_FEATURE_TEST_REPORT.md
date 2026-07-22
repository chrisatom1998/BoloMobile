# BoloMobile feature test report

**Date:** 2026-07-21 (America/New_York)  
**Scope:** Current checkout, including the in-progress working-tree changes present during this run. Those source and test changes were preserved; this QA pass made no production-code or test-code edits.

## Result at a glance

| Check | Result | Evidence |
| --- | --- | --- |
| Full repository gate | PASS | `npm run verify`: lint, TypeScript, **41/41 Jest suites** and **218/218 tests**, store validation, and Maestro-flow validation all passed. |
| Deployed service acceptance | PASS | `npm run acceptance:live`: **30/30** checks passed across three independent passes. |
| Current iOS simulator build | PASS | Expo iOS export completed; `xcodebuild` for `Bolo.xcworkspace` / `Bolo` / iPhone Simulator ended with `BUILD SUCCEEDED`; the resulting app installed and loaded through Metro. |
| End-to-end Realtime voice | PASS | `scripts/run-15-minute-voice-chat.mjs` used an isolated Chrome profile and synthetic Hindi microphone. It completed the full **15-minute target**, **41 turns**, final ready state, and clean end-session transition. |
| Executable Maestro UI flows | BLOCKED | The booted iOS 26.5 simulator is not discovered by local Maestro 2.7.0. `maestro list-devices` lists only Chromium, and an explicit simulator UDID is reported as not connected. The five YAML flows were still syntax/structure validated by `npm run e2e:validate`. |
| Native physical-device voice | BLOCKED | The paired iPhone was offline. A real iPhone remains required for microphone capture, native WebRTC media routing, TTS output routing, haptics, and notification delivery. |

## Feature matrix

| Feature area | Result | Verification evidence |
| --- | --- | --- |
| First launch, hydration, onboarding, learner preferences, and accessible home navigation | PASS | `root-layout-hydration`, `home-journey`, `home-accessibility`, `accessibility-theme`, and the iOS launch check. |
| Scene catalog, category filtering, progress/resume, answers, completion, and bundled offline lesson audio | PASS | `scenes`, `scene-journey`, `offline-voice-player`, `scene-audio-exclusivity`, and `privacy-and-scene-card-ui`. |
| Saved phrases, selection preservation, Romanized display, English meaning, replay speed, removal, and review | PASS | `phrases-journey`, `phrases-accessibility`, `transcript-selection`, `learning`, `storage`, and `language-and-api`. |
| Daily goals, mastery, streaks, progress, foreground timing, reminders, and reminder routing | PASS | `learning`, `practice-reminder`, `practice-reminder-routing`, `foreground-timer`, and `app-state-persistence`. |
| Consent, privacy copy, settings, local/remote data deletion, local alerts, and public legal pages | PASS | `ai-consent-gate`, `settings-lifecycle`, `app-state-clear-data`, `privacy-copy`, `public-pages`, `app-alert`, `app-alert-native`; the live acceptance runner also checked privacy/support/terms three times each. |
| Typed Asha coaching, response-language choice, chat persistence, report/clear controls, selected-text phrase saving, and Romanized live captions | PASS | `live-runtime-regressions`, `chat-history-persistence`, `language-and-api`, `bolo-api-errors`, and the final full gate. |
| AI voice playback, preloading, caching, bounded chunking, replay, speed, cancellation, and audio-session exclusion | PASS | `ai-voice-pipeline`, `ai-voice-player-web`, `language-and-api`, and `live-runtime-regressions`; deployed phrase-audio checks returned valid MP3 payloads. |
| Pronunciation recording, upload/feedback lifecycle, cleanup, interruption handling, and report controls | PASS | `pronunciation-lifecycle`, `voice-controls-lifecycle`, `recording-file-web`, `scene-audio-exclusivity`; live service acceptance exercised `/api/voice-coach` three times. |
| Realtime connection, permissions, turn state, transcript timing, language mode, media cleanup, foreground cleanup, accessibility, and error handling | PASS for web/service; BLOCKED for native hardware | `realtime-conversation-lifecycle`, `realtime-peer-cleanup`, `realtime-voice-accessibility`, `language-and-api`, and the 15-minute / 41-turn browser Realtime session. Physical iPhone verification remains outstanding. |
| Storage validation, migration compatibility, diagnostics, observability, source quality, and user-visible error paths | PASS | `storage`, `app-state-persistence`, `audit-screen-regressions`, `observability`, `source-quality`, and `bolo-api-errors`. |
| Store content, release profiles, public content, and declared native journeys | PASS within non-publisher scope | Store validator confirmed eight artwork files, listing copy, metadata, and release profiles. Five Maestro flow files passed `e2e:validate`. |

## Live-service acceptance detail

Each of three bounded passes validated all of the following against the deployed backend, with ephemeral client data deleted afterward:

- English and Romanized-Hindi typed coaching.
- Generated phrase MP3, pronunciation coaching, and short-lived Realtime client-secret schema.
- Message report creation and remote deletion.
- Privacy, support, and terms public pages.

No secret or audio payload was printed by the runner.

## Native and device limits

The current checkout compiled for the iOS Simulator and loaded through Metro. Local Maestro could not attach to the available iOS 26.5 simulator even when passed its explicit UDID, so the declarative mobile journeys could not be executed as black-box UI automation in this environment.

The physical iPhone `00008150-000444E63A61401E` was offline at the end of the run. The following need a short manual iPhone session after it is connected: grant microphone permission; connect, record, send, receive, and end multiple Realtime turns; verify speaker/Bluetooth routing; verify haptics; test a delivered notification/reminder; and check console/device logs for native WebRTC errors.

`npm run release:validate` was intentionally not run: it requires publisher-owned review identity values and signed-build screenshots, and is a release-account gate rather than an app-feature test.

## Reproduction commands

```sh
npm run verify
npm run acceptance:live
npx expo export --platform ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -workspace ios/Bolo.xcworkspace -scheme Bolo -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,id=<simulator-udid>' build
```

For the remaining hardware checks, use a connected physical iPhone with an installable native development or preview build; Expo Go cannot exercise `react-native-webrtc`.
