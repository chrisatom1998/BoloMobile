import type { SavedPhrase } from '@/state/app-state-types';

export type LessonPilot = {
  goal: string;
  takeaway: string;
  recallSituation: string;
  recallPrompt: string;
  model?: SavedPhrase;
  roleplay: {
    setting: string;
    turns: readonly [RoleplayTurn, RoleplayTurn];
  };
};

type RoleplayTurn = {
  hi: string;
  latin: string;
  en: string;
  prompt: string;
  answer: SavedPhrase | 'lesson';
};

const hello = { hi: 'नमस्ते।', latin: 'Namaste.', en: 'Hello.' };
const howAreYou = { hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?', en: 'How are you?' };
const yourName = { hi: 'आपका नाम क्या है?', latin: 'Aapka naam kya hai?', en: 'What is your name?' };
const pilotLessons: Partial<Record<string, LessonPilot>> = {
  'plan-essentials-01': {
    goal: 'Greet someone politely in Hindi.',
    takeaway: 'You practiced greeting someone politely in Hindi.',
    recallSituation: 'Your friend introduces you to their grandmother.',
    recallPrompt: 'Greet her politely in Hindi.',
    roleplay: {
      setting: 'Asha is your neighbor. You bump into her on the stairs.',
      turns: [
        { ...hello, prompt: 'Greet Asha back.', answer: 'lesson' },
        { ...howAreYou, prompt: 'Try saying you’re well.', answer: { hi: 'मैं ठीक हूँ।', latin: 'Main theek hoon.', en: 'I am well.' } },
      ],
    },
  },
  'plan-essentials-02': {
    goal: 'Introduce yourself by name in Hindi.',
    takeaway: 'You practiced introducing yourself by name in Hindi.',
    recallSituation: 'You arrive at a class and the teacher asks your name.',
    recallPrompt: 'Introduce yourself in Hindi.',
    model: { hi: 'मेरा नाम ... है।', latin: 'Mera naam ... hai.', en: 'My name is ...' },
    roleplay: {
      setting: 'It’s your first day in class. Asha is the teacher.',
      turns: [
        { ...hello, prompt: 'Say hello to Asha.', answer: hello },
        { ...yourName, prompt: 'Tell Asha your name.', answer: 'lesson' },
      ],
    },
  },
};

export function getLessonPilot(sceneId: string) {
  return pilotLessons[sceneId];
}

/** Fills the example with the learner's own name, or a neutral stand-in when none is saved. Names stay as typed. */
export function personalizeModel(model: SavedPhrase, name?: string): SavedPhrase {
  const filled = name?.trim() || 'Sam';
  const fill = (text: string) => text.replace(/\.\.\.|…/gu, () => filled);
  return { hi: fill(model.hi), latin: fill(model.latin), en: fill(model.en) };
}
