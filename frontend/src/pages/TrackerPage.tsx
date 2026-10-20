import { useEffect, useState } from 'react';
import { useTracker } from '../hooks/useTracker';
import { useWakeLock } from '../hooks/useWakeLock';
import { CopyLink } from '../components/CopyLink';
import { ShareQr } from '../components/ShareQr';
import { AppHeader } from '../components/AppHeader';
import { fmtAccuracy, fmtTime, fmtCoords, isSecureGeolocationContext, isBrave } from '../format';

const PERMISSION_LABEL: Record<string, string> = {
  granted: 'Granted',
  denied: 'Denied',
  prompt: 'Not asked yet',
  unknown: 'Unknown',
};

const WAKE_LOCK_LABEL: Record<string, string> = {
  idle: 'Screen lock on demand',
  active: 'Keeping screen awake',
  unsupported: '',
  denied: 'Screen lock denied by browser',
};

export function TrackerPage() {
  const {
    running,
    lastSentAt,
    accuracy,
    sentCount,
    session,
    error,
    start,
    stop,
    rawFix,
    fixCount,
    permission,
  } = useTracker();

  const wakeLock = useWakeLock(running);

  const [brave, setBrave] = useState(false);
  useEffect(() => {
    isBrave().then(setBrave);
  }, []);

  // Server-side facts: the API forwards EXACTLY what the browser reports.
  const gpsHint =
    accuracy !== null && accuracy >= 500
      ? 'Your browser is reporting a weak fix (accuracy ≥ 500 m) — Wi-Fi/IP lookup, not device GPS. The map can only show what the browser reports, which may be kilometres off. Try a phone over HTTPS, or set your real coordinates in DevTools → Sensors → Location.'
      : null;

  const notSecure = !isSecureGeolocationContext();
  const wakeLabel = WAKE_LOCK_LABEL[wakeLock] ?? '';

  return (
    <>
      <AppHeader subtitle="Share your GPS position in real time" />
      <main className="page">
        <section className={`card hero-card${running ? ' is-live' : ''}`}>
          <div className="hero-top">
            <span className={`status-chip ${running ? 'on' : ''}`}>
              <span className="dot" />
              {running ? 'Live now' : 'Ready'}
            </span>
            {wakeLabel && running && (
              <span className={`status-chip subtle ${wakeLock === 'active' ? 'on' : ''}`}>
                <span className="dot" />
                {wakeLabel}
              </span>
            )}
          </div>

          <h1>{running ? 'You are broadcasting' : 'Share my live location'}</h1>
          <p className="sub">
            {running
              ? 'Your position flows through Kafka and reaches every viewer within seconds.'
              : 'Start broadcasting your position, then share the link — anyone who opens it follows you live on the map.'}
          </p>

          <div className="btn-center">
            <button
              className={`big-btn ${running ? 'stop' : 'start'}`}
              onClick={running ? stop : start}
            >
              {running ? 'Stop tracking' : 'Start tracking'}
            </button>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <span className="stat-value">{sentCount}</span>
              <span className="stat-label">points sent</span>
            </div>
            <div className="stat">
              <span className="stat-value">{fmtTime(lastSentAt)}</span>
              <span className="stat-label">last update</span>
            </div>
            <div className="stat">
              <span className={`stat-value${accuracy !== null && accuracy >= 500 ? ' bad' : ''}`}>
                {fmtAccuracy(accuracy)}
              </span>
              <span className="stat-label">accuracy</span>
            </div>
          </div>

          {running && session && (
            <div className="share-panel">
              <div className="share-label">Share this link</div>
              <div className="share-row">
                <div className="share-col">
                  <CopyLink url={session.shareUrl} />
                  <p className="share-hint">
                    Scan with your phone to open this session there — phone GPS is
                    metre-accurate, unlike laptop browser lookups.
                  </p>
                </div>
                <ShareQr url={session.shareUrl} />
              </div>
            </div>
          )}
        </section>

        {/* Raw browser report — proves whether the wrong point comes from the
            browser (before it reaches our API) or from the app pipeline. */}
        <details className="card diag-card" open={!running}>
          <summary>
            <span className="summary-title">Location source — diagnostics</span>
            <span className="caret">▾</span>
          </summary>
          <p className="sub">
            This app forwards <strong>exactly</strong> what your browser reports. Use these raw
            values to tell apart an app issue from a browser/OS issue.
          </p>

          <div className="diagnostic-table">
            <div className="diag-row">
              <span>Permission</span>
              <strong>{PERMISSION_LABEL[permission] ?? permission}</strong>
            </div>
            <div className="diag-row">
              <span>Browser fixes received</span>
              <strong>{fixCount}</strong>
            </div>
            <div className="diag-row">
              <span>Raw lat / lng</span>
              <strong>{rawFix ? fmtCoords(rawFix.lat, rawFix.lng) : '—'}</strong>
            </div>
            <div className="diag-row">
              <span>Raw accuracy</span>
              <strong>{rawFix ? fmtAccuracy(rawFix.accuracy) : '—'}</strong>
            </div>
            <div className="diag-row">
              <span>Fix time</span>
              <strong>{rawFix ? fmtTime(rawFix.at) : '—'}</strong>
            </div>
          </div>

          <div className="diag-help">
            {notSecure && (
              <p>
                <strong>Insecure context:</strong> geolocation only works over <code>https</code> or{' '}
                <code>localhost</code> — on a plain IP host the browser refuses GPS entirely.
              </p>
            )}
            <p>
              If the <strong>raw lat/lng is static</strong> (identical every second) and far from
              where you stand, your browser is supplying that point. Usual suspects:
            </p>
            <ul>
              <li>
                <strong>Desktop browsers have no GPS.</strong> Chrome asks a Wi-Fi/IP service,
                which returns one static point that can be kilometres off.
              </li>
              <li>
                <strong>DevTools → Sensors → Location</strong> still has an override set (the
                coordinates never change because you changed them once).
              </li>
              <li>
                <strong>Site permission is stale</strong> — click the lock icon in the address bar →
                Location → reset, then reload.
              </li>
            </ul>
            <p>
              For real metre-level GPS: open the tracker on a <strong>phone</strong> with HTTPS
              (tunnel with ngrok/cloudflared, then set <code>VITE_API_URL</code>,{' '}
              <code>PUBLIC_APP_URL</code> and <code>CORS_ORIGIN</code> to the HTTPS URLs).
            </p>
          </div>
        </details>

        {brave && (
          <div className="banner warn">
            <span className="icon">⚠</span>
            <span>
              <strong>Brave browser detected.</strong> Brave blocks Google&apos;s Wi-Fi
              geolocation for privacy and serves <strong>IP-only</strong> location — every
              website gets the same coarse point (this is Brave&apos;s design, not a bug in
              this app). For Wi-Fi-level accuracy use <strong>Chrome/Edge/Firefox</strong> on
              this laptop, or scan the QR above to track from your phone.
            </span>
          </div>
        )}

        {gpsHint && (
          <div className="banner warn">
            <span className="icon">⚠</span>
            <span>{gpsHint}</span>
          </div>
        )}

        {error && (
          <div className="banner error">
            <span className="icon">✕</span>
            <span>{error}</span>
          </div>
        )}

        {notSecure && !running && (
          <div className="banner warn">
            <span className="icon">⚠</span>
            <span>
              This page is not in a secure context — the browser will not provide GPS at all here.
            </span>
          </div>
        )}
      </main>
    </>
  );
}
