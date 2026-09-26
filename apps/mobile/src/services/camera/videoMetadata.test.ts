import { createVideoPlayer } from 'expo-video';
import { readVideoMetadata } from './videoMetadata';

type Listener = (payload: Record<string, unknown>) => void;

jest.mock('expo-video', () => ({ createVideoPlayer: jest.fn() }));

function fakePlayer() {
  const listeners = new Map<string, Listener>();
  const player = {
    released: false,
    addListener: (event: string, listener: Listener) => {
      listeners.set(event, listener);
      return { remove: () => listeners.delete(event) };
    },
    release: () => {
      player.released = true;
    },
    emit: (event: string, payload: Record<string, unknown>) => listeners.get(event)?.(payload),
  };
  jest.mocked(createVideoPlayer).mockReturnValue(player as never);
  return player;
}

describe('readVideoMetadata', () => {
  it('reads the duration and the first video track size, then releases the player', async () => {
    const player = fakePlayer();
    const read = readVideoMetadata('file:///rec.mov');
    player.emit('sourceLoad', {
      duration: 9.52,
      availableVideoTracks: [{ size: { width: 1080, height: 1920 } }],
    });
    expect(await read).toEqual({ durationMs: 9520, width: 1080, height: 1920 });
    expect(player.released).toBe(true);
  });

  it('gives null for a file without a video track', async () => {
    const player = fakePlayer();
    const read = readVideoMetadata('file:///rec.mov');
    player.emit('sourceLoad', { duration: 3, availableVideoTracks: [] });
    expect(await read).toBeNull();
  });

  it('gives null when the player fails to load the file', async () => {
    const player = fakePlayer();
    const read = readVideoMetadata('file:///rec.mov');
    player.emit('statusChange', { status: 'error' });
    expect(await read).toBeNull();
    expect(player.released).toBe(true);
  });
});
