import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { words } from '@life/story';
import { createApp } from '../src/app';
import { recordingMail } from '../src/providers/mail';
import type { Env } from '../src/shared/env';
import { testApp } from './session';

const bindings = env as unknown as Env;
const ORIGIN = new URL(bindings.BETTER_AUTH_URL).origin;
const t = words.deletePage;
let client = 0;

function browser() {
  const mail = recordingMail();
  const app = createApp({ mail });
  client += 1;
  const ip = `198.18.0.${client}`;
  let cookie = '';
  const submit = async (path: string, fields: Record<string, string>, origin = ORIGIN) => {
    const res = await app.request(
      path,
      {
        method: 'POST',
        headers: {
          origin,
          'cf-connecting-ip': ip,
          'content-type': 'application/x-www-form-urlencoded',
          ...(cookie ? { cookie } : {}),
        },
        body: new URLSearchParams(fields).toString(),
      },
      bindings,
    );
    const set = res.headers.getSetCookie().find((c) => c.includes('session_token='));
    if (set) cookie = set.split(';')[0]!;
    return { res, set, text: await res.text() };
  };
  return { app, mail, submit };
}

async function deletionRows(email: string) {
  return bindings.DB.prepare(
    'SELECT d.purge_after FROM deletion_requests d JOIN user u ON u.id = d.user_id WHERE u.email = ?',
  )
    .bind(email)
    .all<{ purge_after: string }>();
}

/** Makes an account for `email` through the app's own sign-in, as a person with the app would. */
async function account(email: string) {
  await testApp().signIn(email);
}

async function userRows(email: string) {
  return (await bindings.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).all())
    .results;
}

/** The page's text as a person reads it: character references turned back into characters. */
function readable(html: string): string {
  return html.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function codeOf(text: string): string {
  return /\b(\d{6})\b/.exec(text)![1]!;
}

describe('the public deletion page', () => {
  it('renders a labelled email field and no script', async () => {
    const res = await createApp().request('/account/delete', {}, bindings);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain(`<label for="email">${t.emailLabel}</label>`);
    expect(text).toContain('<input id="email" name="email" type="email"');
    expect(text).not.toContain('<script');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('deletes by email code: sends the code, signs in for the page only, opens the request', async () => {
    const { mail, submit } = browser();
    const email = 'page.leaver@example.com';
    await account(email);

    const sent = await submit('/account/delete/web/code', { email });
    expect(sent.res.status).toBe(200);
    expect(sent.text).toContain(`<label for="otp">${t.codeLabel}</label>`);
    expect(mail.sent).toHaveLength(1);

    const verified = await submit('/account/delete/web/verify', {
      email,
      otp: codeOf(mail.sent[0]!.text),
    });
    expect(verified.res.status).toBe(200);
    expect(verified.text).toContain(t.deleteButton);
    expect(verified.set).toContain('Path=/account/delete/web');
    expect((await deletionRows(email)).results).toHaveLength(0);

    const done = await submit('/account/delete/web/confirm', {});
    expect(done.res.status).toBe(200);
    const rows = (await deletionRows(email)).results;
    expect(rows).toHaveLength(1);
    const date = new Date(rows[0]!.purge_after).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    expect(done.text).toContain(t.done(date));
    expect(done.text).toContain(t.howToCancel);
  });

  it('shows the plain error line for a wrong code and creates nothing', async () => {
    const { mail, submit } = browser();
    const email = 'page.wrong@example.com';
    await account(email);
    await submit('/account/delete/web/code', { email });
    const right = codeOf(mail.sent[0]!.text);
    const wrong = String((Number(right) + 1) % 1_000_000).padStart(6, '0');

    const res = await submit('/account/delete/web/verify', { email, otp: wrong });
    expect(res.res.status).toBe(400);
    expect(res.text).toContain(t.codeWrong);
    expect(res.set).toBeUndefined();
    const confirm = await submit('/account/delete/web/confirm', {});
    expect(confirm.res.status).toBe(401);
    expect((await deletionRows(email)).results).toHaveLength(0);
  });

  it('refuses a POST from another origin', async () => {
    const { mail, submit } = browser();
    const res = await submit(
      '/account/delete/web/code',
      { email: 'page.foreign@example.com' },
      'https://evil.example',
    );
    expect(res.res.status).toBe(403);
    expect(res.text).toContain(t.refused);
    expect(mail.sent).toHaveLength(0);
  });

  it('sends no more than three codes to one address in ten minutes', async () => {
    const { mail, submit } = browser();
    const email = 'page.often@example.com';
    await account(email);
    for (let i = 0; i < 3; i++) {
      const res = await submit('/account/delete/web/code', { email });
      expect(res.text).toContain(`<label for="otp">${t.codeLabel}</label>`);
    }
    expect(mail.sent).toHaveLength(3);

    const fourth = await submit('/account/delete/web/code', { email });
    expect(fourth.res.status).toBe(429);
    expect(readable(fourth.text)).toContain(t.tooManyCodes);
    expect(fourth.text).not.toContain('<label for="otp">');
    expect(mail.sent).toHaveLength(3);
  });

  it('sends no more than five codes for one client in ten minutes', async () => {
    const { mail, submit } = browser();
    const email = 'page.sixth@example.com';
    await account(email);
    for (let i = 0; i < 5; i++) {
      const res = await submit('/account/delete/web/code', { email: `page.many${i}@example.com` });
      expect(res.res.status).toBe(200);
    }

    const sixth = await submit('/account/delete/web/code', { email });
    expect(sixth.res.status).toBe(429);
    expect(readable(sixth.text)).toContain(t.tooManyCodes);
    expect(mail.sent).toHaveLength(0);
  });

  it('never creates an account: an unknown address gets the code step and no mail', async () => {
    const { mail, submit } = browser();
    const email = 'page.nobody@example.com';

    const sent = await submit('/account/delete/web/code', { email });
    expect(sent.res.status).toBe(200);
    expect(sent.text).toContain(`<label for="otp">${t.codeLabel}</label>`);
    expect(mail.sent).toHaveLength(0);

    const verified = await submit('/account/delete/web/verify', { email, otp: '123456' });
    expect(verified.res.status).toBe(400);
    expect(verified.text).toContain(t.codeWrong);
    expect(verified.set).toBeUndefined();
    expect(await userRows(email)).toHaveLength(0);
  });
});
