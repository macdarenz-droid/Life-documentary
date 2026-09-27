// The Network port over expo-network: Wi-Fi and Ethernet count as Wi-Fi, any other connected type as
// cellular, and no connection as none.
import { NetworkStateType, getNetworkStateAsync } from 'expo-network';
import type { Network } from '../../domain/capturePorts';

export const expoNetwork: Network = {
  connection: async () => {
    const state = await getNetworkStateAsync();
    if (!state.isConnected || state.isInternetReachable === false) return 'none';
    if (state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET) {
      return 'wifi';
    }
    return 'cellular';
  },
};
