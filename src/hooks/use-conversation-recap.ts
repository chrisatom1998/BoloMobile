import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { RecapSheetState } from '@/components/conversation-recap-sheet';
import { getConversationRecap } from '@/services/bolo-api';
import { selectRecapMessages, type RecapMessage } from '../../shared/conversation-recap';

/** A recap belongs to one explicitly ended conversation, never persisted history. */
export function useConversationRecap({ clientId, enabled, history }: {
  clientId: string;
  enabled: boolean;
  history: readonly RecapMessage[];
}) {
  const [state, setState] = useState<RecapSheetState | null>(null);
  const mounted = useRef(true);
  const allowed = useRef(enabled);
  const active = useRef(AppState.currentState === 'active');
  const currentContext = useRef({ clientId, history });
  const request = useRef<AbortController | null>(null);
  const snapshot = useRef<RecapMessage[] | null>(null);

  const close = useCallback(() => {
    request.current?.abort();
    request.current = null;
    snapshot.current = null;
    if (mounted.current) setState(null);
  }, []);

  useLayoutEffect(() => {
    allowed.current = enabled;
    currentContext.current = { clientId, history };
  }, [clientId, enabled, history]);

  const load = useCallback(async (messages: RecapMessage[]) => {
    if (!mounted.current || !active.current || !allowed.current || request.current || currentContext.current.clientId !== clientId) return;
    if (!messages.some((message) => message.role === 'you')) {
      setState({ status: 'ready', corrections: [] });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await getConversationRecap({ clientId, messages }, controller.signal);
      if (!mounted.current || !active.current || controller.signal.aborted || request.current !== controller || !allowed.current || currentContext.current.clientId !== clientId) return;
      setState({ status: 'ready', corrections: result.corrections });
    } catch (cause) {
      if (!mounted.current || !active.current || controller.signal.aborted || request.current !== controller || !allowed.current || currentContext.current.clientId !== clientId) return;
      setState({ status: 'error', message: cause instanceof Error ? cause.message : 'Your recap could not load. Please try again.' });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [clientId]);

  const start = useCallback((messages: readonly RecapMessage[]) => {
    if (!mounted.current || !active.current || !allowed.current || snapshot.current !== null || currentContext.current.clientId !== clientId) return;
    snapshot.current = selectRecapMessages(messages);
    setState({ status: 'loading' });
  }, [clientId]);

  const retry = useCallback(() => {
    if (state?.status !== 'error' || snapshot.current === null) return;
    setState({ status: 'loading' });
  }, [state?.status]);

  const dismiss = useCallback((sourceId: string) => {
    setState((current) => current?.status === 'ready'
      ? { status: 'ready', corrections: current.corrections.filter((correction) => correction.sourceId !== sourceId) }
      : current);
  }, []);

  // Consent, navigation and deletion are hard invalidation boundaries. A late
  // network result must not resurrect content or start work after withdrawal.
  useEffect(() => { close(); }, [clientId, close]);
  useEffect(() => { if (!enabled) close(); }, [close, enabled]);
  useEffect(() => {
    if (snapshot.current?.some((message) => !history.some((saved) => saved.id === message.id && saved.text === message.text))) close();
  }, [close, history]);
  // Wait until React commits the final caption and End together. Checking the
  // committed history here also rejects retained End callbacks after deletion.
  useEffect(() => {
    const messages = snapshot.current;
    if (state?.status !== 'loading' || messages === null || request.current) return;
    if (messages.some((message) => !history.some((saved) => saved.id === message.id && saved.text === message.text))) {
      close();
      return;
    }
    void load(messages);
  }, [close, history, load, state]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (next) => {
      active.current = next === 'active';
      if (!active.current) close();
    });
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      snapshot.current = null;
      subscription?.remove();
    };
  }, [close]);

  return { state, start, close, retry, dismiss };
}
