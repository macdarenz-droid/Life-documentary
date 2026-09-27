import { tokens } from '@life/design';
import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { addCastMember, listCast } from '../../application/cast';
import { todayHarness } from '../../application/testing/todayHarness';
import { castActions } from './CastRoute';
import { CastScreen } from './CastScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => undefined }) }));

async function press(name: string | RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

/** Every rendered element whose own style uses the accent colour. */
function accentElements(): { props: { accessibilityLabel?: string } }[] {
  const found: { props: { accessibilityLabel?: string } }[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as {
      props: { style?: unknown; accessibilityLabel?: string };
      children?: unknown;
    };
    const style = StyleSheet.flatten(n.props?.style as never) as
      Record<string, unknown> | undefined;
    if (style && Object.values(style).includes(tokens.color.accent)) found.push(n);
    walk(n.children);
  };
  walk(screen.toJSON());
  return found;
}

async function setup(seed?: (h: Awaited<ReturnType<typeof todayHarness>>) => Promise<void>) {
  const h = await todayHarness();
  if (seed) await seed(h);
  await render(<CastScreen actions={castActions(h.ctx)} />);
  await screen.findByRole('button', { name: words.cast.namePerson });
  return h;
}

describe('CastScreen', () => {
  it('lists people with their relation', async () => {
    await setup(async ({ ctx }) => {
      await addCastMember(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'Mara', 'sister');
      await addCastMember(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'Sam');
    });
    expect(screen.getByRole('button', { name: 'Mara, sister' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sam' })).toBeOnTheScreen();
    expect(screen.queryByText(words.cast.empty)).toBeNull();
  });

  it('shows the empty-state words when nobody is named', async () => {
    await setup();
    expect(screen.getByText(words.cast.empty)).toBeOnTheScreen();
  });

  it('adds a person through the "Name a person" tray', async () => {
    const h = await setup();
    await press(words.cast.namePerson);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(words.cast.nameLabel), ' Mara ');
      fireEvent.changeText(screen.getByLabelText(words.cast.relationLabel), 'sister');
    });
    await press(words.cast.save);
    expect(await screen.findByRole('button', { name: 'Mara, sister' })).toBeOnTheScreen();
    expect(await listCast(h.ctx.store, h.ctx.documentary)).toMatchObject([
      { name: 'Mara', relation: 'sister' },
    ]);
  });

  it('sets and clears a relation from the row tray', async () => {
    await setup(async ({ ctx }) => {
      await addCastMember(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'Sam');
    });
    await press('Sam');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(words.cast.relationLabel), 'brother');
    });
    await press(words.cast.saveRelation);
    expect(await screen.findByRole('button', { name: 'Sam, brother' })).toBeOnTheScreen();
    await press('Sam, brother');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(words.cast.relationLabel), '  ');
    });
    await press(words.cast.saveRelation);
    expect(await screen.findByRole('button', { name: 'Sam' })).toBeOnTheScreen();
  });

  it('asks before removing, then hides the row', async () => {
    await setup(async ({ ctx }) => {
      await addCastMember(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'Sam');
    });
    await press('Sam');
    await press(words.cast.remove);
    expect(screen.getByText(words.cast.removeAsk)).toBeOnTheScreen();
    await press(words.cast.removeConfirm);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sam' })).toBeNull());
    expect(screen.getByText(words.cast.empty)).toBeOnTheScreen();
  });

  it('has the amber action as its only accent-coloured element', async () => {
    await setup(async ({ ctx }) => {
      await addCastMember(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'Sam');
    });
    const accents = accentElements();
    expect(accents).toHaveLength(1);
    expect(accents[0]?.props.accessibilityLabel).toBe(words.cast.namePerson);
  });
});
