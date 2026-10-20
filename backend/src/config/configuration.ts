// Loads backend/.env into process.env. Imported FIRST in main.ts so every
// module sees the env values at decoration/instance time.
import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 3000),
  publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
};

// CORS allow-list. CORS_ORIGIN may list several origins separated by commas
// (handy in dev where Vite may pick 5174 when 5173 is busy, or when testing
// from 127.0.0.1 instead of localhost).
const DEFAULT_ORIGINS = 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174';
export const allowedOrigins = (process.env.CORS_ORIGIN ?? DEFAULT_ORIGINS)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
