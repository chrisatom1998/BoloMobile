import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { romanizeDevanagari } from '../src/lib/devanagari-romanization';

const mockContextualDefinition = jest.fn();

jest.mock('@/services/bolo-api', () => ({
  getContextualWordDefinition: (...args: unknown[]) => mockContextualDefinition(...args),
}));

import { WordDefinitionSheet } from '../src/components/word-definition-sheet';

describe('WordDefinitionSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Romanized Hindi only when Asha responds in English while retaining Devanagari requests', async () => {
    mockContextualDefinition
      .mockRejectedValueOnce(new Error('Bolo is unavailable right now.'))
      .mockResolvedValueOnce('Here, it means one: a polite request for a single tea.');
    const sourcePhrase = 'एक चाय दीजिए।';
    const romanizedPhrase = romanizeDevanagari(sourcePhrase);
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase={`You can say ${sourcePhrase} (Ek chai dijiye.)`} responseLanguage="en" visible />,
    );

    expect(view.getByText(romanizedPhrase)).toBeTruthy();
    expect(view.queryByText(sourcePhrase)).toBeNull();
    expect(view.queryByRole('button', { name: 'You' })).toBeNull();
    for (const word of ['एक', 'चाय', 'दीजिए']) {
      expect(view.getByRole('button', { name: `Explain ${romanizeDevanagari(word)}` })).toBeTruthy();
      expect(view.queryByRole('button', { name: `Explain ${word}` })).toBeNull();
    }
    const token = view.getByRole('button', { name: `Explain ${romanizeDevanagari('एक')}` });
    expect(StyleSheet.flatten(token.props.style).minHeight).toBeGreaterThanOrEqual(44);

    await fireEvent.press(token);

    await waitFor(() => expect(view.getByText('Bolo is unavailable right now.')).toBeTruthy());
    expect(view.getByText(`In this phrase, ${romanizeDevanagari('एक')}`)).toBeTruthy();
    expect(view.queryByText('In this phrase, एक')).toBeNull();
    expect(view.getByRole('button', { name: `Retry explanation for ${romanizeDevanagari('एक')}` })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Retry explanation for एक' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: `Retry explanation for ${romanizeDevanagari('एक')}` }));

    await waitFor(() => expect(view.getByText('Here, it means one: a polite request for a single tea.')).toBeTruthy());
    expect(mockContextualDefinition).toHaveBeenLastCalledWith({
      clientId: 'client-12345678',
      phrase: sourcePhrase,
      word: 'एक',
    }, expect.any(AbortSignal));
  });

  it('uses Devanagari only when Asha responds in Hindi, including retry labels', async () => {
    mockContextualDefinition
      .mockRejectedValueOnce(new Error('Bolo is unavailable right now.'))
      .mockResolvedValueOnce('Tea is the object being requested.');
    const sourcePhrase = 'एक चाय दीजिए।';
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase={sourcePhrase} responseLanguage="hi" visible />,
    );

    expect(view.getByText(sourcePhrase)).toBeTruthy();
    expect(view.queryByText(romanizeDevanagari(sourcePhrase))).toBeNull();
    for (const word of ['एक', 'चाय', 'दीजिए']) {
      expect(view.getByRole('button', { name: `Explain ${word}` })).toBeTruthy();
      expect(view.queryByRole('button', { name: `Explain ${romanizeDevanagari(word)}` })).toBeNull();
    }
    await fireEvent.press(view.getByRole('button', { name: 'Explain चाय' }));
    await waitFor(() => expect(view.getByText('Bolo is unavailable right now.')).toBeTruthy());
    expect(view.getByText('In this phrase, चाय')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Retry explanation for चाय' }));

    await waitFor(() => expect(view.getByText('Tea is the object being requested.')).toBeTruthy());
    expect(mockContextualDefinition).toHaveBeenLastCalledWith({
      clientId: 'client-12345678',
      phrase: sourcePhrase,
      word: 'चाय',
    }, expect.any(AbortSignal));
  });

  it('requests an initial word once when the lookup fails and only retries on demand', async () => {
    mockContextualDefinition
      .mockRejectedValueOnce(new Error('Bolo is unavailable right now.'))
      .mockResolvedValueOnce('Here, it means one.');
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" initialWord="एक" onClose={jest.fn()} phrase="एक चाय दीजिए।" responseLanguage="hi" visible />,
    );

    await waitFor(() => expect(view.getByText('Bolo is unavailable right now.')).toBeTruthy());
    expect(mockContextualDefinition).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByRole('button', { name: 'Retry explanation for एक' }));

    await waitFor(() => expect(view.getByText('Here, it means one.')).toBeTruthy());
    expect(mockContextualDefinition).toHaveBeenCalledTimes(2);
  });
});
