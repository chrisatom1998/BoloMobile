# Bolo UI upgrade plan

Plan only. No app code in this branch. Do not merge.

Shots are from **main** at `3fa456e` (the design brief in #126 is already on main). Device: **iPhone 15 simulator, iOS 26.5 (23F77)**, 1179×2556 pixels (393×852 points). Light appearance. Text sizes: iOS content size `large` (the default) and `extra-large` (one Larger Text step up). Unsigned Debug build, Metro on port 8091. Screenshots are `xcrun simctl io` captures from that simulator.

Cream paper, rust, Georgia, Tiro Devanagari through `hindiType()`, and Asha’s portrait stay. Light mode only. No mascot, no new accent color, no Duolingo restyle. Every new size or spacing value goes in `src/theme.ts`.

## The five upgrades

1. **Asha’s chat header collides, and the last suggestion chip is cut off.** Spec tasks 13 and 17. Do this after #128’s cream Asha screen. Effort M.
2. **The Progress week card is an empty rust block, and the watermark runs through “0 min”.** Spec task 11. #128 only renames today’s column. Effort M.
3. **One Larger Text step drops नमस्ते onto its own line, because the reflow waits until a much bigger size.** Spec task 17. New. Effort M.
4. **“STEP 1 OF 3” on onboarding is left of center.** Alignment. New, on top of #128’s header copy. Effort S.
5. **The tab bar is see-through, so Progress text shows through it and the lesson button gets clipped.** Builds on #128’s tab-bar padding. Effort S.

## 1. Asha chat header and chips

**Problem.** On the chat screen the title “How do I say…?” shares a row with the Last session pill. At the larger size, “ASK ASHA” and that title run into the pill. The suggestion row starts “Order tea”, “Ask the price”, “Be polite”, then slices the fourth chip (“Correct my Hindi”) at the screen edge. Asha’s reply is pushed into that row.

**Before.** [Default](ui-upgrade-plan/screenshots/asha-chat-default.png), [larger](ui-upgrade-plan/screenshots/asha-chat-larger.png).

**Change.** Drop the centered “ASK ASHA / How do I say…?” block. Put Clear chat and Last session on one left-aligned row, each at least 44 points tall. Let the suggestion chips scroll with enough end inset that the last label is fully on screen. Keep Asha’s reply above that row.

**Tokens.** Add `layout.touchTarget: 44`. Add `layout.chipEndInset` equal to `spacing.gutter` (20) and use it as the chip row’s trailing padding. No new color. Headings stay `type.headline` only where a heading remains. Hindi in replies stays `hindiType(16)` inline.

**Files.** `src/app/(tabs)/live.tsx`, `src/theme.ts`.

**Impact.** The chat stops looking broken. Every suggested prompt is readable, and the title no longer fights the Last session control.

**Effort.** M.

**Overlap.** Spec task 13 (remove that heading, move Clear chat) and task 17 (clipping). #128 keeps `askTitle` and only recolors it for the cream screen, so this is not already in #128. Land it after #128 so the row is built on cream, not on the current night screen. #129 does not touch this chrome.

## 2. Progress week card

**Problem.** “Last 7 days” is a tall rust card with no bars. The day letters sit in a empty band, and the faint बोलो watermark runs through the “0 min” number. At the larger size the number sits in the middle of the watermark. The four stats (streak, phrases, lessons, accuracy) are one cramped row.

**Before.** [Default](ui-upgrade-plan/screenshots/progress-default.png), [larger](ui-upgrade-plan/screenshots/progress-larger.png).

**Change.** Draw a 4-point stub for every day, including zeros, so the week reads as seven columns. Today’s stub is gold. Move the watermark off the number and use the existing `colors.onBrandWatermark` (it is already 0.08; the current position is the problem). Lay the four stats out as a 2×2 grid when the row would be tighter than the type scale.

**Tokens.** Add `layout.barStub: 4`. Day letters use `type.caption` (today’s bar labels are 11 points, under the 12-point floor). Reuse `colors.gold`, `colors.onBrandWatermark`, and `colors.brandSoft`. No new color.

**Files.** `src/app/(tabs)/progress.tsx`, `src/theme.ts`.

**Impact.** A new learner sees a week, not a blank orange slab, and the minute total stays readable when the text gets bigger.

**Effort.** M.

**Overlap.** Spec task 11 (stubs, gold today, 2×2 stats). #128 changes today’s value label to the word “Today” and leaves `barEmpty` at height 0, so the blank chart remains. Keep #128’s “Today” label. This is the chart itself. #129’s Progress empty state is the first-lesson card, which is a different block and stays as #129 wrote it.

## 3. Larger Text reflow starts too late

**Problem.** At one step up, Today’s greeting breaks: “Namaste” stays on the first line with the streak pill, and नमस्ते drops underneath, left aligned, as if the line overflowed. The app only switches to the stacked layout at `fontScale >= 1.4` (`LARGE_TEXT_FONT_SCALE` in `use-large-text-layout.ts`). Extra Large is the first Larger Text step and is below that, so the stacked layout never runs. The same miss shows up as the orphan word “opening” under the plan subtitle.

**Before.** [Today, larger](ui-upgrade-plan/screenshots/today-larger.png). Also [plan detail, larger](ui-upgrade-plan/screenshots/plan-detail-larger.png).

**Change.** Treat the first Larger Text step as the point where paired lines stack. Put नमस्ते on its own left-aligned line under Namaste on purpose, at that size, instead of letting the row wrap by accident. Check the other rows that already have a `*Large` style (Today top bar, Progress stats, plan cards) at Extra Large, not only at the accessibility sizes.

**Tokens.** Add `layout.largeTextScale: 1.12` in `src/theme.ts` and point `useLargeTextLayout` at it. 1.12 matches the Extra Large step on this simulator. No new color or type role.

**Files.** `src/theme.ts`, `src/hooks/use-large-text-layout.ts`, `src/app/(tabs)/index.tsx`.

**Impact.** Turning on Larger Text looks like a layout we meant, and the Hindi greeting stays easy to read next to the streak.

**Effort.** M. The threshold is one constant, then a pass on the screens that already branch on it.

**Overlap.** Spec task 17. New. #128’s own larger-text notes (the Progress “Today” label wrapping, the pinned button covering the jump cards) are separate bugs on that branch. #129 does not change this threshold.

## 4. Onboarding step label is off center

**Problem.** “STEP 1 OF 3” is meant to sit in the middle of the header. It sits left of center, with a blank gap on the right. The left slot is the ब mark (`hindiType(28)`) and the right slot is an empty 64-point spacer, so the middle is not the middle. Same at both text sizes. The rest of this screen is in good shape: the Hindi line, the choices, and the Continue button line up with the left edge.

**Before.** [Default](ui-upgrade-plan/screenshots/onboarding-default.png), [larger](ui-upgrade-plan/screenshots/onboarding-larger.png).

**Change.** Give the left and right header slots the same width, and center the step label in the row. ब stays on the left. The right slot stays empty on step 1 and holds Cancel when recalibrating.

**Tokens.** Add `layout.headerSide: 44` (wide enough for Cancel, and a 44-point touch target). Replace the raw `width: 64` spacer and the raw `minHeight: 44` on that row with this token.

**Files.** `src/app/onboarding.tsx`, `src/theme.ts`.

**Impact.** The step count reads as a centered kicker above “Hear this”, at both text sizes.

**Effort.** S.

**Overlap.** New. Spec tasks 8 and 17 are the nearest (spacing, alignment). #128 rewrites this header’s words (“Step 1 of 2”, “Build my plan”, script samples) and pins Continue, and it leaves the unequal side slots. Do the centering on #128’s header so the two edits do not fight. #129 does not touch onboarding.

## 5. Tab bar lets the page show through

**Problem.** On Progress the floating tab bar is translucent. “Your plans” and the plan row show through the icons. At the larger size the gold Start lesson button runs into the bar. Today’s path card is clipped the same way at the larger size.

**Before.** [Progress, larger](ui-upgrade-plan/screenshots/progress-larger.png), [Today, larger](ui-upgrade-plan/screenshots/today-larger.png). The default Progress shot shows the same ghosting: [progress-default.png](ui-upgrade-plan/screenshots/progress-default.png).

**Change.** Paint the tab bar with an opaque `colors.paperRaised` fill so the page cannot read through it. Add scroll padding so the last card and the Start lesson button clear the bar and the home indicator.

**Tokens.** No new color. Reuse `colors.paperRaised`. If #128 has landed, reuse its `safeArea.tabBar` and `safeArea.progressScrollTail` for the padding. If it has not, add those two tokens (`tabBar: 49`, `progressScrollTail: 120`) and replace the raw `paddingBottom: 120` on Progress.

**Files.** `src/app/(tabs)/_layout.tsx`, `src/app/(tabs)/progress.tsx`, `src/app/(tabs)/index.tsx`, `src/theme.ts`.

**Impact.** Tab labels stay readable, and the last button on Progress and Today is tappable instead of hidden under the bar.

**Effort.** S.

**Overlap.** Builds on #128, which sets `minimizeBehavior="never"` and adds the safe-area tokens, and does not make the bar opaque. The ghosting is still on main, where `disableTransparentOnScrollEdge` is already set. #129 does not change the tab bar.

## Per-screen audit

### Onboarding

[Default](ui-upgrade-plan/screenshots/onboarding-default.png), [larger](ui-upgrade-plan/screenshots/onboarding-larger.png).

- Step label off center. Item 4.
- “Hear this”, नमस्ते, and “Namaste” share one left edge. The body “Saved in the app…” is left aligned when it wraps. That part is right.
- Choices are full width, with a 56-point row. The radio mark is 22 points; the row is the touch target.
- Continue is a full-width rust button, washed out while no reply is selected. It clears the home indicator at both sizes.
- #128’s onboarding copy (two steps, “Build my plan”, नमस्ते / namaste samples, pinned Continue) is still only on that draft. This plan does not redo it.

### Today

[Default](ui-upgrade-plan/screenshots/today-default.png), [larger](ui-upgrade-plan/screenshots/today-larger.png).

- Greeting wrap at larger text. Item 3. Default keeps “Namaste” and नमस्ते on one baseline, which looks right.
- The goal ring’s “of 10 min” is tiny (9-point `goalUnit`) and the watermark sits on the ring. #128 grows that label to 12 points and the dial from 64 to 80. Leave that to #128.
- “Or jump to” repeats the tab bar (Asha, Phrases) plus All plans. Spec task 10 removes that row. #128 keeps the row and renames the tile to “Lesson plans”. See Later.
- “Your path” and “Plan 01” are a second heading under the jump row. #128 replaces them with one “Lesson plans” heading. Leave that to #128.
- Streak pill and settings are 44 and 48 points and line up on the default size. At the larger size the streak pill stays on the first line while नमस्ते wraps under it.
- The path card slides under the tab bar at the larger size. Item 5.
- Today’s greeting is 30 points and the hero chip is 11 points, beside Phrases which uses `type.display` (34). Spec task 5. See Later. #128 leaves the 30-point hero title.

The larger Today shot shows a 1-day streak because the Asha chat had already counted a practice day. The default shot was taken before that, at 0 days. Same screen, different data.

### Asha, idle

[Default](ui-upgrade-plan/screenshots/asha-idle-default.png), [larger](ui-upgrade-plan/screenshots/asha-idle-larger.png).

- The screen is night green in a cream app. The Private pill sits on the title row. The sharing line is centered and wraps to two lines. #128 makes this screen cream, removes Private, and replaces the sharing line with one sentence. Leave that to #128.
- “Speak with Asha” is left aligned and wraps to two lines at the larger size. The invite quote under the portrait is centered. After #128, check that the quote does not become a centered paragraph of more than one line (spec task 17).
- Talk with Asha is a full-width rust button. Last session is a separate pill. There is a large empty band under Last session. That space is what #128’s cream layout should use; this plan does not redraw the idle hero.

### Asha, in chat

[Default](ui-upgrade-plan/screenshots/asha-chat-default.png), [larger](ui-upgrade-plan/screenshots/asha-chat-larger.png).

- Header collision and clipped chip. Item 1.
- Bubbles themselves are in good shape: Asha on the left in a paper card, the learner on the right, Hindi inside the reply at a readable size. The “Order tea” reply came back from the live coach (“Ek chai dijiye…”).
- The composer (mic, field, send) clears the tab bar. Send is a gold circle, which matches gold-on-dark for the current night screen. On #128’s cream screen that send control needs to be checked against “one rust primary”.

### Phrases

[Default](ui-upgrade-plan/screenshots/phrases-default.png), [larger](ui-upgrade-plan/screenshots/phrases-larger.png).

- Empty state: a book icon, then a two-line sentence that is center aligned, then a short rust button, then a large blank down to the tab bar. The sentence is the current copy (“Practice a lesson, then save any useful phrase…”). #129 replaces this with `EmptyState`, which also center-aligns the title and the body. See Later for the left-align follow-up. This plan does not add a second empty-state component.
- The title “Phrases” and the subtitle “Words you want to keep.” are left aligned and use the display face. That part matches the design system.

### Lesson plans

[Default](ui-upgrade-plan/screenshots/lesson-plans-default.png), [larger](ui-upgrade-plan/screenshots/lesson-plans-larger.png).

- The large title “One path, 100 small wins.” is left aligned and wraps cleanly at both sizes.
- Plan 01 is a rust-soft card with a left bar. Later plans use other hues on that bar (purple, orange, teal). Those hues are raw hex values on the plan data. Spec task 9 moves hex into tokens. See Later. Do not add more hues.
- “0/10 complete” sits on the right of the eyebrow and stays on one line at the larger size.

### Plan detail

[Default](ui-upgrade-plan/screenshots/plan-detail-default.png), [larger](ui-upgrade-plan/screenshots/plan-detail-larger.png).

- The summary shows both “0/10 lessons complete” and “0%”. #128 drops the extra percent. Leave that to #128.
- Lessons 02 through 05 all say “UP NEXT”, so nothing is singled out as the one next lesson. #128 changes row status to Done, Next, or Later. Leave that to #128.
- At the larger size the subtitle breaks so the word “opening” sits alone. Item 3 covers this class of wrap.
- The nav title stays blank until the large title scrolls away, and the “← All lesson plans” link is not on screen when there is a back chevron. Spec task 16 is already in this shape on main.

### Progress

Covered by items 2 and 5. The next-lesson card (eyebrow, “A warm hello”, gold Start lesson) is clear at the default size. The share button is a 44-point circle and lines up with the title.

## Later

Do these after the five above, or leave them on the draft that already owns them.

- **Left-align multi-line empty copy.** Phrases centers a two-line sentence ([phrases-default.png](ui-upgrade-plan/screenshots/phrases-default.png)). Spec task 17. #129’s `EmptyState` sets `textAlign: 'center'` on the title and the body and adds a centered नमस्ते. When #129 lands, switch that body to left alignment. No new token. Effort S.
- **Remove the “Or jump to” row.** It repeats the tab bar ([today-default.png](ui-upgrade-plan/screenshots/today-default.png)). Spec task 10. #128 keeps the row. Effort S. `src/app/(tabs)/index.tsx`.
- **Use the type scale on Today and Progress.** Greeting and page title are 30 points, the hero chip is 11, the ring caption is 9. Phrases and lesson plans already use `type.display`. Spec task 5. #128 only lifts the ring caption from 9 to 12. Effort M.
- **Already on #128, do not redo:** cream Asha screen, Private pill removed, one privacy line, rust primary button, pinned Next turn on a lesson, status-bar scrim fade (`layout.statusBarFadeHeight`), Georgia on the headings that are still system, “Step 1 of 2” / “Build my plan”, lesson rows Done / Next / Later, redundant percent removed, practice minutes counted only while Asha is focused.
- **Already on #129, do not redo:** the 16 empty, loading, and error states (Today, Phrases, Asha connecting / mic denied / offline / unavailable, lesson plans, Progress), including the larger-text shots on that draft.
- **Plan accent colors.** The left bars on lesson plans are a set of raw hex hues. Spec task 9. Map them to existing rust, gold, and forest tokens when that token pass happens. Do not add a new accent.

## Screenshot files

All under `docs/ui-upgrade-plan/screenshots/`.

| File | Screen | Text size |
| --- | --- | --- |
| `onboarding-default.png` | Onboarding, step 1 | large |
| `onboarding-larger.png` | Onboarding, step 1 | extra-large |
| `today-default.png` | Today | large |
| `today-larger.png` | Today | extra-large |
| `asha-idle-default.png` | Asha, before consent | large |
| `asha-idle-larger.png` | Asha, before consent | extra-large |
| `asha-chat-default.png` | Asha, after “Order tea” | large |
| `asha-chat-larger.png` | Asha, same chat | extra-large |
| `phrases-default.png` | Phrases, empty | large |
| `phrases-larger.png` | Phrases, empty | extra-large |
| `lesson-plans-default.png` | Lesson plans | large |
| `lesson-plans-larger.png` | Lesson plans | extra-large |
| `plan-detail-default.png` | Plan “Start speaking” | large |
| `plan-detail-larger.png` | Plan “Start speaking” | extra-large |
| `progress-default.png` | Progress | large |
| `progress-larger.png` | Progress | extra-large |
