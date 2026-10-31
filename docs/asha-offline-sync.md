# Spec: offline capture and sync for Asha voice sessions

Status: Draft, for review by Chris
Author: Agent Desk (Grok Bot)
Date: 2026-10-31
Scope: BoloMobile app (`src/`); local session storage and retry queue only

## Summary

Asha live voice cannot work offline. Every session needs a WebRTC SDP exchange through the trusted Live server and then streams audio to and from GPT-Live. This spec does not change that. It covers what the app can keep, queue, and send later when the network is missing or drops partway through a session.

Today a session's transcript lives only in the shared `chatHistory` key, which holds the 100 newest messages. That history is wiped when the next live session connects, and the app keeps no record that a session happened. The proposal:

1. Add an on-device **Asha session log**. Each session becomes a durable record with its metadata, its final transcript rows, and what it changed through tools. The log is written as the session runs, so a dropped connection or a killed app still leaves the last successfully saved rows marked "interrupted" (within the limits below).
2. Add a small **sync outbox**. Network-dependent follow-ups that fail while offline, starting with "Report this reply", are queued and retried with backoff when the app is active and Bolo's API responds again.
3. Include a **Last session** screen in the first build. "Sync" means safe local session storage plus retries of failed follow-ups; transcripts are not uploaded to a session-storage server.

## Current behavior

Verified against the source in this PR working tree. API code lives in `src/services/bolo-api.ts`; there is no `src/lib/bolo-api.ts`.

### How a session starts

- `src/hooks/use-realtime-conversation.ts` `connect()` runs `onConnectionStart`, checks for a physical device on iOS, requests microphone permission (`expo-audio`), stops TTS, sets the realtime audio mode, and then calls `createRealtimePeerSession` (`src/lib/realtime-peer.ts`). Its `exchangeSdp` callback calls `createLiveCall`.
- `createLiveCall` in `src/services/bolo-api.ts` POSTs to `${BOLO_LIVE_API_URL}/api/live-call` with `{ clientId, offerSdp, responseLanguage, history?, mode?, context?, clientTools? }`. The response is validated as `{ answerSdp, sessionId }`. Only `answerSdp` is used (`exchangeSdp` returns `call.answerSdp`). **The server `sessionId` is thrown away** and is not stored anywhere in `src/`.
- `getBoloLiveApiUrl()` reads `extra.boloLiveApiUrl`, which `app.config.js` builds from `BOLO_LIVE_API_URL` (HTTPS only, no credentials, no query or fragment). If it is missing, the call throws `BoloApiError('Live voice isn’t available right now. You can still type to Asha.')`.
- `post()` in `bolo-api.ts` has a 30 s timeout. Network failures turn into `BoloApiError('Bolo is unavailable right now. Check your connection and try again.')` with no `status`, and timeouts into `'The request timed out…'`. There is no connectivity check before a request. The repo does not depend on `@react-native-community/netinfo` (`package.json`).
- After the transport is up, the hook waits up to `START_TIMEOUT_MS` (15 s) for `session.started` and then sets status to `ready`.
- `useAshaLiveSession()` (`src/hooks/use-asha-live-session.ts`) supplies the session `mode`, lesson `context` (`buildLiveSessionContext` in `src/lib/live-tools.ts`), and a client tool environment.
- When a new session starts, the old conversation is wiped. On the Asha screen, `startNewConversation` → `resetChat()` → `clearChatHistory()` (`src/app/(tabs)/live.tsx`). In the floating host, `AshaVoiceSessionHost` calls `appRef.current.clearChatHistory()` on the `connecting → ready` transition (`src/state/asha-voice-session.tsx`).

### Streaming and transcripts

- Server events arrive on the WebRTC data channel. `session.input_transcript.delta` and `session.output_transcript.delta` go into `createLiveTranscriptStore` (`src/lib/live-transcripts.ts`). It groups timestamped fragments into revisable rows (`{ id, speaker, text, startMs, endMs, fragments }`), dedupes by `event_id`, and keeps the last 100 rows. Row ids look like `live-${Date.now()}-${lifecycle}-${n}`.
- Each update produces a full snapshot. `recordLiveSnapshot` (`live.tsx`) or `persistSnapshot` (`asha-voice-session.tsx`) converts the rows to `ChatMessage`s and calls `replaceLiveChatSnapshot(previousIds, messages)` (`src/state/app-state.tsx`). That swaps out the previous snapshot's rows in `chatHistory` and coalesces writes so at most one AsyncStorage write is queued at a time.
- The transcript in storage is the same `chatHistory` array that typed coaching uses (`storageKeys.chatHistory = 'bolo-chat-history'`, `MAX_CHAT_HISTORY_MESSAGES = 100`, `MAX_CHAT_MESSAGE_CHARACTERS = 2_400` in `src/lib/storage.ts`). It has no session id, timestamps, or end reason.
- The session ends through `disconnect()`, which can be triggered by the user ending the call, the app leaving the foreground (`AppState` listener), a change to `clientId` or `responseLanguage`, withdrawn consent, a `session.closed` event, the peer's `onClose`, or a mic command timeout. `disconnect()` sends `session.close` on a best-effort basis and then tears everything down. Nothing records why the session ended.

### Progress, scores, and tool side effects

- Practice credit: the first learner row in a session calls `markLiveTurn()` (`live.tsx`, `asha-voice-session.tsx`). That sets `practice.liveDone`, updates `practiceHistory`, and records the streak day (`app-state.tsx`). This is local only.
- Live sessions produce **no scores**. Scores (`SceneAttempt.score`, `bestAccuracy`) only come from scripted lessons (`markSceneComplete` in `app-state.tsx`).
- Client tools (`src/lib/live-tools.ts`):
  - `save_confirmed_phrase` may call `preparePhrase` → `prepareSavedPhraseFromText` → `POST /api/prepare-saved-phrase` on the Bolo API, then `togglePhrase`.
  - `update_completed_progress` calls `recordLessonPractice`, which runs `checkpointScene` and `markLiveTurn` locally.
  - `create_session_recap` builds a summary from the in-memory `savedThisSession` and `progressThisSession`. That summary is not persisted.
- Every state change goes through `commit()` → `persistState()` → `AsyncStorage.multiSet`, serialized by `enqueuePersistence` (`app-state.tsx`). These are local-first writes that complete offline.

### Server side

- `backend/live.ts` and `backend/README.md` hold a reference for the Live server that is not deployed. It exposes `POST /api/live-call` and `GET /api/live-status` and pins `store: false` on the Live session. **No server endpoint stores, lists, or syncs sessions or transcripts.** The README says failures never log transcripts.
- Chris owns the main Bolo API (`getBoloApiUrl()`, fallback `https://api-v2.appdeploy.ai/app/74e39779183cf78fed`), which serves `/api/mobile-chat`, `/api/prepare-saved-phrase`, `/api/phrase-audio`, `/api/voice-coach`, `/api/report-message`, and `/api/delete-mobile-data` (`bolo-api.ts`). None of these take an idempotency key.

### Existing offline support and persistence

- Bundled lesson audio (`src/data/offline-hindi-audio.ts`, generated by `scripts/generate-offline-hindi-audio.mjs`) plays through `src/lib/offline-voice-player.ts` with no network or consent. `.maestro/flows/01-first-launch-offline.yaml` covers an offline lesson using `setAirplaneMode`.
- Persistence libraries already in use:
  - `@react-native-async-storage/async-storage` for all app state (`app-state.tsx`) and diagnostics (`src/lib/observability.ts`, key `bolo-observability-v1`).
  - `expo-file-system` for the progress backup file (`src/lib/progress-backup-file.ts`), the AI voice cache (`src/lib/ai-voice-player.ts`), and recordings (`src/lib/recording-file.ts`).
  - `expo-crypto` `randomUUID` for ids (`storage.ts`).
- Progress backup (`src/lib/progress-backup.ts`) intentionally leaves out chat history.
- Privacy copy (`src/app/privacy.tsx`) says up to 100 recent typed and transcribed Asha messages are stored unencrypted on the device. It says live voice creates no recording file, and that "Delete Bolo data" clears local data and asks the server to delete reports.
- Documentation convention: flat kebab-case Markdown in `docs/` (`docs/voice-acceptance.md`, `docs/ci-release-runbook.md`). This spec follows it.

## Goals

1. Preserve session transcripts across connection drops, backgrounding, app termination, and new sessions, within the retention and save limits below.
2. Keep a durable record of each session: start and end time, end reason, language and mode, lesson, turn count, and tool outcomes. Show the most recent saved record on Last session.
3. Queue network follow-ups that fail while offline and retry them safely, starting with message reports.
4. Make network state visible in Asha's UI: offline before starting, interrupted during a session, and the sync status of queued work.
5. Keep the current privacy posture. Store no audio, upload no session transcripts, and make Clear chat and Delete Bolo data cover the new data.

## Non-goals

- Offline live voice, on-device speech recognition, or offline AI replies. Live needs the network (`createLiveCall` plus WebRTC).
- Resuming a dropped Live session. The server pins `store: false`, there is no resume API in `backend/live.ts`, and `disconnect()` always starts a new session.
- Storing or uploading microphone or Asha audio.
- Server storage/upload of session transcripts, upload consent, and a Past sessions list: not planned for this build.
- Queuing typed coaching (`/api/mobile-chat`) offline. That is a separate feature with its own UX (a reply arrives later). It is listed under Open questions.
- Sync across devices or accounts. Bolo has no accounts, only a random per-install `clientId` (`sanitizeClientId`).
- Changing the Expo version pins described in `AGENTS.md`.

## Proposed design

### 1. Data model (`src/lib/asha-session-log.ts`, new)

```ts
export type AshaSessionEndReason =
  | 'user_ended'        // End control / floating bubble end
  | 'backgrounded'      // AppState left foreground
  | 'connection_lost'   // peer onClose / session.closed after live
  | 'start_failed'      // never reached 'ready' (offline, timeout, server error)
  | 'data_deleted'      // Delete Bolo data ends the call; never re-persist this session
  | 'config_changed'    // clientId / responseLanguage / consent change
  | 'app_terminated';   // found still 'active' at next hydrate

export type AshaSessionTranscriptRow = {
  id: string;               // live transcript row id
  speaker: 'you' | 'asha';
  text: string;             // final text only; fragments are not stored
  startMs: number;          // relative to the Live session
  endMs: number;
};

export type AshaSessionRecord = {
  schema: 1;
  id: string;                      // local UUID (expo-crypto randomUUID)
  serverSessionId?: string;        // from LiveCallResponse.sessionId (currently discarded)
  startedAt: string;               // ISO, when connect() began
  connectedAt?: string;            // ISO, when status became 'ready'
  endedAt?: string;
  contentClearedAt?: string;        // explicit deletion; distinguish from no saved session
  state: 'active' | 'ended' | 'interrupted';
  endReason?: AshaSessionEndReason;
  responseLanguage: 'en' | 'hi';
  mode?: LiveMode;
  lessonId?: string;
  rows: AshaSessionTranscriptRow[]; // capped (see limits)
  learnerTurns: number;
  savedPhrases: string[];          // Devanagari `hi` of phrases saved via tool
  lessonsPracticed: string[];      // lessonIds from update_completed_progress
};
```

Limits, in the same style as `storage.ts`:
- Keep at most 3 stored sessions by default, oldest dropped first, with a maximum age of 30 days: the latest shown on Last session plus up to 2 older records for crash recovery, hidden from the UI. Persist a record **only on its first transcript row**, never merely on `ready`. Empty connecting, `start_failed`, and ready-then-dropped attempts remain in memory and are discarded at finalize; they never enter the index or evict an older session.
- Store at most 200 rows per session, each capped at `MAX_CHAT_MESSAGE_CHARACTERS`.
- Records that would serialize to more than 256 KB are trimmed by dropping the oldest rows.

The exact numbers are open for Chris to choose.

Validate on read with a `sanitizeAshaSession(raw: string | null)` that matches the existing `sanitize*` functions. Drop invalid records instead of throwing.

### 2. Local storage

- Store each record under `bolo-asha-session-v1:<id>`, plus a small `bolo-asha-session-index-v1` containing ids and ordering metadata only. Never serialize the collection into one value: ~5 MB would exceed Android's roughly 2 MB SQLite CursorWindow read limit and rewrite all sessions on each save. Each record remains capped at 256 KB.
- Keep these keys outside `PersistedState` and progress backups; a session module owns a serialized, coalesced write queue. During a call, transcript/status updates write **only the active session key**. Update the index only on insertion, eviction, expiry, or deletion.
- On `connecting`, create an in-memory active record. On its first row, write the record before publishing its index entry, then enforce retention. On every snapshot, **merge by row id**: append new rows and revise existing rows, preserving earlier rows absent from the sliding 100-row snapshot. Apply the 200-row/256 KB caps after merging; never replace the record's rows with the snapshot.
- Coalesce deltas using the newest state, with a dirty save at least every 2 s; persist stored records on status changes and finalize with `endedAt` and `endReason` (`ended` for `user_ended`, otherwise `interrupted`). Surface storage failures. Abrupt termination can lose updates since the last successful write.
- At hydrate, validate records/index, remove missing or invalid entries, reconcile orphan per-session keys after a partial insertion, and clean up expired/evicted records. Recover any stored `active` record as `interrupted` / `app_terminated`. **Await `recoverActive` and its persistence before any `connect()` can create a new active record**, in both screen and floating hosts.
- `chatHistory` remains the current-conversation view. Finalize the previous session before an automatic new-session reset. Neither `resetChat()` nor shared `clearChatHistory()` may delete saved session content: `startNewConversation` and the floating host both use these paths automatically. Add a separate explicit-delete operation called only by the learner's Clear action (see Privacy).

### 3. Capture hooks (minimal changes to existing code)

- `use-realtime-conversation.ts`:
  - Add an optional `onSessionEvent` callback that emits `{ type: 'starting' | 'ready' | 'ended', reason?, serverSessionId? }`.
  - Return `call.sessionId` from `exchangeSdp` alongside the SDP, or capture it in a closure.
  - Pass a reason into `disconnect(reason)` from each call site that already exists: user, AppState, `onClose`, `session.closed`, mic timeout, config effects.
- `asha-voice-session.tsx` and `live.tsx`: send snapshots to the session log next to the existing `replaceLiveChatSnapshot` calls. Only one owner should write per session. Use the same `listenersRef` ownership rule that already decides which side persists `chatHistory`.
- `use-asha-live-session.ts` `createAshaToolEnvironment`: after a successful `savePhrase` or `recordLessonPractice`, also append to the active record's `savedPhrases` or `lessonsPracticed`. Progress itself is already applied locally and needs no sync.

### 4. Sync outbox (`src/lib/sync-outbox.ts`, new)

Store it in a separate AsyncStorage key, `bolo-sync-outbox-v1`.

```ts
type OutboxOp = {
  kind: 'report_message';
  sessionId?: string; // local association for Last session; never sent
  payload: { message: string; reason: ReportReason };
};

type OutboxEntry = OutboxOp & {
  id: string;            // local UUID; not sent by default
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;    // safe, user-facing text only
  state: 'pending' | 'in_flight' | 'failed';
};
```

- Enqueue: when `reportGeneratedMessage` fails with a **transient** error (see classification), the report is queued and the UI says "Report saved. It will be sent when you're back online." Today it only shows "Could not send report" (`live.tsx`).
- `clientId` is not stored per entry. Before each send, check consent, deletion state, and the flush generation, then read the current clientId and send without an intervening await. `clearAllData` synchronously bumps the generation and blocks flushing before any await or id replacement; abort an in-flight request best-effort, clear the queue through its serialized writer, and discard stale completions after every await. A stale loop must never send the next pre-deletion report under the new id or restore deleted entries. Already dispatched requests cannot be recalled. Consent withdrawal uses the same outbox invalidation mechanism. Clear chat invalidates capture writes only; it preserves queued reports and their retries under existing consent.
- Flush triggers, which need no new dependency:
  1. App hydrate.
  2. `AppState` → `active`.
  3. Any successful `post()` to the Bolo API, through a small hook in `bolo-api.ts` that tells the outbox "network is back".
  4. A foreground-only timer that fires at the next `nextAttemptAt`.

  Whether to add NetInfo for faster flushing is an open question.
- Concurrency: only one flush runs at a time, entries go in FIFO order, and each entry is marked `in_flight` before the request. At hydrate, any `in_flight` entry goes back to `pending`.

### 5. Retry, backoff, and error classification

- Add a required typed `kind` to `BoloApiError` in `src/services/bolo-api.ts`: `'network' | 'timeout' | 'aborted' | 'config' | 'invalid_payload' | 'http'`. Preserve user-facing messages and optional HTTP status, but never classify by message text or missing status.
- Map `post()` failures: fetch/transport failure → `network`; internal 30 s timer abort → `timeout`; caller abort (including pre-abort) → `aborted`; non-2xx → `http` with status; malformed JSON or failed response validation on a successful response → `invalid_payload` (even with a 2xx status). Preserve HTTP classification for non-2xx even if its body is malformed. Missing/invalid Live URL → `config`; rejected client payload/local validation → `invalid_payload`. Keep these kinds through hook error handling.
- Retry only `network`, `timeout`, or `http` with 408, 429, or 5xx. Only `network`/`timeout` justify offline-before-start copy. Caller cancellation, configuration, invalid payloads, microphone/startup/peer errors are not evidence of offline internet and must keep their appropriate copy.
- Other HTTP errors and invalid server responses are permanent (no automatic retry; an existing queued entry becomes `failed`). Local validation, configuration, and caller cancellation never enqueue; cancellation from deletion/withdrawal follows the discard rules below.
- Backoff: `delay = min(15 min, 2 s × 2^attempts)` with full jitter. Give up after 8 attempts or 7 days, whichever comes first, and mark the entry `failed`. Failed entries stay visible, with Retry and Discard actions, until the learner acts or the retention window passes.
- A 429 with `Retry-After` is honored. `post()` does not expose headers today, so this needs a small change in `bolo-api.ts`. Otherwise 429 uses the normal backoff.

### 6. Conflict rules

- The device is the source of truth. Active records accept row-id revisions and tool outcomes; finalized records are immutable except explicit content deletion and retention cleanup. There is no server reconciliation.
- Progress, saved phrases, and streaks are already applied locally (`commit()`); never replay them from the outbox.
- Reports have no server idempotency today: a retry after a lost response can create duplicates. **Do not send `reportId` by default.** Chris must first confirm `/api/report-message` accepts that extra field; a strict 4xx would otherwise permanently break reports. Acceptance alone does not establish deduplication. Only enable it after confirmation and test the agreed contract.

### 7. Server/API changes

No server changes are required. Use the existing report payload. Chris owns `api-v2.appdeploy.ai`; any future report-id acceptance/deduplication change is his API decision. No session upload endpoint or upload consent machinery is planned.

### 8. Privacy of audio and transcripts

- **No audio recording file is stored.** Microphone audio streams over WebRTC, and the privacy copy says "Live voice does not create a recording file". This design keeps it that way.
- Transcripts are stored unencrypted in AsyncStorage, just like `chatHistory` today. Changing the on-device retention from "100 recent messages" to "up to 3 sessions, each for at most 30 days" must update the "Data stored on your device" copy in `src/app/privacy.tsx`: "Last session shows your latest conversation. Up to two older conversations are kept briefly for crash recovery but hidden. All saved conversations expire within 30 days."
- **Clear chat** calls a separate explicit-delete operation from `clearSavedChat` in `live.tsx`, never from shared `resetChat` / `clearChatHistory`. It clears current `chatHistory` and all session `rows`, `savedPhrases`, and `lessonsPracticed`, while preserving all queued reports (including associated and unassociated reports) and their retry state. These are learner-initiated outbound data under existing AI consent; they still respect consent withdrawal and Delete Bolo data. In session records, retain only minimal metadata, not learner text; the separately saved phrase library and earned progress remain. Apply the same action from Last session. Disable Clear during a live call, drain/invalidate pending capture writes and tool callbacks, and prevent late callbacks from restoring deleted content. Show a failure if deletion cannot persist.
- **Delete Bolo data** (`clearAllData`) first ends any running live call with `disconnect('data_deleted')`, then invalidates flush and capture generations before awaits/id rotation and removes the index, every per-session key (including orphans), and `bolo-sync-outbox-v1`, serialized against pending writes. The in-progress session must not be re-persisted by disconnect finalization, late transcript rows, tool callbacks, or pending writes, including callbacks after the generation bump. Stale work cannot recreate deleted data. Keep the existing server-report deletion request behavior.
- **Withdrawing AI consent** invalidates/aborts flushing and drops **all network-bound queued operations**, including pending, in-flight, and failed reports. Keep local transcripts available offline. Re-granting consent must not resurrect or automatically send withdrawn reports. Persist removal and surface failures; flushing remains blocked until cleanup succeeds.
- Progress backup (`progress-backup.ts`) keeps excluding chat, sessions, and outbox data. Update privacy copy for local retention, queued report text and retries under existing AI consent; no upload opt-in or upload-specific consent version bump is needed.
- The outbox never stores `clientId`, SDP, or server error bodies. `lastError` holds only the app's own user-facing message.

## UX states

| State | Trigger | What the learner sees |
|---|---|---|
| Offline, before start | `createLiveCall` fails while `connecting` because `BoloApiError.kind` is `network` or `timeout` in [Retry, backoff, and error classification](#5-retry-backoff-and-error-classification) | A clear message, "Live voice needs an internet connection. Lessons and saved phrases work offline.", with a link to today's lesson. A missing Live URL and a rejected client payload keep today's copy (`'Live voice isn’t available right now…'` and `'Bolo could not start this live voice session.'`). |
| Connecting | status `connecting` | No change. |
| Live | `ready` / `recording` / `responding` | No change. The transcript saves continuously in the background. |
| Interrupted | `endReason` is `connection_lost` or `backgrounded` | The transcript stays on screen with a small banner: "Connection lost. This conversation is saved on your device." Start again gives a new session. |
| Last session | “Last session” link on the Asha screen, available offline | Opens the most recent saved record, ordered by start time; no session list. Show date, duration, language/lesson, “In progress”, “Completed” (`user_ended`), or “Interrupted” with end reason; transcript rows in order; “Saved on this device”. Other abnormal finalizations, including failures with rows, are interrupted. |
| Queued work | Outbox has entries | Last session shows its associated pending/failed reports, “Waiting to send”, next retry, and Retry / Discard; after success show “Report received”. Asha also exposes unassociated report retries. |

Last session has a “No saved session yet” empty state with a Start voice action (voice still requires internet). Empty attempts do not replace the previous saved session. After Clear, retained metadata shows “Transcript cleared” and no tool content; associated pending/failed report retries remain available. It does not fall back to an older transcript. Its confirmed Clear chat action uses the same all-chat explicit deletion described in Privacy, with confirmation copy: "Clear all saved chat transcripts? Saved phrases and progress will remain. Pending reports will still be sent under your existing AI consent." Disable it during a call. Delete Bolo data returns the screen to the empty state. Retention expiry can also produce the empty state.

Every new string needs accessible labels in the existing style (see `__tests__/realtime-voice-accessibility.test.tsx`).

## Rollout and migration

1. Add a feature flag constant, `ashaSessionLogEnabled` in `src/lib/asha-session-log.ts`, following `floatingAshaEnabled` in `src/lib/floating-asha.ts`. Ship it on in preview builds first.
2. No migration of existing data. `bolo-chat-history` keeps its format and meaning. The first transcript row after upgrade creates a per-session key and index entry. Existing `chatHistory` rows are not imported because they have no session boundaries. If Chris wants them kept, they can be imported once as one `legacy` record (open question).
3. Versioned key namespaces (`v1`) and a `schema` field let a later format change migrate or drop records safely through the sanitizer.
4. Update the privacy copy in the same release that turns the flag on; Last session ships in that first build.
5. Add a `CHANGELOG.md` entry under Unreleased → Added.
6. Run a device check following `docs/voice-acceptance.md`: airplane mode during a call, background during a call, force-quit during a call. Then confirm the session is saved as interrupted after relaunch.

## Testing plan

Use Jest (`jest-expo` preset, `npm test` = `jest --runInBand`) and follow the existing patterns:

- **Pure unit tests:**
  - `__tests__/asha-session-log.test.ts`: create, update, and finalize; row capping and trimming; the default 3-session and 30-day limits (a fourth stored session evicts the oldest; only the latest is shown, with up to 2 hidden recovery records), including that empty connecting, `start_failed`, and ready-then-dropped attempts are not stored and never evict an older session; >100 rows across sliding snapshots retain early turns and revise existing ids without duplicates; sanitizer rejection of malformed or oversized records; `active` → `interrupted` at hydrate.
  - `__tests__/sync-outbox.test.ts`: FIFO order; error classification against typed `BoloApiError.kind` from `src/services/bolo-api.ts` (network and timeout are transient; cancellation, a missing Live URL, and a rejected live-call payload are not); the backoff schedule with `jest.useFakeTimers()` and seeded jitter; the attempt and age caps; `in_flight` recovery; a single flush at a time.
  - Style follows `__tests__/live-transcripts.test.ts` and `__tests__/live-tools.test.ts`.
- **API errors:** test every `post()` failure path against its kind: transport, timer timeout, caller/pre-abort, non-2xx with valid or malformed body, malformed successful JSON, and response validation. Also pin Live URL configuration and client validation kinds, and verify copy changes do not affect retry/offline classification. Verify report requests omit `reportId` until Chris confirms support.
- **AsyncStorage:** verify updates write only the active session key, index changes only on membership/order changes, and partial insertion/eviction recovery repairs missing entries and orphans. Mock it per file with `jest.mock('@react-native-async-storage/async-storage', …)`, as in `__tests__/app-state-persistence.test.ts` and `__tests__/app-state-clear-data.test.tsx`. Cover write failures with the user-visible alert path, like `reportPersistenceFailure`.
- **Hook and integration tests:**
  - Extend `__tests__/realtime-voice-shared-session.test.tsx`, `__tests__/floating-asha-session.test.tsx`, and `__tests__/live-runtime-regressions.test.tsx`. A session that receives transcript deltas and then gets `onClose` must leave an `interrupted` record whose rows match the accumulated row-id merge within caps. A new connection must finalize the previous record before `clearChatHistory`. Only one owner writes per session. Delay recovery and attempt an immediate connect in both hosts: no new active record exists before `recoverActive` finishes, and the new session is not marked `app_terminated`.
  - `endReason` mapping gets one test per `disconnect` trigger.
  - Extend `__tests__/app-state-clear-data.test.tsx` so Delete Bolo data removes the index, all per-session keys including orphans, and outbox. Delete while flush is awaiting the first response: no second report sends with the rotated clientId and late completion cannot recreate data. Withdraw consent with pending/in-flight/failed reports, re-grant, and verify none send. Delete during a live call must disconnect with `data_deleted` before generation invalidation/deletion; delayed transcript rows, disconnect finalization, tool callbacks, and pending writes must not re-persist the in-progress session. Explicit Clear removes rows/tool content; late writes cannot restore it. Clear preserves associated and unassociated pending/in-flight/failed reports and their retry state; eligible pending reports still send under existing consent. Subsequent consent withdrawal or Delete Bolo data removes them. Screen and floating new-session resets preserve previous session rows and tool content.
  - Extend `__tests__/live-tools.test.ts` so tool saves and progress are recorded on the active session.
- **Last session UI:** entry point, latest-record ordering, completed/interrupted/active status, ordered transcript, associated retries, no-session empty state, metadata-only cleared state, Clear confirmation (including pending reports still being sent)/failure, preserved retries after Clear, hidden older recovery records, and Delete Bolo data reset.
- **Report queue UI:** extend `__tests__/live-runtime-regressions.test.tsx`, which already renders the Asha screen and exercises `reportGeneratedMessage`. Keep tests in `__tests__/`, because `jest.config.cjs` ignores test files under `src/app/`.
- **Coverage:** stay above the thresholds in `jest.config.cjs` (statements 86, branches 76, functions 83, lines 90).
- **E2E (optional):** a Maestro flow modeled on `01-first-launch-offline.yaml` that turns on airplane mode, opens Asha, and checks the offline-before-start message. Live calls can't run on Simulator (`06-simulator-voice-unsupported.yaml`), so interrupted-session checks stay a manual device step.
- Run `npm run verify` before the PR, with `BOLO_LIVE_API_URL=https://live.example.test` per `AGENTS.md`.

## Risks

- **AsyncStorage size.** Android's AsyncStorage has a default total size cap, and all app state shares it. Even the default 3 sessions of 200 rows each add storage pressure. Mitigations: per-record trimming, small index and per-session values (avoiding CursorWindow reads of the whole collection), a total-bytes check, and a fallback to `expo-file-system` JSON files if limits are hit.
- **Write amplification during calls.** Snapshots arrive on every transcript delta. The session log must coalesce writes like `replaceLiveChatSnapshot` does, or it competes with the `chatHistory` write queue and could cause jank on slow devices.
- **Two snapshot owners.** The Asha screen and the floating host both handle snapshots (`listenersRef` decides which). Getting this wrong means duplicate or missing rows.
- **Duplicate reports** from outbox retries until the server supports idempotency.
- **Privacy expectations.** Keeping more transcript history and queued reports on the device changes what the privacy page promises. Updated copy must ship with the feature.
- **Live audio regressions.** Changes in `use-realtime-conversation.ts` touch the same file as the fragile iPhone microphone path (`AGENTS.md`). Keep the changes to callbacks only, and repeat the two-call device check from `AGENTS.md`.

## Open questions

1. **Report API (Chris):** does `/api/report-message` tolerate an extra `reportId` field, and can it deduplicate by that id? Until confirmed, omit it and accept possible duplicate reports.
2. **Retention (Chris):** confirm the default of 3 sessions (the latest shown on Last session plus up to 2 hidden crash-recovery records), with a maximum age of 30 days, or choose a smaller cap. Privacy copy must disclose the briefly retained hidden records. Clear semantics and Last session scope are decided above.
3. **NetInfo:** add it for faster recovery detection, or keep foreground/successful-request/timer triggers?
4. **Typed coaching offline:** a separate future feature, outside this build.
5. **Legacy chat import:** default is no import; should an upgrade preserve existing chat as a legacy record?
6. **`create_session_recap`:** persist its output as a summary? Default is no; any future summary must follow explicit content deletion rules.

## Implementation tasks (for Claude Code)

Each task is one PR-sized unit on a `desk/` branch, with tests.

1. **Session log core.** Add types, per-record/index sanitizers, first-row-only persistence eligibility, retention, and reducer operations (`start`, merge rows by id, `recordTool`, `finish`, `recoverActive`, explicit content deletion). Test >100 rows, revisions, the default 3-session cap and 30-day expiry, and empty attempts including ready-then-dropped.
2. **Persistence and privacy lifecycle.** Add per-session keys and small index with serialized/coalesced writes and partial-write recovery. **Await `recoverActive` before any connect can create an active record**, including the floating host. Wire `clearAllData` to end any live call with `disconnect('data_deleted')` before invalidating generations and deleting all keys, without re-persisting that session; add the separate learner-initiated delete operation, keeping shared automatic reset paths free of session deletion. Invalidate pending writes/callbacks; test recovery ordering and deletion races, including deletion during a live call with late rows/finalization after the generation bump. Test that Clear preserves associated/unassociated queued reports and retries, while consent withdrawal and Delete Bolo data remove them.
3. **Capture wiring.** Add `onSessionEvent`, `disconnect(reason)`, and retain `sessionId` in `use-realtime-conversation.ts`. Feed snapshots from screen/floating host with one owner, merge by id, and record tool outcomes. Finalize previous sessions before automatic current-chat reset. Test both hosts preserve stored rows across new-session resets.
4. **Offline/interrupted UX.** Preserve typed API error kinds through hooks; show offline-before-start copy only for network/timeout. Add interrupted banner, accessible labels, privacy copy and CHANGELOG updates.
5. **Sync outbox and API errors.** Add typed `BoloApiError.kind` and test each failure path; add report-only queue, backoff/triggers, foreground single flush, generation/abort checks on deletion/withdrawal, all-op withdrawal cleanup, and retry/discard UI. Do not send `reportId` pending Chris's confirmation. Test deletion mid-flush and consent re-grant.
6. **Last session screen (first build).** Add the Asha entry point, most recent saved record, status/transcript and associated retries, empty/cleared states, and confirmed explicit Clear chat action as specified in UX and Privacy. Include the pending-reports disclosure in Clear confirmation, preserve report retries in the cleared state, and keep older recovery records hidden. Add screen and lifecycle tests.
