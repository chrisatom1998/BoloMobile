export type SavedPhrase = {
  hi: string;
  latin: string;
  en: string;
};

export type MiraResponseLanguage = 'en' | 'hi';

export type ChatMessage = {
  id: string;
  role: 'you' | 'mira';
  text: string;
  language?: MiraResponseLanguage;
};
