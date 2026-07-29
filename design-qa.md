# Garden Sundial design QA

## Comparison target

- Source visual truth: `/Users/chrisjohnson/.codex/generated_images/019fa669-cd6d-7922-80c9-6d6ad24cd695/call_lGr0HKNnvMla7NbvYoEpW6OE.png`
- Latest annotation source: `/var/folders/vm/ffplws3s3dsfbdr__6l2sbz40000gn/T/codex-clipboard-15535a9b-2b6a-4431-9d9b-f35c7432df97.png`
- Source pixels: generated option 1214 × 1295; latest annotation 558 × 440.
- Rendered implementation: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/annotation-final-full-5.jpg`
- Implementation capture: iPhone 17 Pro Max simulator, 368 × 800 pixels, Release configuration.
- State: Today screen scrolled to the learning path and daily target; 5-minute goal selected in the direct comparison; 10-minute goal selected in the second proof capture; 0 minutes and 0% practiced; Chai scene incomplete; Asha turn complete.
- Density normalization: the latest annotation was scaled to 560 × 443. The 334 × 250 implementation card crop was scaled to 560 × 419 and padded to the same 560 × 443 frame without stretching.

## Evidence

- Full-view implementation: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/annotation-final-full-5.jpg`
- Focused source/implementation comparison: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/comparison.png`
- Latest annotated 5-minute comparison: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/annotation-comparison.png`
- Latest 10-minute state proving the idle 5-minute gold marker: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/annotation-implementation-10.png`
- Marker alignment before/after comparison: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/dot-alignment-comparison.png`
- Final aligned 5-minute state: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/dot-alignment-after-5.png`
- Runtime centerline before/after comparison: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/centerline-before-after.png`
- Final center and right-endpoint states: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/centerline-final-10.png` and `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/centerline-final-15.png`
- Magnified runtime checks: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/centerline-final-apex-8x.png` and `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/centerline-final-left-8x.png`
- Endpoint-label before/after comparison: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/label-overlap-before-after.png`
- Final 5-, 10-, and 15-minute states after the label correction: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/label-overlap-final-5.png`, `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/label-overlap-final-10.png`, and `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/label-overlap-final-15.png`
- Focused inspection was required because the dial labels, marker positions, arc proportions, and status pills were too small to judge reliably in the full simulator screenshot.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the editorial serif title and goal value match the Today screen's existing Georgia-based display language. The compact labels, numeric hierarchy, and copy match the selected option without clipping.
- Spacing and layout rhythm: the header, badge, three snap points, selected marker, centered goal value, progress copy, and two status pills are aligned and remain inside the card at the simulator width.
- Colors and visual tokens: the implementation uses the existing warm paper, terracotta, gold, forest, peach, and pale-success tokens shown by the source.
- Image and asset fidelity: the selected target adds no raster illustration or logo inside this component. The functional progress curve is rendered natively and stays sharp at simulator density.
- Copy and content: `Daily practice target`, `{minutes} min today`, the 5/10/15 choices, `{goal} min`, `daily goal`, the Today progress line, `Chai scene`, and `Asha turn` all use the real app state.
- Accepted product constraint: the native status controls are slightly taller than the mock so their existing minimum touch size is retained. This adds a little card height but does not change the selected visual hierarchy.

## Comparison history

1. Initial implementation evidence: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/iteration-1-full.png`
   - P2: the first arc was wider and shallower than the selected Garden Sundial, and the goal value sat too close to the curve.
   - Fix: narrowed the endpoints, increased the arc rise, moved the selected value below the apex, centered the status pills, and removed excess space beneath the dial.
2. Post-fix evidence: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/comparison.png`
   - The selected terracotta marker now sits at the 10-minute apex, the 5/15 endpoints mirror the source, the goal value is clear inside the arc, and no P0/P1/P2 mismatch remains.
3. User annotation refinement: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/annotation-comparison.png`
   - P2: the arc crowded the selected goal value, the progress copy sat too close to the Chai/Asha controls, and the idle 5-minute endpoint used a hollow marker.
   - Fix: translated the curve and all three marker dots upward by 10 points without reshaping the progress path, added 8 points above the status controls, and made the idle 5-minute endpoint gold.
   - Verification: the 5-minute selected state keeps its terracotta marker, while the 10-minute selected state visibly shows a filled gold 5-minute marker. The raised curve, labels, goal value, progress copy, and status controls do not overlap or clip.
4. Marker-on-curve refinement: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/dot-alignment-comparison.png`
   - P2: all three markers hovered slightly above the curve instead of being centered on it.
   - Fix: lowered only the marker centers, using the curve's exact endpoint and apex positions. The 5/15 markers now use a 2-point bottom offset and the 10 marker uses 1.5 points.
   - Superseded finding: source-coordinate math aligned, but later user feedback and magnified runtime pixels showed the SVG viewport was scaling the curve differently from the markers. The visible centers still missed the rendered curve.
5. Runtime centerline correction: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/centerline-before-after.png`
   - P2: the rendered curve crossed the lower portion of the selected center dot and ended down/right of the left dot even though their source coordinates matched.
   - Fix: gave the curve an explicit 136-point viewport with no aspect-ratio padding, then placed both endpoint controls at the same responsive percentages as the curve endpoints.
   - Verification: the selected 10-minute dot is centered on the true curve apex; the 5- and 15-minute dot centers sit on their respective rendered endpoints. The 8× inspections confirm the curve meets the centers, while labels, touch targets, curve height, progress behavior, and surrounding spacing remain unchanged.
6. Endpoint-label overlap correction: `/Users/chrisjohnson/.codex/visualizations/2026/07/28/019fa669-cd6d-7922-80c9-6d6ad24cd695/garden-sundial-qa/label-overlap-before-after.png`
   - P2: after the marker centerline was corrected, the rising sides of the arc crossed the inward edge of the 5- and 15-minute labels.
   - Fix: moved only the visible 5-minute label 8 points left and the visible 15-minute label 8 points right. The curve, marker centers, and 48-point controls stayed fixed.
   - Verification: the labels remain clear of the arc in the 5-, 10-, and 15-minute simulator states. All three marker centers remain on the curve, and goal selection still updates the real persisted setting.

## Interaction checks

- 5, 10, and 15-minute targets were all visible in the simulator UI hierarchy.
- Selecting a target updates the centered value and selected marker while continuing to call the existing persisted `setGoal` action.
- The Today tab remained selected and the screen remained scrollable with the full card visible above the tab bar.

## Follow-up polish

- P3: the native 44-point status pills are slightly taller than the generated mock's decorative pills. Keep the native size unless a later approved visual explicitly changes interaction sizing.

final result: passed
