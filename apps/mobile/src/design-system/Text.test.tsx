import { tokens } from '@life/design';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Text, type TextVariant } from './Text';

const variants = Object.keys(tokens.type) as TextVariant[];
const displayVariants: TextVariant[] = ['display64', 'display48', 'display34', 'question'];

describe('Text', () => {
  it.each(variants)('%s uses its token family and size', async (variant) => {
    await render(<Text variant={variant}>Sample</Text>);
    const style = StyleSheet.flatten(screen.getByText('Sample').props.style);
    expect(style.fontFamily).toBe(tokens.type[variant].family);
    expect(style.fontSize).toBe(tokens.type[variant].size);
  });

  it.each(displayVariants)('%s is a header', async (variant) => {
    await render(<Text variant={variant}>Heading</Text>);
    expect(screen.getByRole('header')).toHaveTextContent('Heading');
  });

  it('body text is not a header', async () => {
    await render(<Text variant="body">Plain</Text>);
    expect(screen.queryByRole('header')).toBeNull();
  });
});
