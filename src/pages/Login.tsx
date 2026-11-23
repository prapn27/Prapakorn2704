import { useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getAuthInstance } from '../lib/firebase';

const ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/wrong-password': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/user-not-found': 'ไม่พบบัญชีนี้',
  'auth/email-already-in-use': 'อีเมลนี้สมัครไว้แล้ว — ลองเข้าสู่ระบบ',
  'auth/weak-password': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
  'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
  'auth/network-request-failed': 'ต่ออินเทอร์เน็ตไม่ได้ — ล็อกอินครั้งแรกต้องออนไลน์',
  'auth/popup-closed-by-user': 'ปิดหน้าต่างล็อกอินก่อนเสร็จ'
};

export default function Login() {
  const auth = getAuthInstance();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const wrap = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(ERRORS[e?.code] ?? e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="card auth-card stack">
        <img className="logo" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <h1 style={{ textAlign: 'center', margin: 0, fontSize: 22 }}>สลิปบัญชี</h1>
        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
          บันทึกรายรับรายจ่ายจากสลิปโอนเงิน · ซิงก์ทุกเครื่อง · ใช้ออฟไลน์ได้
        </p>
        <button className="btn block" disabled={busy} onClick={() => wrap(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          เข้าสู่ระบบด้วย Google
        </button>
        <div className="divider">หรือใช้อีเมล</div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            wrap(() =>
              mode === 'in'
                ? signInWithEmailAndPassword(auth, email.trim(), password)
                : createUserWithEmailAndPassword(auth, email.trim(), password)
            );
          }}
        >
          <input className="input" type="email" autoComplete="email" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className="input"
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button className="btn primary block" disabled={busy}>{mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</button>
        </form>
        {error && <div className="small danger-text">{error}</div>}
        <div className="row small">
          <button className="btn ghost sm" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
          </button>
          <span className="spacer" />
          {mode === 'in' && (
            <button
              className="btn ghost sm"
              onClick={() =>
                email
                  ? wrap(async () => {
                      await sendPasswordResetEmail(auth, email.trim());
                      alert('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว');
                    })
                  : setError('กรอกอีเมลก่อน แล้วกด "ลืมรหัสผ่าน"')
              }
            >
              ลืมรหัสผ่าน
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
