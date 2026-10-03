import { createAshaNativeToolExecutor } from '../src/lib/asha-native-tools';

function dependencies() {
  return {
    confirmAndSavePhrase: jest.fn(async () => ({ saved: true })),
    createRecap: jest.fn(async () => ({ practicedPhrases: [] })),
    getContext: jest.fn(() => ({
      learnerLevel: 'beginner',
      lessonId: 'hello-1',
      relevantVocabulary: [{ devanagari: 'नमस्ते', romanization: 'Namaste', meaning: 'Hello' }],
    })),
    getProgress: jest.fn(() => ({ difficulty: 'beginner' })),
    lookupMeaning: jest.fn(async () => ({ explanation: 'Hello' })),
    prepareFeedback: jest.fn(async () => ({ feedback: 'One correction' })),
    updateCompletedProgress: jest.fn(async () => ({ updated: true })),
  };
}

function request(name: string, args: Record<string, unknown> = {}, callId = `call-${name}`) {
  return {
    arguments: args,
    callId,
    name,
    sessionId: 'live_test',
    signal: new AbortController().signal,
  };
}

describe('Asha native Bolo tool dispatcher', () => {
  it('reads only bounded local lesson, vocabulary, and progress state', async () => {
    const deps = dependencies();
    const execute = createAshaNativeToolExecutor(deps);

    await expect(execute(request('read_active_lesson'))).resolves.toEqual(expect.objectContaining({
      active: true,
      lessonId: 'hello-1',
    }));
    await expect(execute(request('load_topic_vocabulary', { topic: 'hello' }))).resolves.toEqual({
      topic: 'hello',
      vocabulary: [{ devanagari: 'नमस्ते', romanization: 'Namaste', meaning: 'Hello' }],
    });
    await expect(execute(request('get_learner_progress'))).resolves.toEqual({ difficulty: 'beginner' });
    const lesson = await execute(request('read_active_lesson', {}, 'lesson-minimized'));
    expect(lesson).not.toHaveProperty('learnerLevel');
    expect(lesson).not.toHaveProperty('relevantVocabulary');
  });

  it('does not save or update progress without the required confirmation guards', async () => {
    const deps = dependencies();
    const execute = createAshaNativeToolExecutor(deps);

    await expect(execute(request('save_confirmed_phrase', { originalText: 'namaste', confirmed: false }))).resolves.toEqual({
      saved: false,
      reason: 'Learner confirmation is required.',
    });
    await expect(execute(request('update_completed_progress', {
      lessonId: 'hello-1',
      interactionCompleted: false,
      outcome: 'partial',
    }))).resolves.toEqual({
      updated: false,
      reason: 'The learning interaction is not complete.',
    });
    expect(deps.confirmAndSavePhrase).not.toHaveBeenCalled();
    expect(deps.updateCompletedProgress).not.toHaveBeenCalled();
  });

  it('shares duplicate call IDs and performs a confirmed save only once', async () => {
    const deps = dependencies();
    let finish: ((value: { saved: boolean }) => void) | undefined;
    deps.confirmAndSavePhrase.mockImplementation(() => new Promise<{ saved: boolean }>((resolve) => { finish = resolve; }));
    const execute = createAshaNativeToolExecutor(deps);
    const input = request('save_confirmed_phrase', { originalText: 'Mera naaam?', confirmed: true }, 'save-one');

    const first = execute(input);
    const duplicate = execute(input);
    await Promise.resolve();
    expect(deps.confirmAndSavePhrase).toHaveBeenCalledTimes(1);
    expect(deps.confirmAndSavePhrase).toHaveBeenCalledWith(
      { originalText: 'Mera naaam?', devanagari: undefined },
      input.signal,
    );
    finish?.({ saved: true });
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { saved: true },
      { saved: true },
    ]);
  });

  it('rejects a result made stale by interruption', async () => {
    const deps = dependencies();
    let finish: ((value: { explanation: string }) => void) | undefined;
    deps.lookupMeaning.mockImplementation(() => new Promise<{ explanation: string }>((resolve) => { finish = resolve; }));
    const execute = createAshaNativeToolExecutor(deps);
    const controller = new AbortController();
    const pending = execute({
      ...request('lookup_contextual_meaning', { text: 'कल' }),
      signal: controller.signal,
    });

    await Promise.resolve();
    controller.abort();
    finish?.({ explanation: 'yesterday or tomorrow' });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('updates completed local progress and prevents cross-session recap requests', async () => {
    const deps = dependencies();
    const execute = createAshaNativeToolExecutor(deps);

    await expect(execute(request('update_completed_progress', {
      lessonId: 'hello-1',
      interactionCompleted: true,
      outcome: 'completed',
    }))).resolves.toEqual({ updated: true });
    expect(deps.updateCompletedProgress).toHaveBeenCalledTimes(1);

    await expect(execute(request('create_session_recap', { sessionId: 'live_other' })))
      .rejects.toThrow('different session');
    expect(deps.createRecap).not.toHaveBeenCalled();
  });

  it('delegates bounded meaning, feedback, and same-session recap requests', async () => {
    const deps = dependencies();
    const execute = createAshaNativeToolExecutor(deps);

    await expect(execute(request('lookup_contextual_meaning', {
      context: 'मैं कल आऊँगा।',
      text: 'कल',
    }))).resolves.toEqual({ explanation: 'Hello' });
    expect(deps.lookupMeaning).toHaveBeenCalledWith(
      { context: 'मैं कल आऊँगा।', text: 'कल' },
      expect.any(AbortSignal),
    );

    await expect(execute(request('prepare_learning_feedback', {
      feedbackType: 'grammar',
      learnerText: 'मैं कल आया।',
    }))).resolves.toEqual({ feedback: 'One correction' });
    expect(deps.prepareFeedback).toHaveBeenCalledWith(
      { feedbackType: 'grammar', learnerText: 'मैं कल आया।' },
      expect.any(AbortSignal),
    );

    await expect(execute(request('create_session_recap', { sessionId: 'live_test' })))
      .resolves.toEqual({ practicedPhrases: [] });
    expect(deps.createRecap).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported tools, invalid feedback, and malformed bounded text', async () => {
    const execute = createAshaNativeToolExecutor(dependencies());

    await expect(execute(request('not_a_tool'))).rejects.toThrow('unsupported Bolo tool');
    await expect(execute(request('prepare_learning_feedback', {
      feedbackType: 'style',
      learnerText: 'नमस्ते',
    }))).rejects.toThrow('invalid feedback type');
    await expect(execute(request('load_topic_vocabulary', { topic: '' })))
      .rejects.toThrow('invalid Bolo tool argument');
  });
});
