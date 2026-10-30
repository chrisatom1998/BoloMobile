import { useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FullWindowOverlay } from 'react-native-screens';

import type { FloatingAshaBubble } from '@/components/floating-asha-bubble';
import type { LiveTranscriptRow, RealtimeTranscriptUpdate, RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { floatingAshaEnabled } from '@/lib/floating-asha';
import { useAppState } from '@/state/app-state';
import type { AshaResponseLanguage, ChatMessage } from '@/state/app-state-types';

export type AshaVoiceControls = {
  disconnect: () => void;
  finishTurn: () => void | Promise<void>;
  startTurn: () => Promise<void>;
  status: RealtimeVoiceStatus;
  microphoneEnabled: boolean;
  isPlaying: boolean;
};

export type AshaVoiceListeners = {
  onError?: (message: string) => void;
  onTranscriptChange?: (update: RealtimeTranscriptUpdate) => void;
  onTranscriptSnapshot?: (rows: LiveTranscriptRow[]) => void;
};

export type AshaVoiceSession = {
  /** Shared session is mounted. The Asha screen should use `voice` instead of its own. */
  available: boolean;
  minimized: boolean;
  status: RealtimeVoiceStatus;
  isPlaying: boolean;
  voice: AshaVoiceControls | null;
  /**
   * IDs of the revisable live transcript rows. Owned here so leaving Asha's
   * screen does not forget which rows a later snapshot must replace.
   */
  snapshotIds: MutableRefObject<string[]>;
  minimize: () => void;
  expand: () => void;
  endSession: () => void;
  setListeners: (listeners: AshaVoiceListeners | null) => void;
};

const inactiveSnapshotIds: MutableRefObject<string[]> = { current: [] };

const inactiveSession: AshaVoiceSession = {
  available: false,
  minimized: false,
  status: 'disconnected',
  isPlaying: false,
  voice: null,
  snapshotIds: inactiveSnapshotIds,
  minimize: () => {},
  expand: () => {},
  endSession: () => {},
  setListeners: () => {},
};

/** Synchronous minimized flag so leaving Asha cannot disconnect a session that was just minimized. */
const minimizedNow = { current: false };

export function isFloatingAshaMinimized() {
  return minimizedNow.current;
}

const AshaVoiceSessionContext = createContext<AshaVoiceSession>(inactiveSession);

export function useAshaVoiceSession() {
  return useContext(AshaVoiceSessionContext);
}

function messagesFromRows(rows: LiveTranscriptRow[], responseLanguage: AshaResponseLanguage): ChatMessage[] {
  return rows.filter((row) => row.text.trim()).map((row) => ({
    id: row.id,
    role: row.speaker,
    text: row.text,
    ...(row.speaker === 'asha' ? { language: responseLanguage } : {}),
  }));
}

function FloatingAshaBubbleSlot(props: ComponentProps<typeof FloatingAshaBubble>) {
  // Loaded only while the bubble is on screen, so root layout tests never import it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FloatingAshaBubble: Bubble } = require('@/components/floating-asha-bubble') as typeof import('@/components/floating-asha-bubble');
  return <Bubble {...props} />;
}

function FloatingAshaRouter({ navigateRef }: { navigateRef: MutableRefObject<() => void> }) {
  const router = useRouter();
  useEffect(() => {
    navigateRef.current = () => {
      router.navigate('/live' as Href);
    };
  }, [navigateRef, router]);
  return null;
}

function AshaVoiceSessionHost({
  listenersRef,
  onVoice,
  snapshotIds,
}: {
  listenersRef: MutableRefObject<AshaVoiceListeners | null>;
  onVoice: (voice: AshaVoiceControls) => void;
  snapshotIds: MutableRefObject<string[]>;
}) {
  // Loaded inside the host so the root layout test never evaluates expo-audio.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAshaLiveSession } = require('@/hooks/use-asha-live-session') as typeof import('@/hooks/use-asha-live-session');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useRealtimeConversation } = require('@/hooks/use-realtime-conversation') as typeof import('@/hooks/use-realtime-conversation');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { observe } = require('@/lib/observability') as typeof import('@/lib/observability');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { stopSpeaking } = require('@/lib/speech') as typeof import('@/lib/speech');
  const app = useAppState();
  const liveSession = useAshaLiveSession();
  const previousStatusRef = useRef<RealtimeVoiceStatus>('disconnected');
  // The provider owns this ref for the life of the session. Keep a local Ref so
  // transcript updates can write it without treating the prop as immutable.
  const snapshotIdsRef = useRef(snapshotIds);
  const appRef = useRef(app);
  useEffect(() => {
    appRef.current = app;
  }, [app]);

  const persistSnapshot = useCallback((rows: LiveTranscriptRow[]) => {
    const current = appRef.current;
    const messages = messagesFromRows(rows, current.learnerProfile.responseLanguage);
    const ids = snapshotIdsRef.current;
    current.replaceLiveChatSnapshot(ids.current, messages);
    ids.current = messages.map((message) => message.id);
    if (messages.some((message) => message.role === 'you')) current.markLiveTurn();
  }, []);

  const voice = useRealtimeConversation({
    clientId: app.clientId,
    enabled: app.aiConsent,
    responseLanguage: app.learnerProfile.responseLanguage,
    liveSession,
    onError: (message) => listenersRef.current?.onError?.(message),
    onTranscriptChange: (update) => listenersRef.current?.onTranscriptChange?.(update),
    onTranscriptSnapshot: (rows) => {
      const listener = listenersRef.current?.onTranscriptSnapshot;
      if (listener) listener(rows);
      else persistSnapshot(rows);
    },
  });

  useEffect(() => {
    onVoice({
      disconnect: voice.disconnect,
      finishTurn: voice.finishTurn,
      startTurn: voice.startTurn,
      status: voice.status,
      microphoneEnabled: voice.microphoneEnabled,
      isPlaying: voice.isPlaying,
    });
  }, [onVoice, voice.disconnect, voice.finishTurn, voice.isPlaying, voice.microphoneEnabled, voice.startTurn, voice.status]);

  // The Asha screen owns these side effects while it is mounted. If it is gone, keep the transcript.
  useEffect(() => {
    const status = voice.status;
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (listenersRef.current) return;
    const ids = snapshotIdsRef.current;
    if (status === 'connecting' && previous === 'disconnected') ids.current = [];
    if (previous === 'connecting' && status !== 'connecting' && status !== 'disconnected') {
      observe('voice_connection_succeeded');
      void stopSpeaking();
      appRef.current.clearChatHistory();
      ids.current = [];
    }
  }, [listenersRef, observe, stopSpeaking, voice.status]);

  return null;
}

function EnabledAshaVoiceSession({ children }: PropsWithChildren) {
  const app = useAppState();
  const ready = Boolean(app.hydrated && app.clientId && app.clientId !== 'loading-client');
  const [minimized, setMinimized] = useState(false);
  const [voice, setVoice] = useState<AshaVoiceControls | null>(null);
  const snapshotIds = useRef<string[]>([]);
  const listenersRef = useRef<AshaVoiceListeners | null>(null);
  const navigateRef = useRef<() => void>(() => {});
  const voiceRef = useRef(voice);
  const previousStatusRef = useRef<RealtimeVoiceStatus>('disconnected');
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const setListeners = useCallback((listeners: AshaVoiceListeners | null) => {
    listenersRef.current = listeners;
  }, []);
  const minimize = useCallback(() => {
    minimizedNow.current = true;
    setMinimized(true);
  }, []);
  const expand = useCallback(() => {
    minimizedNow.current = false;
    setMinimized(false);
    navigateRef.current();
  }, []);
  const endSession = useCallback(() => {
    voiceRef.current?.disconnect();
    minimizedNow.current = false;
    setMinimized(false);
  }, []);

  useEffect(() => {
    const status = voice?.status ?? 'disconnected';
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previous !== 'disconnected' && status === 'disconnected' && minimizedNow.current) {
      minimizedNow.current = false;
      setMinimized(false);
    }
  }, [voice?.status]);

  const value = useMemo<AshaVoiceSession>(() => {
    if (!ready) return inactiveSession;
    return {
      available: true,
      minimized,
      status: voice?.status ?? 'disconnected',
      isPlaying: voice?.isPlaying ?? false,
      voice,
      snapshotIds,
      minimize,
      expand,
      endSession,
      setListeners,
    };
  }, [endSession, expand, minimized, minimize, ready, setListeners, snapshotIds, voice]);

  return (
    <AshaVoiceSessionContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {ready ? <AshaVoiceSessionHost listenersRef={listenersRef} onVoice={setVoice} snapshotIds={snapshotIds} /> : null}
        {ready ? <FloatingAshaRouter navigateRef={navigateRef} /> : null}
        {ready && minimized ? (
          // iOS: a separate window above the native tab bar and stack, so the bubble stays on top
          // across tab switches and receives its own touches. It needs its own gesture root.
          <FullWindowOverlay>
            <GestureHandlerRootView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <FloatingAshaBubbleSlot
                isPlaying={voice?.isPlaying ?? false}
                onEnd={endSession}
                onExpand={expand}
                status={voice?.status ?? 'disconnected'}
              />
            </GestureHandlerRootView>
          </FullWindowOverlay>
        ) : null}
      </View>
    </AshaVoiceSessionContext.Provider>
  );
}

export function AshaVoiceSessionProvider({ children }: PropsWithChildren) {
  if (!floatingAshaEnabled) {
    return <AshaVoiceSessionContext.Provider value={inactiveSession}>{children}</AshaVoiceSessionContext.Provider>;
  }
  return <EnabledAshaVoiceSession>{children}</EnabledAshaVoiceSession>;
}
