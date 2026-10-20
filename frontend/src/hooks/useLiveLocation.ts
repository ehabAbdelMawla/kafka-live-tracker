import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import type { FixPoint } from '../types';

export type ConnState = 'connecting' | 'live' | 'offline';

interface JoinAck {
  status: 'ACTIVE' | 'ENDED' | 'UNKNOWN';
  lastLocation: FixPoint | null;
}

export interface LiveState {
  connection: ConnState;
  fix: FixPoint | null;
  ended: boolean;
  status: 'LOADED' | 'NOT_FOUND' | 'LOADING';
  pointCount: number; // live updates received in this visit
}

/**
 * Viewer realtime logic:
 * - joins room share:{shareId} on connect AND on reconnect
 * - the join ack carries a snapshot so the marker shows immediately
 * - drops duplicates/out-of-order points by comparing seq
 */
export function useLiveLocation(shareId: string): LiveState {
  const [state, setState] = useState<LiveState>({
    connection: 'connecting',
    fix: null,
    ended: false,
    status: 'LOADING',
    pointCount: 0,
  });

  // Highest seq accepted so far; points with a lower seq are stale.
  const lastSeqRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket;

    async function boot() {
      try {
        // Public REST snapshot: 404 means the link does not exist.
        const res = await fetch(`${API_URL}/api/share/${shareId}`);
        if (cancelled) return;
        if (res.status === 404) {
          setState((s) => ({ ...s, status: 'NOT_FOUND' }));
          return;
        }
        const snapshot = (await res.json()) as {
          status: string;
          lastLocation: FixPoint | null;
        };
        if (snapshot.lastLocation) {
          lastSeqRef.current = snapshot.lastLocation.seq;
        }
        setState((s) => ({
          ...s,
          status: 'LOADED',
          ended: snapshot.status === 'ENDED',
          fix: snapshot.lastLocation,
        }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, status: 'NOT_FOUND' }));
        return;
      }

      socket = io(`${API_URL}/live`, { transports: ['websocket'] });

      socket.on('connect', () => {
        setState((s) => ({ ...s, connection: 'live' }));
        // (Re)join: server answers with the current snapshot.
        socket.emit(
          'join',
          shareId,
          (ack: JoinAck) => {
            if (ack.status === 'UNKNOWN') {
              setState((s) => ({ ...s, status: 'NOT_FOUND', connection: 'live' }));
              return;
            }
            if (ack.lastLocation && ack.lastLocation.seq > lastSeqRef.current) {
              lastSeqRef.current = ack.lastLocation.seq;
            }
            setState((s) => ({
              ...s,
              connection: 'live',
              fix: s.fix?.seq === undefined || (ack.lastLocation?.seq ?? -1) >= (s.fix?.seq ?? -1)
                ? ack.lastLocation ?? s.fix
                : s.fix,
              ended: ack.status === 'ENDED' ? true : s.ended,
            }));
          },
        );
      });

      socket.on('disconnect', () => {
        setState((s) => ({ ...s, connection: 'offline' }));
      });

      socket.on('location', (point: FixPoint) => {
        // At-least-once delivery: duplicates and reordering happen. seq fixes it.
        if (point.seq <= lastSeqRef.current) return;
        lastSeqRef.current = point.seq;
        setState((s) => ({ ...s, fix: point, connection: 'live', pointCount: s.pointCount + 1 }));
      });

      socket.on('session:ended', () => {
        setState((s) => ({ ...s, ended: true }));
      });
    }

    boot();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [shareId]);

  return state;
}
