export type SavedPhrase = {
  hi: string;
  latin: string;
  en: string;
};

export type AshaResponseLanguage = 'en' | 'hi';
export type MotionPreference = 'system' | 'gentle' | 'lively' | 'reduced';

export type LearnerLevel = 'new' | 'beginner' | 'intermediate';
export type ScriptPreference = 'both' | 'devanagari' | 'latin';
export type LearningGoal = 'travel' | 'conversation' | 'family' | 'work';

export type LearnerProfile = {
  displayName?: string;
  phrasePlaybackRate?: number;
  completed: boolean;
  level: LearnerLevel;
  scriptPreference: ScriptPreference;
  primaryGoal: LearningGoal;
  responseLanguage: AshaResponseLanguage;
  microphoneTested: boolean;
};

export type SceneAttempt = {
  id: string;
  score: number;
  correct: number;
  total: number;
  weakPhrases: string[];
  seconds: number;
  answeredBeatIndex: number | null;
};

export type SceneProgress = {
  attempt?: SceneAttempt;
  lastCompletedAttemptId?: string;
  completions: number;
  bestScore: number;
  bestAccuracy: number;
  totalCorrect: number;
  totalAnswers: number;
  lastPracticedAt: string | null;
  lastBeatIndex: number;
  weakPhrases: string[];
};

export type PhraseReview = {
  mastery: number;
  intervalDays: number;
  dueAt: string;
  lastReviewedAt: string | null;
  correctReviews: number;
  totalReviews: number;
};

export type PracticeDay = {
  date: string;
  seconds: number;
  correct: number;
  answers: number;
  reviews: number;
};

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  notificationId: string | null;
  /** Set after the learner accepts or dismisses the first-lesson reminder offer. */
  offerAnswered?: boolean;
};

/** One Hindi phrase Asha teaches: canonical Devanagari, one romanization, the English meaning. */
export type StructuredPhrase = {
  devanagari: string;
  romanized: string;
  english: string;
};

/** "You said / Say" pair. `youSaid` has at least one script; `say` always has both. */
export type StructuredCorrection = {
  youSaid: { devanagari?: string; romanized?: string };
  say: { devanagari: string; romanized: string; english?: string };
  note?: string;
};

/**
 * Versioned structured chat reply (`replyFormat: 'structured-v1'`). The plain
 * `text` of the message stays authoritative for old builds, speech, and reports.
 */
export type StructuredReply = {
  version: 1;
  intro?: string;
  phrases?: StructuredPhrase[];
  corrections?: StructuredCorrection[];
  outro?: string;
};

export type ChatMessage = {
  id: string;
  role: 'you' | 'asha';
  text: string;
  language?: AshaResponseLanguage;
  /** Present only on Asha replies that arrived with a valid structured block. */
  structured?: StructuredReply;
};
