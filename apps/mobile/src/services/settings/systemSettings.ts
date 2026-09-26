import { Linking } from 'react-native';
import type { SettingsOpener } from '../../domain/capturePorts';

export const systemSettings: SettingsOpener = {
  open: () => void Linking.openSettings(),
};
