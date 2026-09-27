import type { Uuid } from '@life/contracts';
import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { addCastMember } from '../../application/cast';
import { captureMoment } from '../../application/captureMoment';
import { ensurePoster } from '../../application/posters';
import { createStoryline } from '../../application/storylines';
import { fileWithHead, ftyp, todayHarness } from '../../application/testing/todayHarness';
import { editActions, footageActions, viewerActions } from './FootageRoute';
import { FootageScreen } from './FootageScreen';
import { MomentViewer } from './MomentViewer';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

type Harness = Awaited<ReturnType<typeof todayHarness>>;

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

async function openViewer(h: Harness, id: Uuid) {
  const onClose = jest.fn();
  const view = await render(
    <MomentViewer
      id={id}
      actions={viewerActions(h.ctx)}
      Playback={h.ctx.Playback!}
      edit={editActions(h.ctx)}
      onClose={onClose}
    />,
  );
  return { onClose, view };
}

async function showFootage(h: Harness) {
  await render(<FootageScreen actions={footageActions(h.ctx)} onOpen={jest.fn()} />);
  // Let the strip finish its first layout pass (FlashList sets state on a frame callback).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function clip(h: Harness) {
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

describe('The edit tray', () => {
  it('fixes a note and a mood, and the Footage row shows them', async () => {
    const h = await todayHarness();
    const moment = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, {
      kind: 'note',
      text: 'A slow morning.',
      localOnly: false,
    });
    const { view } = await openViewer(h, moment.id);
    await screen.findByText('A slow morning.');
    await press(words.footage.edit);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(words.footage.noteLabel), '  A slower morning. ');
    });
    await press(words.moods.calm);
    await press(words.footage.done);
    expect(await screen.findByText('A slower morning.')).toBeOnTheScreen();
    await act(async () => {
      view.unmount();
    });

    await showFootage(h);
    expect(
      await screen.findByRole('button', {
        name: `${words.footage.kinds.note}, 10:30. A slower morning. ${words.moods.calm}`,
      }),
    ).toBeOnTheScreen();
  });

  it('stores the storylines and people chosen in the tray', async () => {
    const h = await todayHarness();
    const { store, clock, ids, documentary } = h.ctx;
    const job = await createStoryline(store, clock, ids, documentary, 'The new job');
    await createStoryline(store, clock, ids, documentary, 'Half marathon');
    const mara = await addCastMember(store, clock, ids, documentary, 'Mara', 'sister');
    const moment = await captureMoment(store, clock, ids, {
      kind: 'note',
      text: 'Lunch by the river.',
      localOnly: false,
    });
    await openViewer(h, moment.id);
    await screen.findByText('Lunch by the river.');
    await press(words.footage.edit);
    await screen.findByRole('button', { name: 'The new job' });
    await press('The new job');
    await press('Mara · sister');
    await press(words.footage.done);
    await waitFor(async () => {
      const stored = await h.store.driver.all<{ storyline_id: string }>(
        'SELECT storyline_id FROM moment_storylines WHERE moment_id = ?',
        [moment.id],
      );
      const people = await h.store.driver.all<{ cast_id: string }>(
        'SELECT cast_id FROM moment_cast WHERE moment_id = ?',
        [moment.id],
      );
      expect(stored.map((r) => r.storyline_id)).toEqual([job.id]);
      expect(people.map((r) => r.cast_id)).toEqual([mara.id]);
    });
  });

  it('asks before deleting, then the row and the files are gone and the old id cannot be opened', async () => {
    const h = await todayHarness();
    const moment = await clip(h);
    const asset = (await h.store.driver.first<{ localPath: string; posterPath: string }>(
      'SELECT local_path AS localPath, poster_path AS posterPath FROM media_assets WHERE id = ?',
      [moment.mediaAssetId!],
    ))!;
    expect(h.store.io.files.has(asset.localPath)).toBe(true);
    expect(h.store.io.files.has(asset.posterPath)).toBe(true);

    const { onClose, view } = await openViewer(h, moment.id);
    await screen.findByTestId('video-player');
    await press(words.footage.edit);
    await press(words.footage.delete);
    expect(screen.getByText(words.footage.deleteAsk)).toBeOnTheScreen();
    await press(words.footage.keep);
    expect(screen.queryByText(words.footage.deleteAsk)).toBeNull();
    await press(words.footage.delete);
    await press(words.footage.deleteConfirm);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(h.store.io.files.has(asset.localPath)).toBe(false);
    expect(h.store.io.files.has(asset.posterPath)).toBe(false);
    await act(async () => {
      view.unmount();
    });

    await showFootage(h);
    expect(await screen.findByText(words.footage.empty)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Clip,/ })).toBeNull();
    screen.unmount();

    await openViewer(h, moment.id);
    expect(await screen.findByText(words.footage.cannotOpen)).toBeOnTheScreen();
  });
});
