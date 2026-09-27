// Better Auth inside the Worker, on D1 through Drizzle (DECISIONS D17, D36). The instance is built per
// request from `env`, because a Worker has no global env. Email sign-in is a six-digit code; Apple and
// Google are configured only when their secrets exist.
import { expo } from '@better-auth/expo';
import { words } from '@life/story';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from '../data/schema';
import type { MailSender } from '../providers/mail';
import type { Env } from '../shared/env';

export const APP_ORIGIN = 'lifedocumentary://';
export const CODE_LENGTH = 6;
export const CODE_SECONDS = 300;
export const CODE_ATTEMPTS = 3;

function socialProviders(env: Env): BetterAuthOptions['socialProviders'] {
  return {
    ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: env.APPLE_CLIENT_ID,
            clientSecret: env.APPLE_CLIENT_SECRET,
            ...(env.APPLE_APP_BUNDLE_IDENTIFIER
              ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }
              : {}),
          },
        }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
  };
}

/** The options without the database and secrets: what getAuthTables needs to list the tables. */
export function authPlugins(mail: MailSender) {
  return [
    emailOTP({
      otpLength: CODE_LENGTH,
      expiresIn: CODE_SECONDS,
      allowedAttempts: CODE_ATTEMPTS,
      storeOTP: 'hashed',
      async sendVerificationOTP({ email, otp }) {
        await mail.send(email, words.mail.codeSubject, words.mail.codeText(otp));
      },
    }),
    expo(),
  ];
}

export const authRateLimit = { enabled: true, storage: 'database' } as const;

export function createAuth(env: Env, mail: MailSender) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(drizzle(env.DB), {
      provider: 'sqlite',
      schema: authSchema,
      transaction: false,
    }),
    advanced: { database: { generateId: 'uuid', validateSchema: false } },
    rateLimit: authRateLimit,
    trustedOrigins: [APP_ORIGIN],
    user: { deleteUser: { enabled: false } },
    socialProviders: socialProviders(env),
    plugins: authPlugins(mail),
  });
}
