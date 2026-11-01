# Bolo UI audit — status as of 2026-10-31

Checked against the current tree. This replaces the 2026-07-25 report and the 2026-07-26 and 2026-10-30 verification passes. Those passes cited line numbers that no longer match. Resolved findings are listed once, under Fixed. Open findings stay open.

## Open

- **Android live composer keyboard.** `src/app/(tabs)/live.tsx` wraps the screen in `KeyboardAvoidingView` with `behavior` set only on iOS (`padding`); on Android `behavior` is `undefined`. `app.json` sets `android.softwareKeyboardLayoutMode` to `resize`, which does not by itself keep the composer above the keyboard. Left unfixed here because other work is on this screen.
- **Home header motif on a narrow phone.** `src/app/(tabs)/index.tsx` still draws a large watermark behind the Today hero. Whether it overlaps the greeting at iPhone SE width and large text cannot be settled from the code. Needs a device check.
- **Unused theme tokens.** `heroRaised` and `heroGlyph` in `src/theme.ts` are still unused.

## Fixed

Verified in the current code:

- **Hardcoded pronunciation cue.** The featured-phrase cue uses that phrase's `latin` (`Say “{studioPhrase.latin}” naturally…` in `live.tsx`). The literal `chee-nee kam` cue is gone.
- **Due-phrase cap of 5.** Home, Phrases, and the app-state badge call `dueSavedPhrases` with `Infinity`. The function's default `limit` of 5 remains, and the review screen still starts a five-phrase practice when nothing is due. The badge and header counts are not capped.
- **Recalibrate keeps settings.** `onboarding.tsx` seeds level, script, goal, response language, daily goal, and microphone status from the saved profile when `mode=recalibrate`, and Cancel leaves the flow.
- **Practice timer reset.** The Asha screen resets `useForegroundTimer` on focus and, on background, saves the elapsed seconds and resets so a later blur cannot count them twice.
- **End live voice control.** The end control uses the danger and night surfaces, and the minimal layout no longer parks it on the orb's corner.
- **Review can scroll, and a double tap does not grade twice.** The review screen is a `ScrollView`. `grade()` ignores a second tap on the same phrase.
- **Scene completion does not double-count.** `next()` returns when the current beat was already advanced.
- **Android status-bar insets.** Today, Phrases, Progress, and onboarding add Android top or bottom insets. Today computes `contentTopPadding` from the safe area on Android.
- **Word-definition retry.** A second word does not stay stuck on the first request's loading flag; the sheet only skips when the in-flight request is for the same word.
- **Recording survives a brief `inactive` app state.** `voice-turn-button.tsx` discards an in-progress recording on `background`, not on iOS `inactive`.
- **Response language follows the profile.** The Asha screen reads `learnerProfile.responseLanguage` on each render.
- **Chat rows are text, not edit fields.** `chat-message-row.tsx` sets `accessibilityRole="text"`.
- **Missing route.** `src/app/+not-found.tsx` exists.
