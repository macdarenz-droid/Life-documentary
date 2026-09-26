// The keychain over expo-secure-store. Never requireAuthentication: background uploads need the key.
import {
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
  type SecureStoreOptions,
} from 'expo-secure-store';
import type { KeyStore } from '../../domain/ports';

const options: SecureStoreOptions = { keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const expoKeyStore: KeyStore = {
  get: (name) => getItemAsync(name, options),
  set: (name, value) => setItemAsync(name, value, options),
  remove: (name) => deleteItemAsync(name, options),
};
