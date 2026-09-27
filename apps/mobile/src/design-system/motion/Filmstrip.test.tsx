import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { Filmstrip, type FilmstripFrame } from './Filmstrip';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const mockedReducedMotion = jest.mocked(useReducedMotion);

const FRAMES: FilmstripFrame[] = [
  { date: '2027-03-15', label: 'Mon 15' },
  { date: '2027-03-14', label: 'Sun 14' },
  { date: '2027-03-13', label: 'Sat 13' },
  { date: '2027-03-12', label: 'Fri 12' },
];

type HostNode = { props: Record<string, unknown>; children?: (HostNode | string)[] | null };

/** The scale of every animated frame, from its current animated style. */
function frameScales(): number[] {
  const out: number[] = [];
  const walk = (node: HostNode | HostNode[] | string | null) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const animated = node.props.jestAnimatedStyle as
      { value?: { transform?: Record<string, number>[] } } | undefined;
    const scale = animated?.value?.transform?.find((t) => t.scale !== undefined)?.scale;
    if (scale !== undefined) out.push(scale);
    (node.children ?? []).forEach((c) => walk(c as HostNode));
  };
  walk(screen.toJSON() as HostNode | HostNode[] | null);
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedReducedMotion.mockReturnValue(false);
});

describe('Filmstrip', () => {
  it('scales frames away from the centre down, never below 0.92', async () => {
    await render(<Filmstrip frames={FRAMES} selected={FRAMES[0]!.date} onDay={jest.fn()} />);
    const scales = frameScales();
    expect(scales.length).toBeGreaterThan(0);
    expect(scales.some((s) => s < 1)).toBe(true);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.92);
  });

  it('with reduced motion on, never scales, and a tapped day is chosen with a selection haptic', async () => {
    mockedReducedMotion.mockReturnValue(true);
    const onDay = jest.fn();
    await render(<Filmstrip frames={FRAMES} selected={FRAMES[0]!.date} onDay={onDay} />);
    const scales = frameScales();
    expect(scales.length).toBeGreaterThan(0);
    expect(scales.every((s) => s === 1)).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Sat 13' }));
    });
    expect(onDay).toHaveBeenCalledWith('2027-03-13');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('chooses the day the strip settles on', async () => {
    mockedReducedMotion.mockReturnValue(true);
    const onDay = jest.fn();
    await render(<Filmstrip frames={FRAMES} selected={FRAMES[0]!.date} onDay={onDay} />);
    await act(async () => {
      fireEvent(screen.getByTestId('filmstrip'), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: 104 * 2, y: 0 } },
      });
    });
    expect(onDay).toHaveBeenCalledWith('2027-03-13');
  });

  it('marks the chosen day as selected', async () => {
    await render(<Filmstrip frames={FRAMES} selected="2027-03-14" onDay={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Sun 14' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Mon 15' })).not.toBeSelected();
  });
});
