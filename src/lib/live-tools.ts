/**
 * Executes the Bolo function tools that GPT-Live delegation requests over the
 * data channel. Pure and transport-free: the realtime hook feeds parsed data
 * channel events in and sends the returned client events out.
 *
 * Event shapes follow https://developers.openai.com/api/docs/guides/live-delegation:
 * a completed call arrives as a `response.event` envelope whose nested
 * `event.type` is `response.output_item.done` with a `function_call` item. The
 * client answers with `response.item.create` (a `function_call_output` item)
 * and then `response.create` to continue the backend response.
 */
import { getScene, scenes, type Scene } from '@/data/scenes';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { knownHindiDisplayPhrase, knownSavedPhrase } from '@/lib/known-hindi-phrases';
import { recommendedScenes } from '@/lib/learning';
import type { LiveCallContext, LiveMode, LiveVocabularyItem } from '@/services/bolo-api';
import type { LearnerProfile, SavedPhrase, SceneProgress } from '@/state/app-state-types';

export const LIVE_TOOL_NAMES = [
  'read_active_lesson',
  'load_topic_vocabulary',
  'lookup_contextual_meaning',
  'get_learner_progress',
  'prepare_learning_feedback',
  'save_confirmed_phrase',
  'update_completed_progress',
  'create_session_recap',
] as const;
export type LiveToolName = (typeof LIVE_TOOL_NAMES)[number];

export const MAX_TOOL_OUTPUT_BYTES = 4 * 1024;
const MAX_ARGUMENT_CHARACTERS = 4 * 1024;
const MAX_CALL_ID_CHARACTERS = 128;
const MAX_CALLS_PER_SESSION = 100;
const MAX_SAVES_PER_SESSION = 20;
const VOCABULARY_LIMIT = 12;

export type LiveFunctionCall = { callId: string; name: string; arguments: string };

export type LiveClientEvent =
  | { type: 'response.item.create'; event_id: string; item: { type: 'function_call_output'; call_id: string; output: string } }
  | { type: 'response.create'; event_id: string };

export type LiveToolSnapshot = {
  profile: LearnerProfile;
  phrases: SavedPhrase[];
  sceneProgress: Record<string, SceneProgress>;
  streak: number;
  practiceSecondsToday: number;
  liveDoneToday: boolean;
  duePhraseCount: number;
};

export type LiveToolEnvironment = {
  /** Reads the latest app state on every call. */
  getSnapshot: () => LiveToolSnapshot;
  /** The app's existing saved-phrase preparation path, used when no local match exists. */
  preparePhrase: (input: { originalText: string; devanagari?: string }, signal: AbortSignal) => Promise<SavedPhrase>;
  /** Adds a new saved phrase. Only called for phrases that are not already saved. */
  savePhrase: (phrase: SavedPhrase) => void;
  /** Records conversation practice for an existing lesson id. */
  recordLessonPractice: (lessonId: string) => void;
  maxOutputBytes?: number;
};

export type LiveToolExecutor = {
  /** Returns pending client events for a new completed function call, else null. */
  handleEvent: (event: unknown) => Promise<LiveClientEvent[]> | null;
  dispose: () => void;
};

type ToolResult = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Extracts a completed function call from a data channel event, if it is one. */
export function parseCompletedFunctionCall(event: unknown): LiveFunctionCall | null {
  if (!isRecord(event)) return null;
  // Delegated Responses events are nested in `response.event` envelopes.
  const inner = event.type === 'response.event' ? event.event : event;
  if (!isRecord(inner) || inner.type !== 'response.output_item.done') return null;
  const item = inner.item;
  if (!isRecord(item) || item.type !== 'function_call') return null;
  const { call_id: callId, name } = item;
  const args = item.arguments ?? '{}';
  if (typeof callId !== 'string' || !callId || callId.length > MAX_CALL_ID_CHARACTERS) return null;
  if (typeof name !== 'string' || typeof args !== 'string') return null;
  return { callId, name, arguments: args };
}

type FieldSpec =
  | { type: 'string'; max: number; required?: boolean }
  | { type: 'boolean'; required?: boolean }
  | { type: 'enum'; values: readonly string[]; required?: boolean };

class ToolArgumentError extends Error {}

function parseArguments(raw: string, spec: Record<string, FieldSpec>): Record<string, string | boolean | undefined> {
  if (raw.length > MAX_ARGUMENT_CHARACTERS) throw new ToolArgumentError('arguments_too_large');
  let parsed: unknown;
  try { parsed = raw.trim() ? JSON.parse(raw) : {}; }
  catch { throw new ToolArgumentError('invalid_arguments'); }
  if (!isRecord(parsed)) throw new ToolArgumentError('invalid_arguments');
  for (const key of Object.keys(parsed)) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) throw new ToolArgumentError(`unexpected_argument:${key.slice(0, 40)}`);
  }
  const result: Record<string, string | boolean | undefined> = {};
  for (const [key, field] of Object.entries(spec)) {
    const value = parsed[key];
    if (value === undefined || value === null) {
      if (field.required) throw new ToolArgumentError(`missing_argument:${key}`);
      continue;
    }
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new ToolArgumentError(`invalid_argument:${key}`);
      result[key] = value;
      continue;
    }
    if (typeof value !== 'string') throw new ToolArgumentError(`invalid_argument:${key}`);
    const text = value.replace(/\s+/gu, ' ').trim();
    if (field.type === 'enum') {
      if (!field.values.includes(text)) throw new ToolArgumentError(`invalid_argument:${key}`);
    } else if (text.length > field.max) {
      throw new ToolArgumentError(`argument_too_long:${key}`);
    }
    if (!text) {
      if (field.required) throw new ToolArgumentError(`missing_argument:${key}`);
      continue;
    }
    result[key] = text;
  }
  return result;
}

function normalizeKey(text: string) {
  return text.normalize('NFC').toLocaleLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
}

function hasDevanagari(text: string) {
  return /[ऀ-ॿ]/u.test(text);
}

function validSavedPhrase(phrase: SavedPhrase | undefined | null): phrase is SavedPhrase {
  return Boolean(phrase
    && typeof phrase.hi === 'string' && hasDevanagari(phrase.hi) && phrase.hi.trim().length <= 500
    && typeof phrase.latin === 'string' && phrase.latin.trim() && phrase.latin.length <= 500
    && typeof phrase.en === 'string' && phrase.en.trim() && phrase.en.length <= 500);
}

function phraseView(phrase: SavedPhrase) {
  return { devanagari: phrase.hi, romanization: phrase.latin, meaning: phrase.en };
}

/** The lesson Asha should treat as active: a resumable lesson first, then the best recommendation. */
export function activeLessonFor(profile: LearnerProfile, progress: Record<string, SceneProgress>): Scene | undefined {
  return recommendedScenes(profile, progress, 1)[0];
}

/** Key words and correct target phrases for a lesson, deduplicated by Devanagari. */
export function lessonVocabulary(scene: Scene, limit = VOCABULARY_LIMIT): LiveVocabularyItem[] {
  const items: LiveVocabularyItem[] = [];
  const seen = new Set<string>();
  const add = (item: LiveVocabularyItem) => {
    if (seen.has(item.devanagari)) return;
    seen.add(item.devanagari);
    items.push(item);
  };
  // Single key words first keep the list short and useful for a spoken lesson.
  scene.words.forEach((word) => add({ devanagari: word, romanization: romanizeDevanagari(word) }));
  for (const beat of scene.beats) {
    for (const choice of beat.choices) {
      if (choice.correct) add({ devanagari: choice.hi, romanization: choice.latin, meaning: choice.en });
    }
  }
  return items.slice(0, limit);
}

function lessonSummary(scene: Scene, progress?: SceneProgress) {
  return {
    lessonId: scene.id,
    title: scene.title,
    learningObjective: scene.subtitle,
    category: scene.category,
    level: scene.level,
    setting: scene.place,
    progress: {
      completions: progress?.completions ?? 0,
      bestAccuracy: progress?.bestAccuracy ?? 0,
      resumeAtStep: progress?.lastBeatIndex ?? 0,
      totalSteps: scene.beats.length,
    },
  };
}

function findLessonForTopic(topic: string, snapshot: LiveToolSnapshot): Scene | undefined {
  const key = normalizeKey(topic);
  if (['active', 'current', 'active lesson', 'current lesson', 'lesson', 'this lesson'].includes(key)) {
    return activeLessonFor(snapshot.profile, snapshot.sceneProgress);
  }
  const exact = getScene(topic);
  if (exact) return exact;
  const words = key.split(' ').filter((word) => word.length > 2);
  let best: { scene: Scene; score: number } | undefined;
  for (const scene of scenes) {
    const haystack = normalizeKey(`${scene.id} ${scene.title} ${scene.subtitle} ${scene.category} ${scene.place}`);
    let score = haystack.includes(key) ? 10 : 0;
    for (const word of words) if (haystack.includes(word)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { scene, score };
  }
  return best?.scene;
}

function lookupMeanings(text: string, snapshot: LiveToolSnapshot) {
  const key = normalizeKey(text);
  const matches: { phrase: SavedPhrase; source: 'saved' | 'lesson' }[] = [];
  const seen = new Set<string>();
  const add = (phrase: SavedPhrase | undefined, source: 'saved' | 'lesson') => {
    if (!validSavedPhrase(phrase) || seen.has(phrase.hi)) return;
    seen.add(phrase.hi);
    matches.push({ phrase, source });
  };
  for (const phrase of snapshot.phrases) {
    if ([phrase.hi, phrase.latin, phrase.en].some((value) => normalizeKey(value) === key)) add(phrase, 'saved');
  }
  add(knownHindiDisplayPhrase(text), 'lesson');
  add(knownSavedPhrase(text), 'lesson');
  return matches.slice(0, 5);
}

function boundedOutput(result: ToolResult, maximumBytes: number) {
  let output = JSON.stringify(result);
  if (new TextEncoder().encode(output).byteLength > maximumBytes) {
    output = JSON.stringify({ error: 'output_too_large' });
  }
  return output;
}

export function createLiveToolExecutor(environment: LiveToolEnvironment): LiveToolExecutor {
  const maximumBytes = Math.max(64, environment.maxOutputBytes ?? MAX_TOOL_OUTPUT_BYTES);
  const handledCallIds = new Set<string>();
  const savedThisSession: SavedPhrase[] = [];
  const progressThisSession: { lessonId: string; title: string; outcome: string }[] = [];
  const controller = new AbortController();
  let queue: Promise<unknown> = Promise.resolve();
  let eventCount = 0;

  const tools: Record<LiveToolName, (raw: string) => Promise<ToolResult> | ToolResult> = {
    read_active_lesson(raw) {
      parseArguments(raw, {});
      const snapshot = environment.getSnapshot();
      const scene = activeLessonFor(snapshot.profile, snapshot.sceneProgress);
      if (!scene) return { lesson: null };
      return { lesson: { ...lessonSummary(scene, snapshot.sceneProgress[scene.id]), keyWords: lessonVocabulary(scene, 6) } };
    },
    load_topic_vocabulary(raw) {
      const { topic } = parseArguments(raw, { topic: { type: 'string', max: 120, required: true } });
      const snapshot = environment.getSnapshot();
      const scene = findLessonForTopic(topic as string, snapshot);
      if (!scene) return { status: 'not_found', topic };
      return { status: 'found', lessonId: scene.id, title: scene.title, vocabulary: lessonVocabulary(scene) };
    },
    lookup_contextual_meaning(raw) {
      const { text } = parseArguments(raw, { text: { type: 'string', max: 200, required: true }, context: { type: 'string', max: 500 } });
      const matches = lookupMeanings(text as string, environment.getSnapshot());
      if (!matches.length) return { status: 'not_found', text };
      return { status: 'found', text, matches: matches.map(({ phrase, source }) => ({ ...phraseView(phrase), source })) };
    },
    get_learner_progress(raw) {
      parseArguments(raw, {});
      const snapshot = environment.getSnapshot();
      const practiced = Object.entries(snapshot.sceneProgress)
        .filter(([, progress]) => progress.lastPracticedAt)
        .sort(([, a], [, b]) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''));
      return {
        learnerLevel: snapshot.profile.level,
        primaryGoal: snapshot.profile.primaryGoal,
        responseLanguage: snapshot.profile.responseLanguage,
        scriptPreference: snapshot.profile.scriptPreference,
        streakDays: snapshot.streak,
        practiceMinutesToday: Math.floor(snapshot.practiceSecondsToday / 60),
        livePracticeDoneToday: snapshot.liveDoneToday,
        lessonsCompleted: Object.values(snapshot.sceneProgress).filter((progress) => progress.completions > 0).length,
        savedPhraseCount: snapshot.phrases.length,
        phrasesDueForReview: snapshot.duePhraseCount,
        recentLessons: practiced.slice(0, 3).flatMap(([id, progress]) => {
          const scene = getScene(id);
          return scene ? [{ lessonId: id, title: scene.title, completions: progress.completions, bestAccuracy: progress.bestAccuracy }] : [];
        }),
      };
    },
    prepare_learning_feedback(raw) {
      const { learnerText, feedbackType } = parseArguments(raw, {
        learnerText: { type: 'string', max: 500, required: true },
        feedbackType: { type: 'enum', values: ['pronunciation', 'grammar'], required: true },
      });
      const reference = lookupMeanings(learnerText as string, environment.getSnapshot())[0];
      return {
        learnerText,
        feedbackType,
        ...(reference ? { reference: phraseView(reference.phrase) } : {}),
        guidance: feedbackType === 'pronunciation'
          ? 'Give one short, encouraging pronunciation tip for the most important sound, then invite one retry.'
          : 'Acknowledge the meaning, then give one short grammar correction with the corrected Hindi sentence.',
      };
    },
    async save_confirmed_phrase(raw) {
      const args = parseArguments(raw, {
        originalText: { type: 'string', max: 200, required: true },
        devanagari: { type: 'string', max: 200 },
        confirmed: { type: 'boolean', required: true },
      });
      if (args.confirmed !== true) return { error: 'confirmation_required' };
      if (savedThisSession.length >= MAX_SAVES_PER_SESSION) return { error: 'save_limit_reached' };
      const originalText = args.originalText as string;
      const devanagari = typeof args.devanagari === 'string' && hasDevanagari(args.devanagari) ? args.devanagari : undefined;
      const source = devanagari ?? originalText;
      const local = knownHindiDisplayPhrase(source) ?? knownSavedPhrase(source);
      let phrase: SavedPhrase | undefined = local && (!devanagari || normalizeKey(local.hi) === normalizeKey(devanagari)) ? local : undefined;
      if (!phrase) {
        try {
          phrase = await environment.preparePhrase({ originalText, ...(devanagari ? { devanagari } : {}) }, controller.signal);
        } catch {
          return { error: controller.signal.aborted ? 'session_ended' : 'phrase_preparation_failed' };
        }
      }
      if (controller.signal.aborted) return { error: 'session_ended' };
      if (!validSavedPhrase(phrase)) return { error: 'phrase_preparation_failed' };
      const cleaned = { hi: phrase.hi.trim(), latin: phrase.latin.trim(), en: phrase.en.trim() };
      const key = normalizeKey(cleaned.hi);
      const known = [...environment.getSnapshot().phrases, ...savedThisSession].some((saved) => normalizeKey(saved.hi) === key);
      if (known) return { status: 'already_saved', phrase: phraseView(cleaned) };
      environment.savePhrase(cleaned);
      savedThisSession.push(cleaned);
      return { status: 'saved', phrase: phraseView(cleaned) };
    },
    update_completed_progress(raw) {
      const args = parseArguments(raw, {
        lessonId: { type: 'string', max: 120, required: true },
        interactionCompleted: { type: 'boolean', required: true },
        outcome: { type: 'string', max: 200, required: true },
      });
      if (args.interactionCompleted !== true) return { error: 'interaction_not_completed' };
      const scene = getScene(args.lessonId as string);
      if (!scene) return { error: 'unknown_lesson' };
      if (progressThisSession.some((entry) => entry.lessonId === scene.id)) return { status: 'already_recorded', lessonId: scene.id };
      environment.recordLessonPractice(scene.id);
      progressThisSession.push({ lessonId: scene.id, title: scene.title, outcome: args.outcome as string });
      return { status: 'recorded', lessonId: scene.id, title: scene.title };
    },
    create_session_recap(raw) {
      parseArguments(raw, { sessionId: { type: 'string', max: 256, required: true } });
      const saved = savedThisSession.slice(-10).map(phraseView);
      const progress = progressThisSession.slice(-5);
      const parts = [
        saved.length ? `Saved ${saved.length} phrase${saved.length === 1 ? '' : 's'}.` : 'No phrases were saved.',
        progress.length ? `Recorded practice for ${progress.map((entry) => entry.title).join(', ')}.` : 'No lesson progress was recorded.',
      ];
      return { summary: parts.join(' '), savedPhrases: saved, progressUpdates: progress };
    },
  };

  async function execute(call: LiveFunctionCall): Promise<ToolResult> {
    if (!(LIVE_TOOL_NAMES as readonly string[]).includes(call.name)) return { error: 'unknown_tool' };
    if (handledCallIds.size > MAX_CALLS_PER_SESSION) return { error: 'tool_limit_reached' };
    try {
      return await tools[call.name as LiveToolName](call.arguments);
    } catch (cause) {
      return { error: cause instanceof ToolArgumentError ? cause.message : 'tool_failed' };
    }
  }

  return {
    handleEvent(event) {
      const call = parseCompletedFunctionCall(event);
      if (!call || controller.signal.aborted || handledCallIds.has(call.callId)) return null;
      handledCallIds.add(call.callId);
      // Run calls one at a time so saves and progress updates never race.
      const work = queue.then(async (): Promise<LiveClientEvent[]> => {
        const output = boundedOutput(await execute(call), maximumBytes);
        if (controller.signal.aborted) return [];
        eventCount += 1;
        return [
          { type: 'response.item.create', event_id: `bolo-tool-output-${eventCount}`, item: { type: 'function_call_output', call_id: call.callId, output } },
          { type: 'response.create', event_id: `bolo-tool-continue-${eventCount}` },
        ];
      });
      queue = work.catch(() => undefined);
      return work;
    },
    dispose() {
      controller.abort();
    },
  };
}

/** Builds the bounded mode and lesson context sent when a live session starts. */
export function buildLiveSessionContext(snapshot: LiveToolSnapshot): { mode: LiveMode; context: LiveCallContext } {
  const scene = activeLessonFor(snapshot.profile, snapshot.sceneProgress);
  const savedVocabulary = snapshot.phrases.slice(-4).reverse().map(phraseView);
  const lessonItems = scene ? lessonVocabulary(scene, 8) : [];
  const vocabulary = [...lessonItems, ...savedVocabulary.filter((item) => !lessonItems.some((lesson) => lesson.devanagari === item.devanagari))];
  return {
    mode: snapshot.profile.level === 'intermediate' ? 'conversation' : 'beginner',
    context: {
      learnerLevel: snapshot.profile.level,
      ...(scene ? { lessonId: scene.id, lessonTitle: scene.title, learningObjective: scene.subtitle } : {}),
      ...(vocabulary.length ? { relevantVocabulary: vocabulary.slice(0, 12) } : {}),
    },
  };
}
