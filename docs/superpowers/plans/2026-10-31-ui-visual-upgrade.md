# UI visual upgrade implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every screen one alignment role so titles, subtitles, and stage copy sit on a shared edge or a shared centerline, and bring Today and Progress onto the existing type scale.

**Architecture:** `src/theme.ts` owns the alignment roles (`masthead`, `stage`, `stageWide`, `overlayCenter`), a `deck` type role, and the `onFillMuted` token. Screens spread those objects. They do not set a private `maxWidth` on a subtitle or a Georgia weight of 600. Button labels opt out of Android font padding so control text sits in the vertical center.

**Tech Stack:** Expo 57, React Native StyleSheet, the existing `makeStyles` helper, Jest via `npm run verify`.

## Global Constraints

- Keep the orange, serif, light-only look. No new accent, no mascot, no dark theme. The Asha night surface stays.
- `expo` stays pinned at 57.0.27. Do not touch `package.json` `expo.install.exclude`.
- Screens use tokens from `src/theme.ts`. Weights on Georgia are 400 and 700 only.
- Hindi uses `hindiType()` and is never bold.
- A screen shows at most one filled button besides `positive`. Gold (`primaryOnBrand`) is only on a rust surface. Forest is success only.
- Do not change user-facing copy, test IDs, or navigation.
- The Asha ask sheet top radius stays greater than or equal to 30. `__tests__/live-runtime-regressions.test.tsx` pins that.
- Progress hero stays `paperRaised`, title `ink`, body `muted`. `__tests__/audit-screen-regressions.test.tsx` pins that.
- `npm run verify` needs `BOLO_LIVE_API_URL=https://live.example.test`.
- Node is the version in `.nvmrc`. If `npm run toolchain:check` fails, `export PATH="/usr/local/bin:$PATH"`.

---

### Task 1: Alignment roles, deck type, and on-fill colour

**Files:**
- Modify: `src/theme.ts`
- Test: `__tests__/text-alignment.test.ts`

**Interfaces:**
- Consumes: existing `type`, `maxContentWidth`, `lightColors`, `createButtonStyles`
- Produces:
  - `measure.stage` is `320`
  - `type.deck` is `{ fontFamily: 'Georgia', fontSize: 17, lineHeight: 24, fontWeight: '400' }`
  - `align.masthead`, `align.stage`, `align.stageWide`, `align.overlayCenter` with the fields below
  - `lightColors.onFillMuted` is `'#FBEFE8'`
  - `controlLabel` text style used by every `*Text` button style

- [ ] **Step 1: Write the failing test**

```ts
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { align, buttons, controlLabel, lightColors, measure, type } from '../src/theme';

describe('text alignment contract', () => {
  it('keeps masthead text on the left edge of the column', () => {
    expect(align.masthead).toMatchObject({ alignSelf: 'stretch', textAlign: 'left' });
    expect(align.masthead).not.toHaveProperty('maxWidth');
  });

  it('centers a stage block and the glyphs inside it', () => {
    expect(measure.stage).toBe(320);
    expect(align.stage).toMatchObject({
      alignSelf: 'center',
      maxWidth: 320,
      textAlign: 'center',
      width: '100%',
    });
    expect(align.stageWide).toMatchObject({ alignSelf: 'stretch', textAlign: 'center' });
    expect(align.stageWide).not.toHaveProperty('maxWidth');
  });

  it('fills an overlay so a dial label cannot stick to the corner', () => {
    expect(align.overlayCenter).toMatchObject({
      alignItems: 'center',
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    });
  });

  it('uses a regular Georgia deck under mastheads', () => {
    expect(type.deck).toMatchObject({
      fontFamily: 'Georgia',
      fontSize: 17,
      fontWeight: '400',
      lineHeight: 24,
    });
  });

  it('names the cream used for secondary text on rust and forest fills', () => {
    expect(lightColors.onFillMuted).toBe('#FBEFE8');
  });

  it('centers control labels vertically on Android', () => {
    const flat = StyleSheet.flatten(buttons.primaryText) as TextStyle;
    expect(flat).toMatchObject({
      includeFontPadding: false,
      textAlign: 'center',
      textAlignVertical: 'center',
    });
    expect(controlLabel.textAlign).toBe('center');
    expect(align.overlayCenter.position).toBe<ViewStyle['position']>('absolute');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts --no-coverage`

Expected: FAIL because `align`, `measure`, `type.deck`, `onFillMuted`, and `controlLabel` are not exported.

- [ ] **Step 3: Add the tokens**

In `src/theme.ts`, add `onFillMuted: '#FBEFE8'` to `lightColors` next to `onBrandWatermark`. The comment is: `/** Secondary text on rust and forest fills. */`

Add `deck` to `type`, after `bodyLarge`:

```ts
  /** One line under a masthead. Regular Georgia; italic would be synthesized on Android. */
  deck: { fontFamily: displayFont, fontSize: 17, lineHeight: 24, fontWeight: '400' },
```

After `maxContentWidth`, add:

```ts
/** Line length for stage copy. Masthead subtitles do not use this. */
export const measure = {
  stage: 320,
} as const;

/**
 * Where text sits. Spread one of these. Do not set a private maxWidth on a subtitle.
 * - masthead: left edge of the centered column.
 * - stage: the block is centered and the glyphs are centered inside it.
 * - stageWide: glyphs centered across the full column (empty states, card errors).
 * - overlayCenter: fills a fixed shape (the goal dial) and centers its children.
 */
export const align = {
  masthead: {
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  stage: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: measure.stage,
    textAlign: 'center',
  },
  stageWide: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  overlayCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
} as const satisfies Record<string, ViewStyle | TextStyle>;

/** Label inside a button, chip, or segmented control. Android font padding sits low; turn it off. */
export const controlLabel = {
  ...type.label,
  includeFontPadding: false,
  textAlign: 'center',
  textAlignVertical: 'center',
} as const satisfies TextStyle;
```

In `createButtonStyles`, replace each `primaryText`, `primaryOnBrandText`, `secondaryText`, and `positiveText` so they spread `controlLabel` and then set `color`. Example:

```ts
primaryText: { ...controlLabel, color: c.white },
```

`quietText` stays `{ ...type.label, color: c.brandText }` because quiet buttons are links, not centered controls. Do not add `textAlign: 'center'` to `quietText`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/theme.ts __tests__/text-alignment.test.ts
git commit -m "Add alignment roles for masthead, stage, and overlay text"
```

---

### Task 2: Today — type scale, dial center, hero action

**Files:**
- Modify: `src/app/(tabs)/index.tsx`
- Test: `__tests__/today-alignment.test.tsx`

**Interfaces:**
- Consumes: `align.overlayCenter`, `align.masthead`, `type.title`, `type.caption`, `type.label`, `buttons.primaryOnBrand`, `buttons.primaryOnBrandText`, `onFillMuted`, `onBrandWatermark`, `hindiType`, `spacing.gutter`, `radius.lg`
- Produces: Today hero watermark at 64pt, goal label filling the dial, hero action using `primaryOnBrand`

- [ ] **Step 1: Write the failing test**

Reuse the mock setup at the top of `__tests__/home-accessibility.test.tsx` (it already renders `HomeScreen`). Assert on flattened styles:

```tsx
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import HomeScreen from '../src/app/(tabs)/index';
import { lightColors } from '../src/theme';

it('centers the goal value inside the dial', () => {
  const view = render(<HomeScreen />);
  const overlay = StyleSheet.flatten(view.getByTestId('today-goal-value-wrap').props.style);
  expect(overlay).toMatchObject({ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 });
});

it('uses the named cream for secondary hero text and the shared gold button', () => {
  const view = render(<HomeScreen />);
  const subtitle = view.getByText(/New phrase|due|out loud|optional/u);
  expect(StyleSheet.flatten(subtitle.props.style).color).toBe(lightColors.onFillMuted);
  const action = view.getByTestId('today-next-step');
  expect(StyleSheet.flatten(action.props.style).backgroundColor).toBe(lightColors.gold);
  expect(StyleSheet.flatten(action.props.style).borderRadius).toBe(14);
});
```

Seed the same completed learner the home accessibility test uses (`learnerProfile.completed: true`, `goal: 10`, `practice.seconds: 0`). Query `getByTestId('today-goal-value-wrap')` for the overlay. The existing `testID="today-goal-value"` stays on the unit text.

- [ ] **Step 2: Run the test to verify it fails**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/today-alignment.test.tsx --no-coverage`

Expected: FAIL because the overlay has no insets and the subtitle colour is the raw hex.

- [ ] **Step 3: Update Today styles**

Import `align`, `buttons`, `radius` (already imported), `spacing`, `type`.

Style replacements inside `useStyles`:

```ts
list: { width: '100%', alignItems: 'stretch', paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
dateLine: { ...type.caption, color: c.muted },
greeting: { ...type.display, letterSpacing: -0.3 },
streakText: { ...type.label, color: c.ink, fontVariant: ['tabular-nums'] },
heroWatermark: { ...hindiType(64), position: 'absolute', right: -8, top: -18, color: c.onBrandWatermark },
heroTitle: { ...type.title, color: c.white },
heroSubtitle: { ...type.body, color: c.onFillMuted },
heroChipText: { ...type.eyebrow, color: c.ink },
heroMeta: { ...type.caption, color: c.onFillMuted },
goalValue: { ...align.overlayCenter },
goalUnit: { ...type.caption, color: c.onFillMuted, fontSize: 11, lineHeight: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
ashaInviteText: { minWidth: 0, flex: 1, ...type.body, color: c.onFillMuted },
stepLabel: { minWidth: 0, flex: 1, ...type.body, color: c.onFillMuted },
stepMeta: { ...type.caption, color: c.onFillMuted, fontVariant: ['tabular-nums'] },
heroButton: { ...buttons.primaryOnBrand, flex: 1 },
heroButtonText: buttons.primaryOnBrandText,
jumpTile: { minWidth: 0, minHeight: 72, flex: 1, justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
jumpTitle: { ...type.label, color: c.ink },
jumpLabel: { ...type.caption, color: c.muted, fontWeight: '600' },
pathTitle: { ...type.headline },
pathMeta: { ...type.caption, color: c.muted, fontWeight: '600', fontVariant: ['tabular-nums'] },
planTitle: { minWidth: 0, flexShrink: 1, ...type.label, color: c.ink },
planMeta: { ...type.caption, color: c.muted, fontVariant: ['tabular-nums'] },
```

`goalUnit` is an 11-point exception inside a 64-point dial. Comment it: `// Dial unit: smaller than caption so "of 10 min" stays inside the ring.`

`greeting` currently overrides `JournalDisplay` (which is already `type.display` at 34). Spreading `type.display` again is redundant but keeps the letterSpacing. Do not also set `fontSize: 30`.

On the goal overlay `View`, add `testID="today-goal-value-wrap"`.

`heroWord` radius `12` becomes `radius.md` (14). `ashaInvite` radius `18` becomes `radius.lg`.

Leave the hero title left-aligned inside the card. It sits beside the dial; it is not stage copy.

- [ ] **Step 4: Run the test to verify it passes**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/today-alignment.test.tsx __tests__/home-accessibility.test.tsx __tests__/home-journey.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/(tabs)/index.tsx __tests__/today-alignment.test.tsx
git commit -m "Center the Today goal dial and use the type scale"
```

---

### Task 3: Progress — masthead deck and a rust action

**Files:**
- Modify: `src/app/(tabs)/progress.tsx` (`createProgressStyles`)
- Test: `__tests__/text-alignment.test.ts` (add a case; do not create a second file)

**Interfaces:**
- Consumes: `align.masthead`, `type.deck`, `type.display`, `type.title`, `type.headline`, `buttons.primary`, `buttons.primaryText`, `onFillMuted`
- Produces: `createProgressStyles().pageSubtitle` with no `maxWidth` and `textAlign: 'left'`; hero action background `brand`

- [ ] **Step 1: Write the failing test**

Append to `__tests__/text-alignment.test.ts`:

```ts
import { createProgressStyles } from '../src/app/(tabs)/progress';

it('keeps the Progress deck on the title edge and the lesson action rust', () => {
  const styles = createProgressStyles(lightColors);
  expect(styles.pageSubtitle.textAlign).toBe('left');
  expect(styles.pageSubtitle.maxWidth).toBeUndefined();
  expect(styles.pageSubtitle.fontFamily).toBe('Georgia');
  expect(styles.pageSubtitle.fontWeight).toBe('400');
  expect(styles.heroAction.backgroundColor).toBe(lightColors.brand);
  expect(styles.heroTitle.fontWeight).not.toBe('600');
  expect(styles.weekTotal.textAlign).toBeUndefined();
  expect(styles.weekSummary.color).toBe(lightColors.onFillMuted);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts --no-coverage`

Expected: FAIL on `maxWidth` 300 and gold `heroAction`.

- [ ] **Step 3: Update `createProgressStyles`**

```ts
content: { alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
pageTitle: { ...type.display },
pageSubtitle: { ...type.deck, ...align.masthead, color: c.muted },
pageSubtitleLarge: { maxWidth: '100%' },
weekEyebrow: { ...type.eyebrow, color: c.brandSoft },
weekMeta: { ...type.caption, color: c.brandSoft, fontWeight: '600' },
weekTotal: { color: c.white, fontFamily: displayFont, fontSize: 36, lineHeight: 42, fontWeight: '700', fontVariant: ['tabular-nums'] },
weekSummary: { ...type.body, color: c.onFillMuted },
statValue: { ...type.title, color: c.ink, fontVariant: ['tabular-nums'] },
statLabel: { ...type.caption, color: c.muted, textAlign: 'center' },
hero: { width: '100%', alignItems: 'flex-start', borderRadius: radius.xl, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg, gap: spacing.sm },
heroEyebrow: { ...type.eyebrow, color: c.brandText },
heroTitle: { ...type.title, color: c.ink, ...align.masthead },
heroBody: { ...type.body, color: c.muted, ...align.masthead },
heroAction: { ...buttons.primary, alignSelf: 'stretch', marginTop: spacing.xs },
heroActionText: buttons.primaryText,
card: { width: '100%', backgroundColor: c.paperRaised, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md },
title: { ...type.headline, color: c.ink },
seeAllText: { ...type.caption, color: c.brandText, fontWeight: '600' },
planTitle: { minWidth: 0, flexShrink: 1, ...type.label, color: c.ink },
```

`weekTotal` at 36 is under the 40-point exception. Comment it: `// Week total: between title and display so the unit can sit on the same line.`

Keep `content.paddingBottom` at 120 so the audit test (`>= 100`) still passes. Keep `hero.backgroundColor`, `heroTitle.color`, and `heroBody.color` as they are.

Delete `textAlign: 'right'` from `weekTotal`. The row already uses `justifyContent: 'space-between'`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts __tests__/audit-screen-regressions.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/(tabs)/progress.tsx __tests__/text-alignment.test.ts
git commit -m "Align the Progress deck and use a rust lesson action"
```

---

### Task 4: Phrases, lesson plans, and not-found

**Files:**
- Modify: `src/app/(tabs)/phrases.tsx`
- Modify: `src/app/lesson-plans.tsx`
- Modify: `src/app/+not-found.tsx`
- Test: `__tests__/text-alignment.test.ts`

**Interfaces:**
- Consumes: `align.masthead`, `align.stageWide`, `type.deck`
- Produces: Phrases subtitle and plan intro without a private maxWidth; not-found title and body centered

- [ ] **Step 1: Write the failing test**

Export the style factories. In each file, change `const useStyles = makeStyles(...)` so the factory is a named export the test can call:

```ts
export const createPhrasesStyles = (c: ThemeColors) => ({ /* existing object */ });
const useStyles = makeStyles(createPhrasesStyles);
```

Do the same for `createLessonPlanStyles` and `createNotFoundStyles`. Then:

```ts
import { createLessonPlanStyles } from '../src/app/lesson-plans';
import { createNotFoundStyles } from '../src/app/+not-found';
import { createPhrasesStyles } from '../src/app/(tabs)/phrases';

it('drops the left-stuck subtitle measure', () => {
  const phrases = createPhrasesStyles(lightColors);
  const plans = createLessonPlanStyles(lightColors);
  expect(phrases.headerSubtitle.maxWidth).toBeUndefined();
  expect(phrases.headerSubtitle.textAlign).toBe('left');
  expect(phrases.headerSubtitle.fontWeight).toBe('400');
  expect(phrases.emptyBody.textAlign).toBe('center');
  expect(phrases.emptyBody.alignSelf).toBe('stretch');
  expect(plans.intro.maxWidth).toBeUndefined();
  expect(plans.sceneShelfTitle.maxWidth).toBeUndefined();
  expect(plans.sceneShelfTitle.textAlign).toBe('left');
});

it('centers the missing-page stage', () => {
  const styles = createNotFoundStyles(lightColors);
  expect(styles.title).toMatchObject({ alignSelf: 'center', textAlign: 'center', maxWidth: 320 });
  expect(styles.body).toMatchObject({ alignSelf: 'center', textAlign: 'center', maxWidth: 320 });
  expect(styles.content.alignItems).toBe('center');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts --no-coverage`

Expected: FAIL on missing exports and on `maxWidth` 310.

- [ ] **Step 3: Apply the roles**

Phrases:

```ts
headerSubtitle: { ...type.deck, ...align.masthead, color: c.muted },
headerSubtitleLarge: {},
emptyBody: { ...type.body, ...align.stageWide, color: c.muted },
noResults: { ...type.body, ...align.stageWide, color: c.muted },
```

Remove the `displayFont` import from `phrases.tsx` if nothing else uses it.

Lesson plans:

```ts
intro: { ...type.deck, ...align.masthead, color: c.muted },
introLarge: {},
sceneShelfTitle: { ...type.title, ...align.masthead },
```

Not-found:

```ts
content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
title: { ...type.display, ...align.stage, color: c.ink },
body: { ...type.body, ...align.stage, color: c.muted },
```

`headerSubtitleLarge: {}` keeps the existing large-text style join from crashing. The large-text branch can stay in the JSX; an empty override is correct because masthead is already full width.

- [ ] **Step 4: Run the test to verify it passes**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts __tests__/phrases-accessibility.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/(tabs)/phrases.tsx src/app/lesson-plans.tsx src/app/+not-found.tsx __tests__/text-alignment.test.ts
git commit -m "Share one left edge for decks and center the missing page"
```

---

### Task 5: Stage copy — Asha, review, finish, onboarding, errors

**Files:**
- Modify: `src/app/(tabs)/live.tsx` (`createLiveStyles`)
- Modify: `src/app/review.tsx`
- Modify: `src/app/scene/[id].tsx`
- Modify: `src/app/onboarding.tsx`
- Modify: `src/components/app-error-boundary.tsx`
- Test: `__tests__/text-alignment.test.ts`

**Interfaces:**
- Consumes: `align.stage`, `align.stageWide`, `type.headline` (weight 700)
- Produces: live `heroTitle` / `askTitle` / `studioPhraseEnglish` at weight 700 with stage alignment; review and finish copy on `align.stage`; onboarding listen stack centered; error title and body on `align.stage`

- [ ] **Step 1: Write the failing test**

`createLiveStyles` is already exported. Export `createReviewStyles`, `createSceneStyles`, `createOnboardingStyles`, and `createErrorFallbackStyles` the same way as Task 4.

```ts
import { createLiveStyles } from '../src/app/(tabs)/live';
import { createOnboardingStyles } from '../src/app/onboarding';
import { createReviewStyles } from '../src/app/review';
import { createSceneStyles } from '../src/app/scene/[id]';
import { createErrorFallbackStyles } from '../src/components/app-error-boundary';

it('centers stage copy and keeps Georgia at 700', () => {
  const live = createLiveStyles(lightColors);
  expect(live.headerTitle.maxWidth).toBeUndefined();
  expect(live.headerTitle.textAlign).toBe('left');
  expect(live.heroTitle).toMatchObject({ alignSelf: 'center', fontWeight: '700', maxWidth: 320, textAlign: 'center' });
  expect(live.heroBody).toMatchObject({ alignSelf: 'center', textAlign: 'center', maxWidth: 320 });
  expect(live.askTitle.fontWeight).toBe('700');
  expect(live.studioPhraseEnglish.fontWeight).toBe('700');

  const review = createReviewStyles(lightColors);
  expect(review.prompt).toMatchObject({ textAlign: 'center', maxWidth: 320, alignSelf: 'center' });
  expect(review.hintNote.textAlign).toBe('center');
  expect(review.hindi.textAlign).toBe('center');

  const scene = createSceneStyles(lightColors);
  expect(scene.finishHindi).toMatchObject({ alignSelf: 'center', textAlign: 'center' });
  expect(scene.notFoundBody).toMatchObject({ alignSelf: 'center', textAlign: 'center', maxWidth: 320 });

  const onboarding = createOnboardingStyles(lightColors);
  expect(onboarding.listenHindi).toMatchObject({ alignSelf: 'center', textAlign: 'center', maxWidth: 320 });
  expect(onboarding.listenLatin).toMatchObject({ alignSelf: 'center', textAlign: 'center' });
  expect(onboarding.listenHeading).toMatchObject({ alignSelf: 'center', textAlign: 'center' });
  expect(onboarding.heading.textAlign).toBeUndefined();

  const error = createErrorFallbackStyles(lightColors);
  expect(error.title).toMatchObject({ alignSelf: 'center', maxWidth: 320, textAlign: 'center' });
  expect(error.body).toMatchObject({ alignSelf: 'center', maxWidth: 320, textAlign: 'center' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts --no-coverage`

Expected: FAIL. Live `heroTitle.fontWeight` is `'600'` and `headerTitle.maxWidth` is `260`.

- [ ] **Step 3: Apply stage styles**

Live, inside `createLiveStyles`:

```ts
headerTitle: { ...type.display, alignSelf: 'stretch', color: c.white, textAlign: 'left' },
headerTitleStacked: {},
heroTitle: { ...type.headline, ...align.stage, color: c.white },
heroBody: { ...type.body, ...align.stage, color: c.heroSubtle },
askTitle: { ...type.headline, ...align.stage, color: c.white },
askEyebrow: { ...type.eyebrow, ...align.stage, color: c.gold },
studioPhraseEnglish: { ...type.headline, color: c.white },
```

Do not set `fontWeight` on those. `type.headline` is already 700. Leave `askSection.borderTopLeftRadius` at 32.

When `largeTextLayout` is true, the live hero title and body already join a stacked style. Set that override so the 320-point measure does not trap large text:

```ts
heroTitleLarge: { maxWidth: '100%' },
heroBodyLarge: { maxWidth: '100%' },
```

Join them in the JSX the same way `headerTitleStacked` is joined today. Review, finish, not-found, and the error fallback get the same `maxWidth: '100%'` override from `useLargeTextLayout()`. The default style objects stay at 320 so the test above still passes.

Onboarding: the listen step is the only centered step. Do not put `textAlign: 'center'` on the shared `heading` style, because the level and goal steps use it too. Add a listen-only stack:

```ts
listenStack: { alignItems: 'center', gap: spacing.md },
listenHeading: { ...type.display, ...align.stage, color: c.ink },
listenHindi: { ...hindiType(56), ...align.stage, color: c.ink },
listenLatin: { ...type.bodyLarge, ...align.stage, color: c.brandText },
```

In the listen JSX, use `styles.listenStack`, `styles.listenHeading`, `styles.listenHindi`, and `styles.listenLatin`. Leave `styles.heading`, `styles.hindi`, and `styles.latin` for any other use, or delete them if the listen step was their only caller. The level and goal headings keep `styles.heading` (left).

Review:

```ts
card: { backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
prompt: { ...type.display, ...align.stage, color: c.ink },
hindi: { ...hindiType(28), ...align.stage, color: c.ink },
latin: { ...type.bodyLarge, ...align.stage, color: c.brandText },
hintNote: { ...type.caption, ...align.stageWide, color: c.muted },
error: { ...type.caption, ...align.stageWide, color: c.danger },
title: { ...type.title, ...align.stage, color: c.ink },
body: { ...type.body, ...align.stage, color: c.muted },
```

`latin` must not set `fontWeight: '600'`. `type.bodyLarge` is 400.

Scene finish:

```ts
finishHeading: { alignItems: 'center', alignSelf: 'stretch', gap: spacing.xs },
finishHindi: { ...type.display, ...align.stage, color: c.brandDark },
finishGloss: { ...type.body, ...align.stage, color: c.muted },
finishTitle: { ...type.title, ...align.stage, color: c.ink },
notFoundBody: { ...type.body, ...align.stage, color: c.muted },
finishLabel: { ...type.caption, ...align.stageWide, color: c.muted },
```

`resultHindi` is Georgia via `type.headline` plus `fontWeight: '600'`. Delete that override so it stays 700.

Error fallback:

```ts
title: { ...type.title, ...align.stage, color: c.ink },
body: { ...type.body, ...align.stage, color: c.muted },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `BOLO_LIVE_API_URL=https://live.example.test npx jest __tests__/text-alignment.test.ts __tests__/live-runtime-regressions.test.tsx __tests__/scene-journey.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/(tabs)/live.tsx src/app/review.tsx src/app/scene/[id].tsx src/app/onboarding.tsx src/components/app-error-boundary.tsx __tests__/text-alignment.test.ts
git commit -m "Center stage copy on the voice, review, and finish screens"
```

---

### Task 6: Design system note and full verify

**Files:**
- Modify: `docs/design-system.md`

**Interfaces:**
- Consumes: the roles from Task 1
- Produces: a short "Alignment" section under Spacing and radius

- [ ] **Step 1: Document the contract**

Add this section after the spacing table in `docs/design-system.md`:

```markdown
## Alignment

Three roles, from `align` in `src/theme.ts`. A screen does not invent another.

- **Masthead** (`align.masthead`): left edge of the centered column. Screen titles and the `deck` line under them. A deck has no private `maxWidth`.
- **Stage** (`align.stage`, measure 320): the block is centered and the glyphs are centered. Voice prompts, the review answer, lesson finish, the onboarding listen beat, empty states, the missing page, and the error fallback. At large text the max width becomes the column.
- **Overlay** (`align.overlayCenter`): fills a fixed shape on all four edges. The Today goal dial uses it.

`deck` is Georgia 17/24 at weight 400, for that one subtitle line. Georgia is never weight 600. Secondary text on a rust or forest fill uses `onFillMuted`.
```

Add `deck` to the type-role table: Georgia, 17/24, weight 400, "One line under a screen title".

- [ ] **Step 2: Search for leftovers**

Run:

```bash
rg -n "#FBEFE8|maxWidth: 310|maxWidth: 300|maxWidth: 260" src
rg -n "fontWeight: '600'" src/app src/components
```

Expected: no `#FBEFE8`, no subtitle `maxWidth` of 310, 300, or 260. Remaining `fontWeight: '600'` hits are system text (labels, captions, eyebrows), not `fontFamily: displayFont` or a `type.display` / `type.title` / `type.headline` spread. Fix any Georgia 600 the search still shows before continuing.

- [ ] **Step 3: Run verify**

Run: `BOLO_LIVE_API_URL=https://live.example.test npm run verify`

Expected: PASS

- [ ] **Step 4: Look at the screens**

With the Expo web server on port 8081, open Today, Phrases, Progress, Review, and Asha at a 390-point width and at 640. Confirm:

- "Words you want to keep." and "What is taking root." start at the same x as their titles.
- The goal number is inside the ring, on its center.
- The Asha prompt under the portrait is centered, and "Speak with Asha" stays left beside Private.
- The review English prompt and the revealed Hindi line share a centerline.
- The not-found title is centered.

- [ ] **Step 5: Commit**

```bash
git add docs/design-system.md
git commit -m "Document masthead, stage, and overlay alignment"
```

---

## Self-review

Spec coverage:

- Masthead, stage, stage-wide, and overlay roles: Tasks 1, 2, 4, 5.
- `deck` and no private subtitle maxWidth: Tasks 1, 3, 4.
- Today and Progress on the type scale: Tasks 2 and 3.
- Georgia 600 removed from stage headings: Task 5.
- `onFillMuted` replaces `#FBEFE8`: Tasks 1, 2, 3. Task 6 checks leftovers.
- Gold only on rust; Progress action becomes rust: Task 3. Today hero stays gold: Task 2.
- Dial insets: Task 2.
- Watermark: Task 2.
- Ask-sheet radius left alone: Task 5.
- Android composer and dark theme: out of scope, not tasked.
- Design system doc: Task 6.
- Verify command: Task 6.

No task tells the implementer to copy another task's code. Button text changes live in Task 1 and are consumed as `buttons.primaryOnBrandText` and `buttons.primaryText` afterward.
