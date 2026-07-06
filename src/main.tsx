import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import AdminRoutes from './admin/AdminRoutes.tsx';
import './index.css';

// NOTE: StrictMode is intentionally NOT used here. It double-invokes effects in
// development (mount → unmount → remount), which rapidly activates/deactivates the
// live-proctoring STOMP/WebSocket clients while their sockets are still connecting.
// That leaves stompjs "zombie" clients stuck in a reconnect loop and floods the
// console with dropped signaling messages, breaking the live video. Production
// builds never double-invoke, so removing StrictMode simply makes dev match prod.
// (The onConnect guards in LiveViewer/useWebRTCStream are the belt-and-suspenders.)
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/QuickScreen">
    <Routes>
      <Route path="/adm/*" element={<AdminRoutes />} />
      <Route path="/*" element={<App />} />
    </Routes>
  </BrowserRouter>
);
