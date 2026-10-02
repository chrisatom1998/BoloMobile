import { act, render, within } from '@testing-library/react-native';
import * as mockReact from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import LiveScreen from '../src/app/(tabs)/live';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(effect, [effect]),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('lucide-react-native', () => ({
  ArrowDown: () => null,
  BookmarkPlus: () => null,
  Flag: () => null,
  MessageCircle: () => null,
  Mic: () => null,
  MicOff: () => null,
  Send: () => null,
  Sparkles: () => null,
  Sprout: () => null,
  Trash2: () => null,
  Volume2: () => null,
  X: () => null,
}));
jest.mock('@/lib/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticStartRecording: jest.fn(),
  hapticTap: jest.fn(),
}));
jest.mock('@/lib/speech', () => ({
  preloadSpeech: jest.fn(async () => undefined),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));
jest.mock('@/services/bolo-api', () => ({
  getConversationRecap: jest.fn(),
  reportGeneratedMessage: jest.fn(),
  sendMobileChat: jest.fn(),
}));
jest.mock('@/hooks/use-foreground-timer', () => {
  const timer = { elapsedSeconds: () => 0, reset: jest.fn() };
  return { useForegroundTimer: () => timer };
});
jest.mock('@/hooks/use-motion-preference', () => ({
  useMotionPreference: () => ({ mode: 'reduced', reducedMotion: true }),
}));
jest.mock('@/state/app-state', () => {
  const state = {
    addPracticeSeconds: jest.fn(),
    aiConsent: true,
    beginTypedReply: (clientId: string) => clientId !== 'client-12345678' ? null : {
      controller: new AbortController(),
      release: () => {},
    },
    appendChatMessages: jest.fn(),
    replaceLiveChatSnapshot: jest.fn(),
    chatHistory: [],
    clearChatHistory: jest.fn(),
    clientId: 'client-12345678',
    learnerProfile: { responseLanguage: 'en', scriptPreference: 'both' },
    markLiveTurn: jest.fn(),
    savePhrase: jest.fn(),
    togglePhrase: jest.fn(),
    updateLearnerProfile: jest.fn(),
  };
  return { useAppState: () => state };
});
jest.mock('@/hooks/use-realtime-conversation', () => {
  const voice = {
    disconnect: jest.fn(),
    finishTurn: jest.fn(async () => undefined),
    startTurn: jest.fn(async () => undefined),
    status: 'recording',
    microphoneEnabled: true,
    isPlaying: false,
  };
  return { useRealtimeConversation: () => voice };
});

type RenderedNode = { props?: { accessibilityLabel?: string; testID?: string }; children?: (RenderedNode | string)[] };

function visibleOrder(node: RenderedNode | string | null, items: string[] = []): string[] {
  if (typeof node === 'string') items.push(node);
  else if (node) {
    if (node.props?.testID === 'realtime-voice-orb') items.push('orb');
    if (node.props?.testID === 'live-input-caption') items.push('captions');
    node.children?.forEach((child) => visibleOrder(child, items));
  }
  return items;
}

describe('live End chat layout', () => {
  it.each([
    { width: 390, height: 844, fontScale: 1 },
    { width: 320, height: 568, fontScale: 1 },
    { width: 320, height: 568, fontScale: 2.4 },
  ])('keeps badge, orb, helper, End chat, and captions in order at $width points and font scale $fontScale', async ({ width, height, fontScale }) => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    await act(async () => {
      const size = { width, height, fontScale, scale: 2 };
      Dimensions.set({ window: size, screen: size });
    });
    try {
      const view = await render(<LiveScreen />);
      const end = view.getByRole('button', { name: 'End chat' });
      const order = visibleOrder(view.toJSON() as RenderedNode);
      const expected = ['Live voice', 'orb', 'Your microphone is on', 'Speak naturally, even while Asha talks. Tap to mute.', 'End chat', 'captions'];
      expect(order.filter((item) => expected.includes(item))).toEqual(expected);
      expect(within(view.getByTestId('realtime-voice-stage')).queryByText('End chat')).toBeNull();
      expect(StyleSheet.flatten(end.props.style).maxWidth).toBe('100%');
      expect(StyleSheet.flatten(end.props.style).height).toBeUndefined();
      expect(within(end).getByText('End chat').props.numberOfLines).toBeUndefined();
      await view.unmount();
    } finally {
      await act(async () => {
        Dimensions.set({ window: originalWindow, screen: originalScreen });
      });
    }
  });
});
