import { getScene } from '../src/data/scenes';
import {
  activeLessonFor,
  buildLiveSessionContext,
  createLiveToolExecutor,
  lessonVocabulary,
  LIVE_TOOL_NAMES,
  parseCompletedFunctionCall,
  type LiveClientEvent,
  type LiveToolEnvironment,
  type LiveToolSnapshot,
} from '../src/lib/live-tools';
import { defaultLearnerProfile, defaultSceneProgress } from '../src/lib/storage';
import type { SavedPhrase } from '../src/state/app-state-types';

const chaiPhrase: SavedPhrase = { hi: 'एक चाय दीजिए।', latin: 'Ek chai dijiye.', en: 'One tea, please.' };

function snapshot(overrides: Partial<LiveToolSnapshot> = {}): LiveToolSnapshot {
  return {
    profile: { ...defaultLearnerProfile(), completed: true },
    phrases: [],
    sceneProgress: {},
    streak: 3,
    practiceSecondsToday: 150,
    liveDoneToday: true,
    duePhraseCount: 2,
    ...overrides,
  };
}

function setup(state = snapshot(), extra: Partial<LiveToolEnvironment> = {}) {
  let current = state;
  const environment = {
    getSnapshot: jest.fn(() => current),
    preparePhrase: jest.fn(async (): Promise<SavedPhrase> => ({ hi: 'मुझे हिंदी पसंद है।', latin: 'Mujhe Hindi pasand hai.', en: 'I like Hindi.' })),
    savePhrase: jest.fn((phrase: SavedPhrase) => { current = { ...current, phrases: [...current.phrases, phrase] }; }),
    recordLessonPractice: jest.fn(),
    ...extra,
  };
  const executor = createLiveToolExecutor(environment);
  let next = 0;
  const call = async (name: string, args: unknown = {}, callId = `call_${++next}`) => {
    const work = executor.handleEvent(envelope(name, typeof args === 'string' ? args : JSON.stringify(args), callId));
    if (!work) return null;
    const events = await work;
    return { events, output: JSON.parse((events[0] as Extract<LiveClientEvent, { type: 'response.item.create' }>).item.output) as Record<string, unknown> };
  };
  return { environment, executor, call };
}

function envelope(name: string, args: string, callId: string) {
  return {
    type: 'response.event',
    event_id: 'event_response_1',
    delegation_id: 'item_123',
    event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: callId, name, arguments: args } },
  };
}

describe('live tool event parsing', () => {
  it('reads completed function calls from response.event envelopes', () => {
    expect(parseCompletedFunctionCall(envelope('read_active_lesson', '{}', 'call_123'))).toEqual({ callId: 'call_123', name: 'read_active_lesson', arguments: '{}' });
  });

  it.each([
    null,
    'text',
    { type: 'session.output_transcript.delta', delta: 'hi' },
    { type: 'response.event', event: { type: 'response.output_item.added', item: { type: 'function_call', call_id: 'c', name: 'x', arguments: '{}' } } },
    { type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'message', content: [] } } },
    { type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: '', name: 'x', arguments: '{}' } } },
    { type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c'.repeat(129), name: 'x', arguments: '{}' } } },
    { type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c', name: 7, arguments: '{}' } } },
    { type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c', name: 'x', arguments: {} } } },
  ])('ignores events that are not completed function calls: %j', (event) => {
    expect(parseCompletedFunctionCall(event)).toBeNull();
  });

  it('defaults missing arguments to an empty object', () => {
    expect(parseCompletedFunctionCall({ type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c', name: 'get_learner_progress' } } })?.arguments).toBe('{}');
  });
});

describe('live tool executor', () => {
  it('answers with a function_call_output item and then continues the response', async () => {
    const { call } = setup();
    const result = await call('get_learner_progress', {}, 'call_abc');
    expect(result?.events).toEqual([
      { type: 'response.item.create', event_id: 'bolo-tool-output-1', item: { type: 'function_call_output', call_id: 'call_abc', output: expect.any(String) } },
      { type: 'response.create', event_id: 'bolo-tool-continue-1' },
    ]);
  });

  it('never executes the same call id twice', async () => {
    const { call, environment } = setup();
    const args = { originalText: 'One tea, please.', confirmed: true };
    expect((await call('save_confirmed_phrase', args, 'call_same'))?.output).toMatchObject({ status: 'saved' });
    expect(await call('save_confirmed_phrase', args, 'call_same')).toBeNull();
    expect(environment.savePhrase).toHaveBeenCalledTimes(1);
  });

  it('returns errors for unknown tools instead of throwing', async () => {
    const { call } = setup();
    expect((await call('delete_account', {}))?.output).toEqual({ error: 'unknown_tool' });
  });

  it.each([
    ['read_active_lesson', 'unexpected_argument:extra', '{"extra":1}'],
    ['read_active_lesson', 'invalid_arguments', 'not json'],
    ['read_active_lesson', 'invalid_arguments', '[]'],
    ['load_topic_vocabulary', 'missing_argument:topic', '{}'],
    ['load_topic_vocabulary', 'missing_argument:topic', '{"topic":"   "}'],
    ['load_topic_vocabulary', 'invalid_argument:topic', '{"topic":5}'],
    ['load_topic_vocabulary', 'argument_too_long:topic', JSON.stringify({ topic: 'x'.repeat(121) })],
    ['lookup_contextual_meaning', 'argument_too_long:context', JSON.stringify({ text: 'chai', context: 'x'.repeat(501) })],
    ['prepare_learning_feedback', 'invalid_argument:feedbackType', '{"learnerText":"chai","feedbackType":"tone"}'],
    ['save_confirmed_phrase', 'invalid_argument:confirmed', '{"originalText":"chai","confirmed":"yes"}'],
    ['update_completed_progress', 'missing_argument:outcome', '{"lessonId":"chai","interactionCompleted":true}'],
    ['create_session_recap', 'missing_argument:sessionId', '{}'],
    ['read_active_lesson', 'arguments_too_large', JSON.stringify({ padding: 'x'.repeat(5000) })],
  ])('rejects invalid %s arguments with %s', async (name, error, args) => {
    const { call } = setup();
    expect((await call(name, args))?.output).toEqual({ error });
  });

  it('reads the active lesson the app would recommend', async () => {
    const state = snapshot({ sceneProgress: { market: { ...defaultSceneProgress(), lastBeatIndex: 2, lastPracticedAt: '2026-10-01T10:00:00.000Z' } } });
    const { call } = setup(state);
    const active = activeLessonFor(state.profile, state.sceneProgress)!;
    const { output } = (await call('read_active_lesson'))!;
    expect(output.lesson).toMatchObject({ lessonId: active.id, title: active.title, learningObjective: active.subtitle, progress: { totalSteps: active.beats.length } });
    expect((output.lesson as { keyWords: unknown[] }).keyWords.length).toBeGreaterThan(0);
  });

  it('loads vocabulary for an exact lesson id, the active lesson, or a topic', async () => {
    const { call } = setup();
    expect((await call('load_topic_vocabulary', { topic: 'chai' }))?.output).toMatchObject({ status: 'found', lessonId: 'chai' });
    const vocabulary = ((await call('load_topic_vocabulary', { topic: 'chai' }))!.output.vocabulary as { devanagari: string }[]);
    expect(vocabulary.map((item) => item.devanagari)).toContain('चाय');
    expect(vocabulary.map((item) => item.devanagari)).toContain('एक चाय दीजिए।');
    expect(vocabulary.length).toBeLessThanOrEqual(12);
    expect((await call('load_topic_vocabulary', { topic: 'current lesson' }))?.output).toMatchObject({ status: 'found' });
    expect((await call('load_topic_vocabulary', { topic: 'The chai stop' }))?.output).toMatchObject({ status: 'found', lessonId: 'chai' });
    expect((await call('load_topic_vocabulary', { topic: 'zzqx' }))?.output).toEqual({ status: 'not_found', topic: 'zzqx' });
  });

  it('looks up meanings in saved phrases and lesson content, and reports not_found', async () => {
    const saved: SavedPhrase = { hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you' };
    const { call } = setup(snapshot({ phrases: [saved] }));
    expect((await call('lookup_contextual_meaning', { text: 'dhanyavaad' }))?.output).toEqual({ status: 'found', text: 'dhanyavaad', matches: [{ devanagari: 'धन्यवाद', romanization: 'Dhanyavaad', meaning: 'Thank you', source: 'saved' }] });
    expect((await call('lookup_contextual_meaning', { text: 'Ek chai dijiye', context: 'ordering' }))?.output).toMatchObject({ status: 'found', matches: [{ devanagari: chaiPhrase.hi, meaning: chaiPhrase.en, source: 'lesson' }] });
    expect((await call('lookup_contextual_meaning', { text: 'qwzx plorb' }))?.output).toEqual({ status: 'not_found', text: 'qwzx plorb' });
  });

  it('reports learner progress from app state', async () => {
    const state = snapshot({
      phrases: [chaiPhrase],
      sceneProgress: { chai: { ...defaultSceneProgress(), completions: 2, bestAccuracy: 90, lastPracticedAt: '2026-10-02T10:00:00.000Z' }, unknown: { ...defaultSceneProgress(), lastPracticedAt: '2026-10-03T10:00:00.000Z' } },
    });
    const { call } = setup(state);
    expect((await call('get_learner_progress'))?.output).toEqual({
      learnerLevel: 'new',
      primaryGoal: 'conversation',
      responseLanguage: 'en',
      scriptPreference: 'both',
      streakDays: 3,
      practiceMinutesToday: 2,
      livePracticeDoneToday: true,
      lessonsCompleted: 1,
      savedPhraseCount: 1,
      phrasesDueForReview: 2,
      recentLessons: [{ lessonId: 'chai', title: getScene('chai')!.title, completions: 2, bestAccuracy: 90 }],
    });
  });

  it('prepares feedback material locally without network calls', async () => {
    const { call, environment } = setup();
    const { output } = (await call('prepare_learning_feedback', { learnerText: 'Ek chai dijiye', feedbackType: 'pronunciation' }))!;
    expect(output).toMatchObject({ learnerText: 'Ek chai dijiye', feedbackType: 'pronunciation', reference: { devanagari: chaiPhrase.hi } });
    expect(output.guidance).toEqual(expect.stringContaining('pronunciation'));
    expect((await call('prepare_learning_feedback', { learnerText: 'main jaata', feedbackType: 'grammar' }))?.output).toMatchObject({ feedbackType: 'grammar', guidance: expect.stringContaining('grammar') });
    expect(environment.preparePhrase).not.toHaveBeenCalled();
  });

  describe('save_confirmed_phrase', () => {
    it('requires explicit confirmation', async () => {
      const { call, environment } = setup();
      expect((await call('save_confirmed_phrase', { originalText: 'One tea, please.', confirmed: false }))?.output).toEqual({ error: 'confirmation_required' });
      expect(environment.savePhrase).not.toHaveBeenCalled();
    });

    it('saves known lesson phrases locally and dedupes against saved phrases', async () => {
      const { call, environment } = setup();
      expect((await call('save_confirmed_phrase', { originalText: 'Ek chai dijiye', devanagari: chaiPhrase.hi, confirmed: true }))?.output).toEqual({ status: 'saved', phrase: { devanagari: chaiPhrase.hi, romanization: chaiPhrase.latin, meaning: chaiPhrase.en } });
      expect(environment.savePhrase).toHaveBeenCalledWith(chaiPhrase);
      expect(environment.preparePhrase).not.toHaveBeenCalled();
      expect((await call('save_confirmed_phrase', { originalText: 'One tea, please.', confirmed: true }))?.output).toMatchObject({ status: 'already_saved' });
      expect(environment.savePhrase).toHaveBeenCalledTimes(1);
    });

    it('dedupes against phrases already in app state', async () => {
      const { call, environment } = setup(snapshot({ phrases: [chaiPhrase] }));
      expect((await call('save_confirmed_phrase', { originalText: 'Ek chai dijiye.', confirmed: true }))?.output).toMatchObject({ status: 'already_saved' });
      expect(environment.savePhrase).not.toHaveBeenCalled();
    });

    it('uses the app preparation path for new phrases and reports failures as errors', async () => {
      const { call, environment } = setup();
      expect((await call('save_confirmed_phrase', { originalText: 'Mujhe Hindi pasand hai', confirmed: true }))?.output).toMatchObject({ status: 'saved', phrase: { devanagari: 'मुझे हिंदी पसंद है।' } });
      expect(environment.preparePhrase).toHaveBeenCalledWith({ originalText: 'Mujhe Hindi pasand hai' }, expect.any(AbortSignal));
      jest.mocked(environment.preparePhrase).mockRejectedValueOnce(new Error('network down'));
      expect((await call('save_confirmed_phrase', { originalText: 'Kuch naya', confirmed: true }))?.output).toEqual({ error: 'phrase_preparation_failed' });
      jest.mocked(environment.preparePhrase).mockResolvedValueOnce({ hi: 'Kuch', latin: 'Kuch', en: 'Something' });
      expect((await call('save_confirmed_phrase', { originalText: 'Kuch', confirmed: true }))?.output).toEqual({ error: 'phrase_preparation_failed' });
      expect(environment.savePhrase).toHaveBeenCalledTimes(1);
    });

    it('serializes concurrent saves so the same phrase is saved once', async () => {
      const { executor, environment } = setup();
      const args = JSON.stringify({ originalText: 'Mujhe Hindi pasand hai', confirmed: true });
      const outputs = await Promise.all([
        executor.handleEvent(envelope('save_confirmed_phrase', args, 'call_a'))!,
        executor.handleEvent(envelope('save_confirmed_phrase', args, 'call_b'))!,
      ]);
      expect(outputs.map((events) => JSON.parse((events[0] as Extract<LiveClientEvent, { type: 'response.item.create' }>).item.output).status)).toEqual(['saved', 'already_saved']);
      expect(environment.savePhrase).toHaveBeenCalledTimes(1);
    });
  });

  describe('update_completed_progress', () => {
    it('validates the lesson id and completion flag, and records once per session', async () => {
      const { call, environment } = setup();
      expect((await call('update_completed_progress', { lessonId: 'chai', interactionCompleted: false, outcome: 'done' }))?.output).toEqual({ error: 'interaction_not_completed' });
      expect((await call('update_completed_progress', { lessonId: 'not-a-lesson', interactionCompleted: true, outcome: 'done' }))?.output).toEqual({ error: 'unknown_lesson' });
      expect(environment.recordLessonPractice).not.toHaveBeenCalled();
      expect((await call('update_completed_progress', { lessonId: 'chai', interactionCompleted: true, outcome: 'Ordered tea' }))?.output).toEqual({ status: 'recorded', lessonId: 'chai', title: getScene('chai')!.title });
      expect((await call('update_completed_progress', { lessonId: 'chai', interactionCompleted: true, outcome: 'Again' }))?.output).toEqual({ status: 'already_recorded', lessonId: 'chai' });
      expect(environment.recordLessonPractice).toHaveBeenCalledTimes(1);
      expect(environment.recordLessonPractice).toHaveBeenCalledWith('chai');
    });
  });

  it('recaps only confirmed saves and recorded progress from this session', async () => {
    const { call } = setup();
    expect((await call('create_session_recap', { sessionId: 'live_1' }))?.output).toEqual({ summary: 'No phrases were saved. No lesson progress was recorded.', savedPhrases: [], progressUpdates: [] });
    await call('save_confirmed_phrase', { originalText: 'Ek chai dijiye', confirmed: true });
    await call('save_confirmed_phrase', { originalText: 'Ignored', confirmed: false });
    await call('update_completed_progress', { lessonId: 'chai', interactionCompleted: true, outcome: 'Ordered tea' });
    const title = getScene('chai')!.title;
    expect((await call('create_session_recap', { sessionId: 'live_1' }))?.output).toEqual({
      summary: `Saved 1 phrase. Recorded practice for ${title}.`,
      savedPhrases: [{ devanagari: chaiPhrase.hi, romanization: chaiPhrase.latin, meaning: chaiPhrase.en }],
      progressUpdates: [{ lessonId: 'chai', title, outcome: 'Ordered tea' }],
    });
  });

  it('caps output size', async () => {
    const { call } = setup(snapshot(), { maxOutputBytes: 100 });
    expect((await call('load_topic_vocabulary', { topic: 'chai' }))?.output).toEqual({ error: 'output_too_large' });
    expect(((await call('create_session_recap', { sessionId: 's' }))?.events[0] as Extract<LiveClientEvent, { type: 'response.item.create' }>).item.output.length).toBeLessThanOrEqual(100);
  });

  it('keeps every default output within 4 KB', async () => {
    const phrases = Array.from({ length: 100 }, (_, index) => ({ hi: `नमस्ते ${index}`, latin: `Namaste ${index}`, en: `Hello ${index}` }));
    const { call } = setup(snapshot({ phrases }));
    for (const name of LIVE_TOOL_NAMES) {
      const result = await call(name, {});
      expect(new TextEncoder().encode((result!.events[0] as Extract<LiveClientEvent, { type: 'response.item.create' }>).item.output).byteLength).toBeLessThanOrEqual(4096);
    }
  });

  it('reports a tool failure without throwing when app state cannot be read', async () => {
    const { call } = setup(snapshot(), { getSnapshot: () => { throw new Error('boom'); } });
    expect((await call('get_learner_progress'))?.output).toEqual({ error: 'tool_failed' });
  });

  it('stops answering after dispose', async () => {
    let resolvePrepare!: (phrase: SavedPhrase) => void;
    const { executor, environment } = setup(snapshot(), { preparePhrase: jest.fn(() => new Promise<SavedPhrase>((resolve) => { resolvePrepare = resolve; })) });
    const pending = executor.handleEvent(envelope('save_confirmed_phrase', JSON.stringify({ originalText: 'Bilkul naya', confirmed: true }), 'call_1'))!;
    await Promise.resolve();
    executor.dispose();
    resolvePrepare({ hi: 'बिल्कुल नया', latin: 'Bilkul naya', en: 'Brand new' });
    expect(await pending).toEqual([]);
    expect(environment.savePhrase).not.toHaveBeenCalled();
    expect(executor.handleEvent(envelope('get_learner_progress', '{}', 'call_2'))).toBeNull();
  });

  it('ignores non-tool events', () => {
    const { executor } = setup();
    expect(executor.handleEvent({ type: 'session.output_transcript.delta', delta: 'hi' })).toBeNull();
  });
});

describe('live session context', () => {
  it('sends the active lesson, learner level, and bounded vocabulary', () => {
    const state = snapshot({ phrases: [chaiPhrase, { hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you' }] });
    const active = activeLessonFor(state.profile, state.sceneProgress)!;
    const { mode, context } = buildLiveSessionContext(state);
    expect(mode).toBe('beginner');
    expect(context).toMatchObject({ learnerLevel: 'new', lessonId: active.id, lessonTitle: active.title, learningObjective: active.subtitle });
    expect(context.relevantVocabulary!.length).toBeLessThanOrEqual(12);
    expect(context.relevantVocabulary).toEqual(expect.arrayContaining([{ devanagari: 'धन्यवाद', romanization: 'Dhanyavaad', meaning: 'Thank you' }]));
    expect(context.relevantVocabulary!.slice(0, lessonVocabulary(active, 8).length)).toEqual(lessonVocabulary(active, 8));
  });

  it('uses conversation mode for intermediate learners', () => {
    expect(buildLiveSessionContext(snapshot({ profile: { ...defaultLearnerProfile(), level: 'intermediate' } })).mode).toBe('conversation');
  });
});
