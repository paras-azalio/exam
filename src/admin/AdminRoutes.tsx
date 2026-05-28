import { useState, useEffect } from 'react';
import AdminLogin from './AdminLogin';
import AdminPanel from './AdminPanel';

export default function AdminRoutes() {
  const [creds, setCreds] = useState<string | null>(
    () => sessionStorage.getItem('qs_admin_creds')
  );

  useEffect(() => {
    if (creds) sessionStorage.setItem('qs_admin_creds', creds);
    else sessionStorage.removeItem('qs_admin_creds');
  }, [creds]);

  if (!creds) return <AdminLogin onLogin={setCreds} />;
  return <AdminPanel creds={creds} onLogout={() => setCreds(null)} />;
}
