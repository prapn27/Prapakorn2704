import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/store';
import { LanguageSwitch } from '../components/ui';
import { exportCsv } from '../lib/csv';
import { getOcrWorker } from '../lib/ocr';
import { monthKey } from '../lib/format';
import { useI18n } from '../lib/i18n';

export default function Settings() {
  const { tt } = useI18n();
  const data = useData();
  const [ocr, setOcr] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const prepareOcr = async () => {
    setOcr('loading');
    try {
      await getOcrWorker();
      setOcr('ready');
    } catch {
      setOcr('error');
    }
  };

  const doExport = (scope: 'all' | 'month') => {
    const m = monthKey(new Date());
    const txs = scope === 'all' ? data.transactions : data.transactions.filter((t) => t.date.startsWith(m));
    exportCsv(
      [...txs].sort((a, b) => a.date.localeCompare(b.date)),
      data.categoryById,
      data.groupById,
      data.accountById,
      scope === 'all' ? tt('รายรับรายจ่าย-ทั้งหมด.csv') : tt('รายรับรายจ่าย-{m}.csv', { m })
    );
  };

  return (
    <div className="page">
      <div className="card">
        <h2>{tt('หลังบ้าน')}</h2>
        <div className="menu">
          <Link to="/settings/categories">
            <span className="ico">🗂️</span>
            <span>
              {tt('หมวดหมู่ กลุ่ม กฎจับคู่ note และงบประมาณ')}
              <div className="small muted">{tt('{g} กลุ่ม · {c} หมวด', { g: data.groups.length, c: data.categories.length })}</div>
            </span>
            <span className="chev">›</span>
          </Link>
          <Link to="/settings/accounts">
            <span className="ico">👛</span>
            <span>
              {tt('บัญชี / กระเป๋าเงิน')}
              <div className="small muted">{tt('{n} บัญชี', { n: data.accounts.length })}</div>
            </span>
            <span className="chev">›</span>
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>{tt('ข้อมูล')}</h2>
        <div className="menu">
          <button onClick={() => doExport('month')}><span className="ico">📄</span><span>{tt('Export CSV เดือนนี้')}</span><span className="chev">›</span></button>
          <button onClick={() => doExport('all')}><span className="ico">📚</span><span>{tt('Export CSV ทั้งหมด ({n} รายการ)', { n: data.transactions.length })}</span><span className="chev">›</span></button>
          <button onClick={prepareOcr} disabled={ocr === 'loading'}>
            <span className="ico">🔤</span>
            <span>
              {tt('เตรียมตัวอ่านสลิปไว้ใช้ตอนออฟไลน์')}
              <div className="small muted">
                {ocr === 'idle' && tt('ดาวน์โหลดโมเดลภาษาไทยล่วงหน้า (ทำครั้งเดียวตอนมีเน็ต)')}
                {ocr === 'loading' && tt('กำลังดาวน์โหลด…')}
                {ocr === 'ready' && tt('✓ พร้อมใช้งานออฟไลน์แล้ว')}
                {ocr === 'error' && tt('ดาวน์โหลดไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')}
              </div>
            </span>
          </button>
        </div>
      </div>

      <div className="card">
        <h2>{tt('ภาษา')}</h2>
        <LanguageSwitch />
      </div>

      <div className="card">
        <h2>{tt('บัญชีผู้ใช้')}</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>
          {tt('ล็อกอินเป็น {user} · ข้อมูลซิงก์ทุกเครื่องที่ล็อกอินบัญชีนี้', { user: data.user?.email ?? data.user?.displayName ?? '-' })}
        </div>
        <button className="btn danger block" onClick={() => confirm(tt('ออกจากระบบ?')) && data.signOut()}>
          {tt('ออกจากระบบ')}
        </button>
      </div>
      <div className="small muted" style={{ textAlign: 'center' }}>{tt('สลิปบัญชี')} v0.1 · {__APP_BUILD__}</div>
    </div>
  );
}
