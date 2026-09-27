// The Worker's account API over fetch, with the session cookie. Every response is parsed with the
// contracts (CLAUDE.md rule 3); a response that is not 2xx throws with the server's error code.
import {
  ApiError,
  Documentary,
  LinkDocumentaryResult,
  Me,
  RegisterDevice,
  SyncRequest,
  SyncResponse,
} from '@life/contracts';
import type { Api } from '../../domain/capturePorts';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createApiClient(
  baseUrl: string,
  cookie: () => string | null,
  fetchImpl: Fetch = fetch,
): Api {
  const call = async (path: string, body?: unknown): Promise<Response> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    const session = cookie();
    if (session) headers.cookie = session;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: body === undefined && path === '/me' ? 'GET' : 'POST',
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const parsed = ApiError.safeParse(await res.json().catch(() => null));
      throw new Error(`${path}: ${res.status} ${parsed.success ? parsed.data.error.code : ''}`);
    }
    return res;
  };

  return {
    me: async () => Me.parse(await (await call('/me')).json()),
    registerDevice: async (device) =>
      RegisterDevice.parse(await (await call('/devices', RegisterDevice.parse(device))).json()),
    linkDocumentary: async (documentary) =>
      LinkDocumentaryResult.parse(
        await (await call('/documentaries/link', Documentary.parse(documentary))).json(),
      ),
    requestDeletion: async () => {
      await call('/account/delete', {});
    },
    cancelDeletion: async () => {
      await call('/account/delete/cancel', {});
    },
    sync: async (request) =>
      SyncResponse.parse(await (await call('/sync', SyncRequest.parse(request))).json()),
  };
}
