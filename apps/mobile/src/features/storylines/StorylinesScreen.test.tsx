import { tokens } from '@life/design';
import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { captureMoment } from '../../application/captureMoment';
import { closeStoryline, createStoryline } from '../../application/storylines';
import { tagMoment } from '../../application/tagMoment';
import type { fixedClock } from '../../application/testing/memory';
import { todayHarness } from '../../application/testing/todayHarness';
import { storylineActions } from './StorylinesRoute';
import { StorylinesScreen } from './StorylinesScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: () => undefined }) }));

async function press(name: string | RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

/** Every rendered element whose own style uses the accent colour. */
function accentElements(): unknown[] {
  const found: unknown[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { props?: { style?: unknown }; children?: unknown };
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
  await render(<StorylinesScreen actions={storylineActions(h.ctx)} />);
  await screen.findByRole('button', { name: words.storylines.newStoryline });
  return h;
}

describe('StorylinesScreen', () => {
  it('lists open storylines, then closed ones under "Closed", with counts', async () => {
    await setup(async ({ ctx }) => {
      const { store, clock, ids, documentary } = ctx;
      const job = await createStoryline(store, clock, ids, documentary, 'The new job');
      const move = await createStoryline(store, clock, ids, documentary, 'Moving house');
      await createStoryline(store, clock, ids, documentary, 'Half marathon');
      const note = await captureMoment(store, clock, ids, {
        kind: 'note',
        text: 'First day.',
        localOnly: false,
      });
      await tagMoment(store, clock, note.id, { storylineIds: [job.id], castIds: [] });
      (clock as ReturnType<typeof fixedClock>).set('2027-03-16T09:30:00Z');
      await closeStoryline(store, clock, move.id);
    });
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string | undefined)
      .filter((l): l is string => l !== undefined && l.includes(', since '));
    expect(labels).toEqual([
      'The new job, since March 2027, 1 moment',
      'Half marathon, since March 2027, 0 moments',
      'Moving house, since March 2027, 0 moments',
    ]);
    const closedHeading = screen.getByRole('header', { name: words.storylines.closed });
    expect(closedHeading).toBeOnTheScreen();
  });

  it('shows the empty-state words when there are no storylines', async () => {
    await setup();
    expect(screen.getByText(words.storylines.empty)).toBeOnTheScreen();
  });

  it('adds a row through the "New storyline" tray', async () => {
    await setup();
    await press(words.storylines.newStoryline);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(words.storylines.titleLabel), 'The new job');
    });
    await press(words.storylines.save);
    expect(await screen.findByRole('button', { name: /^The new job, since/ })).toBeOnTheScreen();
    expect(screen.queryByText(words.storylines.empty)).toBeNull();
  });

  it('moves a closed storyline under "Closed"', async () => {
    const h = await setup(async ({ ctx }) => {
      await createStoryline(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'The new job');
    });
    expect(screen.queryByRole('header', { name: words.storylines.closed })).toBeNull();
    (h.ctx.clock as ReturnType<typeof fixedClock>).set('2027-03-16T09:30:00Z');
    await press(/^The new job, since/);
    await press(words.storylines.close);
    expect(await screen.findByRole('header', { name: words.storylines.closed })).toBeOnTheScreen();
    await press(/^The new job, since/);
    expect(screen.getByRole('button', { name: words.storylines.reopen })).toBeOnTheScreen();
  });

  it('asks before removing, then hides the row', async () => {
    await setup(async ({ ctx }) => {
      await createStoryline(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'The new job');
    });
    await press(/^The new job, since/);
    await press(words.storylines.remove);
    expect(screen.getByText(words.storylines.removeAsk)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^The new job, since/ })).toBeOnTheScreen();
    await press(words.storylines.removeConfirm);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^The new job, since/ })).toBeNull(),
    );
  });

  it('has the amber action as its only accent-coloured element', async () => {
    await setup(async ({ ctx }) => {
      await createStoryline(ctx.store, ctx.clock, ctx.ids, ctx.documentary, 'The new job');
    });
    const accents = accentElements();
    expect(accents).toHaveLength(1);
    expect(
      (accents[0] as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
    ).toBe(words.storylines.newStoryline);
  });
});
