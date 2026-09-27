// The account on the phone (P4): after a sign-in the phone registers itself and links its local
// documentary, the first sync handshake. Capture never needs an account; failures here leave the local
// documentary as it was and come back as a words line.
import { ACCOUNT_PURGE_DAYS, Documentary, Me, Uuid } from '@life/contracts';
import { addDays, dayAndMonth, words } from '@life/story';
import * as documentaries from '../data/repositories/documentaries';
import * as settings from '../data/repositories/settings';
import type { Account, AccountUser, Api, DeviceInfo, SignInResult } from '../domain/capturePorts';
import type { Clock, Store } from './ports';

const DEVICE_ID_KEY = 'device_id';

export type ThisDevice = DeviceInfo & { newId(): Uuid };

export type LinkResult = { ok: true; documentary: Documentary } | { ok: false; line: string };

/** This phone's id: made once, then kept in the device settings. */
export async function deviceId(store: Store, newId: () => Uuid): Promise<Uuid> {
  const stored = await settings.get(store.driver, DEVICE_ID_KEY);
  if (stored !== undefined) return Uuid.parse(stored);
  const id = newId();
  await settings.put(store.driver, DEVICE_ID_KEY, id);
  return id;
}

/**
 * Registers the phone and links its documentary. When the account owns it under another id, the local
 * row takes the account's id (updatedAt moves), so every later row carries it. Running it again changes
 * nothing.
 */
export async function afterSignIn(
  store: Store,
  clock: Clock,
  api: Api,
  documentary: Documentary,
  device: ThisDevice,
): Promise<LinkResult> {
  try {
    const local = (await documentaries.get(store.driver, documentary.id)) ?? documentary;
    const id = await deviceId(store, () => device.newId());
    await api.registerDevice({ id, platform: device.platform, appVersion: device.appVersion });
    const { documentary: linked } = await api.linkDocumentary(local);
    if (linked.ownerUserId === local.ownerUserId) return { ok: true, documentary: local };
    const updated = Documentary.parse({
      ...local,
      ownerUserId: linked.ownerUserId,
      updatedAt: clock.now(),
    });
    await documentaries.put(store.driver, updated);
    return { ok: true, documentary: updated };
  } catch (error) {
    console.error('The documentary was not linked.', error);
    return { ok: false, line: words.account.linkFailed };
  }
}

export type AccountDeps = {
  store: Store;
  clock: Clock;
  account: Account;
  api: Api;
  documentary: Documentary;
  device: ThisDevice;
};

/** What the Account section shows after a sign-in attempt. */
export type SignInOutcome = {
  user: AccountUser | null;
  line?: string;
  /** The local documentary after the link, when it changed hands. */
  documentary?: Documentary;
};

/** Runs one way of signing in, cancels an open deletion, then `afterSignIn` once. */
export async function signInAndLink(
  deps: AccountDeps,
  signIn: () => Promise<SignInResult>,
): Promise<SignInOutcome> {
  let result: SignInResult;
  try {
    result = await signIn();
  } catch (error) {
    console.error('Sign-in failed.', error);
    return { user: null, line: words.account.signInFailed };
  }
  if (result === 'cancelled') return { user: null };
  if (result === 'wrongCode') return { user: null, line: words.account.codeWrong };
  const user = await deps.account.session().catch(() => null);
  if (!user) return { user: null, line: words.account.signInFailed };
  try {
    const me = await deps.api.me();
    if (me.deletion !== null) await deps.api.cancelDeletion();
  } catch (error) {
    console.error('The open deletion was not cancelled.', error);
    return { user: null, line: words.account.signInFailed };
  }
  const link = await afterSignIn(deps.store, deps.clock, deps.api, deps.documentary, deps.device);
  return link.ok ? { user, documentary: link.documentary } : { user, line: link.line };
}

/** Sends a sign-in code to a typed address: the address it went to, or the line to show. */
export async function sendSignInCode(
  account: Account,
  typed: string,
): Promise<{ to?: string; line?: string }> {
  const email = Me.shape.email.safeParse(typed.trim().toLowerCase());
  if (!email.success) return { line: words.account.emailInvalid };
  try {
    await account.sendCode(email.data);
    return { to: email.data };
  } catch (error) {
    console.error('The code was not sent.', error);
    return { line: words.account.sendFailed };
  }
}

/** "15 April 2027" for a LocalDate. */
function dateLabel(date: string): string {
  return `${dayAndMonth(date)} ${date.slice(0, 4)}`;
}

/**
 * Asks the server to delete the account. The server ends every session, so the phone signs out too and
 * shows the purge date: 30 days from today in the documentary's time zone.
 */
export async function requestAccountDeletion(
  deps: Pick<AccountDeps, 'clock' | 'account' | 'api' | 'documentary'>,
): Promise<{ ok: true; line: string } | { ok: false; line: string }> {
  try {
    await deps.api.requestDeletion();
  } catch (error) {
    console.error('The deletion request failed.', error);
    return { ok: false, line: words.account.deleteFailed };
  }
  await deps.account.signOut().catch(() => undefined);
  const purgeOn = addDays(deps.clock.today(deps.documentary.timeZone), ACCOUNT_PURGE_DAYS);
  return { ok: true, line: words.account.deleted(dateLabel(purgeOn)) };
}
