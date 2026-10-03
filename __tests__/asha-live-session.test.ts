import {
  ASHA_MODES,
  AshaTaskGate,
  buildAshaRecentContext,
  buildAshaLiveSessionConfig,
  preserveLearnerText,
} from '../src/lib/asha-live-session';

describe('Asha recent context minimization', () => {
  it('bounds maximum typed and generated messages without rewriting the local text', () => {
    const typed = `Kya naam hai? ${'x'.repeat(500)}`;
    const generated = `नमस्ते। ${'य'.repeat(2_400)}`;
    const messages = [
      { role: 'user', text: typed },
      { role: 'asha', text: generated },
    ];

    const context = buildAshaRecentContext(messages);

    expect(context).toHaveLength(2);
    expect(context.every((item) => item.length <= 500)).toBe(true);
    expect(context[0]).toBe(`user: ${typed.slice(0, 494)}`);
    expect(context[1]).toBe(`asha: ${generated.slice(0, 494)}`);
    expect(messages).toEqual([
      { role: 'user', text: typed },
      { role: 'asha', text: generated },
    ]);
  });

  it('keeps only the last eight messages and never splits a surrogate pair', () => {
    const context = buildAshaRecentContext([
      ...Array.from({ length: 8 }, (_, index) => ({ role: 'user', text: `old-${index}` })),
      { role: 'user', text: `${'x'.repeat(493)}😀suffix` },
    ]);

    expect(context).toHaveLength(8);
    expect(context[0]).toBe('user: old-1');
    expect(context.at(-1)).toBe(`user: ${'x'.repeat(493)}`);
  });
});

describe('Asha GPT-Live session contract', () => {
  it.each(ASHA_MODES)('creates gpt-live-1 with Responses delegation for %s', (mode) => {
    const config = buildAshaLiveSessionConfig(mode, {
      learnerLevel: 'beginner',
      lessonId: 'lesson-travel',
      lessonTitle: 'At the station',
      learningObjective: 'Ask where a train is going',
      relevantVocabulary: [{ devanagari: 'ट्रेन', romanization: 'ṭren', meaning: 'train' }],
    });

    expect(config.model).toBe('gpt-live-1');
    expect(config.delegation.type).toBe('responses');
    expect(config.delegation.responses.model).toBe('gpt-5.6-terra');
    expect(config.delegation.responses.parallel_tool_calls).toBe(false);
    expect(config.delegation.responses.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'read_active_lesson',
      'save_confirmed_phrase',
      'update_completed_progress',
      'create_session_recap',
    ]));
    expect(config.instructions).toContain('one question at a time');
    expect(config.delegation.responses.instructions).toContain('Preserve learner-created text');
  });

  it('requires confirmation and completed interactions in mutation schemas', () => {
    const tools = buildAshaLiveSessionConfig('lesson', {}).delegation.responses.tools;
    const save = tools.find((tool) => tool.name === 'save_confirmed_phrase');
    const progress = tools.find((tool) => tool.name === 'update_completed_progress');

    expect(save?.parameters.properties.confirmed).toEqual({ type: 'boolean', const: true });
    expect(progress?.parameters.properties.interactionCompleted).toEqual({ type: 'boolean', const: true });
  });

  it('preserves unknown Romanized Hindi exactly', () => {
    const unknown = 'Mera naaam?  X Æ-12 -- bilkul!!!';
    expect(preserveLearnerText(unknown)).toBe(unknown);
  });

  it('rejects results from an obsolete backend generation', () => {
    const gate = new AshaTaskGate();
    const first = gate.begin();
    expect(gate.isCurrent(first)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(first)).toBe(false);
    const next = gate.begin();
    expect(gate.isCurrent(next)).toBe(true);
  });
});
