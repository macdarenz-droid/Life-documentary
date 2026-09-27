import { Stack } from 'expo-router';
import { StorylinesRoute } from '../src/features/storylines';

export default function Storylines() {
  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <StorylinesRoute />
    </>
  );
}
