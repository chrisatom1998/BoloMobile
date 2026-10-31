import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createLiveStyles } from '../src/app/(tabs)/live';
import { ChatMessageRow, phrasePlaybackKey } from '../src/components/chat-message-row';
import type { ChatMessage, ScriptPreference } from '../src/state/app-state-types';
import { hindiFont, lightColors } from '../src/theme';

jest.mock('lucide-react-native', () => ({
  AlertCircle: () => null,
  BookmarkPlus: () => null,
  Ellipsis: () => null,
  Flag: () => null,
  Lock: () => null,
  MessageCircle: () => null,
  Mic: () => null,
  MicOff: () => null,
  Sprout: () => null,
  Trash2: () => null,
  Volume2: () => null,
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn(), useRouter: () => ({ push: jest.fn() }) }));
// The row borrows the live screen's style factory; the screen's own dependencies are not under test here.
jest.mock('@/state/app-state', () => ({ useAppState: jest.fn() }));
jest.mock('@/state/asha-voice-session', () => ({ isFloatingAshaMinimized: () => false, useAshaVoiceSession: jest.fn() }));
jest.mock('@/components/realtime-voice-button', () => ({ RealtimeVoiceButton: () => null }));
jest.mock('@/hooks/use-asha-live-session', () => ({ useAshaLiveSession: jest.fn() }));
jest.mock('@/lib/speech', () => ({ preloadSpeech: jest.fn(), speakText: jest.fn(), stopSpeaking: jest.fn() }));
jest.mock('@/services/bolo-api', () => ({ reportGeneratedMessage: jest.fn(), sendMobileChat: jest.fn(), prepareSavedPhraseFromText: jest.fn(), getContextualWordDefinition: jest.fn() }));

const styles = createLiveStyles(lightColors);
const DEVANAGARI = /[ऀ-ॿ]/u;

const legacyMessage: ChatMessage = { id: 'asha-1', role: 'asha', language: 'en', text: 'You can say: चाय में चीनी कम डालिए (chaay mein cheeni kam daaliye).' };
const structuredMessage: ChatMessage = {
  id: 'asha-2',
  role: 'asha',
  language: 'en',
  text: 'Less sugar in your tea? Ask the waiter politely:\nचाय में चीनी कम डालिए। (chaay mein cheeni kam daaliye.) — Please put less sugar in the tea.',
  structured: {
    version: 1,
    intro: 'Less sugar in your tea? Ask the waiter politely:',
    phrases: [{ devanagari: 'चाय में चीनी कम डालिए।', romanized: 'chaay mein cheeni kam daaliye.', english: 'Please put less sugar in the tea.' }],
    corrections: [{ youSaid: { devanagari: 'डालो', romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye', english: 'please put' }, note: 'daalo is for friends. With a waiter, use the polite ending.' }],
    outro: 'Want to try ordering?',
  },
};

function handlers() {
  return {
    onOpenPhrasePicker: jest.fn(),
    onOpenWordDefinition: jest.fn(),
    onPlayPhrase: jest.fn(),
    onPlayReply: jest.fn(),
    onReport: jest.fn(),
    onSelectedText: jest.fn(),
    onSelectionCollapsed: jest.fn(),
  };
}

async function renderRow(message: ChatMessage, scriptPreference: ScriptPreference, overrides: Partial<Parameters<typeof ChatMessageRow>[0]> = {}) {
  const callbacks = handlers();
  const view = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    <ChatMessageRow
      aiConsent
      continuesNext={false}
      continuesPrevious={false}
      isPending={false}
      isWelcome={false}
      message={message}
      playbackLocked={false}
      reported={false}
      reporting={false}
      scriptPreference={scriptPreference}
      styles={styles}
      {...callbacks}
      {...overrides}
    />
    </SafeAreaProvider>,
  );
  return { ...callbacks, view };
}

/** The chat line is a read-only TextInput: flat `value` on web, nested spans elsewhere. */
function lineText(node: { props: { children?: unknown; value?: string } }): string {
  if (typeof node.props.value === 'string') return node.props.value;
  const flatten = (child: unknown): string => {
    if (child === null || child === undefined || typeof child === 'boolean') return '';
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (Array.isArray(child)) return child.map(flatten).join('');
    const element = child as { props?: { children?: unknown } };
    return flatten(element.props?.children);
  };
  return flatten(node.props.children);
}

function rendered(view: Awaited<ReturnType<typeof render>>) {
  return JSON.stringify(view.toJSON());
}

describe('ChatMessageRow legacy messages', () => {
  it('shows Devanagari in Tiro with exactly one romanization for "both"', async () => {
    const { view } = await renderRow(legacyMessage, 'both');
    const line = view.getByLabelText('Asha: You can say: chaay mein cheeni kam daaliye.');
    expect(line.props.readOnly).toBe(true);
    expect(lineText(line)).toBe('You can say: चाय में चीनी कम डालिए (chaay mein cheeni kam daaliye).');
    expect(lineText(line).match(/daal/gu)).toHaveLength(1);
    expect(lineText(line)).not.toContain('daalie');
    const hindi = view.getByText('चाय में चीनी कम डालिए');
    expect(hindi.props.accessibilityLanguage).toBe('hi-IN');
    expect(StyleSheet.flatten(hindi.props.style)).toMatchObject({ fontFamily: hindiFont, fontWeight: '400', fontSize: 16, lineHeight: 23 });
    expect(line.props.accessibilityHint).toBe('Read-only message. Highlight words, then use Save phrase below.');
  });

  it('shows one romanization and no Devanagari for "latin"', async () => {
    const { view } = await renderRow(legacyMessage, 'latin');
    const line = view.getByLabelText('Asha: You can say: chaay mein cheeni kam daaliye.');
    expect(lineText(line)).toBe('You can say: chaay mein cheeni kam daaliye.');
    expect(rendered(view)).not.toMatch(DEVANAGARI);
  });

  it('shows Devanagari without the parenthetical for "devanagari"', async () => {
    const { view } = await renderRow(legacyMessage, 'devanagari');
    expect(lineText(view.getByLabelText(/^Asha: /u))).toBe('You can say: चाय में चीनी कम डालिए.');
    expect(view.getByText('चाय में चीनी कम डालिए').props.accessibilityLanguage).toBe('hi-IN');
  });

  it('keeps an unknown Romanized learner phrase and English punctuation intact', async () => {
    const you: ChatMessage = { id: 'you-roman', role: 'you', text: 'Kripayaa paanee dijiye.' };
    const prose: ChatMessage = { id: 'asha-prose', role: 'asha', language: 'en', text: 'Less sugar, please — really!' };
    const romanized = await renderRow(you, 'devanagari');
    expect(lineText(romanized.view.getByLabelText('You: Kripayaa paanee dijiye.'))).toBe('Kripayaa paanee dijiye.');
    const english = await renderRow(prose, 'both');
    expect(lineText(english.view.getByLabelText('Asha: Less sugar, please — really!'))).toBe('Less sugar, please — really!');
  });

  it('derives a romanization once, covering ऑ, and keeps the learner bubble in step', async () => {
    const you: ChatMessage = { id: 'you-1', role: 'you', text: 'मुझे ऑटो चाहिए' };
    const both = await renderRow(you, 'both');
    expect(lineText(both.view.getByLabelText('You: Mujhe oto chaahie'))).toBe('मुझे ऑटो चाहिए (Mujhe oto chaahie)');
    const latin = await renderRow(you, 'latin');
    expect(lineText(latin.view.getByLabelText('You: Mujhe oto chaahie'))).toBe('Mujhe oto chaahie');
    expect(rendered(latin.view)).not.toMatch(DEVANAGARI);
  });

  it('maps a highlighted romanization back to the Devanagari source and keeps Save phrase on the selection path', async () => {
    const { onOpenPhrasePicker, onSelectedText, view } = await renderRow(legacyMessage, 'both');
    const line = view.getByLabelText(/^Asha: /u);
    const text = lineText(line);
    const start = text.indexOf('cheeni kam');
    await fireEvent(line, 'selectionChange', { nativeEvent: { selection: { start, end: start + 'cheeni kam'.length } } });
    expect(onSelectedText).toHaveBeenCalledWith('asha-1', { sourceText: 'चीनी कम', text: 'cheeni kam' });
    await fireEvent.press(view.getByLabelText('Save phrase: You can say: chaay mein cheeni kam daaliye.'));
    expect(onOpenPhrasePicker).toHaveBeenCalledWith(legacyMessage);
    expect(onOpenPhrasePicker.mock.calls[0]).toHaveLength(1);
  });

  it('moves Words, Listen and Report into an accessible more menu', async () => {
    const { onOpenWordDefinition, onPlayReply, onReport, view } = await renderRow(legacyMessage, 'both');
    expect(view.queryByLabelText(/Read reply aloud:/u)).toBeNull();
    const more = view.getByLabelText('More actions: You can say: chaay mein cheeni kam daaliye.');
    expect(more.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(more.props.style)).toMatchObject({ minWidth: 44, minHeight: 44 });
    await fireEvent.press(more);
    const menu = view.getByTestId('chat-menu-asha-1');
    expect(within(menu).getByRole('header')).toHaveTextContent('Asha’s reply: You can say: chaay mein cheeni kam daaliye.');
    for (const label of ['Explore Hindi words:', 'Read reply aloud:', 'Report reply:']) {
      const item = view.getByLabelText(new RegExp(`^${label}`, 'u'));
      expect(item.props.accessibilityRole).toBe('button');
      expect(StyleSheet.flatten(item.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    await fireEvent.press(view.getByLabelText(/^Read reply aloud:/u));
    expect(onPlayReply).toHaveBeenCalledWith(legacyMessage);
    expect(view.queryByTestId('chat-menu-asha-1')).toBeNull();

    await fireEvent.press(more);
    await fireEvent.press(view.getByLabelText(/^Explore Hindi words:/u));
    expect(onOpenWordDefinition).toHaveBeenCalledWith('चाय में चीनी कम डालिए');

    await fireEvent.press(more);
    await fireEvent.press(view.getByLabelText(/^Report reply:/u));
    expect(onReport).toHaveBeenCalledWith(legacyMessage);

    await fireEvent.press(more);
    await fireEvent.press(view.getByLabelText('Close menu'));
    expect(view.queryByTestId('chat-menu-asha-1')).toBeNull();
  });

  it('reflects report state in the action row and disables the menu item', async () => {
    const { view } = await renderRow(legacyMessage, 'both', { reporting: true });
    expect(view.getByText('Reporting…')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/^More actions:/u));
    expect(view.getByLabelText(/^Report reply:/u).props.accessibilityState).toEqual({ disabled: true });
    const reported = await renderRow(legacyMessage, 'both', { reported: true });
    expect(reported.view.getByText('Reported')).toBeTruthy();
  });

  it('offers only Save phrase and Words on a learner message with Hindi, and no menu without Hindi', async () => {
    const hindiYou = await renderRow({ id: 'you-2', role: 'you', text: 'नमस्ते' }, 'both');
    await fireEvent.press(hindiYou.view.getByLabelText(/^More actions:/u));
    expect(hindiYou.view.getByLabelText(/^Explore Hindi words:/u)).toBeTruthy();
    expect(hindiYou.view.queryByLabelText(/^Read reply aloud:/u)).toBeNull();
    expect(hindiYou.view.queryByLabelText(/^Report reply:/u)).toBeNull();
    const plainYou = await renderRow({ id: 'you-3', role: 'you', text: 'Hello Asha' }, 'both');
    expect(plainYou.view.getByLabelText('Save phrase: Hello Asha')).toBeTruthy();
    expect(plainYou.view.queryByLabelText(/^More actions:/u)).toBeNull();
  });

  it('hides every action on the welcome and pending rows', async () => {
    const welcome = await renderRow({ id: 'welcome', role: 'asha', text: 'Hi! Tell me what you would like to practice.' }, 'both', { isWelcome: true });
    expect(welcome.view.queryByRole('button')).toBeNull();
    expect(welcome.view.getByLabelText(/^Asha: /u).props.accessibilityHint).toBe('Read-only message.');
    const pending = await renderRow({ id: 'you-4', role: 'you', text: 'Sending this' }, 'both', { isPending: true });
    expect(pending.view.queryByRole('button')).toBeNull();
    expect(pending.view.getByText('Sending…')).toBeTruthy();
  });
});

describe('ChatMessageRow structured replies', () => {
  it('renders English prose, a phrase card and a You said / Say correction for "both"', async () => {
    const { view } = await renderRow(structuredMessage, 'both');
    expect(lineText(view.getByLabelText('Asha: Less sugar in your tea? Ask the waiter politely:'))).toBe('Less sugar in your tea? Ask the waiter politely:');
    const card = view.getByTestId('chat-phrase-asha-2-0');
    expect(within(card).getByTestId('chat-phrase-asha-2-0-devanagari')).toHaveTextContent('चाय में चीनी कम डालिए।');
    expect(within(card).getByTestId('chat-phrase-asha-2-0-devanagari').props.accessibilityLanguage).toBe('hi-IN');
    expect(within(card).getByTestId('chat-phrase-asha-2-0-romanized')).toHaveTextContent('chaay mein cheeni kam daaliye.');
    expect(within(card).getByTestId('chat-phrase-asha-2-0-english')).toHaveTextContent('Please put less sugar in the tea.');
    expect(view.getAllByText(/chaay mein cheeni kam daaliye/u)).toHaveLength(1);

    const youSaid = view.getByTestId('chat-correction-asha-2-0-you-said');
    expect(within(youSaid).getByText('You said')).toBeTruthy();
    const struck = within(youSaid).getByText('डालो');
    expect(struck.props.accessibilityLanguage).toBe('hi-IN');
    expect(StyleSheet.flatten(struck.props.style)).toMatchObject({ textDecorationLine: 'line-through', fontFamily: hindiFont, fontWeight: '400' });
    expect(StyleSheet.flatten(within(youSaid).getByText('daalo').props.style)).toMatchObject({ textDecorationLine: 'line-through' });
    const say = view.getByTestId('chat-correction-asha-2-0-say');
    expect(StyleSheet.flatten(say.props.style)).toMatchObject({ backgroundColor: lightColors.forestSoft });
    expect(within(say).getByText('Say')).toBeTruthy();
    expect(within(say).getByText('डालिए').props.accessibilityLanguage).toBe('hi-IN');
    expect(StyleSheet.flatten(within(say).getByText('डालिए').props.style).textDecorationLine).toBeUndefined();
    expect(within(say).getByText('daaliye')).toBeTruthy();
    expect(within(say).getByText('please put')).toBeTruthy();
    expect(view.getByText('daalo is for friends. With a waiter, use the polite ending.')).toBeTruthy();
    expect(lineText(view.getByLabelText('Asha: Want to try ordering?'))).toBe('Want to try ordering?');
    // The flat reply text is never rendered twice next to the structured content.
    expect(view.queryByText(/— Please put less sugar/u)).toBeNull();
  });

  it('respects "latin" and "devanagari" across the card and the correction', async () => {
    const latin = await renderRow(structuredMessage, 'latin');
    expect(rendered(latin.view)).not.toMatch(DEVANAGARI);
    expect(latin.view.getByTestId('chat-phrase-asha-2-0-romanized')).toHaveTextContent('chaay mein cheeni kam daaliye.');
    expect(latin.view.getByText('daalo')).toBeTruthy();
    expect(latin.view.getByText('daaliye')).toBeTruthy();

    const devanagari = await renderRow(structuredMessage, 'devanagari');
    expect(devanagari.view.queryByTestId('chat-phrase-asha-2-0-romanized')).toBeNull();
    expect(devanagari.view.queryByText('daalo')).toBeNull();
    expect(devanagari.view.getByText('डालो')).toBeTruthy();
    expect(devanagari.view.getByText('डालिए')).toBeTruthy();
  });

  it('plays only that phrase from the card and the whole reply from the menu', async () => {
    const { onPlayPhrase, onPlayReply, view } = await renderRow(structuredMessage, 'both', { playingPhrase: null });
    const listen = view.getByTestId('chat-phrase-asha-2-0-listen');
    expect(listen.props.accessibilityLabel).toBe('Listen to Please put less sugar in the tea.');
    expect(StyleSheet.flatten(listen.props.style)).toMatchObject({ minWidth: 44, minHeight: 44 });
    await fireEvent.press(listen);
    expect(onPlayPhrase).toHaveBeenCalledWith(structuredMessage, structuredMessage.structured!.phrases![0]);
    expect(onPlayReply).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText(/^More actions:/u));
    await fireEvent.press(view.getByLabelText(/^Read reply aloud:/u));
    expect(onPlayReply).toHaveBeenCalledWith(structuredMessage);

    const playing = await renderRow(structuredMessage, 'both', { playingPhrase: phrasePlaybackKey('asha-2', structuredMessage.structured!.phrases![0]!) });
    expect(playing.view.getByTestId('chat-phrase-asha-2-0-listen').props.accessibilityState).toMatchObject({ busy: true });
    const locked = await renderRow(structuredMessage, 'both', { playbackLocked: true });
    expect(locked.view.getByTestId('chat-phrase-asha-2-0-listen').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(locked.view.getByLabelText(/^More actions:/u));
    const lockedListen = locked.view.getByLabelText(/^Read reply aloud:/u);
    expect(lockedListen.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(lockedListen);
    expect(locked.onPlayReply).not.toHaveBeenCalled();
    expect(locked.view.getByLabelText('Close menu')).toBeTruthy();
  });

  it('lets Save phrase choose between the taught phrase and the corrected form', async () => {
    const { onOpenPhrasePicker, view } = await renderRow(structuredMessage, 'both');
    await fireEvent.press(view.getByLabelText(/^Save phrase:/u));
    expect(onOpenPhrasePicker).not.toHaveBeenCalled();
    const menu = view.getByTestId('chat-menu-asha-2');
    expect(within(menu).getByRole('header')).toHaveTextContent('Which phrase do you want to save?');
    await fireEvent.press(view.getByLabelText('Save phrase: daaliye'));
    expect(onOpenPhrasePicker).toHaveBeenCalledWith(structuredMessage, { devanagari: 'डालिए', romanized: 'daaliye', english: 'please put' });
  });

  it('saves the highlighted words instead of offering the structured phrases', async () => {
    const hasSelectedText = jest.fn((messageId: string) => messageId === 'asha-2');
    const { onOpenPhrasePicker, view } = await renderRow(structuredMessage, 'both', { hasSelectedText });
    await fireEvent.press(view.getByLabelText(/^Save phrase:/u));
    expect(hasSelectedText).toHaveBeenCalledWith('asha-2');
    expect(onOpenPhrasePicker).toHaveBeenCalledWith(structuredMessage);
    expect(view.queryByTestId('chat-menu-asha-2')).toBeNull();

    const single: ChatMessage = { ...structuredMessage, id: 'asha-2', structured: { version: 1, intro: 'Try:', phrases: structuredMessage.structured!.phrases } };
    const highlighted = await renderRow(single, 'latin', { hasSelectedText });
    await fireEvent.press(highlighted.view.getByLabelText(/^Save phrase:/u));
    expect(highlighted.onOpenPhrasePicker).toHaveBeenCalledWith(single);
  });

  it('pre-fills the picker directly when the reply teaches one phrase', async () => {
    const single: ChatMessage = { ...structuredMessage, id: 'asha-3', structured: { version: 1, intro: 'Try:', phrases: structuredMessage.structured!.phrases } };
    const { onOpenPhrasePicker, onOpenWordDefinition, view } = await renderRow(single, 'latin');
    await fireEvent.press(view.getByLabelText(/^Save phrase:/u));
    expect(onOpenPhrasePicker).toHaveBeenCalledWith(single, structuredMessage.structured!.phrases![0]);
    await fireEvent.press(view.getByLabelText(/^More actions:/u));
    await fireEvent.press(view.getByLabelText(/^Explore Hindi words:/u));
    // Words keeps the canonical Devanagari even for a latin-only learner.
    expect(onOpenWordDefinition).toHaveBeenCalledWith('चाय में चीनी कम डालिए।');
  });
});
