import { spacing } from '@/theme';

type Insets = { top: number; bottom: number; left: number; right: number };

/**
 * Padding for a screen with no navigation header, so the first line clears
 * the notch or Dynamic Island and the last line clears the home indicator.
 * Side insets are added only when the system reports them. The 20pt gutter
 * stays on each screen until the spacing-token pass.
 */
export function headerlessContentInset(insets: Insets, bottomPadding: number) {
  return {
    paddingTop: insets.top + spacing.sm,
    paddingBottom: bottomPadding + insets.bottom,
    ...(insets.left > 0 ? { paddingLeft: insets.left } : {}),
    ...(insets.right > 0 ? { paddingRight: insets.right } : {}),
  };
}
