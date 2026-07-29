# Changelog

All notable changes to BoloMobile are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Each lesson turn now speaks the situation's Hindi line aloud automatically before the learner answers, using bundled offline audio when available, while the English text stays on screen.

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
- Settled the AI voice playback promise before pausing the player so a decoder-invalidated native player can no longer leave the Listen flow hanging forever.
- Rejected a pending live voice connection when the Realtime service reports an error during configuration, instead of showing a false "ready" state that a later timeout tore down.
- Reported a text-to-speech failure after a successful typed chat turn as a distinct playback problem instead of presenting it as a failed send.
- Blocked AI consent changes while "Delete my data" is clearing storage so a consent record can no longer be re-persisted immediately after a wipe.
- Preserved the full 500-character learner message when the response-language instruction is prepended to a typed chat request.

- Locked both practice-mode tabs during connecting, recording, and responding realtime voice states without blocking typed-request mode changes.
- Offset the compact end-session button so its hit target no longer overlaps the voice orb.
- Restored polite screen-reader announcements for realtime voice status changes.
- Kept the live caption mounted through the ready state to prevent its entrance animation from replaying.
- Limited live translation announcements to the newest segment instead of re-reading the full history.
- Hid the no-op chat-history button in live translate mode while preserving the centered header layout.

### Changed

- **Live voice screen redesign** (`src/app/live.tsx`, `src/components/realtime-voice-button.tsx`):
  - The glowing orb is now the single voice CTA; the separate "Start voice chat" pill was removed. The orb's center reflects session state (brand glyph when idle/connecting/responding, mic when ready, send icon while recording), and a floating X ends an active session.
  - Hero copy deduplicated to one title and at most one supporting line per session state; the "Ask Asha" card no longer repeats the hero's pitch.
  - The "Live Asha caption" block is hidden until a session produces content, then animates in with a 260 ms native-driver fade/rise. The translate-mode caption card follows the same reveal pattern, driven by recorder status.
  - The "Correct me" / "Live translate" toggles are now styled and announced as a segmented control (`tablist`/`tab` roles, selected-thumb shadow, higher-contrast idle labels).
  - The "Ask Asha" section reads as a bottom sheet: drag handle, rounded top edge overlapping the hero; the "Text phrase help below ↓" hint row was removed.
  - Compact responsive layout (smaller orb, tighter spacing) for windows under 760 pt tall.

### Added

- `compact` size variant on `RealtimeVoiceButton`.
- `LiveTranslationRecorder` now reports a `LiveTranslationStatus` (`idle`/`starting`/`active`) via `onStatusChange`.
- `.claude/launch.json` Expo web launch config for in-editor preview.

### Tests

- `__tests__/live-runtime-regressions.test.tsx` and `__tests__/realtime-voice-accessibility.test.tsx` updated and extended for the orb CTA, hidden-until-active caption, segmented-control roles, and compact variant (165 tests passing).
