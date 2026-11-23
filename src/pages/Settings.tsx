import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/store';
import { exportCsv } from '../lib/csv';
import { getOcrWorker } from '../lib/ocr';
import { monthKey } from '../lib/format';

export default function Settings() {
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
      scope === 'all' ? 'รายรับรายจ่าย-ทั้งหมด.csv' : `รายรับรายจ่าย-${m}.csv`
    );
  };

  return (
    <div className="page">
      <div className="card">
        <h2>หลังบ้าน</h2>
        <div className="menu">
          <Link to="/settings/categories">
            <span className="ico">🗂️</span>
            <span>
              หมวดหมู่ กลุ่ม กฎจับคู่ note และงบประมาณ
              <div className="small muted">{data.groups.length} กลุ่ม · {data.categories.length} หมวด</div>
            </span>
            <span className="chev">›</span>
          </Link>
          <Link to="/settings/accounts">
            <span className="ico">👛</span>
            <span>
              บัญชี / กระเป๋าเงิน
              <div className="small muted">{data.accounts.length} บัญชี</div>
            </span>
            <span className="chev">›</span>
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>ข้อมูล</h2>
        <div className="menu">
          <button onClick={() => doExport('month')}><span className="ico">📄</span><span>Export CSV เดือนนี้</span><span className="chev">›</span></button>
          <button onClick={() => doExport('all')}><span className="ico">📚</span><span>Export CSV ทั้งหมด ({data.transactions.length} รายการ)</span><span className="chev">›</span></button>
          <button onClick={prepareOcr} disabled={ocr === 'loading'}>
            <span className="ico">🔤</span>
            <span>
              เตรียมตัวอ่านสลิปไว้ใช้ตอนออฟไลน์
              <div className="small muted">
                {ocr === 'idle' && 'ดาวน์โหลดโมเดลภาษาไทยล่วงหน้า (ทำครั้งเดียวตอนมีเน็ต)'}
                {ocr === 'loading' && 'กำลังดาวน์โหลด…'}
                {ocr === 'ready' && '✓ พร้อมใช้งานออฟไลน์แล้ว'}
                {ocr === 'error' && 'ดาวน์โหลดไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'}
              </div>
            </span>
          </button>
        </div>
      </div>

      <div className="card">
        <h2>บัญชีผู้ใช้</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>
          ล็อกอินเป็น {data.user?.email ?? data.user?.displayName ?? '-'} · ข้อมูลซิงก์ทุกเครื่องที่ล็อกอินบัญชีนี้
        </div>
        <button className="btn danger block" onClick={() => confirm('ออกจากระบบ?') && data.signOut()}>
          ออกจากระบบ
        </button>
      </div>
      <div className="small muted" style={{ textAlign: 'center' }}>สลิปบัญชี v0.1</div>
    </div>
  );
}
