import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

/**
 * ใช้ Firebase เฉพาะส่วนล็อกอิน (Authentication) เท่านั้น
 * ข้อมูลรายการทั้งหมดอยู่ที่ Cloudflare D1 ผ่าน /api (ดู docs/PLAN-cloudflare-d1.md)
 */
const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

export const useEmulator = env.VITE_USE_EMULATOR === 'true';
export const isConfigured = Boolean(config.apiKey && config.projectId);

let auth: Auth | null = null;

if (isConfigured) {
  const app = initializeApp(config);
  auth = getAuth(app);
  if (useEmulator) connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
}

export function getAuthInstance(): Auth {
  if (!auth) throw new Error('Firebase is not configured');
  return auth;
}
