import { launchImageLibraryAsync } from 'expo-image-picker';
import type { LibraryPicker } from '../../domain/capturePorts';

export const expoLibraryPicker: LibraryPicker = {
  pick: async () => {
    const result = await launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return null;
    const kind = asset.type === 'video' || asset.type === 'pairedVideo' ? 'video' : 'photo';
    return {
      uri: asset.uri,
      kind,
      width: asset.width,
      height: asset.height,
      ...(kind === 'video' && asset.duration ? { durationMs: Math.round(asset.duration) } : {}),
    };
  },
};
