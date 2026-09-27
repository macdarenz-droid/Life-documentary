import { contrastRatio, tokens } from '@life/design';
import { render, screen } from '@testing-library/react-native';
import { Switch, switchColors } from './Switch';

const tokenColours = new Set<string>([
  tokens.color.background,
  tokens.color.surface,
  tokens.color.text,
]);

async function renderSwitch(value: boolean) {
  await render(<Switch accessibilityLabel="Daily question" value={value} />);
  return screen.getByRole('switch', { name: 'Daily question' });
}

describe('Switch', () => {
  it('off: a surface track and a text thumb', async () => {
    const view = await renderSwitch(false);
    expect(view.props.tintColor).toBe(tokens.color.surface);
    expect(view.props.thumbTintColor).toBe(tokens.color.text);
  });

  it('on: a text track and a background thumb', async () => {
    const view = await renderSwitch(true);
    expect(view.props.onTintColor).toBe(tokens.color.text);
    expect(view.props.thumbTintColor).toBe(tokens.color.background);
  });

  it('uses no colour outside the tokens', () => {
    for (const state of [switchColors.off, switchColors.on]) {
      expect(tokenColours.has(state.track)).toBe(true);
      expect(tokenColours.has(state.thumb)).toBe(true);
    }
  });

  it('the part that shows the state stands out from the background at 3:1 or more', () => {
    // Off: the white thumb on a dark track. On: the white track.
    expect(contrastRatio(switchColors.off.thumb, tokens.color.background)).toBeGreaterThanOrEqual(
      3,
    );
    expect(contrastRatio(switchColors.on.track, tokens.color.background)).toBeGreaterThanOrEqual(3);
  });
});
