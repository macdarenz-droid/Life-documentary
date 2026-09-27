import { Stack } from 'expo-router';
import { FootageRoute } from '../src/features/footage';

export default function Footage() {
  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <FootageRoute />
    </>
  );
}
