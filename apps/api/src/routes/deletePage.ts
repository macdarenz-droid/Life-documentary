// The public deletion page (P4): an account can be deleted without the app, as the app stores require.
// Plain server-rendered HTML with no script at all and no tracking. The email code signs the person in
// for this page only (the session cookie's path is the page's own), and the button opens the same
// deletion request as POST /account/delete. Every POST checks that it came from this origin.
import { Uuid } from '@life/contracts';
import { words } from '@life/story';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { database } from '../data/db';
import * as deletionRequests from '../data/repositories/deletionRequests';
import type { AppEnv } from './middleware/session';

const PAGE = '/account/delete';
const STEPS = `${PAGE}/web`;
const t = words.deletePage;

const Email = z.email().max(254);
const Code = z.string().regex(/^\d{6}$/);

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escape(t.title)}</title>
<style>
  body { margin: 0; background: #faf7f2; color: #1c1a17; font: 1.0625rem/1.5 system-ui, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; padding: 2rem 1rem; }
  h1 { font-size: 1.5rem; line-height: 1.25; }
  form { display: grid; gap: 0.75rem; margin-top: 1.5rem; }
  label { font-weight: 600; }
  input { font: inherit; padding: 0.75rem; border: 2px solid #5c564e; border-radius: 0.5rem; background: #fff; color: #1c1a17; }
  input:focus, button:focus { outline: 3px solid #1f4e8c; outline-offset: 2px; }
  button { font: inherit; font-weight: 600; min-height: 2.75rem; padding: 0.75rem 1rem; border: 0; border-radius: 0.5rem; background: #1c1a17; color: #fff; cursor: pointer; }
  .note { color: #4a453e; }
  .error { color: #8a1c14; font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>${escape(t.title)}</h1>
${body}
</main>
</body>
</html>`;
}

function emailForm(error?: string): string {
  return `<p>${escape(t.intro)}</p>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
<form method="post" action="${STEPS}/code">
  <label for="email">${escape(t.emailLabel)}</label>
  <input id="email" name="email" type="email" autocomplete="email" required>
  <button type="submit">${escape(t.sendCode)}</button>
</form>`;
}

function codeForm(email: string, error?: string): string {
  return `<p>${escape(t.codeSent(email))}</p>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
<form method="post" action="${STEPS}/verify">
  <input type="hidden" name="email" value="${escape(email)}">
  <label for="otp">${escape(t.codeLabel)}</label>
  <input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
  <button type="submit">${escape(t.checkCode)}</button>
</form>`;
}

function confirmForm(): string {
  return `<p>${escape(t.confirmLine)}</p>
<form method="post" action="${STEPS}/confirm">
  <button type="submit">${escape(t.deleteButton)}</button>
</form>`;
}

function doneText(purgeAfter: string): string {
  const date = new Date(purgeAfter).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `<p role="status">${escape(t.done(date))}</p>
<p class="note">${escape(t.howToCancel)}</p>`;
}

function html(c: Context<AppEnv>, body: string, status: 200 | 400 | 401 | 403 = 200) {
  c.header('Cache-Control', 'no-store');
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  return c.html(page(body), status);
}

/** A POST is accepted only from this page's own origin. */
function sameOrigin(c: Context<AppEnv>): boolean {
  return c.req.header('origin') === new URL(c.env.BETTER_AUTH_URL).origin;
}

async function field(c: Context<AppEnv>, name: string): Promise<string> {
  const form: Record<string, unknown> = await c.req.parseBody().catch(() => ({}));
  const value = form[name];
  return typeof value === 'string' ? value.trim() : '';
}

/** Better Auth's session cookie, narrowed to the page's own steps. */
function forThisPage(setCookie: string): string {
  return setCookie.replace(/;\s*Path=[^;]*/i, '').concat(`; Path=${STEPS}`);
}

export const deletePage = new Hono<AppEnv>()
  .get(PAGE, (c) => html(c, emailForm()))
  .post(`${STEPS}/code`, async (c) => {
    if (!sameOrigin(c)) return html(c, `<p class="error">${escape(t.refused)}</p>`, 403);
    const email = Email.safeParse((await field(c, 'email')).toLowerCase());
    if (!email.success) return html(c, emailForm(t.emailInvalid), 400);
    await c.var.auth().api.sendVerificationOTP({ body: { email: email.data, type: 'sign-in' } });
    return html(c, codeForm(email.data));
  })
  .post(`${STEPS}/verify`, async (c) => {
    if (!sameOrigin(c)) return html(c, `<p class="error">${escape(t.refused)}</p>`, 403);
    const email = Email.safeParse((await field(c, 'email')).toLowerCase());
    if (!email.success) return html(c, emailForm(t.emailInvalid), 400);
    const otp = Code.safeParse(await field(c, 'otp'));
    if (!otp.success) return html(c, codeForm(email.data, t.codeWrong), 400);
    try {
      const { headers } = await c.var.auth().api.signInEmailOTP({
        body: { email: email.data, otp: otp.data },
        headers: c.req.raw.headers,
        returnHeaders: true,
      });
      for (const cookie of headers.getSetCookie())
        c.header('Set-Cookie', forThisPage(cookie), { append: true });
      return html(c, confirmForm());
    } catch {
      return html(c, codeForm(email.data, t.codeWrong), 400);
    }
  })
  .post(`${STEPS}/confirm`, async (c) => {
    if (!sameOrigin(c)) return html(c, `<p class="error">${escape(t.refused)}</p>`, 403);
    const auth = c.var.auth();
    const found = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!found) return html(c, emailForm(), 401);
    const request = await deletionRequests.request(
      database(c.env.DB),
      Uuid.parse(found.user.id),
      new Date().toISOString(),
    );
    await auth.api.revokeSessions({ headers: c.req.raw.headers });
    return html(c, doneText(request.purgeAfter));
  });
