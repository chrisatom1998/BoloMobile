# Changelog

All notable changes to BoloMobile are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
  - Hero copy deduplicated to one title and at most one supporting line per session state; the "Ask Mira" card no longer repeats the hero's pitch.
  - The "Live Mira caption" block is hidden until a session produces content, then animates in with a 260 ms native-driver fade/rise. The translate-mode caption card follows the same reveal pattern, driven by recorder status.
  - The "Correct me" / "Live translate" toggles are now styled and announced as a segmented control (`tablist`/`tab` roles, selected-thumb shadow, higher-contrast idle labels).
  - The "Ask Mira" section reads as a bottom sheet: drag handle, rounded top edge overlapping the hero; the "Text phrase help below ↓" hint row was removed.
  - Compact responsive layout (smaller orb, tighter spacing) for windows under 760 pt tall.

### Added

- `compact` size variant on `RealtimeVoiceButton`.
- `LiveTranslationRecorder` now reports a `LiveTranslationStatus` (`idle`/`starting`/`active`) via `onStatusChange`.
- `.claude/launch.json` Expo web launch config for in-editor preview.

### Tests

- `__tests__/live-runtime-regressions.test.tsx` and `__tests__/realtime-voice-accessibility.test.tsx` updated and extended for the orb CTA, hidden-until-active caption, segmented-control roles, and compact variant (165 tests passing).
