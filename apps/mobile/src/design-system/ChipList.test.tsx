import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ChipList } from './ChipList';

const OPTIONS = [
  { id: 'a', label: 'The new job' },
  { id: 'b', label: 'Half marathon' },
];

describe('ChipList', () => {
  it('shows each option with its selected state', async () => {
    await render(<ChipList options={OPTIONS} selected={['b']} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'The new job', selected: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Half marathon', selected: true })).toBeOnTheScreen();
  });

  it('adds a chip on the first tap and takes it off on the second', async () => {
    const onChange = jest.fn();
    const view = await render(<ChipList options={OPTIONS} selected={['b']} onChange={onChange} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'The new job' }));
    });
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a']);
    await view.rerender(<ChipList options={OPTIONS} selected={['b', 'a']} onChange={onChange} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Half marathon' }));
    });
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });
});
