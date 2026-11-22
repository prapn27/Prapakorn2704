import { useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { DataProvider, useData } from './lib/store';
import { isConfigured, useEmulator } from './lib/firebase';
import { SyncBadge } from './components/ui';
import { TransactionForm } from './components/TransactionForm';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Import from './pages/Import';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import CategoriesAdmin from './pages/CategoriesAdmin';
import Accounts from './pages/Accounts';
import Login from './pages/Login';
import SetupNeeded from './pages/SetupNeeded';

const TITLES: Record<string, string> = {
  '/': 'สลิปบัญชี',
  '/transactions': 'รายการ',
  '/import': 'นำเข้าสลิป',
  '/reports': 'รายงาน',
  '/settings': 'ตั้งค่า',
  '/settings/categories': 'จัดการหมวดหมู่',
  '/settings/accounts': 'บัญชี / กระเป๋าเงิน'
};

const NAV = [
  { to: '/', ico: '🏠', label: 'หน้าหลัก' },
  { to: '/transactions', ico: '📋', label: 'รายการ' },
  { to: '/import', ico: '🧾', label: 'นำเข้าสลิป' },
  { to: '/reports', ico: '📊', label: 'รายงาน' },
  { to: '/settings', ico: '⚙️', label: 'ตั้งค่า' }
];

function Shell() {
  const { user, authReady, loaded } = useData();
  const loc = useLocation();
  const [adding, setAdding] = useState(false);

  if (!authReady) return <div className="center-screen muted">กำลังโหลด…</div>;
  if (!user) return <Login />;

  const sub = loc.pathname.startsWith('/settings/');
  return (
    <div className="app">
      <header className="topbar">
        <div className="row">
          {sub && <NavLink to="/settings" className="icon-btn" aria-label="กลับ">‹</NavLink>}
          <h1>{TITLES[loc.pathname] ?? 'สลิปบัญชี'}</h1>
          {useEmulator && <span className="badge warn">emulator</span>}
        </div>
        <SyncBadge />
      </header>
      {!loaded ? (
        <div className="empty">กำลังโหลดข้อมูล…</div>
      ) : (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/import" element={<Import />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/categories" element={<CategoriesAdmin />} />
          <Route path="/settings/accounts" element={<Accounts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      {loaded && !sub && loc.pathname !== '/import' && (
        <button className="fab" onClick={() => setAdding(true)} aria-label="เพิ่มรายการ">+</button>
      )}
      <nav className="bottomnav">
        <div className="inner">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <span className="ico">{n.ico}</span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />;
  return (
    <DataProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </DataProvider>
  );
}
