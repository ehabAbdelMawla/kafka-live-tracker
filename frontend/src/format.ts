/** Small human-friendly formatters shared by the tracker and viewer pages. */

export function fmtAccuracy(meters?: number | null): string {
  if (meters === undefined || meters === null) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function fmtSpeed(mPerS?: number | null): string {
  if (mPerS === undefined || mPerS === null) return '—';
  const kmh = mPerS * 3.6;
  return `${kmh < 10 ? kmh.toFixed(1) : Math.round(kmh)} km/h`;
}

export function fmtTime(ts?: number | null): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleTimeString();
}

export function fmtCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// 'https://' | 'http://localhost' | 'http://127.0.0.1' are the only origins
// where navigator.geolocation gives real device GPS or DevTools-simulated GPS.
export function isSecureGeolocationContext(): boolean {
  return (
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

// Detect Brave. The brave check is duck-typed because TypeScript's Navigator
// type does not know about navigator.brave.
export async function isBrave(): Promise<boolean> {
  const braveFlag = (navigator as Navigator & { brave?: { isBrave?: Promise<boolean> } }).brave;
  if (!braveFlag) return false;
  try {
    return (await braveFlag.isBrave) === true;
  } catch {
    return false;
  }
}
