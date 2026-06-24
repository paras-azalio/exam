/**
 * Central runtime configuration.
 *
 * Set VITE_BACKEND_URL in your .env (or as an env-var at build time) to point
 * to a different backend.  The default falls back to localhost for local dev.
 *
 * Example .env:
 *   VITE_BACKEND_URL=https://api.example.com
 */
export const BACKEND_URL: string =
  (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8080';
