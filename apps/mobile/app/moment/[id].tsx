import { Uuid } from '@life/contracts';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MomentRoute } from '../../src/features/footage';

export default function Moment() {
  const { id, next } = useLocalSearchParams<{ id: string; next?: string }>();
  const parsed = Uuid.safeParse(id);
  // "Next" walks the rest of a day's moments; anything that is not an id is left out.
  const rest = (next ?? '').split(',').flatMap((n) => {
    const p = Uuid.safeParse(n);
    return p.success ? [p.data] : [];
  });
  return (
    <>
      <Stack.Screen options={{ animation: 'fade' }} />
      <MomentRoute
        id={parsed.success ? parsed.data : Uuid.parse('00000000-0000-4000-8000-000000000000')}
        next={rest}
      />
    </>
  );
}
