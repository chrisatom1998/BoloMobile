import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { displayHindiTranscript } from '../src/lib/learner-phrase-display';

const mockContextualDefinition = jest.fn();
const mockPreparePhrase = jest.fn();

jest.mock('@/services/bolo-api', () => ({
  prepareSavedPhraseFromText: (...args: unknown[]) => mockPreparePhrase(...args),
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
    expect(view.getByText(displayHindiTranscript('एक चाय दीजिए।'))).toBeTruthy();
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
    expect(view.getByText(displayHindiTranscript('एक चाय दीजिए।'))).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Explain chai' }));
    await waitFor(() => expect(mockContextualDefinition).toHaveBeenCalledWith({
      clientId: 'client-12345678',
      phrase: 'एक चाय दीजिए।',
      word: 'चाय',
    }, expect.any(AbortSignal)));
  });
});


describe('Romanized Hindi word source', () => {
  beforeEach(() => { jest.resetAllMocks(); });

  it('resolves a source-less Hindi reply once and reuses its canonical words after reopening', async () => {
    mockPreparePhrase.mockResolvedValue({ hi: 'पानी दीजिए।', latin: 'Paani deejiye.', en: 'Please give water.' });
    mockContextualDefinition.mockResolvedValue('Water is the thing being requested.');
    const props = { clientId: 'client-12345678', onClose: jest.fn(), phrase: 'Paani deejiye.', scriptPreference: 'latin' as const };
    const view = await render(<WordDefinitionSheet {...props} visible />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Explain Paani' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Explain Paani' }));
    await waitFor(() => expect(mockContextualDefinition).toHaveBeenCalledWith({ clientId: props.clientId, phrase: 'पानी दीजिए।', word: 'पानी' }, expect.any(AbortSignal)));
    await view.rerender(<WordDefinitionSheet {...props} visible={false} />);
    await view.rerender(<WordDefinitionSheet {...props} visible />);
    expect(mockPreparePhrase).toHaveBeenCalledTimes(1);
  });

  it('does not resolve surrounding English when canonical Hindi is already retained', async () => {
    const view = await render(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="You can say पानी दीजिए। It is polite." visible />);
    expect(view.getByRole('button', { name: 'Explain पानी' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Explain You' })).toBeNull();
    expect(mockPreparePhrase).not.toHaveBeenCalled();
  });

  it('offers an explicit retry when Hindi source resolution fails', async () => {
    mockPreparePhrase.mockRejectedValueOnce(new Error('Connection lost.')).mockResolvedValueOnce({ hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' });
    const view = await render(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="Namaste" visible />);
    await waitFor(() => expect(view.getByText('Connection lost.')).toBeTruthy());
    expect(mockPreparePhrase).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole('button', { name: 'Retry preparing Hindi words' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Explain नमस्ते' })).toBeTruthy());
  });

  it('aborts a stale resolution and never replaces a newer source', async () => {
    let finish!: (value: unknown) => void;
    mockPreparePhrase.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = await render(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="Paani deejiye" visible />);
    const signal = mockPreparePhrase.mock.calls[0][1] as AbortSignal;
    await view.rerender(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="नमस्ते" visible />);
    expect(signal.aborted).toBe(true);
    await act(async () => { finish({ hi: 'पानी दीजिए', latin: 'Paani deejiye', en: 'Give water' }); });
    expect(view.getByRole('button', { name: 'Explain नमस्ते' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Explain पानी' })).toBeNull();
  });
});

it('lets a learner trim an oversized Romanized reply directly in the native word tray', async () => {
  jest.resetAllMocks();
  mockPreparePhrase.mockResolvedValue({ hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' });
  const view = await render(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase={'Namaste! '.repeat(70)} visible />);
  expect(mockPreparePhrase).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'Prepare words from excerpt' }).props.accessibilityState.disabled).toBe(true);
  expect(view.queryByRole('button', { name: 'Retry preparing Hindi words' })).toBeNull();
  await fireEvent.changeText(view.getByLabelText('Hindi excerpt for word meanings'), 'Namaste');
  await fireEvent.press(view.getByRole('button', { name: 'Prepare words from excerpt' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Explain नमस्ते' })).toBeTruthy());
  expect(mockPreparePhrase).toHaveBeenCalledWith({ clientId: 'client-12345678', text: 'Namaste' }, expect.any(AbortSignal));
});

it('preserves the learner excerpt exactly when preparing unknown Romanized Hindi', async () => {
  jest.resetAllMocks();
  mockPreparePhrase.mockResolvedValue({ hi: 'मेरा नाम X-12 है।', latin: 'Mera naaam? X-12 -- bilkul!', en: 'My name is X-12.' });
  const exact = '  Mera naaam? X-12 -- bilkul!  ';
  const view = await render(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase={'Namaste! '.repeat(70)} visible />);
  await fireEvent.changeText(view.getByLabelText('Hindi excerpt for word meanings'), exact);
  await fireEvent.press(view.getByRole('button', { name: 'Prepare words from excerpt' }));
  await waitFor(() => expect(mockPreparePhrase).toHaveBeenCalledWith({ clientId: 'client-12345678', text: exact }, expect.any(AbortSignal)));
});


it('lets a learner recover from oversized canonical Hindi without translating or losing the chosen excerpt', async () => {
  jest.resetAllMocks();
  mockContextualDefinition.mockResolvedValue('An expression of thanks.');
  const phrase = `${'नमस्ते! '.repeat(900)}धन्यवाद।`;
  const view = await render(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase={phrase} visible />);
  expect(view.getByText(/6000 characters or fewer/u)).toBeTruthy();
  expect(view.getByLabelText('Hindi excerpt for word meanings').props.value).toBe(phrase);
  expect(view.getByRole('button', { name: 'Prepare words from excerpt' }).props.accessibilityState.disabled).toBe(true);
  expect(view.queryByRole('button', { name: 'Retry preparing Hindi words' })).toBeNull();
  expect(mockPreparePhrase).not.toHaveBeenCalled();
  expect(mockContextualDefinition).not.toHaveBeenCalled();
  const selected = 'नमस्ते! मैं ठीक हूँ। धन्यवाद।';
  await fireEvent.changeText(view.getByLabelText('Hindi excerpt for word meanings'), selected);
  await fireEvent.press(view.getByRole('button', { name: 'Prepare words from excerpt' }));
  await fireEvent.press(view.getByRole('button', { name: 'Explain धन्यवाद' }));
  await waitFor(() => expect(mockContextualDefinition).toHaveBeenCalledWith({ clientId: 'client-12345678', phrase: selected, word: 'धन्यवाद' }, expect.any(AbortSignal)));
  expect(mockPreparePhrase).not.toHaveBeenCalled();
});


it('keeps unknown Romanized spellings on word labels while looking up canonical Hindi', async () => {
  jest.resetAllMocks();
  mockPreparePhrase.mockResolvedValue({ hi: 'कृपया पानी दीजिए।', latin: 'Kripya paani dijiye.', en: 'Please give me water.' });
  mockContextualDefinition.mockResolvedValue('Water is the requested object.');
  const view = await render(<WordDefinitionSheet clientId="client-12345678" onClose={jest.fn()} phrase="Kripayaa paanee dijiye." scriptPreference="latin" visible />);
  await waitFor(() => expect(view.getByText('Kripayaa paanee dijiye.')).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'Explain paanee' }));
  expect(mockContextualDefinition).toHaveBeenCalledWith({ clientId: 'client-12345678', phrase: 'कृपया पानी दीजिए।', word: 'पानी' }, expect.any(AbortSignal));
});
