import { Uuid } from '@life/contracts';
import { useLocalSearchParams } from 'expo-router';
import { EpisodeRoute } from '../../src/features/episode';

export default function Episode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsed = Uuid.safeParse(id);
  return (
    <EpisodeRoute
      id={parsed.success ? parsed.data : Uuid.parse('00000000-0000-4000-8000-000000000000')}
    />
  );
}
