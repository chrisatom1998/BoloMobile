import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { romanizeDevanagari } from '../src/lib/devanagari-romanization';

const mockContextualDefinition = jest.fn();

jest.mock('@/services/bolo-api', () => ({
  getContextualWordDefinition: (...args: unknown[]) => mockContextualDefinition(...args),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

import { WordDefinitionSheet } from '../src/components/word-definition-sheet';

describe('WordDefinitionSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders only Hindi word choices and explains the selected word in English', async () => {
    mockContextualDefinition.mockResolvedValue('Here, it means one: a polite request for a single tea.');
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="You can say एक चाय दीजिए। (Ek chai dijiye.)" visible />,
    );

    expect(view.getByText('एक चाय दीजिए।')).toBeTruthy();
    expect(view.getByText(romanizeDevanagari('एक चाय दीजिए।'))).toBeTruthy();
    expect(view.queryByRole('button', { name: 'You' })).toBeNull();
    const token = view.getByRole('button', { name: 'Explain एक' });
    expect(StyleSheet.flatten(token.props.style).minHeight).toBeGreaterThanOrEqual(44);

    await fireEvent.press(token);

    await waitFor(() => expect(view.getByText('Here, it means one: a polite request for a single tea.')).toBeTruthy());
    expect(mockContextualDefinition).toHaveBeenCalledWith({
      clientId: 'client-12345678',
      phrase: 'एक चाय दीजिए।',
      word: 'एक',
    }, expect.any(AbortSignal));
  });

  it('offers a retry after a failed contextual definition request', async () => {
    mockContextualDefinition
      .mockRejectedValueOnce(new Error('Bolo is unavailable right now.'))
      .mockResolvedValueOnce('Tea is the object being requested.');
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="एक चाय दीजिए।" visible />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Explain चाय' }));
    await waitFor(() => expect(view.getByText('Bolo is unavailable right now.')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Retry explanation for चाय' }));

    await waitFor(() => expect(view.getByText('Tea is the object being requested.')).toBeTruthy());
  });

  it('requests an initial word once when the lookup fails and only retries on demand', async () => {
    mockContextualDefinition
      .mockRejectedValueOnce(new Error('Bolo is unavailable right now.'))
      .mockResolvedValueOnce('Here, it means one.');
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" initialWord="एक" onClose={jest.fn()} phrase="एक चाय दीजिए।" visible />,
    );

    await waitFor(() => expect(view.getByText('Bolo is unavailable right now.')).toBeTruthy());
    expect(mockContextualDefinition).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByRole('button', { name: 'Retry explanation for एक' }));

    await waitFor(() => expect(view.getByText('Here, it means one.')).toBeTruthy());
    expect(mockContextualDefinition).toHaveBeenCalledTimes(2);
  });

  it('can retry a word whose earlier request was aborted by another selection', async () => {
    let resolveFirst!: (value: string) => void;
    mockContextualDefinition
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce('Here, it means tea.')
      .mockResolvedValueOnce('Here, it means one.');
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="एक चाय दीजिए।" visible />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Explain एक' }));
    await fireEvent.press(view.getByRole('button', { name: 'Explain चाय' }));
    await waitFor(() => expect(view.getByText('Here, it means tea.')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Explain एक' }));
    await waitFor(() => expect(view.getByText('Here, it means one.')).toBeTruthy());
    resolveFirst('stale result');
    expect(mockContextualDefinition).toHaveBeenCalledTimes(3);
  });

  it('honors a Latin-only learner script preference without changing lookup source text', async () => {
    mockContextualDefinition.mockResolvedValue('Here, it means tea.');
    const view = await render(
      <WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="एक चाय दीजिए।" scriptPreference="latin" visible />,
    );

    expect(view.queryByText('एक चाय दीजिए।')).toBeNull();
    expect(view.getByText(romanizeDevanagari('एक चाय दीजिए।'))).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: `Explain ${romanizeDevanagari('चाय')}` }));
    await waitFor(() => expect(mockContextualDefinition).toHaveBeenCalledWith({
      clientId: 'client-12345678',
      phrase: 'एक चाय दीजिए।',
      word: 'चाय',
    }, expect.any(AbortSignal)));
  });
});
