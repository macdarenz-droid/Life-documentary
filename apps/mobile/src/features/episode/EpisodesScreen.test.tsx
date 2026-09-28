import { DeviceEpisode, Uuid } from '@life/contracts';
import { durationLabel, episodeWords } from '@life/story';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { openLocalDocumentary } from '../../application/bootstrap';
import { listEpisodes, type ThisWeek } from '../../application/episodes';
import { storeEpisode } from '../../application/testing/fakeEpisodeFiles';
import { fixedClock, memoryStore, sequentialIds } from '../../application/testing/memory';
import { EpisodesScreen } from './EpisodesScreen';

const NOW = '2027-03-21T18:30:00Z';
const id = (n: number) =>
  Uuid.parse(`00000000-0000-4000-8000-0000000006${String(n).padStart(2, '0')}`);

async function rows() {
  const store = await memoryStore();
  const clock = fixedClock(NOW);
  const documentary = await openLocalDocumentary(store, clock, sequentialIds(), 'Europe/Berlin');
  const put = (n: number, patch: Partial<DeviceEpisode>) =>
    storeEpisode(
      store,
      DeviceEpisode.parse({
        id: id(n),
        documentaryId: documentary.id,
        number: n,
        weekStart: `2027-02-${String(n * 7).padStart(2, '0')}`,
        weekEnd: `2027-02-${String(n * 7 + 6).padStart(2, '0')}`,
        state: 'ready',
        renderVersion: 1,
        updatedAt: NOW,
        ...patch,
      }),
    );
  await put(1, {
    title: 'Rain on the tram',
    durationMs: 95_000,
    localPath: 'store/episodes/e1.lde',
    localRenderVersion: 1,
  });
  await put(2, { state: 'failed', renderVersion: 0 });
  await put(3, { state: 'narrating', renderVersion: 0, dueAt: '2027-03-21T17:00:00Z' });
  await put(4, {
    state: 'understanding',
    renderVersion: 0,
    weekStart: '2027-03-14',
    weekEnd: '2027-03-20',
    dueAt: '2027-03-28T17:00:00Z',
  });
  return listEpisodes(store, clock, documentary);
}

async function show(week: ThisWeek) {
  const list = await rows();
  const onOpen = jest.fn();
  await render(
    <EpisodesScreen
      actions={{ load: async () => ({ week, episodes: list }) }}
      onOpen={onOpen}
      onBack={() => undefined}
    />,
  );
  return { onOpen };
}

describe('EpisodesScreen', () => {
  it('shows a ready episode, one being made, one running late and one that failed, each with its words', async () => {
    const { onOpen } = await show({ status: 'making', hour: 18 });
    expect(await screen.findByText(episodeWords.making(18))).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: episodeWords.title })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: episodeWords.back })).toBeOnTheScreen();

    const ready = screen.getByRole('button', { name: /Episode 1\. Rain on the tram/ });
    expect(screen.getByText('Rain on the tram')).toBeOnTheScreen();
    expect(
      screen.getByText(
        `${episodeWords.dates('2027-02-07', '2027-02-13')} · ${durationLabel(95_000)} · ${episodeWords.offline}`,
      ),
    ).toBeOnTheScreen();
    fireEvent.press(ready);
    expect(onOpen).toHaveBeenCalledWith(id(1));

    expect(
      screen.getByLabelText(new RegExp(`Episode 4\\..*${episodeWords.makingLabel}`)),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(new RegExp(`Episode 3\\..*${episodeWords.lateLabel}`)),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(new RegExp(`Episode 2\\..*${episodeWords.failedLabel}`)),
    ).toBeOnTheScreen();
    // Only a ready episode opens.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it.each([
    [{ status: 'late', hour: 18 } as ThisWeek, episodeWords.late],
    [{ status: 'failed', hour: 18 } as ThisWeek, episodeWords.failed],
    [{ status: 'quiet', hour: 18 } as ThisWeek, episodeWords.quiet],
    [{ status: 'ready', hour: 18, number: 1 } as ThisWeek, episodeWords.ready(1)],
  ])('shows this week as %j', async (week, line) => {
    await show(week);
    expect(await screen.findByText(line)).toBeOnTheScreen();
  });

  it('says when the first episode comes, with no week line yet', async () => {
    await render(
      <EpisodesScreen
        actions={{ load: async () => ({ week: { status: 'none', hour: 18 }, episodes: [] }) }}
      />,
    );
    expect(await screen.findByText(episodeWords.empty)).toBeOnTheScreen();
  });
});
