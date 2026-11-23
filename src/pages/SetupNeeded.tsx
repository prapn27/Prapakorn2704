import { useI18n } from '../lib/i18n';

export default function SetupNeeded() {
  const { tt } = useI18n();
  return (
    <div className="center-screen">
      <div className="card auth-card stack">
        <h1 style={{ margin: 0, fontSize: 20 }}>{tt('ยังไม่ได้ตั้งค่าการล็อกอิน')}</h1>
        <p className="small" style={{ margin: 0 }}>
          {tt('แอพใช้ Firebase Authentication สำหรับล็อกอิน ให้สร้างไฟล์')} <code>.env.local</code> {tt('โดยคัดลอกจาก')}{' '}
          <code>.env.example</code> {tt('แล้วใส่ค่าจาก Firebase Console จากนั้นรัน')} <code>npm run dev</code> {tt('ใหม่')}
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          {tt('ถ้าต้องการลองในเครื่องโดยไม่มีโปรเจกต์จริง ให้ใช้ Auth Emulator')} (<code>npm run emulators</code>) {tt('คู่กับ')}{' '}
          <code>npm run dev:worker</code> {tt('และ')} <code>npm run dev:emu</code> — {tt('รายละเอียดอยู่ใน README')}
        </p>
      </div>
    </div>
  );
}
