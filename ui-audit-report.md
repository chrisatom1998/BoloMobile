# Bolo UI Audit — 2026-07-25

Four parallel audits covered the tab screens, stack screens, shared components, and cross-cutting concerns (theming, accessibility, safe areas, keyboard, web). Findings below are grounded in code with file:line references; the top items were re-verified by hand. Severity reflects user impact.

---

## Critical — broken core flows

### 1. The "End live voice session" button is invisible (white-on-white)
`src/components/realtime-voice-button.tsx:211` styles the end button `rgba(255,255,255,0.1)` background, `rgba(255,255,255,0.18)` border, white X icon — styles written for a dark hero surface that no longer exists. In `live.tsx` it renders inside `voiceStage` (`live.tsx:638`), whose background is `paperRaised` = `#FFFFFF`. Contrast ≈ 1.0:1.
**Impact:** once a live voice session connects, a sighted user cannot see how to stop the microphone session. The decorative rings (`realtime-voice-button.tsx:192–208`) are equally invisible. Related dead tokens: `hero*`/`successSurface` in `theme.ts:47–55` are unused.

### 2. End button overlaps the voice orb and steals taps
`realtime-voice-button.tsx:213` — in `size="minimal"` (what live.tsx uses), `endButtonMinimal` is `{right: -spacing.lg, top: 0}` on a 48×48 button in a 104×104 stage, overlapping the 88×88 orb's top-right corner and rendering last (wins the touch).
**Impact:** tapping the orb's upper-right area to start/send a voice turn silently ends the whole session. Compounded by #1: the button you're hitting is invisible.

### 3. "Recalibrate my plan" traps the user in onboarding and silently resets their preferences
- `settings.tsx:164` pushes `/onboarding`, which is registered `headerShown: false, gestureEnabled: false` (`_layout.tsx:54`) with no back/cancel control on the screen itself. On iOS the only exit is completing the flow.
- `onboarding.tsx:53–72` hardcodes local state to defaults and never seeds from the existing `learnerProfile`/goal; `completeOnboarding` (`app-state.tsx:289–291`) then overwrites everything.
**Impact:** a user who taps Recalibrate out of curiosity is stuck, and finishing the flow silently reverts script preference, focus, response language, and daily goal to defaults.

### 4. Review session can become uncompletable
`review.tsx:79–117` — the screen root is a fixed `View` (no ScrollView) with a `minHeight: 360` card, unbounded 29pt prompt text, and a 54pt grade row.
**Impact:** on small devices or Dynamic Type ≥ ~1.3–1.5, the "Again"/"Got it" buttons are pushed off-screen with no way to scroll to them.

### 5. Wrong teaching content: hardcoded pronunciation cue
`live.tsx:100 + 482` — `studioPhrase` is `phrases[0]` (whatever the user saved first), but the cue is the literal string `Say "chee-nee kam" gently; pause after "kam."`
**Impact:** the featured-phrase card shows pronunciation instructions for an unrelated phrase — actively wrong teaching content for almost every user.

### 6. Practice time is massively miscounted
`live.tsx:176–180` — `useForegroundTimer` starts at mount, is credited only on unmount, and native tab screens stay mounted across tab switches; there's no focus/blur handling.
**Impact:** 40 minutes spent on the Phrases tab gets credited as "live practice" toward the daily goal, streak, and Progress chart; force-quitting loses the session's minutes entirely.

### 7. Android: content renders under the status bar on most screens
`index.tsx:161`, `phrases.tsx:129`, `progress.tsx:43`, `onboarding.tsx:75` rely solely on `contentInsetAdjustmentBehavior="automatic"`, which is iOS-only; nothing outside live.tsx uses safe-area insets, and SDK 57 Android is forced edge-to-edge.
**Impact:** screen titles and the onboarding brand mark sit under the status bar/clock; bottom rows sit under the gesture nav bar. Related: the word-definition sheet and phrase picker modals (`word-definition-sheet.tsx:91`, `transcript-phrase-picker.tsx:92`) use iOS-only `pageSheet` and go full-screen on Android with headers under the status bar.

### 8. Word definition sheet can wedge in a permanent loading state
`word-definition-sheet.tsx:56–69` — tapping a second word aborts the first request but leaves its cache entry `{loading: true}`; the guard `if (cached?.loading || cached?.explanation) return` then blocks all retries.
**Impact:** tap "क्या", quickly tap "हैं", tap "क्या" again → "Finding the useful meaning…" forever; only escape is closing the sheet.

---

## High

- **Due-count capped at 5 and inconsistent across screens.** `(tabs)/_layout.tsx:13,33` and `index.tsx:39–40` use `dueSavedPhrases` with its default `limit: 5` (`learning.ts:39`); `phrases.tsx:57` recomputes with `Infinity`. With 20 due phrases the badge says 5, the CTA says "Review 5 phrases", and the Phrases header says 20. The `9+` badge branch is dead code.
- **Live composer under the tab bar on iOS.** `live.tsx:566 + 394` hand-rolls window-level insets with `contentInsetAdjustmentBehavior="never"`; `useSafeAreaInsets` doesn't include the native tab bar height, so the send row can render behind the tab bar. Meanwhile `KeyboardAvoidingView behavior="padding"` with no offset (`live.tsx:390`) double-pads when the keyboard opens.
- **No keyboard avoidance on Android in the live composer.** `live.tsx:390` passes `behavior: undefined` on Android and no `softwareKeyboardLayoutMode` is set; the keyboard covers the input.
- **Double-tap double-counts progress.**
  - `review.tsx:35–44` — `grade()` has no re-entrancy guard: double-tapping "Got it" grades the phrase twice and skips the next card.
  - `scene/[id].tsx:89–108,210` — Continue/Finish is never disabled: double-tapping Finish records the completion twice (practice seconds, totals inflated).
- **Recording discarded on `inactive` app state.** `voice-turn-button.tsx:198` treats iOS `inactive` (Notification Center pull-down, incoming-call banner) like backgrounding and discards the in-progress pronunciation recording.
- **Settings ↔ Live response-language desync.** `live.tsx:72` seeds `responseLanguage` from the profile once and never re-syncs, and never writes back; changing it in Settings doesn't reach the (still-mounted) Live tab and vice versa.

---

## Medium

- **Chat action row overflows.** `chat-message-row.tsx:132` + `live.tsx:684` — four actions (~330pt) in a bubble capped at ~262pt, no `flexWrap`; labels clip, worse at large font scale.
- **Phrase picker double keyboard inset.** `transcript-phrase-picker.tsx:93–94` — `KeyboardAvoidingView` *and* `automaticallyAdjustKeyboardInsets` both apply, pushing "Save phrase" out of reach.
- **"Phrase saved" confirmation likely never shows on iOS.** `live.tsx:385–386` dismisses the sheet and presents the alert in the same tick.
- **Script preference ignored in three places.** Home garden cue (`index.tsx:139`), Progress featured phrase (`progress.tsx:92`) always render Devanagari; the word sheet (`word-definition-sheet.tsx:80`) keys script off `responseLanguage` instead of `scriptPreference`, so the tapped Devanagari word opens a romanized sheet.
- **Fake speaker affordances.** `live.tsx:476` and `progress.tsx:90` render Volume2 icons whose press navigates instead of playing audio.
- **"Go back" on a tab root.** `live.tsx:427` — `router.back` does nothing on fresh launch, or pops the entire tabs group.
- **Speech keeps playing across tab switches.** `phrases.tsx:69` (and `live.tsx:182–193`) stop audio only on unmount; tab screens don't unmount.
- **Audio errors surface in the wrong place.** `phrases.tsx:124` renders `audioError` in the list header, off-screen for failures triggered rows down; `review.tsx` never clears a stale audio error when advancing (`scene/[id].tsx:91` does).
- **Lesson-plan navigation.** `lesson-plans.tsx:87` uses `router.replace('/lesson-plans')` creating a `[list, list]` stack (native back appears to do nothing); the detail screen never overrides the "Lesson plans" large title (`_layout.tsx:56`).
- **Settings segmented controls truncate.** `settings.tsx:144–185` omit `stackedAtLargeText` (which Live and Phrases pass) and use `compact` (34pt-tall triggers); reminder times ellipsize to identical stubs at large text.
- **Reduced-motion recording indicator vanishes.** `realtime-voice-button.tsx:63,100` — with Reduce Motion on, ripple value 1 → opacity exactly 0, so the "listening" ring disappears when recording starts.
- **Stale selection saved.** `chat-message-row.tsx:42` doesn't notify on collapsed selection and `live.tsx:251` never clears `selectedChatTextRef` — "Save selection" uses an abandoned highlight.
- **Scene resume is silent and stats are wrong.** `scene/[id].tsx:29–33,137` — resumed scene drops the user at the saved beat with no affordance; completion computes accuracy over remaining beats but displays total beats (one right answer on a resumed last beat → 100% best accuracy over "10 turns").
- **Diagnostics flashes "No diagnostics recorded yet."** `diagnostics.tsx:11,32` — no loading state on a privacy-sensitive screen.
- **Web alert degradation drops reports.** `app-alert.web.ts:30–33` — multi-action alerts become a `window.prompt` numbered menu; any typo silently cancels (affects Report flows in `live.tsx:375` and `pronunciation-recorder.tsx:64`).
- **No `+not-found` route** — bad deep links land on expo-router's unthemed default screen.

---

## Low (grouped)

- **Touch targets under 44pt:** live header buttons 36×36 (`live.tsx:631–632`), home streak chip 32pt tall (`index.tsx:92,237`), compact segmented triggers 34pt (`segmented-control.tsx:131`).
- **Accessibility:** chat text announced as an edit field with a misleading hint (`chat-message-row.tsx:52–67`); live-region announcement truncated to 56 chars (`chat-message-row.tsx:12–18,124`); decorative motifs and the 156pt `ब` glyph announced to screen readers (`progress.tsx:53,161`, motif labels on all three tabs); `review.tsx:82` label on a non-`accessible` View is dropped.
- **Visual polish:** home header motif can overlap the greeting on narrow phones (`index.tsx:224`); Asha portrait rendered at 1×1×opacity-0 with a test asserting it exists (`live.tsx:619`, `__tests__/live-runtime-regressions.test.tsx:399`); modals unmounted on close so `animationType="slide"` never plays exit (`live.tsx:594`, `scene/[id].tsx:244`); progress bar chart mixes rounded labels with unrounded heights (`progress.tsx:21,118`); review progress bar reads `index/length` so it disagrees with "Phrase 1 of N" (`review.tsx:80–81`); scene NPC text can run under the speaker button (`scene/[id].tsx:266,269`).
- **Dead/misleading UI:** hearts HUD decrements but nothing consumes it (`scene/[id].tsx:83,149`); "{n} total" shows the filtered count (`phrases.tsx:122`); no empty state on Progress for new learners (`progress.tsx:104–138`); composer gives no disabled treatment (`live-composer.tsx:35`); disabled segmented control looks enabled (`segmented-control.tsx:93` + `live.tsx:441`); pronunciation button stuck on "Asha is thinking…" during feedback playback (`pronunciation-recorder.tsx:97`).
- **Hygiene:** `commit()` side-effects inside a setState updater (`app-state.tsx:271–283`); orb animations never cancelled on unmount (`realtime-voice-button.tsx:58–96`); hardcoded `#38290D` / `rgba(255,255,255,…)` colors bypassing the theme (`phrases.tsx:201`, `realtime-voice-button.tsx:192–211`); eight unused `hero*` theme tokens (`theme.ts:47–55`); `scene/[id].tsx:20` doesn't guard array-valued route params (lesson-plans does).

---

## Verified clean
Dark mode is deliberately disabled (fixed light palette, `userInterfaceStyle: "light"`), all sampled token pairs clear WCAG 4.5:1, hydration is gated with a labelled loading state, reduced motion is honored in the animated surfaces (modulo the ring bug above), abort controllers/listeners are cleaned up, and there are no TODO/FIXME/skipped tests in the repo. `use-realtime-conversation.ts`'s status machine has no constructible stuck state.

## Suggested fix order
1. Voice-session controls (#1, #2) — one styling/layout pass on `realtime-voice-button.tsx`.
2. Onboarding trap + preference reset (#3).
3. Review scrollability + double-tap guards (#4, review/scene grading).
4. Practice-time accounting (#6) and the hardcoded cue (#5).
5. Android safe-area/keyboard pass (#7 + live composer items).
6. Word-sheet retry wedge (#8), then the medium list.
