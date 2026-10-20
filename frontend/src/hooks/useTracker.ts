import { useEffect, useRef, useState } from 'react';
import { api, ApiError, StartSession } from '../api';

const SEND_INTERVAL_MS = 2000; // throttle: about 1 fix every 2 seconds
const STORAGE_KEY = 'live-tracker:session';
const STATIC_FIX_LIMIT = 5; // identical fixes in a row ⇒ simulated/cached source

// What the browser itself reports, untouched — used in the diagnostics panel
// to answer "is the wrong point coming from the browser or from our app?".
export interface RawFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: number;
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface TrackerState {
  running: boolean;
  lastSentAt: number | null;
  accuracy: number | null;
  session: StartSession | null; // set while running
  error: string | null;
  sentCount: number;
  isSuspicious: boolean; // identical fixes or weak (>= 500 m) accuracy
  rawFix: RawFix | null; // latest raw browser report (not throttled)
  fixCount: number; // how many times watchPosition fired (accepted or not)
  permission: PermissionState;
}

export function useTracker() {
  const [state, setState] = useState<TrackerState>({
    running: false,
    lastSentAt: null,
    accuracy: null,
    session: null,
    error: null,
    sentCount: 0,
    isSuspicious: false,
    rawFix: null,
    fixCount: 0,
    permission: 'unknown',
  });

  const sessionRef = useRef<StartSession | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const lastSentRef = useRef(0);
  const sentCountRef = useRef(0);
  const fixCountRef = useRef(0);
  const lastCoordsRef = useRef<{ lat: number; lng: number; count: number }>({ lat: 0, lng: 0, count: 0 });

  // Check the geolocation permission state for this origin.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        setState((s) => ({ ...s, permission: status.state as PermissionState }));
        status.onchange = () =>
          setState((s) => ({ ...s, permission: status.state as PermissionState }));
      })
      .catch(() => undefined);
  }, []);

  // Count identical consecutive fixes: a perfectly constant, metre-accurate
  // point usually means DevTools Sensors override or cached/IP-based lookup.
  function noteCoords(lat: number, lng: number): number {
    const c = lastCoordsRef.current;
    if (Math.abs(c.lat - lat) < 1e-5 && Math.abs(c.lng - lng) < 1e-5) {
      c.count += 1;
    } else {
      Object.assign(c, { lat, lng, count: 0 });
    }
    return c.count;
  }

  function startWatch() {
    // maximumAge: 0 => never serve a cached fix; every point is fresh.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        fixCountRef.current += 1;
        // Record the browser's raw report BEFORE throttling/filtering.
        setState((s) => ({
          ...s,
          fixCount: fixCountRef.current,
          rawFix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            at: pos.timestamp,
          },
        }));
        maybeSend(pos);
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow access in the browser settings (address bar icon).'
            : `GPS error: ${err.message}`;
        setState((s) => ({ ...s, error: message }));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  function maybeSend(pos: GeolocationPosition) {
    const now = Date.now();
    if (now - lastSentRef.current < SEND_INTERVAL_MS) return; // throttle
    lastSentRef.current = now;

    const session = sessionRef.current;
    if (!session) return;

    api
      .sendLocation(session, {
        seq: ++seqRef.current,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        speed: pos.coords.speed ?? undefined,
        heading: pos.coords.heading ?? undefined,
        deviceTimestamp: pos.timestamp,
      })
      .then(() => {
        sentCountRef.current += 1;
        const duplicateFixes = noteCoords(pos.coords.latitude, pos.coords.longitude);
        const accuracy = pos.coords.accuracy ?? null;
        setState((s) => ({
          ...s,
          accuracy,
          lastSentAt: now,
          sentCount: sentCountRef.current,
          isSuspicious: duplicateFixes >= STATIC_FIX_LIMIT || accuracy >= 500,
          error: null,
        }));
      })
      .catch((err: ApiError) => {
        if (err.status === 401 || err.status === 404 || err.status === 409) {
          stop(); // session invalid or already ended
        }
        setState((s) => ({ ...s, error: err.message }));
      });
  }

  async function queryPermission(): Promise<PermissionState> {
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' });
      return (status?.state as PermissionState) ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  function start() {
    setState((s) => ({ ...s, error: null }));
    queryPermission().then((permission) => setState((s) => ({ ...s, permission })));
    navigator.geolocation.getCurrentPosition(
      async (firstPosition) => {
        try {
          const session = await api.startSession();
          sessionRef.current = session;
          seqRef.current = 0;
          lastSentRef.current = 0;
          sentCountRef.current = 0;
          fixCountRef.current = 0;
          lastCoordsRef.current = { lat: 0, lng: 0, count: 0 };
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
          startWatch();
          maybeSend(firstPosition);
          setState((s) => ({ ...s, running: true, session, rawFix: null, error: null }));
        } catch (err) {
          setState((s) => ({ ...s, error: (err as Error).message }));
        }
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow access in the browser settings (address bar icon).'
            : `GPS error: ${err.message}`;
        setState((s) => ({ ...s, error: message }));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  function stop() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const session = sessionRef.current;
    sessionRef.current = null;
    sessionStorage.removeItem(STORAGE_KEY);
    if (session) {
      api.stopSession(session).catch(() => undefined); // best effort
    }
    setState((s) => ({
      ...s,
      running: false,
      session: null,
      accuracy: null,
      sentCount: 0,
      isSuspicious: false,
      rawFix: null,
      fixCount: 0,
    }));
  }

  return { ...state, start, stop };
}
