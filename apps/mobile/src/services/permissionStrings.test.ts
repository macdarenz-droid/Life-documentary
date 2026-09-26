import { words } from '@life/story';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Plugin = string | [string, Record<string, unknown>];
const appJson = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8')) as {
  expo: { plugins: Plugin[] };
};
const options = (name: string): Record<string, unknown> => {
  const found = appJson.expo.plugins.find(
    (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === name,
  );
  if (!found) throw new Error(`app.json has no ${name} plugin with options`);
  return found[1];
};
const prompts = words.permissions.prompts;

describe('app.json permission strings come from words', () => {
  it('expo-camera', () => {
    expect(options('expo-camera')).toMatchObject({
      cameraPermission: prompts.camera,
      microphonePermission: prompts.microphone,
    });
  });
  it('expo-audio', () => {
    expect(options('expo-audio')).toMatchObject({ microphonePermission: prompts.microphone });
  });
  it('expo-image-picker', () => {
    expect(options('expo-image-picker')).toMatchObject({ photosPermission: prompts.photos });
  });
  it('expo-location, when in use only', () => {
    expect(options('expo-location')).toEqual({
      locationWhenInUsePermission: prompts.location,
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
    });
  });
});
