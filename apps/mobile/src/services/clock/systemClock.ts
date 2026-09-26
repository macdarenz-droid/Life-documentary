import { localDay } from '@life/story';
import type { Clock } from '../../application/ports';

/** The device clock: ISO instants and the local date in a given time zone. */
export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  today: (timeZone) => localDay(new Date().toISOString(), timeZone),
};
