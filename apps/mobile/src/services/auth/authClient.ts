// Better Auth on the phone: the Expo plugin keeps the session cookie in the secure store and opens the
// browser for Google; the email code plugin signs in with six digits.
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

export function createLifeAuthClient(apiBaseUrl: string) {
  return createAuthClient({
    baseURL: apiBaseUrl,
    plugins: [
      expoClient({ scheme: 'lifedocumentary', storagePrefix: 'life', storage: SecureStore }),
      emailOTPClient(),
    ],
  });
}

export type LifeAuthClient = ReturnType<typeof createLifeAuthClient>;
