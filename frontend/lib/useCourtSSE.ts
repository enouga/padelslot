'use client';
import { useEffect, useRef } from 'react';
import type { SSEEvent } from './api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function useCourtSSE(
  courtId: string | null,
  onEvent: (event: SSEEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!courtId) return;

    const es = new EventSource(`${BASE_URL}/api/courts/${courtId}/stream`);

    es.onmessage = (e: MessageEvent) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        onEventRef.current(event);
      } catch {
        console.warn('[SSE] Parse error', e.data);
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on error
      console.warn(`[SSE] Reconnecting for court ${courtId}`);
    };

    return () => es.close();
  }, [courtId]);
}
