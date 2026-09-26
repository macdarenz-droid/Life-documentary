// A place name for the moment: the first non-empty of name, district and city. Coordinates stay here.
import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  reverseGeocodeAsync,
} from 'expo-location';
import type { PlaceFinder } from '../../domain/capturePorts';

export const expoPlaceFinder: PlaceFinder = {
  currentPlaceName: async () => {
    if ((await getForegroundPermissionsAsync()).status !== 'granted') return null;
    const { coords } = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
    const [address] = await reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    const name = [address?.name, address?.district, address?.city].find(
      (v) => v && v.trim().length > 0,
    );
    return name?.trim() ?? null;
  },
};
