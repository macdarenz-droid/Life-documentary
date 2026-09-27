import type { Uuid } from '@life/contracts';
import { tokens } from '@life/design';
import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { captureMoment } from '../../application/captureMoment';
import { ensurePoster } from '../../application/posters';
import { createStoryline } from '../../application/storylines';
import { tagMoment } from '../../application/tagMoment';
import { fileWithHead, ftyp, todayHarness } from '../../application/testing/todayHarness';
import { footageActions } from './FootageRoute';
import { FootageScreen } from './FootageScreen';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

type Harness = Awaited<ReturnType<typeof todayHarness>>;
const setClock = (h: Harness, at: string) =>
  (h.ctx.clock as typeof h.ctx.clock & { set(next: string): void }).set(at);

async function note(h: Harness, at: string, text: string, localOnly = false) {
  setClock(h, at);
  return captureMoment(h.store, h.ctx.clock, h.ctx.ids, { kind: 'note', text, localOnly });
}

async function clip(h: Harness, at: string) {
  setClock(h, at);
  h.store.io.files.set('tmp/clip', fileWithHead(ftyp('qt  ')));
  const moment = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
    kind: 'clip',
    media: {
      sourcePath: 'tmp/clip',
      mediaKind: 'video',
      durationMs: 9400,
      width: 1080,
      height: 1920,
    },
    localOnly: false,
  });
  await ensurePoster(h.store, h.services.posters, moment.mediaAssetId!);
  return moment;
}

async function show(h: Harness, onOpen = jest.fn()) {
  await render(<FootageScreen actions={footageActions(h.ctx)} onOpen={onOpen} />);
  // Let the strip finish its first layout pass (FlashList sets state on a frame callback).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return onOpen;
}

describe('FootageScreen', () => {
  it("shows the newest day's moments and changes them when another day is chosen", async () => {
    const h = await todayHarness();
    await note(h, '2027-03-14T08:00:00Z', 'Rain on the tram window.');
    await note(h, '2027-03-15T07:30:00Z', 'Coffee on the balcony.');
    const moved = await clip(h, '2027-03-15T17:05:00Z');
    const onOpen = await show(h);

    expect(await screen.findByText('Coffee on the balcony.')).toBeOnTheScreen();
    expect(screen.getByText('08:30')).toBeOnTheScreen();
    expect(screen.getByText('18:05  0:09')).toBeOnTheScreen();
    expect(screen.queryByText('Rain on the tram window.')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sunday 14 March' }));
    });
    expect(await screen.findByText('Rain on the tram window.')).toBeOnTheScreen();
    expect(screen.queryByText('Coffee on the balcony.')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Monday 15 March' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Clip, 18:05/ }));
    });
    expect(onOpen).toHaveBeenCalledWith(moved.id);
  });

  it('lists storylines with their counts and opens one', async () => {
    const h = await todayHarness();
    const job = await createStoryline(
      h.store,
      h.ctx.clock,
      h.ctx.ids,
      h.ctx.documentary,
      'The new job',
    );
    for (const [at, text] of [
      ['2027-03-13T08:00:00Z', 'First day.'],
      ['2027-03-14T08:00:00Z', 'The desk by the window.'],
    ] as const) {
      const m = await note(h, at, text);
      await tagMoment(h.store, h.ctx.clock, m.id, { storylineIds: [job.id as Uuid], castIds: [] });
    }
    await show(h);
    await screen.findByText(words.footage.title);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: words.footage.storylines }));
    });
    const row = await screen.findByRole('button', {
      name: `The new job, ${words.storylines.moments(2)}`,
    });
    expect(screen.getByText('2')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(row);
    });
    expect(await screen.findByText('The desk by the window.')).toBeOnTheScreen();
    expect(screen.getByText('First day.')).toBeOnTheScreen();
  });

  it('marks a moment kept on this phone', async () => {
    const h = await todayHarness();
    await note(h, '2027-03-15T08:00:00Z', 'Only for me.', true);
    await show(h);
    expect(await screen.findByText('Only for me.')).toBeOnTheScreen();
    expect(screen.getByText(words.footage.onThisPhone)).toBeOnTheScreen();
  });

  it('says so plainly when there is nothing yet', async () => {
    const h = await todayHarness();
    await show(h);
    expect(await screen.findByText(words.footage.empty)).toBeOnTheScreen();
  });

  it('uses no amber anywhere', async () => {
    const h = await todayHarness();
    await note(h, '2027-03-15T08:00:00Z', 'A quiet one.', true);
    await clip(h, '2027-03-15T09:00:00Z');
    await show(h);
    await screen.findByText('A quiet one.');
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(2));
    const colours: string[] = [];
    type Node = { props: Record<string, unknown>; children?: (Node | string)[] | null };
    const walk = (node: Node | Node[] | string | null) => {
      if (node === null || typeof node === 'string') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const style = (StyleSheet.flatten(node.props.style as StyleProp<ViewStyle & TextStyle>) ??
        {}) as Record<string, unknown>;
      for (const key of ['color', 'backgroundColor', 'borderColor', 'tintColor'] as const) {
        const value = style[key];
        if (typeof value === 'string') colours.push(value.toLowerCase());
      }
      (node.children ?? []).forEach((c) => walk(c as Node));
    };
    walk(screen.toJSON() as Node | Node[] | null);
    expect(colours.length).toBeGreaterThan(5);
    expect(colours).not.toContain(tokens.color.accent.toLowerCase());
  });
});
