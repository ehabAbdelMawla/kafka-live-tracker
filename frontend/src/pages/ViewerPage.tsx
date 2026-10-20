import { useLiveLocation } from '../hooks/useLiveLocation';
import { LiveMap } from '../components/LiveMap';
import { AppHeader } from '../components/AppHeader';
import { fmtAccuracy, fmtCoords, fmtSpeed, fmtTime } from '../format';

const CONNECTION_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  offline: 'Reconnecting…',
};

export function ViewerPage({ shareId }: { shareId: string }) {
  const { connection, fix, ended, status, pointCount } = useLiveLocation(shareId);

  const weakFix = fix?.accuracy !== undefined && fix.accuracy >= 500;

  return (
    <>
      <AppHeader subtitle="Watching a shared position live" />
      <main className="page wide">
        <div className="map-wrap">
          <LiveMap fix={fix} />

          {status === 'LOADING' && (
            <div className="overlay waiting-overlay">
              <div className="waiting-pill">
                <span className="spinner" />
                Loading share link…
              </div>
            </div>
          )}

          {status === 'LOADED' && !fix && (
            <div className="overlay waiting-overlay">
              <div className="waiting-pill">
                <span className="spinner" />
                Waiting for first location…
              </div>
            </div>
          )}

          {status === 'LOADED' && (
            <div className="overlay top">
              <span className={`conn-pill ${connection}`}>
                <span className="dot" />
                {CONNECTION_LABEL[connection] ?? connection}
              </span>
              {ended && (
                <span className="ended-banner">
                  Tracking ended — showing last known position
                </span>
              )}
            </div>
          )}

          {fix && (
            <div className="overlay bottom-card">
              <div className="stat">
                <div className="k">Updated</div>
                <div className="v">{fmtTime(fix.deviceTimestamp)}</div>
              </div>
              <div className="stat">
                <div className="k">Coords</div>
                <div className="v">{fmtCoords(fix.lat, fix.lng)}</div>
              </div>
              <div className="stat">
                <div className="k">Accuracy</div>
                <div className="v">{fmtAccuracy(fix.accuracy)}</div>
              </div>
              <div className="stat">
                <div className="k">Speed</div>
                <div className="v">{fmtSpeed(fix.speed)}</div>
              </div>
              <div className="stat">
                <div className="k">Updates</div>
                <div className="v">{pointCount}</div>
              </div>
              {weakFix && (
                <div className="fix-warning">
                  Weak fix — this location comes from Wi-Fi/IP positioning, not
                  device GPS, and can be inaccurate by kilometres.
                </div>
              )}
            </div>
          )}
        </div>

        {status === 'NOT_FOUND' && (
          <div className="banner error" style={{ marginBottom: 12 }}>
            <span className="icon">✕</span>
            <span>Link not found. Double-check the URL.</span>
          </div>
        )}

        <p className="center-note">
          <a className="back-link" href="/">
            Share your own location →
          </a>
        </p>
      </main>
    </>
  );
}
