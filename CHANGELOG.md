# Changelog

All notable changes to BoloMobile are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Asha live voice sessions are now kept in an on-device session log, one encrypted value per session (`bolo-asha-session-v1:<id>`) plus a small encrypted index (`bolo-asha-session-index-v1`). A session is saved from its first transcript line: start and end time, how it ended, reply language, mode, lesson, the final transcript lines (merged by line id, up to 200 per session), and phrases or lessons saved through Asha's tools. The log is written while the call runs, so a dropped connection, backgrounding, or a killed app leaves the lines saved so far marked "Interrupted". Bolo keeps the latest 3 sessions for at most 30 days (the newest is shown; up to two older ones stay hidden for crash recovery), stores no audio, and never uploads them. Empty attempts that never produced a line are not kept and do not replace an older session.
- A "Last session" screen, reachable from the Asha screen, shows the most recent saved session's start time, length, whether it completed, was interrupted, or is in progress, its language, mode, lesson, a read-only transcript, and any reports for that conversation still waiting to send, with Retry and Discard. It has an empty state before the first session and a "Transcript cleared" state after Clear chat.
- A sync outbox (`bolo-sync-outbox-v1`) keeps "Report this reply" requests that fail without a connection and retries them with exponential backoff when the app returns to the foreground, after any successful Bolo request, or on a timer, honoring `Retry-After` (including one received by the attempt that queued the report) and giving up after 8 attempts or 7 days. Removing the queue on consent withdrawal or Delete Bolo data sets a marker (`bolo-sync-outbox-clearing-v1`) until it finishes, so a removal interrupted by a restart completes before anything stored can send. Replies show "Waiting to send", "Reported", or "Couldn't send" with Retry and Discard, and the Asha screen lists queued reports whose reply is no longer on screen. The outbox sends exactly the existing report payload (no local ids) and never stores the client identifier or server error text.
- When a live call cannot start because the Live server could not be reached or timed out, the Asha screen now says that live voice needs the internet while lessons and saved phrases work offline, with a link to today's lesson. Other startup failures keep their own message. A session that loses its connection or ends on backgrounding keeps its transcript on screen with a note that it is saved on the device.
- Bolo API failures now carry a typed `kind` (network, timeout, aborted, config, invalid payload, or HTTP status) so offline copy and report retries are decided from the failure itself, never from message text.
- Each lesson turn now speaks the situation's Hindi line aloud automatically before the learner answers, using bundled offline audio when available, while the English text stays on screen.

### Changed

- Asha chat history and the on-device session log are encrypted at rest with AES-256-GCM. On Android and iOS the key is kept in the platform keystore. Plaintext history already on the device is rewritten the next time it is read.
- Clear chat on the Asha screen (and on Last session) now asks "Clear all saved chat transcripts?" and removes the current chat plus every saved session's transcript lines and tool content while keeping minimal session metadata and any reports still waiting to send. Starting a new voice session no longer removes saved sessions. Delete Bolo data ends any live call, removes every saved session and queued report, and withdrawing AI consent drops queued reports without sending them.

### Fixed

- The lesson name step now shrinks above the iOS keyboard (a padding KeyboardAvoidingView around the step), so the bottom-pinned Continue stays visible while typing and a tap on it lands while the keyboard is up.
- The "Change" practice-name link and the "Add Asha coaching" line on a lesson now respond to a 44pt tall touch area, with no change to how they look.
- The native splash screen is held until saved progress has hydrated (and released on a startup crash), so the launch no longer flashes the loading view, and its background now matches the app's theme background (#F6F3ED instead of #F5F0E8).
- The iOS microphone permission prompt now explains that Asha listens during live practice and that audio reaches Bolo's voice service only while a session is on.
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
