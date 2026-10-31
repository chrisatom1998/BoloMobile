# Changelog

All notable changes to BoloMobile are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking

- **iOS production builds need a GPT-Live endpoint.** Live voice moved to GPT-Live, and iOS release builds now reject a missing or blank Live URL ([#40](https://github.com/chrisatom1998/BoloMobile/pull/40)).
- **iOS uses the UIKit scene lifecycle** (`enableSceneSupport`) so the app launches on iOS 27; native modules and config plugins need to work with it ([#79](https://github.com/chrisatom1998/BoloMobile/pull/79)).
- **New native build required for live voice.** The audio stack moved to WebRTC 155 with a voiceChat audio session, and Expo packages are pinned to their Oct 21 versions so the iPhone mic captures sound ([#83](https://github.com/chrisatom1998/BoloMobile/pull/83), [#84](https://github.com/chrisatom1998/BoloMobile/pull/84)).
- **Saved data changes.** Asha sessions and queued reports are now stored on the phone under new keys, and Clear chat now removes every saved transcript, not just the current chat ([#98](https://github.com/chrisatom1998/BoloMobile/pull/98)).
- **Daily goal picker moved.** Today is one guided card, and the daily practice goal now lives in Settings > Learning preferences ([#93](https://github.com/chrisatom1998/BoloMobile/pull/93)).
- **Onboarding picks the starting plan, and "My created lessons" is hidden outside developer builds** ([#95](https://github.com/chrisatom1998/BoloMobile/pull/95)).

### Added

- Asha live voice sessions are now kept in an on-device session log, one AsyncStorage value per session (`bolo-asha-session-v1:<id>`) plus a small index (`bolo-asha-session-index-v1`). A session is saved from its first transcript line: start and end time, how it ended, reply language, mode, lesson, the final transcript lines (merged by line id, up to 200 per session), and phrases or lessons saved through Asha's tools. The log is written while the call runs, so a dropped connection, backgrounding, or a killed app leaves the lines saved so far marked "Interrupted". Bolo keeps the latest 3 sessions for at most 30 days (the newest is shown; up to two older ones stay hidden for crash recovery), stores no audio, and never uploads them. Empty attempts that never produced a line are not kept and do not replace an older session. ([#98](https://github.com/chrisatom1998/BoloMobile/pull/98))
- A "Last session" screen, reachable from the Asha screen, shows the most recent saved session's start time, length, whether it completed, was interrupted, or is in progress, its language, mode, lesson, a read-only transcript, and any reports for that conversation still waiting to send, with Retry and Discard. It has an empty state before the first session and a "Transcript cleared" state after Clear chat. ([#98](https://github.com/chrisatom1998/BoloMobile/pull/98))
- A sync outbox (`bolo-sync-outbox-v1`) keeps "Report this reply" requests that fail without a connection and retries them with exponential backoff when the app returns to the foreground, after any successful Bolo request, or on a timer, honoring `Retry-After` (including one received by the attempt that queued the report) and giving up after 8 attempts or 7 days. Removing the queue on consent withdrawal or Delete Bolo data sets a marker (`bolo-sync-outbox-clearing-v1`) until it finishes, so a removal interrupted by a restart completes before anything stored can send. Replies show "Waiting to send", "Reported", or "Couldn't send" with Retry and Discard, and the Asha screen lists queued reports whose reply is no longer on screen. The outbox sends exactly the existing report payload (no local ids) and never stores the client identifier or server error text. ([#98](https://github.com/chrisatom1998/BoloMobile/pull/98))
- When a live call cannot start because the Live server could not be reached or timed out, the Asha screen now says that live voice needs the internet while lessons and saved phrases work offline, with a link to today's lesson. Other startup failures keep their own message. A session that loses its connection or ends on backgrounding keeps its transcript on screen with a note that it is saved on the device. ([#98](https://github.com/chrisatom1998/BoloMobile/pull/98))
- Bolo API failures now carry a typed `kind` (network, timeout, aborted, config, invalid payload, or HTTP status) so offline copy and report retries are decided from the failure itself, never from message text. ([#98](https://github.com/chrisatom1998/BoloMobile/pull/98))
- Each lesson turn now speaks the situation's Hindi line aloud automatically before the learner answers, using bundled offline audio when available, while the English text stays on screen.
- `compact` size variant on `RealtimeVoiceButton`.
- `LiveTranslationRecorder` now reports a `LiveTranslationStatus` (`idle`/`starting`/`active`) via `onStatusChange`.
- `.claude/launch.json` Expo web launch config for in-editor preview.
- A new look for Today, Scene, Asha, Phrases and Progress, with a Hindi typeface, a calmer Today screen, cleaner Progress, scene choices and an Asha portrait ([#51](https://github.com/chrisatom1998/BoloMobile/pull/51), [#61](https://github.com/chrisatom1998/BoloMobile/pull/61)).
- Live voice conversations with Asha run on GPT-Live ([#40](https://github.com/chrisatom1998/BoloMobile/pull/40)), and Asha can read lessons and save phrases during a live call ([#60](https://github.com/chrisatom1998/BoloMobile/pull/60)).
- Each voice conversation starts with an empty transcript ([#65](https://github.com/chrisatom1998/BoloMobile/pull/65)), and a Clear chat button starts fresh ([#71](https://github.com/chrisatom1998/BoloMobile/pull/71)).
- A floating Asha bubble keeps a live call going while you move around the app ([#73](https://github.com/chrisatom1998/BoloMobile/pull/73), [#83](https://github.com/chrisatom1998/BoloMobile/pull/83)).
- Asha listens as soon as a live call starts ([#84](https://github.com/chrisatom1998/BoloMobile/pull/84)).
- Back up your progress: export and restore it from Settings ([#52](https://github.com/chrisatom1998/BoloMobile/pull/52)).
- A more native feel on iOS: press feedback, haptics, a review sheet and simpler phrase cards ([#57](https://github.com/chrisatom1998/BoloMobile/pull/57)).
- A simpler "Say your name" lesson: your name gets its own step and each turn fits on one screen ([#64](https://github.com/chrisatom1998/BoloMobile/pull/64)).
- Better accessibility, clearer empty and error states, and a new app icon ([#56](https://github.com/chrisatom1998/BoloMobile/pull/56)).
- The app launches on iOS 27 ([#79](https://github.com/chrisatom1998/BoloMobile/pull/79)).
- Lesson choices show Devanagari and romanized Hindi before you tap, the English meaning after you answer, and come in shuffled order ([#3](https://github.com/chrisatom1998/BoloMobile/pull/3)).
- Word-order and recall-reveal practice with a Try again option ([#16](https://github.com/chrisatom1998/BoloMobile/pull/16)).
- A "Say it aloud" recorder in Review after you tap Reveal ([#86](https://github.com/chrisatom1998/BoloMobile/pull/86)).
- Review mixes speak-first and listen-first cards, and using Hear a hint counts the card as Again ([#88](https://github.com/chrisatom1998/BoloMobile/pull/88)).
- Today is one guided "Do this next" card that walks you from review to the lesson to Asha ([#93](https://github.com/chrisatom1998/BoloMobile/pull/93)).
- The Asha screen keeps the conversation readable above the composer and shows typing dots while Asha replies ([#90](https://github.com/chrisatom1998/BoloMobile/pull/90)).
- Asha's voice stage fits on one screen: the portrait is the mic, a compact mute button sits by the composer, and captions appear once someone speaks ([#92](https://github.com/chrisatom1998/BoloMobile/pull/92)).
- Lessons only test phrases you have already been taught, wrong options rotate, wrong answers offer Try again or Show answer, and a 30-lesson shelf appears on Lesson plans ([#95](https://github.com/chrisatom1998/BoloMobile/pull/95)).

### Changed

- Clear chat on the Asha screen (and on Last session) now asks "Clear all saved chat transcripts?" and removes the current chat plus every saved session's transcript lines and tool content while keeping minimal session metadata and any reports still waiting to send. Starting a new voice session no longer removes saved sessions. Delete Bolo data ends any live call, removes every saved session and queued report, and withdrawing AI consent drops queued reports without sending them. ([#98](https://github.com/chrisatom1998/BoloMobile/pull/98))
- **Live voice screen redesign** (`src/app/live.tsx`, `src/components/realtime-voice-button.tsx`):
  - The glowing orb is now the single voice CTA; the separate "Start voice chat" pill was removed. The orb's center reflects session state (brand glyph when idle/connecting/responding, mic when ready, send icon while recording), and a floating X ends an active session.
  - Hero copy deduplicated to one title and at most one supporting line per session state; the "Ask Asha" card no longer repeats the hero's pitch.
  - The "Live Asha caption" block is hidden until a session produces content, then animates in with a 260 ms native-driver fade/rise. The translate-mode caption card follows the same reveal pattern, driven by recorder status.
  - The "Correct me" / "Live translate" toggles are now styled and announced as a segmented control (`tablist`/`tab` roles, selected-thumb shadow, higher-contrast idle labels).
  - The "Ask Asha" section reads as a bottom sheet: drag handle, rounded top edge overlapping the hero; the "Text phrase help below ↓" hint row was removed.
  - Compact responsive layout (smaller orb, tighter spacing) for windows under 760 pt tall.

### Fixed

- Snapshotted the quick-review session at mount so grading a phrase no longer shrinks the live due list underneath the advancing card index, which skipped phrases, produced "2 of 1 remembered" summaries, and could drop the learner into an unrequested low-mastery session instead of the completion screen.
- Scored resumed scenes over the beats actually answered after the checkpoint instead of the full beat count, which permanently understated best accuracy and practice-history answer totals.
- Cancelled the scheduled daily practice reminder during "Delete my Bolo data" so the OS notification can no longer keep firing with no way to turn it off after its stored identifier is wiped.
- Updated in-memory state immediately after the data-deletion write succeeds and made the diagnostics wipe best-effort, so a diagnostics-clear failure can no longer leave the UI showing deleted data while claiming nothing was removed.
- Queued the diagnostics clear behind pending counter writes so an in-flight event can no longer re-create the diagnostics snapshot right after the user deletes it.
- Gated the review screen's Listen/Slow buttons on AI consent or bundled offline audio, matching every other screen, and surfaced playback failures instead of rejecting silently.
- Counted realtime voice connection successes/failures only for actual connection attempts instead of once per completed or failed voice turn, and stopped counting caller-cancelled AI requests as failures, so the private diagnostics counters reflect reality.
- Listed and labeled all due phrases on the saved-phrases screen instead of the review session's five-phrase cap, which hid genuinely due phrases from the Due filter and header count.
- Dropped review records for phrases evicted by the 100-phrase cap and kept the newest (not oldest) 200 review entries at hydration, so long-term use can no longer silently reset recent phrases' mastery.
- Used own-property lookups for bundled offline lesson audio so AI reply text matching an Object.prototype key can no longer crash playback or bypass the consent gate.
- Settled the AI voice playback promise before pausing the player so a decoder-invalidated native player can no longer leave the Listen flow hanging forever. ([#2](https://github.com/chrisatom1998/BoloMobile/pull/2))
- Rejected a pending live voice connection when the Realtime service reports an error during configuration, instead of showing a false "ready" state that a later timeout tore down. ([#2](https://github.com/chrisatom1998/BoloMobile/pull/2))
- Reported a text-to-speech failure after a successful typed chat turn as a distinct playback problem instead of presenting it as a failed send. ([#2](https://github.com/chrisatom1998/BoloMobile/pull/2))
- Blocked AI consent changes while "Delete my data" is clearing storage so a consent record can no longer be re-persisted immediately after a wipe. ([#2](https://github.com/chrisatom1998/BoloMobile/pull/2))
- Preserved the full 500-character learner message when the response-language instruction is prepended to a typed chat request. ([#2](https://github.com/chrisatom1998/BoloMobile/pull/2))
- Locked both practice-mode tabs during connecting, recording, and responding realtime voice states without blocking typed-request mode changes.
- Offset the compact end-session button so its hit target no longer overlaps the voice orb.
- Restored polite screen-reader announcements for realtime voice status changes.
- Kept the live caption mounted through the ready state to prevent its entrance animation from replaying.
- Limited live translation announcements to the newest segment instead of re-reading the full history.
- Hid the no-op chat-history button in live translate mode while preserving the centered header layout.
- Realtime voice no longer stalls, and the live translation history is capped ([#1](https://github.com/chrisatom1998/BoloMobile/pull/1)).
- Removed the red error banner on Today ([#77](https://github.com/chrisatom1998/BoloMobile/pull/77)).
- The listening ring stays bright with Reduce Motion on ([#74](https://github.com/chrisatom1998/BoloMobile/pull/74)).
- The welcome message no longer looks like a text box ([#75](https://github.com/chrisatom1998/BoloMobile/pull/75)).
- Days with no practice no longer show a bar ([#76](https://github.com/chrisatom1998/BoloMobile/pull/76)).
- Phrase and word sheets slide closed properly ([#78](https://github.com/chrisatom1998/BoloMobile/pull/78)).
- Android: fixed the back button, status bar overlap and the scene tray ([#58](https://github.com/chrisatom1998/BoloMobile/pull/58)).
- Fixed gaps in Today and Scene after the redesign ([#55](https://github.com/chrisatom1998/BoloMobile/pull/55)), plus general UI and voice fixes ([#50](https://github.com/chrisatom1998/BoloMobile/pull/50)).
- Word-order answers are scored word by word, so a sentence with a repeated word counts as correct in either valid order ([#85](https://github.com/chrisatom1998/BoloMobile/pull/85)).
- On iOS the composer sits right above the tab bar instead of behind it ([#91](https://github.com/chrisatom1998/BoloMobile/pull/91)).
- The iPhone mic captures sound in live voice: mono mic input, app state re-checked before unmuting, and a minimized call ends before the lesson recorder starts ([#83](https://github.com/chrisatom1998/BoloMobile/pull/83)).
- Asha's intro message no longer shows a Listen button, and the live-voice debug line is gone ([#90](https://github.com/chrisatom1998/BoloMobile/pull/90)).
- Smaller fixes on Today, Phrases, Progress, Settings, Review (grade buttons sit above the recorder, saved phrases come back tomorrow) and Asha (errors can be dismissed), plus a one-line privacy card and exercise copy that matches the task ([#95](https://github.com/chrisatom1998/BoloMobile/pull/95)).
- Settings says "lessons" instead of "scenes" ([#100](https://github.com/chrisatom1998/BoloMobile/pull/100)).

### Internal

- Dependabot: GitHub Actions updates ([#39](https://github.com/chrisatom1998/BoloMobile/pull/39), [#72](https://github.com/chrisatom1998/BoloMobile/pull/72)).
- Dependabot: app npm packages, 6 updates including heroui-native 1.0.3 → 1.0.11 and uniwind 1.10 → 1.13 ([#68](https://github.com/chrisatom1998/BoloMobile/pull/68)).
- Dependabot: website `@types/node` 22 → 26 ([#38](https://github.com/chrisatom1998/BoloMobile/pull/38)).
- Security patches: website Next.js 16.4.0 → 16.4.3 (critical fix), Expo SDK 57 patches, Zod 4.6.7 and node-forge 1.4.2 ([#77](https://github.com/chrisatom1998/BoloMobile/pull/77)).
- Hardened iOS CI with a `required-checks` aggregate job ([#6](https://github.com/chrisatom1998/BoloMobile/pull/6)), fixed CI dependency failures and the iOS smoke test ([#31](https://github.com/chrisatom1998/BoloMobile/pull/31)), deflaked the iOS Maestro smoke flow ([#87](https://github.com/chrisatom1998/BoloMobile/pull/87)), and sped up the iOS native build (arm64 only, ccache, no job chaining) ([#99](https://github.com/chrisatom1998/BoloMobile/pull/99)).
- iOS release preflight, an App Store privacy manifest and a pinned Node version ([#16](https://github.com/chrisatom1998/BoloMobile/pull/16)).
- Maestro harness repairs ([#50](https://github.com/chrisatom1998/BoloMobile/pull/50)).
- The EAS build upload includes the postinstall patch, and expo-doctor stays green with the Expo pins documented ([#83](https://github.com/chrisatom1998/BoloMobile/pull/83), [#84](https://github.com/chrisatom1998/BoloMobile/pull/84)).
- Docs: AGENTS.md puts Claude Code first ([#81](https://github.com/chrisatom1998/BoloMobile/pull/81)), and Cloud Agent docs cover the Node pin and dev servers ([#89](https://github.com/chrisatom1998/BoloMobile/pull/89)).
- `__tests__/live-runtime-regressions.test.tsx` and `__tests__/realtime-voice-accessibility.test.tsx` updated and extended for the orb CTA, hidden-until-active caption, segmented-control roles, and compact variant (165 tests passing).
