import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { dueSavedPhrases } from '@/lib/learning';
import { useAppState } from '@/state/app-state';
import { useTheme } from '@/theme';

/**
 * The learning loop is deliberately kept to four stable destinations. Keeping
 * the triggers static matters: native tabs remount if their route list changes.
 */
export default function PrimaryTabsLayout() {
  const { phraseReviews, phrases } = useAppState();
  const { colors } = useTheme();
  // The badge points at the Phrases tab, which only lists saved phrases.
  const dueCount = dueSavedPhrases(phrases, phraseReviews ?? {}, Infinity).length;

  return (
    <NativeTabs
      backgroundColor={colors.paperRaised}
      disableTransparentOnScrollEdge
      minimizeBehavior="onScrollDown"
      shadowColor={colors.lineStrong}
      tintColor={colors.brand}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md="home" sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Icon md="graphic_eq" sf={{ default: 'waveform', selected: 'waveform.circle.fill' }} />
        <NativeTabs.Trigger.Label>Asha</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="phrases">
        <NativeTabs.Trigger.Icon md="menu_book" sf={{ default: 'book.closed', selected: 'book.closed.fill' }} />
        <NativeTabs.Trigger.Label>Phrases</NativeTabs.Trigger.Label>
        {dueCount > 0 ? <NativeTabs.Trigger.Badge>{dueCount > 9 ? '9+' : String(dueCount)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Icon md="bar_chart" sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
