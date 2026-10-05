# Changelog

All notable changes to BoloMobile are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Each lesson turn now speaks the situation's Hindi line aloud automatically before the learner answers, using bundled offline audio when available, while the English text stays on screen.

### Fixed

- Stopped saving changes after local progress fails to load, so the temporary defaults can no longer overwrite the learner's unreadable saved phrases and progress; saving resumes after "Delete my Bolo data" succeeds.
- Cancelled the daily practice reminder only after the data-deletion write succeeds, so a failed wipe no longer leaves the reminder shown as on while its OS notification is already gone.
- Showed the generic request error for 5xx responses instead of raw server error text, keeping service messages only for 4xx responses.
- Reported a timeout or cancel that fires while the response body is still downloading as such, instead of as an invalid response.
- Cached the live-status check for 60 seconds per route instance so repeated checks no longer re-read the server key and make paid OpenAI model lookups every time.
- Stopped retrying permanent client errors and invalid payloads when generating bundled offline Hindi audio.
- Blocked scheduling a daily reminder while saved progress could not be read, since its notification identifier could not be stored and the OS reminder would outlive the app's ability to cancel it.
- Romanized the loanword vowels ऑ/ॉ and ऍ/ॅ instead of leaking raw Devanagari into Latin-script text, so डॉक्टर now reads "Doktar" rather than "Daॉktar".
- Routed every delivery of the repeating daily practice reminder, not only the first tap per app session, by de-duplicating on the delivery date as well as the shared notification identifier.
- Stopped showing an error banner when the learner ends a live voice session or toggles the microphone again while a mute/unmute command is still awaiting confirmation.
- Failed live voice startup immediately with a clear message when the connection drops before the data channel opens, instead of waiting out the 15-second watchdog and reporting a timeout.
- Cleaned up the offline lesson audio status listener and watchdog timer when playback fails to start.
- Re-armed the calendar-day midnight timer after a clock or time zone change so Home's due count no longer goes stale until the next foreground.
- Stopped Asha from reading a typed reply aloud when it arrives after the learner has switched to another tab; the reply is still saved in the chat.
- Removed the review card's grouping label so VoiceOver and TalkBack can reach the Reveal, Listen, and Slow buttons and no longer hear the Hindi answer before it is revealed.
- Kept the Words sheet mounted with its explanation once the saved chat reaches the 100-message cap, instead of remounting on every new message.
- Recomputed due-phrase counts, the Phrases tab badge, and the Progress week after midnight on the always-mounted tabs.
- Surfaced a message when private diagnostics cannot be read or the onboarding microphone check fails, instead of hanging on stale text.
- Cleared the lesson's "Continuing at turn N" notice once the learner moves past the resumed turn, and renamed the Listen button's accessibility label to start with its visible text for voice control.
- Limited the saved-phrase Listen hint about offline audio to phrases that actually have a bundled clip, and removed an unreachable fallback on the Asha featured phrase.
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
