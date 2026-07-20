const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
    setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  },
}));

import { clearObservability, getObservabilitySnapshot, observe } from '../src/lib/observability';

describe('privacy-preserving observability', () => {
  beforeEach(async () => {
    mockStore.clear();
    await clearObservability();
  });

  it('stores only allow-listed counters and aggregate durations', async () => {
    observe('ai_request_succeeded', 123.6);
    observe('scene_completed');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshot = await getObservabilitySnapshot();
    const counters = Object.values(snapshot.days)[0];
    expect(counters.ai_request_succeeded).toEqual({ count: 1, totalDurationMs: 124 });
    expect(counters.scene_completed).toEqual({ count: 1, totalDurationMs: 0 });
    expect(JSON.stringify(snapshot)).not.toMatch(/message|transcript|audio|phrase|client/i);
  });

  it('deletes the local diagnostics snapshot', async () => {
    observe('app_opened');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearObservability();
    expect(await getObservabilitySnapshot()).toEqual({ days: {} });
  });
});
