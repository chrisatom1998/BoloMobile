import type { AshaSessionContext } from '@/lib/asha-live-session';

export type AshaNativeToolName =
  | 'read_active_lesson'
  | 'load_topic_vocabulary'
  | 'lookup_contextual_meaning'
  | 'get_learner_progress'
  | 'prepare_learning_feedback'
  | 'save_confirmed_phrase'
  | 'update_completed_progress'
  | 'create_session_recap';

export type AshaNativeToolRequest = {
  arguments: Record<string, unknown>;
  callId: string;
  name: string;
  sessionId: string;
  signal: AbortSignal;
};

export type AshaNativeToolExecutor = (request: AshaNativeToolRequest) => Promise<unknown>;

type Dependencies = {
  confirmAndSavePhrase: (input: { devanagari?: string; originalText: string }, signal: AbortSignal) => Promise<unknown>;
  createRecap: (signal: AbortSignal) => Promise<unknown>;
  getContext: () => AshaSessionContext;
  getProgress: () => unknown;
  lookupMeaning: (input: { context?: string; text: string }, signal: AbortSignal) => Promise<unknown>;
  prepareFeedback: (input: { feedbackType: 'grammar' | 'pronunciation'; learnerText: string }, signal: AbortSignal) => Promise<unknown>;
  updateCompletedProgress: (input: { lessonId: string; outcome: string }, signal: AbortSignal) => Promise<unknown>;
};

const MAX_COMPLETED_CALLS = 500;

function boundedText(value: unknown, maximum: number, required = true): string | undefined {
  if (typeof value !== 'string') {
    if (!required && value === undefined) return undefined;
    throw new Error('Asha requested an invalid Bolo tool argument.');
  }
  const text = value.trim();
  if ((required && !text) || text.length > maximum) throw new Error('Asha requested an invalid Bolo tool argument.');
  return text || undefined;
}

function abortError() {
  const error = new Error('The learner changed the request before this result completed.');
  error.name = 'AbortError';
  return error;
}

function checkActive(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

async function runTool(deps: Dependencies, request: AshaNativeToolRequest): Promise<unknown> {
  const args = request.arguments;
  checkActive(request.signal);
  let result: unknown;

  switch (request.name as AshaNativeToolName) {
    case 'read_active_lesson': {
      const context = deps.getContext();
      result = {
        active: Boolean(context.lessonId || context.lessonTitle || context.learningObjective),
        lessonId: context.lessonId,
        lessonTitle: context.lessonTitle,
        learningObjective: context.learningObjective,
      };
      break;
    }
    case 'load_topic_vocabulary': {
      const topic = boundedText(args.topic, 120)!;
      const vocabulary = deps.getContext().relevantVocabulary ?? [];
      const normalizedTopic = topic.toLocaleLowerCase();
      const matching = vocabulary.filter((word) => [word.devanagari, word.romanization, word.meaning]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedTopic)));
      result = { topic, vocabulary: matching.length ? matching : vocabulary };
      break;
    }
    case 'lookup_contextual_meaning':
      result = await deps.lookupMeaning({
        text: boundedText(args.text, 500)!,
        context: boundedText(args.context, 600, false),
      }, request.signal);
      break;
    case 'get_learner_progress':
      result = deps.getProgress();
      break;
    case 'prepare_learning_feedback': {
      const feedbackType = args.feedbackType;
      if (feedbackType !== 'grammar' && feedbackType !== 'pronunciation') {
        throw new Error('Asha requested an invalid feedback type.');
      }
      result = await deps.prepareFeedback({
        feedbackType,
        learnerText: boundedText(args.learnerText, 600)!,
      }, request.signal);
      break;
    }
    case 'save_confirmed_phrase':
      if (args.confirmed !== true) return { saved: false, reason: 'Learner confirmation is required.' };
      result = await deps.confirmAndSavePhrase({
        originalText: boundedText(args.originalText, 500)!,
        devanagari: boundedText(args.devanagari, 500, false),
      }, request.signal);
      break;
    case 'update_completed_progress':
      if (args.interactionCompleted !== true) return { updated: false, reason: 'The learning interaction is not complete.' };
      result = await deps.updateCompletedProgress({
        lessonId: boundedText(args.lessonId, 120)!,
        outcome: boundedText(args.outcome, 200)!,
      }, request.signal);
      break;
    case 'create_session_recap': {
      const requestedSessionId = boundedText(args.sessionId, 256)!;
      if (requestedSessionId !== request.sessionId) throw new Error('Asha requested a recap for a different session.');
      result = await deps.createRecap(request.signal);
      break;
    }
    default:
      throw new Error('Asha requested an unsupported Bolo tool.');
  }

  checkActive(request.signal);
  return result;
}

/**
 * Creates an in-app dispatcher for Responses-delegated Bolo tools. Learner
 * state never leaves the app for mutations; duplicate Live call IDs share one
 * result, and aborted generations cannot commit a stale result.
 */
export function createAshaNativeToolExecutor(deps: Dependencies): AshaNativeToolExecutor {
  const inFlight = new Map<string, Promise<unknown>>();
  const completed = new Map<string, unknown>();

  return async (request) => {
    const key = `${request.sessionId}:${request.callId}`;
    if (completed.has(key)) return completed.get(key);
    const existing = inFlight.get(key);
    if (existing) return existing;

    const task = runTool(deps, request).then((result) => {
      completed.set(key, result);
      while (completed.size > MAX_COMPLETED_CALLS) {
        const oldest = completed.keys().next().value as string | undefined;
        if (!oldest) break;
        completed.delete(oldest);
      }
      return result;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };
}
