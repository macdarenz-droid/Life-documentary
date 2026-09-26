import type { PermissionState } from '../../domain/capturePorts';

/** Maps an Expo PermissionResponse status to the port's state. */
export function toPermissionState(status: string): PermissionState {
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}
