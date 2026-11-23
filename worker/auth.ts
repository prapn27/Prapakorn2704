import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env';

const JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

let remoteKeys: JWTVerifyGetKey | undefined;

export class AuthError extends Error {}

/**
 * ตรวจ Firebase ID token แล้วคืน uid
 * - production: ตรวจลายเซ็น RS256 กับ JWKS ของ Google, issuer, audience
 * - ENV=dev: ยอมรับ token ที่ไม่มีลายเซ็นจาก Auth Emulator (ตรวจแค่ issuer/audience/sub)
 * `keys` ใช้ฉีดกุญแจเองตอนทดสอบ
 */
export async function verifyIdToken(token: string, env: Env, keys?: JWTVerifyGetKey): Promise<string> {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new AuthError('server misconfigured');
  const issuer = `https://securetoken.google.com/${projectId}`;

  try {
    if (env.ENV === 'dev') {
      const p = decodeJwt(token);
      if (p.iss !== issuer || p.aud !== projectId || typeof p.sub !== 'string' || !p.sub) {
        throw new AuthError('bad dev token');
      }
      if (typeof p.exp === 'number' && p.exp * 1000 < Date.now()) throw new AuthError('expired');
      return p.sub;
    }
    remoteKeys ??= createRemoteJWKSet(JWKS_URL);
    const { payload } = await jwtVerify(token, keys ?? remoteKeys, {
      algorithms: ['RS256'],
      issuer,
      audience: projectId,
      clockTolerance: 10
    });
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
      throw new AuthError('bad sub');
    }
    return payload.sub;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('invalid token');
  }
}

export function bearer(header: string | undefined | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}
