# Spec: Fix six review findings on the live voice screen

## Context

BoloMobile is an Expo SDK 57 / React Native 0.86 / expo-router app (TypeScript strict, path alias `@/*` → `src/*`). Jest with `jest-expo` and `@testing-library/react-native`; tests live in `__tests__/` (files under `src/app/` are excluded from test discovery).

The live voice practice screen (`src/app/live.tsx`) was recently redesigned: a pressable orb (`src/components/realtime-voice-button.tsx`) is the single voice CTA, the "Live Asha caption" block mounts conditionally with an entrance animation (`CaptionReveal`), the "Correct me / Live translate" toggles are a segmented control with `tablist`/`tab` roles, and there is a `compact` layout for windows under 760pt tall. A code review found six defects. Fix all six.

Conventions to follow (match existing code exactly):
- `StyleSheet.create` objects with sorted-ish inline single-line styles; theme values from `@/theme` (`colors`, `spacing`, `radius`).
- Every interactive element has `accessibilityRole`, `accessibilityLabel` (where the visible label is insufficient), and `accessibilityState`; disabled controls also get `styles.disabled` opacity and, where a reason isn't obvious, an `accessibilityHint` (see the language buttons in `live.tsx` for the pattern).
- The ESLint config enforces `react-hooks/refs`: do NOT use `useRef(new Animated.Value(...)).current`; use `const [v] = useState(() => new Animated.Value(...))` (see `CaptionReveal`).
- No new dependencies. No refactors beyond what each fix requires.

Do not weaken or delete existing tests except where this spec explicitly says a behavior changes. In `__tests__/live-runtime-regressions.test.tsx`, `RealtimeVoiceButton` is mocked (pressables that drive `onStatusChange`); screen-level assertions go there. Component-level orb assertions go in `__tests__/realtime-voice-accessibility.test.tsx`, which mocks `@/hooks/use-realtime-conversation` via a mutable `mockVoiceStatus`.

## Fix 1 (Major): Mode tabs must lock during an active realtime voice turn

`src/app/live.tsx` — the two mode tabs ("Correct me", "Live translate", around line 311–332) are always tappable. Switching modes unmounts `RealtimeVoiceButton`, whose hook cleanup disconnects the peer, silently discarding a turn that is being recorded or an in-flight reply.

Required behavior:
- Disable both tabs while `realtimeLocked` is true (`realtimeLocked` already exists: status `connecting | recording | responding`).
- IMPORTANT: do NOT disable on `busy` (typed-chat in flight). An existing test, "aborts a typed request and ignores its late reply after switching modes", pins that switching modes while `busy` aborts the typed request. That behavior must keep working.
- When locked: `disabled={realtimeLocked}`, `accessibilityState={{ disabled: realtimeLocked, selected }}`, append `styles.disabled` to the unselected tab only (keep the selected tab fully visible so the current mode stays legible), and add `accessibilityHint` matching house style, e.g. `End the live voice session to switch modes.` (only when locked, like the language buttons do).

Test (live-runtime-regressions): press the mock "Mock realtime recording" pressable, then press the "Live translate" tab; assert mode did NOT switch (the "Correct me" tab still has `selected: true` and the translate hero copy "Speak Hindi. Read English." is absent), and both tabs expose `disabled: true`. Then press "Mock realtime disconnected" and assert switching works again.

## Fix 2 (Major): Compact end-session button overlaps the orb

`src/components/realtime-voice-button.tsx` — the end button (`styles.endButton`, `position: 'absolute', right: 0`, 48×48) is centered vertically in the stage. In compact mode the stage is 224 wide and the orb 148, so the orb spans x≈38–186 while the button spans x=176–224: a ~10pt-wide overlap at the orb's right edge where the later-rendered end button steals taps meant for the orb (tap-to-send becomes end-session).

Required behavior:
- Add a compact-only offset so the hit rects cannot intersect: `endButtonCompact: { right: -spacing.lg }` applied as `style={[styles.endButton, compact && styles.endButtonCompact]}` (import `spacing` from `@/theme`). That puts the button at x=192–240 vs. the orb edge at 186 — 6pt clearance. Non-compact geometry (stage 282, orb 168, 9pt gap) must not change.

Test (realtime-voice-accessibility): with `mockVoiceStatus = 'ready'` and `compact`, flatten the styles of the orb and end button and assert non-overlap arithmetically: `stageWidth = 224`, orb right edge `= (224 + orb.width) / 2`, end button left edge `= 224 - 48 - (endStyle.right ?? 0)`... simpler and robust: assert `endStyle.right` is `-16` in compact and `0`/undefined otherwise, plus a comment stating the geometry it guarantees. Also keep the existing ≥44pt assertions passing.

## Fix 3 (Major): Restore screen-reader announcements for realtime status

`src/app/live.tsx` — the hero title (`{voiceHeroTitle}`, around line 360) lost `accessibilityLiveRegion="polite"` in the redesign. The caption's live region mounts already containing its first text, and newly mounted live regions do not announce initial content, so the `disconnected → connecting` transition is silent for screen readers.

Required behavior:
- Add `accessibilityLiveRegion="polite"` back to the hero title `Text`. It is permanently mounted in correct mode, so every status change ("Connecting to Asha", "Asha is listening", …) announces. Keep the caption's existing live region as-is.

Test (live-runtime-regressions): assert `view.getByText('Start speaking').props.accessibilityLiveRegion` is `'polite'`.

## Fix 4 (Minor): Stop the caption flicker at session start

`src/app/live.tsx` — `liveCaptionText` is empty when status is `ready` with no caption yet, so during a first session the block mounts at `connecting`, unmounts at `ready`, and remounts at `recording`, replaying the entrance animation each time.

Required behavior:
- Keep the block mounted for the entire active session: render it when `realtimeOwnsAudio || liveCaptionText !== ''` (`realtimeOwnsAudio` already exists: status !== 'disconnected').
- Give the `ready`-with-no-caption state real text so the block is never empty: change the `liveCaptionText` fallback so that when status is `ready` and `liveCaption` is empty it reads `Captions appear after your first turn.`; when `liveCaption` is non-empty, show `liveCaption` (unchanged). Statuses `connecting`/`recording`/`responding` keep their current strings. When disconnected, behavior is unchanged (block hidden unless a previous caption exists).

Test (live-runtime-regressions): press "Mock realtime connecting" → "Live Asha caption" visible; press "Mock realtime ready" → still visible with text "Captions appear after your first turn."; press "Mock realtime disconnected" → hidden again (no caption was produced).

## Fix 5 (Minor): Announce only the newest translation, not the whole history

`src/app/live.tsx` translate mode (around line 376–394) — `accessibilityLiveRegion="polite"` sits on the `View` wrapping ALL accumulated translations, so appending a segment can make TalkBack re-read the entire history.

Required behavior:
- Remove the live region from the history container `View`.
- Render the translations so the LAST entry is a separate, permanently-positioned `Text` that carries `accessibilityLiveRegion="polite"`: history = `translations.slice(0, -1)` mapped as today (keep the `testID="translation-entry"` on every entry including the last — an existing test asserts all entries in order), and the final entry rendered as its own `Text` with the same `styles.translationText` and testID, inside the same visual flow. Because the announcer `Text` node stays mounted across appends (it is always "the last slot"), its content change announces exactly one new segment.
- The existing "appends translated segments to the visible history in completion order" test must still pass unmodified — all entries, in order, with `testID="translation-entry"`.

## Fix 6 (Minor): Hide "Open chat history" in translate mode

`src/app/live.tsx` (around line 306) — the top-right chat button calls `scrollToEnd`, but in translate mode the FlatList `data` is `[]`, so the action does nothing useful.

Required behavior:
- Render the chat button only when `mode === 'correct'`. Keep the topbar layout stable (the button is absolutely positioned, so removal must not shift the title; verify `headerCopy` still centers).

Test (live-runtime-regressions): after pressing the "Live translate" tab, `queryByLabelText('Open chat history')` is null; back on "Correct me" it exists.

## Cleanup

- In `__tests__/live-runtime-regressions.test.tsx`, remove the `MockView` import if it is genuinely unused (check first).
- Add a `### Fixed` subsection under `## [Unreleased]` in `CHANGELOG.md` summarizing fixes 1–6 in one line each, matching the file's existing style.

## Verification (all must pass before you are done)

```
npm run lint
npm run typecheck
npm test
```

All existing tests must pass (165 currently) plus the new ones specified above. Report actual command output. Do not commit — leave changes in the working tree.
