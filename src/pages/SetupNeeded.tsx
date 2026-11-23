export default function SetupNeeded() {
  return (
    <div className="center-screen">
      <div className="card auth-card stack">
        <h1 style={{ margin: 0, fontSize: 20 }}>ยังไม่ได้ตั้งค่าการล็อกอิน</h1>
        <p className="small" style={{ margin: 0 }}>
          แอพใช้ Firebase Authentication สำหรับล็อกอิน ให้สร้างไฟล์ <code>.env.local</code> โดยคัดลอกจาก{' '}
          <code>.env.example</code> แล้วใส่ค่าจาก Firebase Console จากนั้นรัน <code>npm run dev</code> ใหม่
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          ถ้าต้องการลองในเครื่องโดยไม่มีโปรเจกต์จริง ให้ใช้ Auth Emulator (<code>npm run emulators</code>) คู่กับ{' '}
          <code>npm run dev:worker</code> และ <code>npm run dev:emu</code> — รายละเอียดอยู่ใน README
        </p>
      </div>
    </div>
  );
}
