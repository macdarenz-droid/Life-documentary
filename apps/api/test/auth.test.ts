import { getAuthTables } from '@better-auth/core/db';
import { Uuid } from '@life/contracts';
import { env } from 'cloudflare:workers';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { authPlugins, authRateLimit } from '../src/auth';
import { authSchema } from '../src/data/schema';
import { recordingMail, type RecordingMail } from '../src/providers/mail';
import type { Env } from '../src/shared/env';

const bindings = env as unknown as Env;
const ORIGIN = bindings.BETTER_AUTH_URL;

let mail: RecordingMail;
let app: ReturnType<typeof createApp>;
let logged: string[];
/** Each test is its own client, so the per-client rate limits of one test do not reach the next. */
let client = 0;
let ip: string;

beforeEach(() => {
  client += 1;
  ip = `203.0.113.${client}`;
  mail = recordingMail();
  app = createApp({ mail });
  logged = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    `/api/auth${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        'cf-connecting-ip': ip,
        ...headers,
      },
      body: JSON.stringify(body),
    },
    bindings,
  );
}

async function sendCode(email: string): Promise<string> {
  const before = mail.sent.length;
  const res = await post('/email-otp/send-verification-otp', { email, type: 'sign-in' });
  expect(res.status).toBe(200);
  expect(mail.sent.length).toBe(before + 1);
  const message = mail.sent.at(-1)!;
  expect(message.to).toBe(email);
  const code = /\b(\d{6})\b/.exec(message.text)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}

function signIn(email: string, otp: string) {
  return post('/sign-in/email-otp', { email, otp });
}

/** A code of the same length that is not `code`. */
function wrong(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, '0');
}

describe('Better Auth on D1', () => {
  it('has every table and field Better Auth needs for our options', () => {
    const needed = getAuthTables({ rateLimit: authRateLimit, plugins: authPlugins(mail) });
    const tables = authSchema as Record<string, (typeof authSchema)[keyof typeof authSchema]>;
    for (const [model, table] of Object.entries(needed)) {
      const ours = tables[table.modelName];
      expect(ours, `table for ${model}`).toBeDefined();
      const columns = Object.keys(getTableColumns(ours!));
      expect(columns).toContain('id');
      for (const [key, field] of Object.entries(table.fields)) {
        expect(columns, `${getTableName(ours!)}.${field.fieldName ?? key}`).toContain(
          field.fieldName ?? key,
        );
      }
    }
  });

  it('signs a new person in with a six-digit code and returns their session', async () => {
    const email = 'ada@example.com';
    const code = await sendCode(email);

    const res = await signIn(email, code);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('better-auth.session_token=');

    const session = await app.request(
      '/api/auth/get-session',
      { headers: { cookie: cookie!.split(';')[0]!, origin: ORIGIN } },
      bindings,
    );
    expect(session.status).toBe(200);
    const body = await session.json<{ user: { id: string; email: string } }>();
    expect(body.user.email).toBe(email);
    expect(Uuid.safeParse(body.user.id).success).toBe(true);
  });

  it('refuses a code used a second time and a wrong code', async () => {
    const email = 'grace@example.com';
    const code = await sendCode(email);
    expect((await signIn(email, wrong(code))).ok).toBe(false);
    expect((await signIn(email, code)).status).toBe(200);
    const again = await signIn(email, code);
    expect(again.status).not.toBe(429);
    expect(again.ok).toBe(false);
  });

  it('refuses the right code after three wrong ones', async () => {
    const email = 'hedy@example.com';
    const code = await sendCode(email);
    for (let i = 0; i < 3; i++) expect((await signIn(email, wrong(code))).ok).toBe(false);
    // Sign-in allows three tries per client per window, so the fourth comes from another client: it is
    // refused because the code has used up its attempts, not because of the rate limit.
    ip = `198.51.100.${client}`;
    const last = await signIn(email, code);
    expect(last.status).not.toBe(429);
    expect(last.ok).toBe(false);
  });

  it('counts sign-in tries by cf-connecting-ip, whatever X-Forwarded-For says', async () => {
    const email = 'ida@example.com';
    const code = await sendCode(email);
    // A new X-Forwarded-For on every try does not make a new client.
    for (let i = 0; i < 3; i++) {
      const res = await post(
        '/sign-in/email-otp',
        { email, otp: wrong(code) },
        {
          'x-forwarded-for': `10.0.0.${i}`,
        },
      );
      expect(res.status).not.toBe(429);
    }
    const fourth = await post(
      '/sign-in/email-otp',
      { email, otp: code },
      {
        'x-forwarded-for': '10.0.0.9',
      },
    );
    expect(fourth.status).toBe(429);
    // A list in X-Forwarded-For does not put a different client into the same count.
    const other = await post(
      '/sign-in/email-otp',
      { email, otp: wrong(code) },
      {
        'cf-connecting-ip': `198.51.100.${client}`,
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      },
    );
    expect(other.status).not.toBe(429);
  });

  it('never stores or logs the plain code', async () => {
    const email = 'katherine@example.com';
    const code = await sendCode(email);
    const rows = await bindings.DB.prepare('SELECT * FROM verification').all();
    expect(rows.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows.results)).not.toContain(code);
    expect((await signIn(email, code)).status).toBe(200);
    expect(logged.join('\n')).not.toContain(code);
    expect(logged.join('\n')).not.toContain(email);
  });
});
