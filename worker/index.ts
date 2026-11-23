import { Hono } from 'hono';
import type { JWTVerifyGetKey } from 'jose';
import { syncRequestSchema } from '../shared/schema';
import { AuthError, bearer, verifyIdToken } from './auth';
import { bootstrap } from './bootstrap';
import type { Env } from './env';
import { purgeTombstones } from './purge';
import { sync } from './sync';

const MAX_BODY = 512 * 1024;

export function createApp(opts: { keys?: JWTVerifyGetKey } = {}) {
  const app = new Hono<{ Bindings: Env; Variables: { uid: string } }>();

  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const token = bearer(c.req.header('Authorization'));
    if (!token) return c.json({ error: 'unauthorized' }, 401);
    try {
      c.set('uid', await verifyIdToken(token, c.env, opts.keys));
    } catch (e) {
      if (!(e instanceof AuthError)) console.error('auth error', e);
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });

  app.get('/api/me', async (c) => {
    const row = await c.env.DB.prepare('SELECT rev, seeded FROM users WHERE id = ?')
      .bind(c.get('uid'))
      .first<{ rev: number; seeded: number }>();
    return c.json({ uid: c.get('uid'), rev: row?.rev ?? 0, seeded: row?.seeded === 1 });
  });

  app.post('/api/bootstrap', async (c) => c.json(await bootstrap(c.env.DB, c.get('uid'))));

  app.post('/api/sync', async (c) => {
    const text = await c.req.text();
    if (text.length > MAX_BODY) return c.json({ error: 'payload too large' }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return c.json({ error: 'invalid json' }, 400);
    }
    const parsed = syncRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', detail: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);
    }
    return c.json(await sync(c.env.DB, c.get('uid'), parsed.data));
  });

  app.onError((e, c) => {
    console.error('unhandled', e);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(purgeTombstones(env.DB));
  }
} satisfies ExportedHandler<Env>;
