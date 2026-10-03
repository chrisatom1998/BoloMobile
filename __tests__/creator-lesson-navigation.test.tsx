import { fireEvent, render } from '@testing-library/react-native';
import { getScene, scenes } from '../src/data/scenes';
import { lessonPlans } from '../src/data/lesson-plans';
import { offlineHindiAudio } from '../src/data/offline-hindi-audio';
import { creatorLessons } from '../src/data/creator-lessons';

const mockPush = jest.fn();
let mockPlanId: string | undefined = 'creator';
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [require('./fixtures/creator-lesson.json')] }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ planId: mockPlanId }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => false, push: mockPush, replace: jest.fn() }),
}));
jest.mock('@/state/app-state', () => ({ useAppState: () => ({ sceneProgress: {} }) }));
jest.mock('@/components/journal-chrome', () => {
  const React = require('react') as typeof import('react');
  const { Text, View } = require('react-native') as typeof import('react-native');
  return {
    JournalDisplay: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    JournalKicker: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    JournalMotif: () => React.createElement(View),
  };
});
import LessonPlansScreen from '../src/app/lesson-plans';

describe('creator lesson integration', () => {
  beforeEach(() => { mockPush.mockClear(); mockPlanId = 'creator'; });

  it('keeps built-in lessons and registers imported scenes once with complete offline audio', () => {
    expect(scenes.filter(s => !s.id.startsWith('plan-creator-'))).toHaveLength(130);
    expect(new Set(scenes.map(s => s.id)).size).toBe(scenes.length);
    const plan = lessonPlans.find(p => p.id === 'creator')!;
    expect(plan.lessonIds).toEqual(creatorLessons.map(s => s.id));
    for (const lesson of creatorLessons) {
      expect(getScene(lesson.id)).toEqual(lesson);
      const lines = [...lesson.words, ...lesson.beats.flatMap(b => [b.npc, ...b.choices.flatMap(c => [c.hi, c.reply])])];
      for (const line of lines) expect(offlineHindiAudio[line]).toBeDefined();
      for (const beat of lesson.beats) {
        expect(beat.choices.filter(c => c.correct)).toHaveLength(1);
        expect(new Set(beat.choices.map(c => c.hi)).size).toBe(3);
      }
    }
  });

  it('shows the creator plan in the catalog with updated counts', async () => {
    mockPlanId = undefined;
    const view = await render(<LessonPlansScreen />);
    expect(view.getByText('One path, 101 small wins.')).toBeTruthy();
    expect(view.getByLabelText('11 ordered lesson plans')).toBeTruthy();
    await fireEvent.press(view.getByTestId('lesson-plan-creator'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/lesson-plans', params: { planId: 'creator' } });
  });

  it('opens the imported lesson through the normal Bolo lesson screen', async () => {
    const view = await render(<LessonPlansScreen />);
    expect(view.getByText('My created lessons')).toBeTruthy();
    expect(view.getByText('0/1 lessons complete')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Creator test lesson, lesson 1 of 1, Next lesson'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-creator-test-fixture-01' } });
  });
});
