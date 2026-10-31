import { lessonPlans } from '../src/data/lesson-plans';
import { completedLessonCount } from '../src/lib/learning';
import { defaultSceneProgress } from '../src/lib/storage';

describe('completedLessonCount', () => {
  it('counts only lessons that sit in a lesson plan, like the plan rows do', () => {
    const [first = '', second = ''] = lessonPlans[0]?.lessonIds ?? [];
    const done = { ...defaultSceneProgress(), completions: 1 };
    expect(completedLessonCount({ [first]: done, [second]: defaultSceneProgress(), chai: done, gone: done })).toBe(1);
  });
});
