// The Account port over Better Auth. Apple uses the native sheet and sends its identity token; Google
// opens the browser through the Expo plugin. The cookie is cached after every call so API requests can
// read it without waiting.
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Account, SignInResult } from '../../domain/capturePorts';
import type { LifeAuthClient } from './authClient';

type Failure = { status: number } | null;

/** A refused code comes back as a 4xx; anything else is a failure the caller shows. */
function codeResult(error: Failure): SignInResult {
  if (!error) return 'signedIn';
  if (error.status >= 400 && error.status < 500 && error.status !== 429) return 'wrongCode';
  throw new Error(`Sign-in by code failed: ${error.status}`);
}

function ok(error: Failure, what: string): void {
  if (error) throw new Error(`${what} failed: ${error.status}`);
}

export function betterAuthAccount(client: LifeAuthClient): Account {
  let cached: string | null = null;
  const refresh = async () => {
    const cookie = await client.getCookie();
    cached = cookie.length > 0 ? cookie : null;
  };

  return {
    session: async () => {
      const { data } = await client.getSession();
      await refresh();
      return data ? { userId: data.user.id, email: data.user.email } : null;
    },
    sendCode: async (email) => {
      const { error } = await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      ok(error, 'Sending the code');
    },
    signInWithCode: async (email, code) => {
      const { error } = await client.signIn.emailOtp({ email, otp: code });
      await refresh();
      return codeResult(error);
    },
    signInWithApple: async () => {
      let token: string | null;
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          ],
        });
        token = credential.identityToken;
      } catch (error) {
        if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
        throw error;
      }
      if (!token) throw new Error('Apple gave no identity token');
      const { error } = await client.signIn.social({ provider: 'apple', idToken: { token } });
      ok(error, 'Sign in with Apple');
      await refresh();
      return 'signedIn';
    },
    signInWithGoogle: async () => {
      const { error } = await client.signIn.social({
        provider: 'google',
        callbackURL: '/settings',
      });
      ok(error, 'Sign in with Google');
      await refresh();
      return cached ? 'signedIn' : 'cancelled';
    },
    signOut: async () => {
      try {
        await client.signOut();
      } finally {
        cached = null;
      }
    },
    cookie: () => cached,
  };
}
