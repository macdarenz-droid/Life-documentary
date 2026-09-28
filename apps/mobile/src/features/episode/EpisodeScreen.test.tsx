import { DeviceEpisode, Uuid } from '@life/contracts';
import { episodeWords } from '@life/story';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { downloadReady } from '../../application/episodes';
import { fakeEpisodeFiles, storeEpisode } from '../../application/testing/fakeEpisodeFiles';
import { todayHarness } from '../../application/testing/todayHarness';
import { episodeActions } from './EpisodeRoute';
import { EpisodeScreen } from './EpisodeScreen';

const ID = Uuid.parse('00000000-0000-4000-8000-000000000701');
const T = '2027-03-14T17:00:00.000Z';

async function setup(state: DeviceEpisode['state'] = 'ready') {
  const h = await todayHarness();
  const files = fakeEpisodeFiles(h.store.io);
  const ctx = { ...h.ctx, services: { ...h.ctx.services, episodes: files } };
  await storeEpisode(
    h.store,
    DeviceEpisode.parse({
      id: ID,
      documentaryId: h.ctx.documentary.id,
      number: 1,
      weekStart: '2027-03-07',
      weekEnd: '2027-03-13',
      state,
      title: 'Rain on the tram',
      renderVersion: state === 'ready' ? 1 : 0,
      updatedAt: T,
    }),
  );
  const onClose = jest.fn();
  const show = () =>
    render(
      <EpisodeScreen
        id={ID}
        actions={episodeActions(ctx)}
        Playback={h.ctx.Playback!}
        onClose={onClose}
      />,
    );
  return { h, files, ctx, onClose, show };
}

describe('EpisodeScreen', () => {
  it('plays the decrypted local copy when there is one', async () => {
    const s = await setup();
    await downloadReady(
      s.h.store,
      s.h.ctx.documentary,
      { connection: async () => 'wifi' },
      s.files,
    );
    await s.show();
    const player = await screen.findByTestId('episode-player');
    expect(player.props.accessibilityValue.text).toBe(`cache/playback/episode-${ID}.mp4`);
    expect(screen.getByLabelText(episodeWords.playing('Rain on the tram'))).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: episodeWords.close }));
    expect(s.onClose).toHaveBeenCalled();
  });

  it('streams the route with the session header otherwise', async () => {
    const s = await setup();
    await s.show();
    const player = await screen.findByTestId('episode-player');
    expect(player.props.accessibilityValue.text).toBe(
      `https://api.test/episodes/${ID}/video cookie=life.session_token=fake`,
    );
  });

  it('says it could not be opened for an episode that is not ready', async () => {
    const s = await setup('rendering');
    await s.show();
    expect(await screen.findByText(episodeWords.openError)).toBeOnTheScreen();
    expect(screen.queryByTestId('episode-player')).toBeNull();
  });
});
