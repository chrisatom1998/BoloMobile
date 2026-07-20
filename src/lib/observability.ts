import { dateKey } from '@/lib/storage';

const OBSERVABILITY_KEY = 'bolo-observability-v1';
const EVENT_NAMES = [
  'app_opened',
  'onboarding_completed',
  'scene_started',
  'scene_completed',
  'consent_viewed',
  'consent_accepted',
  'consent_declined',
  'voice_connection_succeeded',
  'voice_connection_failed',
  'ai_request_succeeded',
  'ai_request_failed',
  'review_completed',
  'retention_day_1',
  'retention_day_7',
  'runtime_error',
] as const;

export type ObservabilityEvent = (typeof EVENT_NAMES)[number];

type EventCounter = { count: number; totalDurationMs: number };
export type ObservabilitySnapshot = { days: Record<string, Partial<Record<ObservabilityEvent, EventCounter>>> };

let writeTail: Promise<void> = Promise.resolve();
const sessionEvents = new Set<ObservabilityEvent>();

type LocalStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

// Keep the native module lazy: diagnostics are also imported by pure UI tests and
// by the error boundary before the native bridge is guaranteed to be available.
function storage(): LocalStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@react-native-async-storage/async-storage') as { default: LocalStorage }).default;
}

function sanitize(value: unknown): ObservabilitySnapshot {
  if (!value || typeof value !== 'object') return { days: {} };
  const days = (value as ObservabilitySnapshot).days;
  if (!days || typeof days !== 'object') return { days: {} };
  const allowed = new Set<string>(EVENT_NAMES);
  const safeDays = Object.fromEntries(Object.entries(days).slice(-30).flatMap(([day, counters]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !counters || typeof counters !== 'object') return [];
    const safeCounters = Object.fromEntries(Object.entries(counters).flatMap(([event, counter]) => {
      if (!allowed.has(event) || !counter || typeof counter !== 'object') return [];
      const raw = counter as EventCounter;
      const count = Number.isFinite(raw.count) ? Math.max(0, Math.round(raw.count)) : 0;
      const totalDurationMs = Number.isFinite(raw.totalDurationMs) ? Math.max(0, Math.round(raw.totalDurationMs)) : 0;
      return [[event, { count, totalDurationMs }]];
    }));
    return [[day, safeCounters]];
  }));
  return { days: safeDays };
}

export async function getObservabilitySnapshot(): Promise<ObservabilitySnapshot> {
  const raw = await storage().getItem(OBSERVABILITY_KEY);
  try {
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { days: {} };
  }
}

export function observe(event: ObservabilityEvent, durationMs = 0) {
  if (!EVENT_NAMES.includes(event)) return;
  writeTail = writeTail.then(async () => {
    const current = await getObservabilitySnapshot();
    const day = dateKey();
    const previous = current.days[day]?.[event] ?? { count: 0, totalDurationMs: 0 };
    const todayCounters = {
      ...current.days[day],
      [event]: {
        count: previous.count + 1,
        totalDurationMs: previous.totalDurationMs + Math.max(0, Math.round(durationMs)),
      },
    };
    if (event === 'app_opened') {
      const firstDay = Object.keys(current.days).sort()[0] ?? day;
      const elapsedDays = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / 86_400_000);
      const retentionEvent = elapsedDays === 1 ? 'retention_day_1' : elapsedDays === 7 ? 'retention_day_7' : null;
      if (retentionEvent && !todayCounters[retentionEvent]) todayCounters[retentionEvent] = { count: 1, totalDurationMs: 0 };
    }
    const days = {
      ...current.days,
      [day]: todayCounters,
    };
    const boundedDays = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-30));
    await storage().setItem(OBSERVABILITY_KEY, JSON.stringify({ days: boundedDays }));
  }).catch(() => undefined);
}

export function observeOncePerSession(event: ObservabilityEvent) {
  if (sessionEvents.has(event)) return;
  sessionEvents.add(event);
  observe(event);
}

export async function clearObservability() {
  await writeTail;
  await storage().removeItem(OBSERVABILITY_KEY);
  writeTail = Promise.resolve();
  sessionEvents.clear();
}
