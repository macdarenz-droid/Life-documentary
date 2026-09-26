// Port types the data layer depends on; the Expo adapters live in services/, the Node ones in tests.

/** AES-256-GCM with a caller-chosen 12-byte nonce. */
export interface Cipher {
  randomBytes(length: number): Uint8Array;
  /** Returns ciphertext ‖ 16-byte tag. */
  seal(
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Promise<Uint8Array>;
  /** Throws on a bad tag. */
  open(
    key: Uint8Array,
    nonce: Uint8Array,
    sealed: Uint8Array,
    aad: Uint8Array,
  ): Promise<Uint8Array>;
}

/** The platform keychain. */
export interface KeyStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Byte-range file access, so large files are never read whole. */
export interface FileIO {
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  read(path: string, offset: number, length: number): Promise<Uint8Array>;
  append(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Full paths of the files directly inside `dir`; empty when it does not exist. */
  list(dir: string): Promise<string[]>;
  ensureDir(dir: string): Promise<void>;
}
