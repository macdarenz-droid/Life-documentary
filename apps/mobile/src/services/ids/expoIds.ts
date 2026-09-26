import { Uuid } from '@life/contracts';
import { randomUUID } from 'expo-crypto';
import type { Ids } from '../../application/ports';

export const expoIds: Ids = { newId: () => Uuid.parse(randomUUID()) };
