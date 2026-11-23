declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FIREBASE_PROJECT_ID: string;
    ENV?: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
