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
};

export type ChatMessage = {
  id: string;
  role: 'you' | 'asha';
  text: string;
  language?: AshaResponseLanguage;
};
