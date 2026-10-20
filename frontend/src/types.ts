export interface FixPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  seq: number;
  deviceTimestamp: number;
}
