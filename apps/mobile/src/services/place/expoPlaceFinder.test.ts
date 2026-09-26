import * as Location from 'expo-location';
import { expoPlaceFinder } from './expoPlaceFinder';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

const mocked = Location as jest.Mocked<typeof Location>;

describe('expoPlaceFinder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mocked.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 53.35, longitude: -6.26 },
    } as never);
  });

  it('returns the first non-empty of name, district and city', async () => {
    mocked.reverseGeocodeAsync.mockResolvedValue([
      { name: ' ', district: 'Temple Bar', city: 'Dublin' },
    ] as never);
    expect(await expoPlaceFinder.currentPlaceName()).toBe('Temple Bar');
  });

  it('returns null when location permission is denied', async () => {
    mocked.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await expoPlaceFinder.currentPlaceName()).toBeNull();
    expect(mocked.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});
