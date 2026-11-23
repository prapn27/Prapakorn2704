export interface Env {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  /** ตั้งเป็น "dev" ใน .dev.vars เท่านั้น — ห้ามมีบน production */
  ENV?: string;
}
