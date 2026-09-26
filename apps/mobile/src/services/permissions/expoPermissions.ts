import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { Camera } from 'expo-camera';
import { getForegroundPermissionsAsync, requestForegroundPermissionsAsync } from 'expo-location';
import type { Permissions } from '../../domain/capturePorts';
import { toPermissionState } from './state';

export const expoPermissions: Permissions = {
  camera: {
    get: async () => toPermissionState((await Camera.getCameraPermissionsAsync()).status),
    request: async () => toPermissionState((await Camera.requestCameraPermissionsAsync()).status),
  },
  microphone: {
    get: async () => toPermissionState((await getRecordingPermissionsAsync()).status),
    request: async () => toPermissionState((await requestRecordingPermissionsAsync()).status),
  },
  location: {
    get: async () => toPermissionState((await getForegroundPermissionsAsync()).status),
    request: async () => toPermissionState((await requestForegroundPermissionsAsync()).status),
  },
};
