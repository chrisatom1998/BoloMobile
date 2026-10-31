import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';

import { PhraseCard } from '../src/components/phrase-card';
import { hindiFont, lightColors } from '../src/theme';

jest.mock('lucide-react-native', () => ({
  Volume2: () => null,
}));

const phrase = { devanagari: 'आप कैसे हैं?', romanized: 'Aap kaise hain?', english: 'How are you?' };
const DEVANAGARI = /[ऀ-ॿ]/u;

type Rendered = Awaited<ReturnType<typeof render>>;

function renderedText(view: Rendered) {
  return view.toJSON() ? JSON.stringify(view.toJSON()) : '';
}

/** Text nodes in tree (reading) order, by testID. */
function textOrder(view: Rendered) {
  return view.getAllByTestId(/^(phrase-card-(devanagari|romanized|english|concealed)|mastery-dots)$/u).map((node) => node.props.testID);
}

async function withFontScale<T>(fontScale: number, run: () => Promise<T>) {
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  await act(async () => Dimensions.set({ screen: { ...screen, fontScale }, window: { ...window, fontScale } }));
  try {
    return await run();
  } finally {
    await act(async () => Dimensions.set({ screen, window }));
  }
}

describe('PhraseCard', () => {
  it('shows Devanagari, one romanization and English in order for "both"', async () => {
    const view = await render(<PhraseCard {...phrase} scriptPreference="both" />);
    const devanagari = view.getByTestId('phrase-card-devanagari');
    expect(devanagari).toHaveTextContent('आप कैसे हैं?');
    expect(devanagari.props.accessibilityLanguage).toBe('hi-IN');
    expect(StyleSheet.flatten(devanagari.props.style)).toMatchObject({ fontFamily: hindiFont, fontSize: 22, lineHeight: 32, fontWeight: '400', color: lightColors.ink });
    expect(view.getByTestId('phrase-card-romanized')).toHaveTextContent('Aap kaise hain?');
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-romanized').props.style)).toMatchObject({ color: lightColors.brandText });
    expect(view.getByTestId('phrase-card-english')).toHaveTextContent('How are you?');
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-english').props.style)).toMatchObject({ color: lightColors.muted });

    expect(textOrder(view)).toEqual(['phrase-card-devanagari', 'phrase-card-romanized', 'phrase-card-english']);
    expect(view.getAllByText(/Aap kaise hain/u)).toHaveLength(1);
  });

  it('keeps each language in its own accessible node and gives the card no role', async () => {
    const view = await render(<PhraseCard {...phrase} scriptPreference="both" />);
    const card = view.getByTestId('phrase-card');
    expect(card.props.accessibilityRole).toBeUndefined();
    expect(card.props.accessibilityLabel).toBeUndefined();
    expect(card.props.accessible).toBeFalsy();
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ borderLeftWidth: 4, borderLeftColor: lightColors.gold, backgroundColor: lightColors.background });
    expect(StyleSheet.flatten(card.props.style).height).toBeUndefined();
    expect(view.queryByRole('button')).toBeNull();
  });

  it('hides the romanization for "devanagari"', async () => {
    const view = await render(<PhraseCard {...phrase} scriptPreference="devanagari" />);
    expect(view.getByTestId('phrase-card-devanagari')).toHaveTextContent('आप कैसे हैं?');
    expect(view.queryByTestId('phrase-card-romanized')).toBeNull();
    expect(view.getByTestId('phrase-card-english')).toHaveTextContent('How are you?');
  });

  it('renders no Devanagari anywhere for "latin" and leads with the romanization', async () => {
    const view = await render(<PhraseCard {...phrase} onListen={jest.fn()} scriptPreference="latin" />);
    expect(view.queryByTestId('phrase-card-devanagari')).toBeNull();
    expect(renderedText(view)).not.toMatch(DEVANAGARI);
    expect(view.getByRole('button').props.accessibilityLabel).not.toMatch(DEVANAGARI);
    expect(textOrder(view)).toEqual(['phrase-card-romanized', 'phrase-card-english']);
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-romanized').props.style)).toMatchObject({ fontSize: 20 });
  });

  it('renders no Devanagari for "latin" even when the romanized field is mixed-script', async () => {
    const view = await render(<PhraseCard devanagari="चाय कम" english="Less chai" onListen={jest.fn()} romanized="chai कम" scriptPreference="latin" />);
    expect(view.queryByTestId('phrase-card-devanagari')).toBeNull();
    expect(view.getByTestId('phrase-card-romanized')).toHaveTextContent('Chai kam');
    expect(renderedText(view)).not.toMatch(DEVANAGARI);
    expect(view.getByRole('button').props.accessibilityLabel).not.toMatch(DEVANAGARI);
  });

  it('never invents a Devanagari line from a romanized-only mixed-script value', async () => {
    for (const scriptPreference of ['both', 'devanagari', 'latin'] as const) {
      const view = await render(<PhraseCard english="Less chai" onListen={jest.fn()} romanized="chai कम" scriptPreference={scriptPreference} />);
      expect(view.queryByTestId('phrase-card-devanagari')).toBeNull();
      expect(view.getByTestId('phrase-card-romanized')).toHaveTextContent('Chai kam');
      expect(renderedText(view)).not.toMatch(DEVANAGARI);
      expect(view.getByRole('button').props.accessibilityLabel).toBe('Listen to Less chai');
      await view.unmount();
    }
  });

  it('renders no Devanagari for "latin" with loanword vowels such as ऑटो', async () => {
    const view = await render(<PhraseCard devanagari="ऑटो वाले से पूछो।" english="Ask the auto driver." onListen={jest.fn()} scriptPreference="latin" />);
    expect(view.queryByTestId('phrase-card-devanagari')).toBeNull();
    expect(view.getByTestId('phrase-card-romanized')).toHaveTextContent('Oto vaale se poochho.');
    expect(renderedText(view)).not.toMatch(DEVANAGARI);
    expect(view.getByRole('button').props.accessibilityLabel).not.toMatch(DEVANAGARI);
  });

  it('derives the romanization from Devanagari when none is supplied', async () => {
    const view = await render(<PhraseCard devanagari="कृपया पानी दीजिए।" english="Please give me water." scriptPreference="both" />);
    expect(view.getByTestId('phrase-card-romanized')).toHaveTextContent(/^Kripya paani /u);
  });

  it('never invents Devanagari for a romanized-only phrase', async () => {
    const view = await render(<PhraseCard english="I want chai" romanized="Chai chahiye" scriptPreference="both" />);
    expect(view.queryByTestId('phrase-card-devanagari')).toBeNull();
    expect(view.getByTestId('phrase-card-romanized')).toHaveTextContent('Chai chahiye');
    expect(renderedText(view)).not.toMatch(DEVANAGARI);
  });

  it('omits the English line when the meaning is empty', async () => {
    const view = await render(<PhraseCard devanagari="नमस्ते" english="" scriptPreference="both" />);
    expect(view.queryByTestId('phrase-card-english')).toBeNull();
    expect(view.getByTestId('phrase-card-romanized')).toHaveTextContent('Namaste');
  });

  it('conceals the Hindi lines behind a neutral placeholder but keeps the English prompt and Listen', async () => {
    const onListen = jest.fn();
    const view = await render(<PhraseCard {...phrase} concealed onListen={onListen} scriptPreference="both" />);
    expect(view.getByTestId('phrase-card-concealed')).toHaveTextContent('Answer hidden');
    expect(view.queryByTestId('phrase-card-devanagari')).toBeNull();
    expect(view.queryByTestId('phrase-card-romanized')).toBeNull();
    expect(renderedText(view)).not.toMatch(DEVANAGARI);
    expect(renderedText(view)).not.toContain('Aap kaise hain');
    expect(view.getByTestId('phrase-card-english')).toHaveTextContent('How are you?');
    expect(view.getByRole('button').props.accessibilityLabel).toBe('Listen to How are you?');
  });

  it('does not read a concealed answer out through the Listen label', async () => {
    const view = await render(<PhraseCard concealed devanagari="आप कैसे हैं?" onListen={jest.fn()} scriptPreference="both" />);
    expect(view.getByRole('button').props.accessibilityLabel).toBe('Listen to this phrase');
    expect(view.getByText('Answer hidden')).toBeTruthy();
  });

  it('renders a 44pt Listen button that calls onListen and shows a busy state while playing', async () => {
    const onListen = jest.fn();
    const view = await render(<PhraseCard {...phrase} onListen={onListen} scriptPreference="both" />);
    const button = view.getByRole('button', { name: 'Listen to How are you?' });
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ minWidth: 44, minHeight: 44 });
    expect(button.props.accessibilityState).toMatchObject({ busy: false, disabled: false });
    expect(view.queryByTestId('phrase-card-listen-busy')).toBeNull();
    await fireEvent.press(button);
    expect(onListen).toHaveBeenCalledTimes(1);

    await view.rerender(<PhraseCard {...phrase} onListen={onListen} playing scriptPreference="both" />);
    expect(view.getByRole('button').props.accessibilityState).toMatchObject({ busy: true });
    expect(view.getByTestId('phrase-card-listen-busy')).toBeTruthy();
  });

  it('respects a custom Listen label, hint and disabled state', async () => {
    const onListen = jest.fn();
    const view = await render(<PhraseCard {...phrase} listenDisabled listenHint="Agree to connected AI processing to enable Listen." listenLabel="Hear this reply" onListen={onListen} scriptPreference="both" />);
    const button = view.getByRole('button', { name: 'Hear this reply' });
    expect(button.props.accessibilityHint).toBe('Agree to connected AI processing to enable Listen.');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);
    expect(onListen).not.toHaveBeenCalled();
  });

  it('uses the romanization in the Listen label when there is no English', async () => {
    const view = await render(<PhraseCard devanagari="नमस्ते" onListen={jest.fn()} scriptPreference="both" />);
    expect(view.getByRole('button').props.accessibilityLabel).toBe('Listen to Namaste');
  });

  it('switches to the night surface with gold romanization', async () => {
    const view = await render(<PhraseCard {...phrase} onListen={jest.fn()} scriptPreference="both" variant="night" />);
    expect(StyleSheet.flatten(view.getByTestId('phrase-card').props.style)).toMatchObject({ backgroundColor: lightColors.nightSurface, borderLeftColor: lightColors.gold });
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-devanagari').props.style)).toMatchObject({ color: lightColors.white });
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-romanized').props.style)).toMatchObject({ color: lightColors.gold });
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-english').props.style)).toMatchObject({ color: lightColors.heroSubtle });
  });

  it('tightens type for the compact size while keeping Tiro at regular weight', async () => {
    const view = await render(<PhraseCard {...phrase} scriptPreference="both" size="compact" />);
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-devanagari').props.style)).toMatchObject({ fontFamily: hindiFont, fontSize: 18, lineHeight: 26, fontWeight: '400' });
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-romanized').props.style)).toMatchObject({ fontSize: 14 });
    expect(StyleSheet.flatten(view.getByTestId('phrase-card-english').props.style)).toMatchObject({ fontSize: 13 });
  });

  it('renders the accessory slot under the text lines', async () => {
    const view = await render(
      <PhraseCard {...phrase} scriptPreference="both">
        <Text testID="mastery-dots">3 / 5</Text>
      </PhraseCard>,
    );
    expect(textOrder(view)).toEqual(['phrase-card-devanagari', 'phrase-card-romanized', 'phrase-card-english', 'mastery-dots']);
  });

  it('keeps Listen beside the text at default type and stacks it below at accessibility sizes', async () => {
    await withFontScale(1, async () => {
      const view = await render(<PhraseCard {...phrase} onListen={jest.fn()} scriptPreference="both" />);
      expect(StyleSheet.flatten(view.getByTestId('phrase-card-body').props.style)).toMatchObject({ flexDirection: 'row' });
      expect(view.queryByText('Listen')).toBeNull();
      await view.unmount();
    });
    await withFontScale(2, async () => {
      const view = await render(<PhraseCard {...phrase} onListen={jest.fn()} scriptPreference="both" />);
      expect(StyleSheet.flatten(view.getByTestId('phrase-card-body').props.style)).toMatchObject({ flexDirection: 'column', alignItems: 'stretch' });
      expect(StyleSheet.flatten(view.getByTestId('phrase-card-listen').props.style)).toMatchObject({ alignSelf: 'flex-start', minHeight: 44 });
      expect(view.getByText('Listen')).toBeTruthy();
      expect(view.getByRole('button').props.accessibilityLabel).toBe('Listen to How are you?');
    });
  });
});
