import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import AdminPanel from './AdminPanel';
import ExamDetailPage from './ExamDetailPage';

export default function AdminRoutes() {
  const [creds, setCreds] = useState<string | null>(
    () => sessionStorage.getItem('qs_admin_creds')
  );

  useEffect(() => {
    if (creds) sessionStorage.setItem('qs_admin_creds', creds);
    else sessionStorage.removeItem('qs_admin_creds');
  }, [creds]);

  if (!creds) return <AdminLogin onLogin={setCreds} />;
  return (
    <Routes>
      <Route path="/" element={<AdminPanel creds={creds} onLogout={() => setCreds(null)} />} />
      <Route path="/exam/:examCode" element={<ExamDetailPage creds={creds} />} />
    </Routes>
  );
}
