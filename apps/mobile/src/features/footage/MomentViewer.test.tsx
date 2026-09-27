import type { Uuid } from '@life/contracts';
import { words } from '@life/story';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { captureMoment, type CaptureInput } from '../../application/captureMoment';
import {
  JPEG_HEAD,
  fileWithHead,
  ftyp,
  todayHarness,
} from '../../application/testing/todayHarness';
import { todayQuestion } from '../../application/todayQuestion';
import { viewerActions } from './FootageRoute';
import { MomentViewer } from './MomentViewer';

type Harness = Awaited<ReturnType<typeof todayHarness>>;

async function capture(h: Harness, input: CaptureInput, bytes?: Uint8Array) {
  if (bytes) h.store.io.files.set('tmp/source', bytes);
  const moment = await captureMoment(h.store, h.ctx.clock, h.ctx.ids, input);
  h.store.io.files.delete('tmp/source');
  return moment;
}

async function open(h: Harness, id: Uuid) {
  const real = viewerActions(h.ctx);
  const actions = {
    load: jest.fn(real.load),
    openOriginal: jest.fn(real.openOriginal),
    closeOriginal: jest.fn(real.closeOriginal),
  };
  const onClose = jest.fn();
  const view = await render(
    <MomentViewer id={id} actions={actions} Playback={h.ctx.Playback!} onClose={onClose} />,
  );
  return { actions, onClose, view };
}

describe('MomentViewer', () => {
  it('plays a video answer under its question, opening the original once and closing it on Close', async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const moment = await capture(
      h,
      {
        kind: 'answer',
        questionId: question.id,
        media: {
          sourcePath: 'tmp/source',
          mediaKind: 'video',
          durationMs: 6000,
          width: 1080,
          height: 1920,
        },
        localOnly: false,
      },
      fileWithHead(ftyp('qt  ')),
    );
    const { actions, onClose } = await open(h, moment.id);

    const player = await screen.findByTestId('video-player');
    const uri = `cache/playback/${moment.mediaAssetId}.mov`;
    expect(player.props.accessibilityValue).toEqual({ text: `${uri} playing` });
    expect(h.store.io.files.has(uri)).toBe(true);
    expect(screen.getByText(question.text)).toBeOnTheScreen();
    expect(actions.openOriginal).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: words.footage.pause }));
    });
    expect(screen.getByTestId('video-player').props.accessibilityValue).toEqual({
      text: `${uri} paused`,
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: words.footage.close }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(actions.closeOriginal).toHaveBeenCalledWith(moment.mediaAssetId);
    expect(h.store.io.files.has(uri)).toBe(false);
  });

  it('plays a voice answer with its question and a timecode, and closes it on unmount', async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const moment = await capture(
      h,
      {
        kind: 'answer',
        questionId: question.id,
        media: { sourcePath: 'tmp/source', mediaKind: 'audio', durationMs: 6000 },
        localOnly: false,
      },
      fileWithHead(ftyp('M4A ')),
    );
    const { actions, view } = await open(h, moment.id);
    expect(await screen.findByTestId('audio-player')).toBeOnTheScreen();
    expect(screen.getByText(question.text)).toBeOnTheScreen();
    expect(screen.getByText('0:00 / 0:06')).toBeOnTheScreen();
    expect(actions.openOriginal).toHaveBeenCalledTimes(1);
    await act(async () => {
      view.unmount();
    });
    expect(actions.closeOriginal).toHaveBeenCalledWith(moment.mediaAssetId);
  });

  it("shows an answer's transcript under the player, and nothing for an answer without one", async () => {
    const h = await todayHarness();
    const question = await todayQuestion(h.store, h.ctx.documentary, h.ctx.clock, h.ctx.ids);
    const voice = {
      kind: 'answer' as const,
      questionId: question.id,
      media: { sourcePath: 'tmp/source', mediaKind: 'audio' as const, durationMs: 6000 },
      localOnly: false,
    };
    const said = await capture(h, voice, fileWithHead(ftyp('M4A ')));
    const quiet = await capture(h, voice, fileWithHead(ftyp('M4A ')));
    // Rows as a pull lands them: a transcript for the first answer, only a caption for the second.
    const derived = (id: string, momentId: string, provider: string, field: string, text: string) =>
      h.store.driver.run(
        `INSERT INTO derived (id, moment_id, ${field}, language, provider, model_version, produced_at)
         VALUES (?, ?, ?, 'en', ?, 'fixture-1', '2027-03-21T18:00:00Z')`,
        [id, momentId, text, provider],
      );
    await derived(
      '00000000-0000-4000-8000-0000000000d1',
      said.id,
      'workersAi',
      'transcript',
      'We walked down to the lake after work.',
    );
    await derived(
      '00000000-0000-4000-8000-0000000000d2',
      quiet.id,
      'anthropic',
      'caption',
      'A person on a bench by the water.',
    );

    const first = await open(h, said.id);
    expect(await screen.findByText('We walked down to the lake after work.')).toBeOnTheScreen();
    expect(screen.getByText(question.text)).toBeOnTheScreen();
    await act(async () => {
      first.view.unmount();
    });

    await open(h, quiet.id);
    expect(await screen.findByTestId('audio-player')).toBeOnTheScreen();
    expect(screen.queryByText('We walked down to the lake after work.')).toBeNull();
    expect(screen.queryByText('A person on a bench by the water.')).toBeNull();
  });

  it('shows a photo still with its note as the caption', async () => {
    const h = await todayHarness();
    const moment = await capture(
      h,
      {
        kind: 'photo',
        media: { sourcePath: 'tmp/source', mediaKind: 'photo', width: 3024, height: 4032 },
        localOnly: false,
      },
      fileWithHead(JPEG_HEAD),
    );
    await h.store.driver.run('UPDATE moments SET text = ? WHERE id = ?', [
      'The harbour at dawn',
      moment.id,
    ]);
    const { actions } = await open(h, moment.id);
    expect(await screen.findByText('The harbour at dawn')).toBeOnTheScreen();
    expect(screen.getByLabelText(words.footage.kinds.photo)).toBeOnTheScreen();
    expect(actions.openOriginal).toHaveBeenCalledTimes(1);
  });

  it('shows a note in display type without opening any file', async () => {
    const h = await todayHarness();
    const moment = await capture(h, { kind: 'note', text: 'A slow morning.', localOnly: false });
    const { actions } = await open(h, moment.id);
    expect(await screen.findByText('A slow morning.')).toBeOnTheScreen();
    expect(actions.openOriginal).not.toHaveBeenCalled();
  });

  it('says plainly when the original cannot be opened', async () => {
    const h = await todayHarness();
    const moment = await capture(
      h,
      {
        kind: 'clip',
        media: {
          sourcePath: 'tmp/source',
          mediaKind: 'video',
          durationMs: 6000,
          width: 1080,
          height: 1920,
        },
        localOnly: false,
      },
      new Uint8Array(4096).map((_, i) => (i * 31 + 17) & 255),
    );
    await open(h, moment.id);
    expect(await screen.findByText(words.footage.cannotOpen)).toBeOnTheScreen();
    expect(screen.queryByTestId('video-player')).toBeNull();
  });
});
