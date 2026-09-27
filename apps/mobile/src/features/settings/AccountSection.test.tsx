import { words } from '@life/story';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { openLocalDocumentary } from '../../application/bootstrap';
import { todayHarness } from '../../application/testing/todayHarness';
import { accountActions, settingsActions } from './SettingsRoute';
import { SettingsScreen } from './SettingsScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => undefined }) }));

type Harness = Awaited<ReturnType<typeof todayHarness>>;

/** The documentary as the phone now stores it. */
const local = (h: Harness) =>
  openLocalDocumentary(h.store, h.ctx.clock, h.ctx.ids, 'Europe/Berlin');

async function setup(prepare: (h: Harness) => void = () => undefined) {
  const h = await todayHarness();
  prepare(h);
  await render(
    <SettingsScreen
      actions={settingsActions(h.ctx)}
      account={accountActions(h.ctx)}
      {...(h.ctx.AppleButton ? { AppleButton: h.ctx.AppleButton } : {})}
    />,
  );
  await screen.findByText(words.account.title);
  return h;
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

async function type(label: string, text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), text);
  });
}

async function signInByCode(code = '123456') {
  await type(words.account.emailLabel, ' Sam@Example.com ');
  await press(words.account.sendCode);
  expect(screen.getByText(words.account.codeSent('sam@example.com'))).toBeOnTheScreen();
  await type(words.account.codeLabel, code);
  await press(words.account.signIn);
}

describe('Settings, Account', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('says capture works without an account and offers Apple, Google and email', async () => {
    await setup();
    expect(screen.getByText(words.account.intro)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: words.account.signInApple })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: words.account.continueGoogle })).toBeOnTheScreen();
    expect(screen.getByLabelText(words.account.emailLabel)).toBeOnTheScreen();
  });

  it('has no Apple button on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await setup();
    expect(screen.queryByRole('button', { name: words.account.signInApple })).toBeNull();
    expect(screen.getByRole('button', { name: words.account.continueGoogle })).toBeOnTheScreen();
  });

  it('signs in with a code, then registers the phone and links the documentary once', async () => {
    const h = await setup();
    await signInByCode();

    expect(screen.getByText('sam@example.com')).toBeOnTheScreen();
    expect(h.services.account.sentCodes).toEqual(['sam@example.com']);
    expect(h.services.api.devices).toHaveLength(1);
    expect(h.services.api.linked.map((d) => d.id)).toEqual([h.ctx.documentary.id]);
    const stored = await local(h);
    expect(stored?.ownerUserId).toBe(h.services.api.ownerUserId);
    expect(screen.getByRole('button', { name: words.account.signOut })).toBeOnTheScreen();
  });

  it('shows the wrong-code line and stays signed out', async () => {
    const h = await setup();
    await signInByCode('000000');
    expect(screen.getByText(words.account.codeWrong)).toBeOnTheScreen();
    expect(h.services.api.linked).toHaveLength(0);
    expect(screen.queryByRole('button', { name: words.account.signOut })).toBeNull();
  });

  it('keeps the local documentary and shows the line when the link fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = await setup((harness) => {
      harness.services.api.failLink = true;
    });
    const before = await local(h);
    await press(words.account.signInApple);

    expect(screen.getByText(words.account.linkFailed)).toBeOnTheScreen();
    expect(await local(h)).toEqual(before);
  });

  it('signs out back to the signed-out section', async () => {
    await setup((h) => {
      h.services.account.signedIn = h.services.account.person;
    });
    expect(screen.getByText('sam@example.com')).toBeOnTheScreen();
    await press(words.account.signOut);
    expect(screen.getByText(words.account.intro)).toBeOnTheScreen();
    expect(screen.queryByText('sam@example.com')).toBeNull();
  });

  it('asks once before deleting, then shows the purge date', async () => {
    const h = await setup((harness) => {
      harness.services.account.signedIn = harness.services.account.person;
    });
    await press(words.account.deleteAccount);
    expect(screen.getByText(words.account.deleteAsk)).toBeOnTheScreen();
    expect(h.services.api.deletionRequests).toBe(0);

    await press(words.account.keep);
    expect(screen.queryByText(words.account.deleteAsk)).toBeNull();

    await press(words.account.deleteAccount);
    await press(words.account.deleteConfirm);
    expect(h.services.api.deletionRequests).toBe(1);
    expect(screen.getByText(words.account.deleted('14 April 2027'))).toBeOnTheScreen();
    expect(screen.getByText(words.account.intro)).toBeOnTheScreen();
  });
});
