import { betterAuthAccount } from './betterAuthAccount';
import type { LifeAuthClient } from './authClient';

jest.mock('expo-apple-authentication', () => ({}));

/** An auth client after the Google sheet: the stored cookie line and whether a session came back. */
function fakeClient(cookie: string, signedIn: boolean): LifeAuthClient {
  const client = {
    signIn: { social: async () => ({ data: null, error: null }) },
    getSession: async () => ({
      data: signedIn ? { user: { id: 'user-1', email: 'sam@example.com' } } : null,
      error: null,
    }),
    getCookie: async () => cookie,
  };
  return client as unknown as LifeAuthClient;
}

describe('betterAuthAccount with Google', () => {
  it('says cancelled and holds no cookie when the sheet closes with only the state cookie', async () => {
    const account = betterAuthAccount(fakeClient('better-auth.state=abc', false));
    expect(await account.signInWithGoogle()).toBe('cancelled');
    expect(account.cookie()).toBeNull();
  });

  it('says signed in and holds the cookie once the session is there', async () => {
    const line = 'better-auth.state=abc; better-auth.session_token=tok';
    const account = betterAuthAccount(fakeClient(line, true));
    expect(await account.signInWithGoogle()).toBe('signedIn');
    expect(account.cookie()).toBe(line);
  });
});
