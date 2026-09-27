import { Uuid } from '@life/contracts';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MomentRoute } from '../../src/features/footage';

export default function Moment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsed = Uuid.safeParse(id);
  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <MomentRoute
        id={parsed.success ? parsed.data : Uuid.parse('00000000-0000-4000-8000-000000000000')}
      />
    </>
  );
}
