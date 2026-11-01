# Bolo design system

Rule one: keep the orange, serif, original look. Warm cream paper, rust brand, Georgia headings, Tiro Devanagari for Hindi, and Asha's portrait. No mascots, no new accent colours, no dark theme (Bolo is light-only).

Everything below lives in `src/theme.ts`. Screens use these tokens, never a raw size, weight or hex.

## Type roles (`type`)

| Role | Face | Size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| `display` | Georgia | 34 / 40 | 700 | Screen titles |
| `title` | Georgia | 26 / 32 | 700 | Hero card titles, lesson title |
| `headline` | Georgia | 20 / 26 | 700 | Section headings, list titles, prompts |
| `bodyLarge` | System | 17 / 24 | 400 | Asha's lines, lead text |
| `body` | System | 16 / 23 | 400 | Reading text |
| `label` | System | 16 / 20 | 600 | Buttons, chips, list names |
| `caption` | System | 13 / 18 | 400 | Metadata, helper text |
| `eyebrow` | System | 12 / 16 | 700, uppercase, 0.6 tracking | Kickers above titles |

- Weights are 400, 600 and 700 only. Georgia has no 800/900, so those smear.
- Hindi uses `hindiType(size)`: 28 for a hero phrase, 20 on cards, 17 inline. Never bold Devanagari.
- Numbers use `fontVariant: ['lining-nums', 'tabular-nums']` so Georgia's 0 does not read as o.
- Exceptions, each commented where used: tab-bar labels (11), decorative glyphs and numerals of 40 pt and up.

## Colour roles

- **Rust (`brand`)**: the brand, and the single primary action on a cream screen.
- **Gold**: celebration and streaks, and the action that sits on a rust surface.
- **Forest**: correct answers and success only. Never links, arrows or plain actions.
- **Ink**: text, and the selected state.

Selected means ink: an ink fill with white text on chips and segmented controls, or a 2 pt ink border with a check on choice cards. The current item in a list uses a `brandSoft` fill with a rust left bar.

## Buttons (`buttons`, `createButtonStyles`)

| Variant | Look | Use |
| --- | --- | --- |
| `primary` | Rust fill, white `label`, 52 pt, radius `md` | The one main action on a cream screen |
| `primaryOnBrand` | Gold fill, ink text | Only on rust surfaces |
| `secondary` | Paper fill, 1 pt `lineStrong` border, ink text | Again, Hint, Record pronunciation, settings actions |
| `quiet` | Text only, `brandText` | Links, Done, All plans |
| `positive` | Forest fill, white text | Only the "Got it" grade |

A screen shows at most one filled button besides `positive`. Spread the container into the pressable's style and the matching `*Text` style into its label.

## Spacing and radius

- `spacing`: `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32, and `gutter` 20 for screen side padding.
- `radius`: `sm` 10, `md` 14 (buttons), `lg` 20 (cards), `xl` 24, `xxl` 28, `pill` (chips).
- A raw value is allowed only with a comment saying why (for example a speech-bubble tail or a value a regression test pins).
