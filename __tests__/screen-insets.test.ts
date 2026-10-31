import { headerlessContentInset } from '../src/lib/screen-insets';
import { spacing } from '../src/theme';

describe('headerless content inset', () => {
  it('clears the Dynamic Island and the home indicator', () => {
    expect(headerlessContentInset({ top: 59, bottom: 34, left: 0, right: 0 }, spacing.xxl)).toEqual({
      paddingTop: 59 + spacing.sm,
      paddingBottom: spacing.xxl + 34,
    });
  });

  it('adds side insets only when the system reports them', () => {
    expect(headerlessContentInset({ top: 0, bottom: 21, left: 47, right: 47 }, 16)).toEqual({
      paddingTop: spacing.sm,
      paddingBottom: 16 + 21,
      paddingLeft: 47,
      paddingRight: 47,
    });
  });
});
