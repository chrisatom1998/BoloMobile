# UI visual upgrade

Bolo keeps the orange, serif, light-only look in `docs/design-system.md`. This upgrade does not add a theme, an accent, or a mascot. It makes the existing screens read as one composition: text sits on a shared centerline or a shared left edge, and the two screens skipped by the type-scale pass stop using raw sizes.

## Problem

`textAlign` is set per screen, and it does not do what it looks like it does. In React Native, `textAlign: 'center'` only centers glyphs inside the text node. It does not center the node. A `maxWidth` on a stretched child pins that node to the left, so a "centered" subtitle is a narrow left column under a full-width title. The same screens also mix Georgia at weight 600 (which the design system forbids, because Georgia only ships 400 and 700) with raw sizes the type scale was meant to replace.

Today and Progress were left out of the type-scale pass on purpose (PR #126). They still look like a different app from Phrases, Review, and Settings.

## Alignment contract

Three roles, defined once in `src/theme.ts` and spread by screens. A screen does not invent a fourth.

### Masthead

Left edge, full column. Screen titles, section titles, lists, settings, lesson rows, chat transcripts.

- The column is `width: '100%'`, `maxWidth: maxContentWidth` (640), `alignSelf: 'center'`.
- Text is `alignSelf: 'stretch'` and `textAlign: 'left'`.
- A subtitle does not get its own `maxWidth`. It shares the title's left edge and wraps with the column. At Dynamic Type `>= 1.4`, behavior is unchanged because the subtitle is already full width.

### Stage

The block is centered, and the glyphs are centered inside it. Ceremonial copy only: the voice prompt under Asha's portrait, the review answer, the lesson-finish line, the onboarding "नमस्ते" beat, empty states, the not-found screen, and the error fallback.

- `alignSelf: 'center'`, `width: '100%'`, `maxWidth: 320`, `textAlign: 'center'`.
- At Dynamic Type `>= 1.4`, `maxWidth` becomes `'100%'` so large text is not trapped in 320 points.
- A stage paragraph that must use the full column (an error under a card) uses the same `textAlign: 'center'` with `alignSelf: 'stretch'` and no `maxWidth`.

### Overlay

Anything drawn on top of a fixed shape (the Today goal dial) fills that shape and centers its children with insets, not with hope that Yoga centers an absolute child.

- `position: 'absolute'`, `top: 0`, `right: 0`, `bottom: 0`, `left: 0`, `alignItems: 'center'`, `justifyContent: 'center'`.

### What stays left on purpose

Chat bubbles, phrase cards, lesson choices, settings rows, and the Asha top bar (title on the left, Private on the right). Centering those would fight reading order. The Asha top bar drops `maxWidth: 260` on the title so "Speak with Asha" uses the space beside the badge instead of wrapping into a narrow stub. The copy under the portrait is stage.

## Type

Add one role. Do not add sizes anywhere else.

| Role | Face | Size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| `deck` | Georgia | 17 / 24 | 400 | The one line under a masthead: "Words you want to keep.", "What is taking root." |

- `deck` is regular, not italic. Italic Georgia is synthesized on Android and smears.
- Georgia weight stays 400 or 700. Remove every `fontWeight: '600'` that sits on `displayFont`, `type.display`, `type.title`, or `type.headline`. System text may stay 600.
- Today and Progress replace raw `fontSize` / `lineHeight` / `fontWeight` with `type.*` or `deck`. The documented exceptions stay: tab labels at 11, and numerals of 40 points and up (the due count, the week total).

## Colour on a fill

Secondary text on the rust and forest hero cards is the raw hex `#FBEFE8` in several styles. Name it `onFillMuted` in `src/theme.ts` and use that token. It is the existing cream, not a new accent. White text on those cards stays `white`. Gold remains the action on a rust surface only.

The Progress lesson card sits on `paperRaised`. Its action is gold today, which breaks the colour rule (gold is for a rust surface). That action becomes `buttons.primary` (rust, white label). The Today hero action stays gold, and it uses `buttons.primaryOnBrand` instead of a one-off pill. Copy and test IDs do not change. The Progress hero card stays `paperRaised` with ink title and muted body; `__tests__/audit-screen-regressions.test.tsx` pins those colours.

## Shape and rhythm

- Screen side padding is `spacing.gutter` (20). Vertical page padding uses `spacing.lg` or `spacing.xl`, not a raw 18.
- Cards and tiles use `radius.lg` (20) or `radius.xl` (24). Replace raw 18 and 22.
- The Asha "Ask" sheet keeps its 32-point top radius. `__tests__/live-runtime-regressions.test.tsx` requires that radius to be at least 30. Leave it, with the existing comment style if the value is touched.
- The Today hero watermark uses `onBrandWatermark` and `hindiType(64)`, matching Progress, so the glyph stays in the corner and does not sit on the title. The audit's open "watermark vs greeting" question is closed by shrinking and tinting the glyph, not by a device-only guess.

## Vertical centering in controls

Button, chip, and dial labels set `includeFontPadding: false` and `textAlignVertical: 'center'` on the text style (Android; iOS ignores them). Buttons stay `minHeight: 52`, never a fixed `height`, so Devanagari matras are not clipped. Hindi inside a control uses `hindiType()` and is not bold.

## Screens

| Surface | Role | Change |
| --- | --- | --- |
| Today greeting, path, jump tiles | Masthead | Type roles, gutter, shared gold button, dial overlay, smaller watermark |
| Today hero title and steps | Left, inside the rust card | `onFillMuted` for secondary lines; title uses `type.title` |
| Phrases header | Masthead | Subtitle becomes `deck` and loses `maxWidth: 310` |
| Phrases empty and no-results | Stage | Block centered, glyphs centered |
| Progress heading | Masthead | Subtitle becomes `deck` and loses `maxWidth: 300`; week total drops redundant `textAlign: 'right'` |
| Progress lesson card | Masthead | Action becomes rust `primary` |
| Lesson plan detail intro and shelf title | Masthead | `intro` and `sceneShelfTitle` lose their private `maxWidth` |
| Asha header | Masthead row | Title loses `maxWidth: 260` |
| Asha voice copy, Ask heading | Stage | `heroTitle`, `heroBody`, `askTitle` use the stage role; Georgia 600 becomes 700 |
| Review prompt, answer, errors | Stage | Card copy uses the stage role, including the hint note |
| Onboarding "Hear this" | Stage | Heading, `नमस्ते`, and "Namaste" only. Level and goal steps stay left; they are forms |
| Lesson finish and not-found | Stage | Finish heading and the not-found title/body use the stage role. `notFoundBody` is `alignSelf: 'center'` |
| Error fallback | Stage | Title and body use the stage measure so a wrapped line stays centered |
| Settings, privacy, diagnostics, chat rows | Masthead / reading | No layout change |

## Out of scope

- A dark theme. The Asha night surface stays; it is the voice stage, not a second app theme.
- The Android live-composer keyboard (`behavior` is still undefined on Android). That stays the open item in `ui-audit-report.md`.
- New illustration, motion, or marketing-site layout inside the app.
- Expo version pins.
- Copy changes, except none. Strings stay as they are.

## Done when

- A subtitle under a screen title shares that title's left edge at phone width and at 640 points.
- Stage copy (review answer, Asha prompt, finish line, onboarding नमस्ते, empty states, not-found) is centered as a block, including when the line wraps.
- The Today goal number sits in the middle of the ring because the label fills the dial.
- Today and Progress use `type` roles. The only Georgia weights in those files are 400 and 700.
- No `#FBEFE8` remains in `src/`.
- `npm run verify` passes with `BOLO_LIVE_API_URL=https://live.example.test`.
