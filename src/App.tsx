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
import { I18nProvider, useI18n } from './lib/i18n';

const TITLES: Record<string, string> = {
  '/': 'สลิปบัญชี', // i18n-key
  '/transactions': 'รายการ', // i18n-key
  '/import': 'นำเข้าสลิป', // i18n-key
  '/reports': 'รายงาน', // i18n-key
  '/settings': 'ตั้งค่า', // i18n-key
  '/settings/categories': 'จัดการหมวดหมู่', // i18n-key
  '/settings/accounts': 'บัญชี / กระเป๋าเงิน' // i18n-key
};

const NAV = [
  { to: '/', ico: '🏠', label: 'หน้าหลัก' }, // i18n-key
  { to: '/transactions', ico: '📋', label: 'รายการ' }, // i18n-key
  { to: '/import', ico: '🧾', label: 'นำเข้าสลิป' }, // i18n-key
  { to: '/reports', ico: '📊', label: 'รายงาน' }, // i18n-key
  { to: '/settings', ico: '⚙️', label: 'ตั้งค่า' } // i18n-key
];

function Shell() {
  const { tt } = useI18n();
  const { user, authReady, loaded, online, syncing, syncError, retrySync, notice, dismissNotice } = useData();
  const loc = useLocation();
  const [adding, setAdding] = useState(false);

  if (!authReady) return <div className="center-screen muted">{tt('กำลังโหลด…')}</div>;
  if (!user) return <Login />;

  const sub = loc.pathname.startsWith('/settings/');
  return (
    <div className="app">
      <header className="topbar">
        <div className="row">
          {sub && <NavLink to="/settings" className="icon-btn" aria-label={tt('กลับ')}>‹</NavLink>}
          <h1>{tt(TITLES[loc.pathname] ?? TITLES['/'])}</h1>
          {useEmulator && <span className="badge warn">emulator</span>}
        </div>
        <SyncBadge />
      </header>
      {notice && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="banner warn" role="status">
            <span>ℹ️</span>
            <span className="spacer" style={{ whiteSpace: 'pre-line' }}>{notice}</span>
            <button className="icon-btn" onClick={dismissNotice} aria-label={tt('ปิดข้อความ')}>✕</button>
          </div>
        </div>
      )}
      {!loaded ? (
        <div className="page">
          <div className="card stack" style={{ textAlign: 'center' }}>
            {syncing ? (
              <div className="muted">{tt('กำลังตั้งค่าและดาวน์โหลดข้อมูล…')}</div>
            ) : (
              <>
                <div>
                  {online
                    ? syncError
                      ? tt('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
                      : tt('กำลังโหลดข้อมูล…')
                    : tt('ต้องต่ออินเทอร์เน็ตเพื่อตั้งค่าครั้งแรก')}
                </div>
                <div className="small muted">{tt('เปิดครั้งแรกบนเครื่องนี้ต้องออนไลน์เพื่อดึงข้อมูล หลังจากนั้นใช้ออฟไลน์ได้')}</div>
                <button className="btn" onClick={retrySync}>{tt('ลองใหม่')}</button>
              </>
            )}
          </div>
        </div>
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
        <button className="fab" onClick={() => setAdding(true)} aria-label={tt('เพิ่มรายการ')}>+</button>
      )}
      <nav className="bottomnav">
        <div className="inner">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <span className="ico">{n.ico}</span>
              {tt(n.label)}
            </NavLink>
          ))}
        </div>
      </nav>
      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      {!isConfigured ? (
        <SetupNeeded />
      ) : (
        <DataProvider>
          <HashRouter>
            <Shell />
          </HashRouter>
        </DataProvider>
      )}
    </I18nProvider>
  );
}
