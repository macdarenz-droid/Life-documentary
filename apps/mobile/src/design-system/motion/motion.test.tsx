import { act, render, screen } from '@testing-library/react-native';
import { Text as NativeText, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Dissolve } from './Dissolve';
import { GrainBreath } from './GrainBreath';
import { TextMorph } from './TextMorph';
import { TitleCard } from './TitleCard';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

// Skia's own Jest mock needs CanvasKit in a node environment; the component tests run in React
// Native's environment, so the canvas is a plain view here. The shader itself is compiled in
// grainShader.test.ts against CanvasKit.
jest.mock('@shopify/react-native-skia', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    Canvas: ({ children }: { children?: unknown }) => (
      <MockView testID="skia-canvas">{children}</MockView>
    ),
    Fill: ({ children }: { children?: unknown }) => children,
    Shader: () => null,
    Skia: { RuntimeEffect: { Make: () => ({}) } },
  };
});

const mockedReducedMotion = jest.mocked(useReducedMotion);

type HostNode = { props: Record<string, unknown>; children?: (HostNode | string)[] | null };

function countNodes(
  node: HostNode | HostNode[] | string | null,
  match: (n: HostNode) => boolean,
): number {
  if (node === null || typeof node === 'string') return 0;
  if (Array.isArray(node)) return node.reduce((sum, n) => sum + countNodes(n, match), 0);
  return (match(node) ? 1 : 0) + countNodes((node.children ?? []) as HostNode[], match);
}

/** Nodes whose current animated style moves them: a translation other than 0 or a scale other than 1. */
function movedNodes(): number {
  return countNodes(screen.toJSON() as HostNode | HostNode[] | null, (n) => {
    const animated = n.props.jestAnimatedStyle as
      { value?: { transform?: Record<string, number>[] } } | undefined;
    return (animated?.value?.transform ?? []).some(
      (t) =>
        (t.translateY !== undefined && t.translateY !== 0) ||
        (t.scale !== undefined && t.scale !== 1),
    );
  });
}

function flatOpacity(style: unknown): number {
  if (Array.isArray(style)) return style.reduce((o: number, st) => o * flatOpacity(st), 1);
  if (style && typeof style === 'object' && 'opacity' in style) return Number(style.opacity);
  return 1;
}

/** Opacity of the image frame with this recycling key, multiplied down from every ancestor's current style. */
function frameOpacity(recyclingKey: string): number | null {
  const walk = (node: HostNode | string, above: number): number | null => {
    if (typeof node === 'string') return null;
    const animated = node.props.jestAnimatedStyle as { value?: { opacity?: number } } | undefined;
    const own =
      animated?.value?.opacity !== undefined
        ? animated.value.opacity
        : flatOpacity(node.props.style);
    const here = above * own;
    if (node.props.recyclingKey === recyclingKey) return here;
    for (const child of node.children ?? []) {
      const found = walk(child, here);
      if (found !== null) return found;
    }
    return null;
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  if (root === null) return null;
  for (const n of Array.isArray(root) ? root : [root]) {
    const found = walk(n, 1);
    if (found !== null) return found;
  }
  return null;
}

/** Image frames drawn with a blur in the rendered tree. */
function blurredFrames(): number {
  return countNodes(
    screen.toJSON() as HostNode | HostNode[] | null,
    (n) => Number(n.props.blurRadius ?? 0) > 0,
  );
}

beforeEach(() => {
  mockedReducedMotion.mockReturnValue(false);
});

afterEach(() => jest.useRealTimers());

describe('TitleCard', () => {
  it('with reduced motion on, every line is readable immediately and onDone fires after the fade', async () => {
    mockedReducedMotion.mockReturnValue(true);
    jest.useFakeTimers();
    const onDone = jest.fn();
    await render(
      <TitleCard lines={['The Week', 'It Rained']} variant="display48" play onDone={onDone} />,
    );
    expect(screen.getByRole('header', { name: 'The Week\nIt Rained' })).toBeOnTheScreen();
    expect(movedNodes()).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(90);
    });
    expect(movedNodes()).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('with reduced motion off, onDone fires once after the last word lands', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    await render(
      <TitleCard lines={['The Week', 'It Rained']} variant="display48" play onDone={onDone} />,
    );
    expect(screen.getByRole('header', { name: 'The Week\nIt Rained' })).toBeOnTheScreen();
    expect(movedNodes()).toBe(4);
    await act(async () => {
      jest.advanceTimersByTime(900);
    });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('TitleCard onDone', () => {
  it('a new inline onDone mid-reveal does not restart it; the latest callback fires once at the original end', async () => {
    jest.useFakeTimers();
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await render(
      <TitleCard lines={['The Week', 'It Rained']} variant="display48" play onDone={first} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await rerender(
      <TitleCard lines={['The Week', 'It Rained']} variant="display48" play onDone={second} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(second).not.toHaveBeenCalled();
    // the plan ends at 180 + 900 = 1080 ms after the start
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('TextMorph', () => {
  it('with reduced motion on, the accessible label is the new text as soon as it changes', async () => {
    mockedReducedMotion.mockReturnValue(true);
    const { rerender } = await render(<TextMorph text="Hold to answer" variant="bodyStrong" />);
    expect(screen.getByLabelText('Hold to answer')).toBeOnTheScreen();
    await rerender(<TextMorph text="Recording" variant="bodyStrong" />);
    expect(screen.getByLabelText('Recording')).toBeOnTheScreen();
    expect(movedNodes()).toBe(0);
    expect(screen.queryByLabelText('Hold to answer')).toBeNull();
  });

  it('with reduced motion off, the accessible label is also the new text immediately', async () => {
    jest.useFakeTimers();
    const { rerender } = await render(<TextMorph text="Recording" variant="bodyStrong" />);
    await rerender(<TextMorph text="Saved" variant="bodyStrong" />);
    expect(screen.getByLabelText('Saved')).toBeOnTheScreen();
    // the five arriving letters start 30% of a line below
    expect(movedNodes()).toBeGreaterThanOrEqual(5);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    // arrivals have landed; the nine leaving letters rest 30% of a line above, faded out
    expect(movedNodes()).toBe(9);
    jest.useRealTimers();
    expect(screen.queryByLabelText('Recording')).toBeNull();
  });
});

describe('Dissolve', () => {
  it('with reduced motion on, the new image is exposed to accessibility at once and no blurred copy is drawn', async () => {
    mockedReducedMotion.mockReturnValue(true);
    const { rerender } = await render(
      <Dissolve
        source={{ uri: 'https://example.test/mon.jpg' }}
        recyclingKey="mon"
        accessibilityLabel="Monday"
      />,
    );
    expect(screen.getByLabelText('Monday')).toBeOnTheScreen();
    await rerender(
      <Dissolve
        source={{ uri: 'https://example.test/tue.jpg' }}
        recyclingKey="tue"
        accessibilityLabel="Tuesday"
      />,
    );
    expect(screen.getByLabelText('Tuesday')).toBeOnTheScreen();
    expect(blurredFrames()).toBe(0);
  });

  it('with reduced motion off, the outgoing frame gets a blurred copy that is removed once the new one is in', async () => {
    jest.useFakeTimers();
    const { rerender } = await render(
      <Dissolve
        source={{ uri: 'https://example.test/mon.jpg' }}
        recyclingKey="mon"
        accessibilityLabel="Monday"
      />,
    );
    expect(blurredFrames()).toBe(0);
    await rerender(
      <Dissolve
        source={{ uri: 'https://example.test/tue.jpg' }}
        recyclingKey="tue"
        accessibilityLabel="Tuesday"
      />,
    );
    expect(screen.getByLabelText('Tuesday')).toBeOnTheScreen();
    expect(blurredFrames()).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(blurredFrames()).toBe(0);
    jest.useRealTimers();
  });
});

describe('Dissolve, more', () => {
  it('with reduced motion on, the outgoing frame stays fully opaque halfway through', async () => {
    mockedReducedMotion.mockReturnValue(true);
    jest.useFakeTimers();
    const { rerender } = await render(
      <Dissolve source={{ uri: 'https://example.test/mon.jpg' }} recyclingKey="mon" />,
    );
    await rerender(
      <Dissolve source={{ uri: 'https://example.test/tue.jpg' }} recyclingKey="tue" />,
    );
    await act(async () => {
      jest.advanceTimersByTime(160);
    });
    expect(frameOpacity('mon')).toBe(1);
    const incoming = frameOpacity('tue') ?? 0;
    expect(incoming).toBeGreaterThan(0);
    expect(incoming).toBeLessThan(1);
  });

  it('exposes the image with its label as an image, and nothing without a label', async () => {
    await render(
      <Dissolve
        source={{ uri: 'https://example.test/mon.jpg' }}
        recyclingKey="mon"
        accessibilityLabel="Monday"
      />,
    );
    expect(screen.getByRole('image', { name: 'Monday' })).toBeOnTheScreen();
    await render(<Dissolve source={{ uri: 'https://example.test/mon.jpg' }} recyclingKey="mon" />);
    expect(screen.queryAllByRole('image')).toHaveLength(0);
  });
});

describe('GrainBreath', () => {
  it('renders its children and a grain overlay that ignores touches, and breathes', async () => {
    jest.useFakeTimers();
    await render(
      <GrainBreath>
        <NativeText>Hero</NativeText>
      </GrainBreath>,
    );
    expect(screen.getByText('Hero')).toBeOnTheScreen();
    expect(screen.getByTestId('grain-overlay')).toHaveProp('pointerEvents', 'none');
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    expect(movedNodes()).toBe(1);
    jest.useRealTimers();
  });

  it('with reduced motion on, renders children and the overlay and never scales', async () => {
    mockedReducedMotion.mockReturnValue(true);
    jest.useFakeTimers();
    await render(
      <GrainBreath>
        <View testID="hero" />
      </GrainBreath>,
    );
    expect(screen.getByTestId('hero')).toBeOnTheScreen();
    expect(screen.getByTestId('grain-overlay')).toHaveProp('pointerEvents', 'none');
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    expect(movedNodes()).toBe(0);
    jest.useRealTimers();
  });
});
