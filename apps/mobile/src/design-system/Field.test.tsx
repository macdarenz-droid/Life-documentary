import { render, screen } from '@testing-library/react-native';
import { Field } from './Field';

describe('Field', () => {
  it('labels the input with its label text', async () => {
    await render(<Field label="Your answer" value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Your answer')).toBeOnTheScreen();
  });

  it('shows the error text when given', async () => {
    await render(
      <Field label="Name" value="" onChangeText={jest.fn()} error="Add a name to continue." />,
    );
    expect(screen.getByText('Add a name to continue.')).toBeOnTheScreen();
  });

  it('shows no error text by default', async () => {
    await render(<Field label="Name" value="" onChangeText={jest.fn()} />);
    expect(screen.queryByText('Add a name to continue.')).toBeNull();
  });
});
