import { words } from '@life/story';
import * as documentaries from '../data/repositories/documentaries';
import { afterSignIn, refreshPushToken, requestAccountDeletion, signInAndLink } from './account';
import { todayHarness } from './testing/todayHarness';

type Harness = Awaited<ReturnType<typeof todayHarness>>;

const setClock = (h: Harness, at: string) =>
  (h.ctx.clock as typeof h.ctx.clock & { set(next: string): void }).set(at);

const device = (h: Harness) => ({ ...h.services.device, newId: () => h.ctx.ids.newId() });

const run = (h: Harness) =>
  afterSignIn(h.store, h.ctx.clock, h.services.api, h.ctx.documentary, device(h));

describe('afterSignIn', () => {
  it('registers the phone, links the documentary and takes the account owner id', async () => {
    const h = await todayHarness();
    setClock(h, '2027-03-15T10:00:00Z');
    const result = await run(h);

    expect(h.services.api.devices).toHaveLength(1);
    expect(h.services.api.devices[0]).toMatchObject({ platform: 'ios', appVersion: '0.0.0' });
    expect(h.services.api.linked.map((d) => d.id)).toEqual([h.ctx.documentary.id]);
    const stored = await documentaries.get(h.store.driver, h.ctx.documentary.id);
    expect(stored?.ownerUserId).toBe(h.services.api.ownerUserId);
    expect(stored?.updatedAt).toBe('2027-03-15T10:00:00Z');
    expect(result).toEqual({ ok: true, documentary: stored });
  });

  it('changes nothing the second time and keeps the same device id', async () => {
    const h = await todayHarness();
    setClock(h, '2027-03-15T10:00:00Z');
    await run(h);
    const once = await documentaries.get(h.store.driver, h.ctx.documentary.id);

    setClock(h, '2027-03-15T11:00:00Z');
    const again = await run(h);

    expect(await documentaries.get(h.store.driver, h.ctx.documentary.id)).toEqual(once);
    expect(again).toEqual({ ok: true, documentary: once });
    const [first, second] = h.services.api.devices;
    expect(second?.id).toBe(first?.id);
    expect(h.services.api.linked).toHaveLength(1);
  });

  it('leaves the local documentary as it was when the link fails, and says so', async () => {
    const h = await todayHarness();
    h.services.api.failLink = true;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const before = await documentaries.get(h.store.driver, h.ctx.documentary.id);

    const result = await run(h);

    expect(result).toEqual({ ok: false, line: words.account.linkFailed });
    expect(await documentaries.get(h.store.driver, h.ctx.documentary.id)).toEqual(before);
    jest.restoreAllMocks();
  });
});

describe('signInAndLink', () => {
  const deps = (h: Harness) => ({
    store: h.store,
    clock: h.ctx.clock,
    account: h.services.account,
    api: h.services.api,
    documentary: h.ctx.documentary,
    device: device(h),
  });

  it('shows the wrong-code line and links nothing for a wrong code', async () => {
    const h = await todayHarness();
    const outcome = await signInAndLink(deps(h), () =>
      h.services.account.signInWithCode('sam@example.com', '000000'),
    );
    expect(outcome).toEqual({ user: null, line: words.account.codeWrong });
    expect(h.services.api.linked).toHaveLength(0);
  });

  it('shows nothing when the person cancels Apple or Google', async () => {
    const h = await todayHarness();
    h.services.account.social = 'cancelled';
    expect(await signInAndLink(deps(h), () => h.services.account.signInWithGoogle())).toEqual({
      user: null,
    });
  });

  it('cancels an open deletion once when the person signs in again', async () => {
    const h = await todayHarness();
    h.services.api.deletion = { purgeAfter: '2027-04-14T09:30:00Z' };
    const outcome = await signInAndLink(deps(h), () => h.services.account.signInWithGoogle());
    expect(outcome.user).toEqual(h.services.account.person);
    expect(h.services.api.deletionCancels).toBe(1);
    expect((await h.services.api.me()).deletion).toBeNull();
  });

  it('cancels nothing when no deletion is open', async () => {
    const h = await todayHarness();
    await signInAndLink(deps(h), () => h.services.account.signInWithGoogle());
    expect(h.services.api.deletionCancels).toBe(0);
  });

  it('shows the sign-in failed line when the open deletion cannot be checked', async () => {
    const h = await todayHarness();
    h.services.api.me = () => Promise.reject(new Error('No network'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const outcome = await signInAndLink(deps(h), () => h.services.account.signInWithGoogle());
    expect(outcome).toEqual({ user: null, line: words.account.signInFailed });
    jest.restoreAllMocks();
  });
});

describe('requestAccountDeletion', () => {
  it('asks the server, signs out and gives the purge date 30 days from today', async () => {
    const h = await todayHarness('2027-03-15T09:30:00Z');
    h.services.account.signedIn = h.services.account.person;
    const result = await requestAccountDeletion({
      clock: h.ctx.clock,
      account: h.services.account,
      api: h.services.api,
      documentary: h.ctx.documentary,
    });
    expect(h.services.api.deletionRequests).toBe(1);
    expect(h.services.account.signedIn).toBeNull();
    expect(result).toEqual({ ok: true, line: words.account.deleted('14 April 2027') });
  });
});

describe('the push token', () => {
  const TOKEN = 'ExponentPushToken[abc]';
  const withToken = (h: Harness, token: () => Promise<string | null>) => ({
    ...device(h),
    pushTokens: { current: token },
  });
  const refresh = (h: Harness, dev: ReturnType<typeof withToken>) =>
    refreshPushToken({
      store: h.store,
      clock: h.ctx.clock,
      account: h.services.account,
      api: h.services.api,
      device: dev,
      timeZone: h.ctx.documentary.timeZone,
    });

  it('goes up with the registration after sign-in', async () => {
    const h = await todayHarness();
    await afterSignIn(
      h.store,
      h.ctx.clock,
      h.services.api,
      h.ctx.documentary,
      withToken(h, async () => TOKEN),
    );
    expect(h.services.api.devices[0]?.pushToken).toBe(TOKEN);
  });

  it('goes up on a foreground at most once a day, and only when signed in', async () => {
    const h = await todayHarness();
    setClock(h, '2027-03-15T10:00:00Z');
    const dev = withToken(h, async () => TOKEN);
    expect(await refresh(h, dev)).toBe(false);
    h.services.account.signedIn = h.services.account.person;
    expect(await refresh(h, dev)).toBe(true);
    expect(await refresh(h, dev)).toBe(false);
    setClock(h, '2027-03-16T10:00:00Z');
    expect(await refresh(h, dev)).toBe(true);
    expect(h.services.api.devices.map((d) => d.pushToken)).toEqual([TOKEN, TOKEN]);
  });

  it('counts the day only after a registration with a token worked', async () => {
    const h = await todayHarness();
    setClock(h, '2027-03-15T10:00:00Z');
    h.services.account.signedIn = h.services.account.person;
    // No token yet: nothing is sent and the day does not count.
    let token: string | null = null;
    const dev = withToken(h, async () => token);
    await afterSignIn(h.store, h.ctx.clock, h.services.api, h.ctx.documentary, dev);
    expect(h.services.api.devices[0]?.pushToken).toBeUndefined();
    expect(await refresh(h, dev)).toBe(false);
    // A registration that fails does not count either.
    token = TOKEN;
    const registerDevice = h.services.api.registerDevice;
    h.services.api.registerDevice = () => Promise.reject(new Error('No network'));
    await expect(refresh(h, dev)).rejects.toThrow('No network');
    h.services.api.registerDevice = registerDevice;
    expect(await refresh(h, dev)).toBe(true);
    expect(await refresh(h, dev)).toBe(false);
  });
});
