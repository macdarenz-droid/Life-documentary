import { words } from '@life/story';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { addCastMember } from '../../application/cast';
import { createStoryline } from '../../application/storylines';
import { todayHarness } from '../../application/testing/todayHarness';
import { todayQuestion } from '../../application/todayQuestion';
import { TodayScreen } from './TodayScreen';
import { todayScreenProps } from './TodayRoute';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Path: () => null,
  Skia: { Path: { Make: () => ({ addArc: () => undefined }) } },
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

/** Today with two storylines and one person, after a photo was saved. */
async function setup() {
  const h = await todayHarness();
  const { store, clock, ids, documentary } = h.ctx;
  const job = await createStoryline(store, clock, ids, documentary, 'The new job');
  const run = await createStoryline(store, clock, ids, documentary, 'Half marathon');
  const mara = await addCastMember(store, clock, ids, documentary, 'Mara', 'sister');
  const question = await todayQuestion(store, documentary, clock, ids);
  await render(<TodayScreen {...todayScreenProps(h.ctx)} />);
  await waitFor(() =>
    expect(
      screen.queryByLabelText(question.text) ?? screen.queryByText(question.text),
    ).not.toBeNull(),
  );
  expect(screen.queryByRole('button', { name: words.tags.tag })).toBeNull();
  await press(words.extras.photo);
  await press(words.extras.takePhoto);
  await screen.findByRole('button', { name: words.tags.tag });
  const lastMoment = async () =>
    (
      await store.driver.all<{ id: string }>(
        'SELECT id FROM moments ORDER BY captured_at DESC, rowid DESC LIMIT 1',
      )
    )[0]!.id;
  const tagsOf = async (momentId: string) => ({
    storylines: (
      await store.driver.all<{ storyline_id: string }>(
        'SELECT storyline_id FROM moment_storylines WHERE moment_id = ? ORDER BY storyline_id',
        [momentId],
      )
    ).map((r) => r.storyline_id),
    cast: (
      await store.driver.all<{ cast_id: string }>(
        'SELECT cast_id FROM moment_cast WHERE moment_id = ?',
        [momentId],
      )
    ).map((r) => r.cast_id),
  });
  return { ...h, job, run, mara, lastMoment, tagsOf };
}

describe('TagTray', () => {
  it('tags the last moment with the two chips selected', async () => {
    const { job, mara, lastMoment, tagsOf } = await setup();
    await press(words.tags.tag);
    await screen.findByRole('button', { name: 'The new job' });
    await press('The new job');
    await press('Mara · sister');
    expect(screen.getByRole('button', { name: 'The new job', selected: true })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Half marathon', selected: false }),
    ).toBeOnTheScreen();
    await press(words.tags.done);
    await waitFor(async () =>
      expect(await tagsOf(await lastMoment())).toEqual({
        storylines: [job.id],
        cast: [mara.id],
      }),
    );
  });

  it('selects a storyline created inline', async () => {
    const { store, ctx, lastMoment, tagsOf } = await setup();
    await press(words.tags.tag);
    await screen.findByRole('button', { name: 'The new job' });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(words.tags.newStoryline), '  Moving house ');
    });
    await press(words.tags.addStoryline);
    expect(
      await screen.findByRole('button', { name: 'Moving house', selected: true }),
    ).toBeOnTheScreen();
    await press(words.tags.done);
    const created = await store.driver.first<{ id: string }>(
      'SELECT id FROM storylines WHERE title = ? AND documentary_id = ?',
      ['Moving house', ctx.documentary.id],
    );
    await waitFor(async () =>
      expect(await tagsOf(await lastMoment())).toEqual({ storylines: [created!.id], cast: [] }),
    );
  });

  it('shows the words line when an inline title is taken', async () => {
    await setup();
    await press(words.tags.tag);
    await screen.findByRole('button', { name: 'The new job' });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(words.tags.newStoryline), 'the new job');
    });
    await press(words.tags.addStoryline);
    expect(await screen.findByText(words.tags.titleTaken)).toBeOnTheScreen();
  });
});
