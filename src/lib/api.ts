import type { SyncRequest, SyncResponse } from '../../shared/schema';
import { tr } from './i18n';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type TokenGetter = (forceRefresh: boolean) => Promise<string>;

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const TIMEOUT_MS = 15_000;

async function post<T>(path: string, body: unknown, getToken: TokenGetter): Promise<T> {
  let lastStatus = 0;
  // ถ้าโดน 401 ให้ขอ token ใหม่ (บังคับรีเฟรช) แล้วลองอีกครั้งเดียว
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) return (await res.json()) as T;
    lastStatus = res.status;
    if (res.status !== 401) break;
  }
  throw new ApiError(lastStatus, tr('เซิร์ฟเวอร์ตอบกลับ {status}', { status: lastStatus }));
}

export const makeApi = (getToken: TokenGetter) => ({
  sync: (req: SyncRequest) => post<SyncResponse>('/api/sync', req, getToken),
  bootstrap: () => post<{ seeded: boolean }>('/api/bootstrap', {}, getToken)
});
export type Api = ReturnType<typeof makeApi>;
