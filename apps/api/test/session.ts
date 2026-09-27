// Test helpers: sign a person in by code through the real auth routes and keep their session cookie.
import { env } from 'cloudflare:workers';
import { createApp } from '../src/app';
import { recordingMail } from '../src/providers/mail';
import type { Env } from '../src/shared/env';

export const bindings = env as unknown as Env;
const ORIGIN = bindings.BETTER_AUTH_URL;
let client = 0;

export function testApp() {
  const mail = recordingMail();
  const app = createApp({ mail });
  client += 1;
  const ip = `192.0.2.${client % 250}`;

  const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
    const { cookie, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set('origin', ORIGIN);
    headers.set('x-forwarded-for', ip);
    if (rest.body !== undefined) headers.set('content-type', 'application/json');
    if (cookie) headers.set('cookie', cookie);
    return app.request(path, { ...rest, headers }, bindings);
  };

  /** Signs `email` in with a fresh code and returns the session cookie. */
  const signIn = async (email: string): Promise<string> => {
    await call('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: JSON.stringify({ email, type: 'sign-in' }),
    });
    const otp = /\b(\d{6})\b/.exec(mail.sent.at(-1)!.text)![1]!;
    const res = await call('/api/auth/sign-in/email-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
    if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
    return res.headers.get('set-cookie')!.split(';')[0]!;
  };

  const post = (path: string, body: unknown, cookie?: string) =>
    call(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(cookie ? { cookie } : {}),
    });

  return { app, call, post, signIn };
}
