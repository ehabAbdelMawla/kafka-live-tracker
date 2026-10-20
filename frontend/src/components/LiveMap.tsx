import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Vite cannot use L.Icon.Default (its path detection breaks under bundlers and
// produces doubled URLs). Build the icon explicitly from imported assets.
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import type { FixPoint } from '../types';

// The pin shown at the tracked position.
const pin = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41], // size of the (non-retina) icon image
  iconAnchor: [12, 41], // tip of the pin sits on the coordinates
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Smoothly follow the marker as fixes arrive.
function Recenter({ fix }: { fix: FixPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (fix) {
      map.setView([fix.lat, fix.lng], Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [fix, map]);
  return null;
}

export function LiveMap({ fix, track }: { fix: FixPoint | null; track?: [number, number][] }) {
  return (
    <MapContainer
      center={fix ? [fix.lat, fix.lng] : [30.044, 31.235]}
      zoom={16}
      className="map"
    >
      {/* OSM standard tiles are keyless by design. CARTO's dark basemaps now
          require an API key (June 2025 policy) — we darken OSM tiles in CSS
          instead (.leaflet-tile filter) to keep the dark theme. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {fix && <Marker position={[fix.lat, fix.lng]} icon={pin} />}
      {fix && fix.accuracy !== undefined && (
        <Circle
          center={[fix.lat, fix.lng]}
          radius={Math.max(fix.accuracy, 10)}
          pathOptions={{ color: '#818cf8', weight: 1.5, fillOpacity: 0.16 }}
        />
      )}
      {track && track.length > 1 && (
        <Polyline positions={track} pathOptions={{ color: '#fb7185', weight: 3, opacity: 0.9 }} />
      )}
      <Recenter fix={fix} />
    </MapContainer>
  );
}
