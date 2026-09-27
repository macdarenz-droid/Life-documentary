import { Stack } from 'expo-router';
import { CastRoute } from '../src/features/cast';

export default function Cast() {
  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <CastRoute />
    </>
  );
}
