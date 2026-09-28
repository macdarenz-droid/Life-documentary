// Pushes through Expo's push service (P16, D42) with plain `fetch`, in batches of 100. It sends what it
// is given and reports each ticket's outcome, read leniently. It decides nothing, and no error it
// reports holds a token.
import { z } from 'zod';
import type { PushMessage, PushResult, Pusher } from '../../pipeline/ports';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_BATCH = 100;
/** The Android channel visible pushes go to; the phone creates it (P16). */
export const EPISODES_CHANNEL = 'episodes';

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

// Unknown fields are ignored; a ticket we can't read counts as failed.
const Ticket = z.object({
  status: z.string(),
  details: z.object({ error: z.string().optional() }).loose().optional(),
});
const Tickets = z.object({ data: z.array(z.unknown()) });

function body(message: PushMessage) {
  if (message.silent) {
    return { to: message.to, data: message.data, contentAvailable: true, priority: 'normal' };
  }
  return {
    to: message.to,
    ...(message.title !== undefined ? { title: message.title } : {}),
    data: message.data,
    sound: 'default',
    priority: 'high',
    channelId: EPISODES_CHANNEL,
  };
}

function outcome(ticket: unknown): Pick<PushResult, 'outcome' | 'error'> {
  const read = Ticket.safeParse(ticket);
  if (!read.success)
    return { outcome: 'failed', error: 'Expo answered with a ticket that could not be read.' };
  if (read.data.status === 'ok') return { outcome: 'sent' };
  if (read.data.details?.error === 'DeviceNotRegistered') return { outcome: 'deviceNotRegistered' };
  return {
    outcome: 'failed',
    error: `Expo refused the message (${read.data.details?.error ?? 'no reason'}).`,
  };
}

async function sendBatch(
  batch: PushMessage[],
  accessToken: string | undefined,
  fetcher: Fetch,
): Promise<PushResult[]> {
  const failAll = (error: string): PushResult[] =>
    batch.map((m) => ({ to: m.to, outcome: 'failed', error }));
  let response: Response;
  try {
    response = await fetcher(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch.map(body)),
    });
  } catch {
    return failAll('Expo could not be reached.');
  }
  if (!response.ok) return failAll(`Expo answered ${response.status}.`);
  const tickets = Tickets.safeParse(await response.json().catch(() => null));
  if (!tickets.success) return failAll('Expo answered with a body that could not be read.');
  return batch.map((m, i) => ({ to: m.to, ...outcome(tickets.data.data[i]) }));
}

export function expoPusher(accessToken?: string, fetcher: Fetch = fetch): Pusher {
  return {
    async send(messages) {
      const results: PushResult[] = [];
      for (let i = 0; i < messages.length; i += EXPO_BATCH) {
        results.push(...(await sendBatch(messages.slice(i, i + EXPO_BATCH), accessToken, fetcher)));
      }
      return results;
    },
  };
}
