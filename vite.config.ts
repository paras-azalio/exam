import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The Spring Boot backend (REST + STOMP/SockJS) runs here over plain HTTP.
// We never let the browser hit it directly — see the proxy below.
// Local run: backend is on this machine. (Was http://localhost:8080 for the
// LAN/server setup — switch back if you point the frontend at a remote backend.)
const BACKEND = 'http://localhost:8080';

export default defineConfig({
  // basicSsl() makes the dev server serve HTTPS with a self-signed cert.
  // This is REQUIRED so that admins opening the panel from another machine
  // (e.g. http://localhost:5173) get a SECURE CONTEXT — without it,
  // navigator.mediaDevices is undefined and the admin cannot turn on mic/camera.
  plugins: [react(), basicSsl()],
  base: '/QuickScreen/',
  // sockjs-client (used for the STOMP live-proctoring socket) references the Node
  // global `global`, which doesn't exist in the browser. Alias it to globalThis.
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The page is HTTPS, but the backend is HTTPS-less. A direct https→http call
    // is blocked as "mixed content", so we proxy backend traffic through Vite:
    // the browser only ever talks HTTPS to Vite (same origin), and Vite forwards
    // to the HTTP backend server-side. This also removes all CORS problems.
    proxy: {
      '/QuickScreen/api': { target: BACKEND, changeOrigin: true, secure: false },
      '/QuickScreen/ws':  { target: BACKEND, changeOrigin: true, secure: false, ws: true },
    },
  },
});
