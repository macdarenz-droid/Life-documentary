import { render, screen } from '@testing-library/react-native';
import { TodayPlaceholder } from './TodayPlaceholder';

describe('TodayPlaceholder', () => {
  it('shows the title as a header and the waiting line', async () => {
    await render(<TodayPlaceholder />);
    expect(screen.getByRole('header')).toHaveTextContent('Life Documentary');
    expect(screen.getByText('Your first question will be here soon.')).toBeOnTheScreen();
  });
});
