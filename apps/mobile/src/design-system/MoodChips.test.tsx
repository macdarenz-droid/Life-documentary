import { words } from '@life/story';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { MoodChips } from './MoodChips';

describe('MoodChips', () => {
  it('selects a mood on the first tap and clears it on the second', async () => {
    const onChange = jest.fn();
    const view = await render(<MoodChips value={null} onChange={onChange} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: words.moods.calm }));
    });
    expect(onChange).toHaveBeenLastCalledWith('calm');
    await view.rerender(<MoodChips value="calm" onChange={onChange} />);
    expect(
      screen.getByRole('button', { name: words.moods.calm, selected: true }),
    ).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: words.moods.calm }));
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
