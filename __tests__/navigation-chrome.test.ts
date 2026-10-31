import { portraitLock, readingSheetOptions, reviewSheetOptions, rootStackScreenOptions } from '../src/lib/navigation-chrome';

describe('navigation chrome', () => {
  it('locks every screen upright and keeps the iOS back swipe on card screens', () => {
    const options = rootStackScreenOptions('#F6F3ED', '#172523');
    expect(options.orientation).toBe(portraitLock);
    expect(options.orientation).toBe('portrait_up');
    expect(options.fullScreenGestureEnabled).toBe(true);
    expect(options.gestureEnabled).toBe(true);
    expect(options.contentStyle).toEqual({ backgroundColor: '#F6F3ED' });
  });

  it('presents review as a full form sheet with a grabber', () => {
    expect(reviewSheetOptions).toMatchObject({
      gestureEnabled: true,
      presentation: 'formSheet',
      sheetAllowedDetents: [1],
      sheetGrabberVisible: true,
    });
  });

  it('presents reading screens as a sheet that can rest or expand', () => {
    expect(readingSheetOptions.presentation).toBe('formSheet');
    expect(readingSheetOptions.sheetGrabberVisible).toBe(true);
    expect(readingSheetOptions.sheetAllowedDetents).toEqual([0.72, 1]);
    expect(readingSheetOptions.gestureEnabled).toBe(true);
  });
});
