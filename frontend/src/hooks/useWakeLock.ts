import { useEffect, useRef, useState } from 'react';

// Screen Wake Lock — keeps the phone screen on while tracking, so the browser
// keeps feeding GPS fixes instead of pausing when the display turns off.
// Silent degradation everywhere: unsupported (desktop) or denied => status
// says so and the app behaves exactly as before.
export type WakeLockStatus = 'idle' | 'active' | 'unsupported' | 'denied';

interface WakeLockSentinel {
  released: boolean;
  addEventListener(type: 'release', listener: () => void): void;
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}

function getWakeLock(): WakeLockApi | null {
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock ?? null;
}

export function useWakeLock(active: boolean) {
  const [status, setStatus] = useState<WakeLockStatus>(() =>
    getWakeLock() ? 'idle' : 'unsupported',
  );
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  // Browsers auto-release the lock when the tab is hidden; re-acquire when it
  // becomes visible again (this is what keeps long walk tests alive).
  useEffect(() => {
    if (!active) return;

    async function acquire() {
      const wakeLock = getWakeLock();
      if (!wakeLock || sentinelRef.current) return;
      try {
        const sentinel = await wakeLock.request('screen');
        sentinelRef.current = sentinel;
        setStatus('active');
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null;
          setStatus((s) => (s === 'active' ? 'idle' : s));
        });
      } catch {
        setStatus('denied');
      }
    }

    function release() {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      sentinel?.release().catch(() => undefined);
      setStatus((s) => (s === 'active' ? 'idle' : s));
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        acquire();
      }
    }

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);

  return status;
}
