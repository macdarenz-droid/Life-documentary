import { z } from 'zod';

export const MusicMood = z.enum(['calm', 'warm', 'bright', 'bittersweet', 'driving']);
export type MusicMood = z.infer<typeof MusicMood>;
