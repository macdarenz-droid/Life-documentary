// The Worker's account API over fetch, with the session cookie. Every response is parsed with the
// contracts (CLAUDE.md rule 3); a response that is not 2xx throws with the server's error code.
import {
  ApiError,
  CompleteUpload,
  CreateUpload,
  CreateUploadResult,
  Documentary,
  LinkDocumentaryResult,
  Me,
  RegisterDevice,
  SyncRequest,
  SyncResponse,
  UploadDone,
  UploadedPart,
} from '@life/contracts';
import type { Api } from '../../domain/capturePorts';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** `partFetch` sends part bytes (expo/fetch on a device); it defaults to `fetchImpl`. */
export function createApiClient(
  baseUrl: string,
  cookie: () => string | null,
  fetchImpl: Fetch = fetch,
  partFetch: Fetch = fetchImpl,
): Api {
  const failed = async (path: string, res: Response): Promise<never> => {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    throw new Error(`${path}: ${res.status} ${parsed.success ? parsed.data.error.code : ''}`);
  };

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
    if (!res.ok) return failed(path, res);
    return res;
  };

  const put = async (path: string, bytes: Uint8Array): Promise<Response> => {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
    };
    const session = cookie();
    if (session) headers.cookie = session;
    const res = await partFetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers,
      // A copy on its own ArrayBuffer, the body type fetch takes.
      body: bytes.slice(),
    });
    if (!res.ok) return failed(path, res);
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
    createUpload: async (input) =>
      CreateUploadResult.parse(await (await call('/uploads', CreateUpload.parse(input))).json()),
    uploadPart: async (assetId, purpose, partNumber, bytes) =>
      UploadedPart.parse(
        await (await put(`/uploads/${assetId}/${purpose}/parts/${partNumber}`, bytes)).json(),
      ),
    completeUpload: async (assetId, purpose, parts) =>
      UploadDone.parse(
        await (
          await call(`/uploads/${assetId}/${purpose}/complete`, CompleteUpload.parse({ parts }))
        ).json(),
      ),
  };
}
