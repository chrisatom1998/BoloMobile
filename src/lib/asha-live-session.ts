export const ASHA_LIVE_MODEL = 'gpt-live-1' as const;
export const ASHA_RESPONSES_MODEL = 'gpt-5.6-terra' as const;

export const ASHA_MODES = [
  'hindi-immersion',
  'hindi-english-help',
  'beginner',
  'conversation',
  'lesson',
] as const;

export type AshaMode = (typeof ASHA_MODES)[number];

export type AshaSessionContext = {
  learnerLevel?: string;
  lessonId?: string;
  lessonTitle?: string;
  learningObjective?: string;
  recentContext?: string[];
  relevantVocabulary?: {
    devanagari: string;
    romanization?: string;
    meaning?: string;
  }[];
};

export const MAX_ASHA_RECENT_CONTEXT_CHARACTERS = 500;

export function buildAshaRecentContext(
  messages: readonly { role: string; text: string }[],
): string[] {
  return messages.slice(-8).map(({ role, text }) => {
    const prefix = `${role}: `;
    const maximumTextLength = Math.max(0, MAX_ASHA_RECENT_CONTEXT_CHARACTERS - prefix.length);
    let boundedText = text.slice(0, maximumTextLength);
    const finalCodeUnit = boundedText.charCodeAt(boundedText.length - 1);
    if (finalCodeUnit >= 0xD800 && finalCodeUnit <= 0xDBFF) boundedText = boundedText.slice(0, -1);
    return `${prefix}${boundedText}`;
  });
}

export type AshaLiveSessionRequest = {
  clientId: string;
  context: AshaSessionContext;
  mode: AshaMode;
  sdp: string;
};

export type AshaLiveSessionResponse = {
  session: { id: string };
  transport: { sdp: string; type: 'webrtc' };
};

const MODE_INSTRUCTIONS: Record<AshaMode, string> = {
  'hindi-immersion': 'Speak primarily in Hindi. Use English only when the learner explicitly asks for it.',
  'hindi-english-help': 'Speak in Hindi and give brief English explanations when material is difficult or the learner asks.',
  beginner: 'Use short Hindi sentences, common vocabulary, a slower pace, and generous thinking pauses.',
  conversation: 'Speak naturally, prioritize conversational flow, and offer fewer corrections.',
  lesson: 'Follow the active Bolo lesson and its learning objective. Delegate whenever lesson state is needed.',
};

export function isAshaMode(value: unknown): value is AshaMode {
  return typeof value === 'string' && ASHA_MODES.includes(value as AshaMode);
}

export function buildAshaLiveInstructions(mode: AshaMode): string {
  return [
    'You are Asha, a warm, patient Hindi conversation partner and tutor in the Bolo iOS app.',
    'Hindi is your default spoken language. Speak naturally and clearly at the learner\'s pace.',
    'Keep routine replies short, ask one question at a time, and leave enough silence for the learner to think.',
    'Respond to meaning first. Correct at most one useful mistake, without shaming or excessive praise.',
    'Do not infer language preference from accent, coughs, background speech, filler sounds, or isolated words.',
    'Briefly explain in English when asked or when the learner is stuck, then return to Hindi unless English mode was chosen.',
    'Honor spoken requests such as “speak more slowly”, “explain that in English”, or “only speak Hindi”.',
    'If speech is unclear, ask only about the unclear word or phrase. Never guess important names, numbers, or intent.',
    'When interrupted, stop speaking immediately, listen, and treat the newest learner request as authoritative.',
    'Delegate any answer that depends on lessons, vocabulary, meanings, progress, feedback, saved phrases, or recaps.',
    'Never claim a save, progress update, or lesson completion until the delegated tool result confirms it.',
    MODE_INSTRUCTIONS[mode],
  ].join(' ');
}

export function buildAshaResponsesInstructions(context: AshaSessionContext): string {
  const vocabulary = context.relevantVocabulary
    ?.map((word) => [word.devanagari, word.romanization, word.meaning].filter(Boolean).join(' — '))
    .join('; ');
  const contextSummary = [
    context.lessonId ? `Lesson id: ${context.lessonId}.` : '',
    context.lessonTitle ? `Lesson title: ${context.lessonTitle}.` : '',
    context.learningObjective ? `Learning objective: ${context.learningObjective}.` : '',
    context.learnerLevel ? `Learner level: ${context.learnerLevel}.` : '',
    vocabulary ? `Relevant vocabulary: ${vocabulary}.` : '',
    context.recentContext?.length ? `Recent context: ${context.recentContext.join(' | ')}` : '',
  ].filter(Boolean).join(' ');

  return [
    'You are Bolo’s permission-scoped teaching and application workflow backend for Asha.',
    'Use tools for authoritative app state. Do not invent lesson content, progress, saved state, or confirmations.',
    'Preserve learner-created text byte-for-byte, including unknown Romanized Hindi, English names, and punctuation.',
    'Use canonical Devanagari for Hindi speech only when it is available. If conversion is uncertain, keep the original and request clarification.',
    'Prepare only one concise correction at a time, after responding to meaning.',
    'A phrase may be saved only after explicit learner confirmation. Progress may be updated only after the relevant interaction is complete.',
    'Return compact results so the live voice conversation can continue naturally while work runs.',
    contextSummary,
  ].filter(Boolean).join(' ');
}

export const ASHA_TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'read_active_lesson',
    description: 'Read the active Bolo lesson and its learning objective.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'load_topic_vocabulary',
    description: 'Load vocabulary relevant to the active lesson or current topic.',
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string' } },
      required: ['topic'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'lookup_contextual_meaning',
    description: 'Look up a contextual meaning and short example sentence.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' }, context: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_learner_progress',
    description: 'Read current learner progress and selected difficulty.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'prepare_learning_feedback',
    description: 'Prepare one concise pronunciation or grammar correction.',
    parameters: {
      type: 'object',
      properties: {
        learnerText: { type: 'string' },
        feedbackType: { type: 'string', enum: ['pronunciation', 'grammar'] },
      },
      required: ['learnerText', 'feedbackType'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'save_confirmed_phrase',
    description: 'Save a phrase only after the learner explicitly confirms the save.',
    parameters: {
      type: 'object',
      properties: {
        originalText: { type: 'string' },
        devanagari: { type: 'string' },
        confirmed: { type: 'boolean', const: true },
      },
      required: ['originalText', 'confirmed'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_completed_progress',
    description: 'Update progress only after the relevant learning interaction is complete.',
    parameters: {
      type: 'object',
      properties: {
        lessonId: { type: 'string' },
        interactionCompleted: { type: 'boolean', const: true },
        outcome: { type: 'string' },
      },
      required: ['lessonId', 'interactionCompleted', 'outcome'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_session_recap',
    description: 'Create a concise recap of practiced phrases, useful corrections, and confirmed progress.',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string' } },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
] as const;

export function buildAshaLiveSessionConfig(mode: AshaMode, context: AshaSessionContext) {
  return {
    model: ASHA_LIVE_MODEL,
    instructions: buildAshaLiveInstructions(mode),
    delegation: {
      type: 'responses' as const,
      responses: {
        model: ASHA_RESPONSES_MODEL,
        instructions: buildAshaResponsesInstructions(context),
        tools: ASHA_TOOL_DEFINITIONS,
        tool_choice: 'auto' as const,
        parallel_tool_calls: false,
      },
    },
  };
}

/**
 * Monotonic generation guard for delegated work. Calling invalidate() when the
 * learner interrupts makes every in-flight result from an older turn stale.
 */
export class AshaTaskGate {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

export function preserveLearnerText(text: string): string {
  return text;
}
