// An in-memory copy of the Worker's upload routes over a fake R2 for upload tests: an open upload per
// asset and purpose (created again, the same one comes back), parts stored by number, and the finished
// object's bytes. Every call is recorded; `failOnPart` makes that part number throw once, and a purpose
// in `refused` answers every part with a 403.
import {
  CompleteUpload,
  CreateUpload,
  UPLOAD_PART_SIZE,
  UploadedPart,
  partCountFor,
} from '@life/contracts';
import { ApiRefused, type Api } from '../../domain/capturePorts';

type Open = { uploadId: string; bytes: number; parts: Map<number, Uint8Array> };

export type FakeUploadApi = Api & {
  /** Every call in order: `create:<purpose>`, `part:<n>`, `complete:<purpose>`. */
  calls: string[];
  /** Finished objects by `<assetId>/<purpose>`. */
  objects: Map<string, Uint8Array>;
  /** Content types asked for, by `<assetId>/<purpose>`. */
  contentTypes: Map<string, string>;
  /** The next upload of this part number throws, as a dropped connection would. */
  failOnPart: number | null;
  /** Every create throws. */
  down: boolean;
  /** Parts for these purposes are refused with a 403. */
  refused: Set<string>;
  /** Every body sent, by `<assetId>/<purpose>`, part by part. */
  bodies: Map<string, Uint8Array[]>;
};

export function fakeUploadApi(): FakeUploadApi {
  const open = new Map<string, Open>();
  let next = 0;
  const unused = async (): Promise<never> => {
    throw new Error('Not part of the upload fake');
  };
  const key = (assetId: string, purpose: string) => `${assetId}/${purpose}`;

  const api: FakeUploadApi = {
    calls: [],
    objects: new Map(),
    contentTypes: new Map(),
    failOnPart: null,
    down: false,
    refused: new Set(),
    bodies: new Map(),
    me: unused,
    registerDevice: unused,
    linkDocumentary: unused,
    requestDeletion: unused,
    cancelDeletion: unused,
    sync: unused,
    createUpload: async (input) => {
      const request = CreateUpload.parse(input);
      api.calls.push(`create:${request.purpose}`);
      if (api.down) throw new Error('No network');
      const k = key(request.assetId, request.purpose);
      api.contentTypes.set(k, request.contentType);
      let upload = open.get(k);
      if (!upload) {
        next += 1;
        upload = { uploadId: `upload-${next}`, bytes: request.bytes, parts: new Map() };
        open.set(k, upload);
      }
      return {
        uploadId: upload.uploadId,
        partSize: UPLOAD_PART_SIZE,
        partCount: partCountFor(upload.bytes),
      };
    },
    uploadPart: async (assetId, purpose, partNumber, bytes) => {
      api.calls.push(`part:${partNumber}`);
      if (api.failOnPart === partNumber) {
        api.failOnPart = null;
        throw new Error('Connection dropped');
      }
      if (api.refused.has(purpose)) {
        throw new ApiRefused(`/uploads/${assetId}/${purpose}/parts/${partNumber}: 403`, 403);
      }
      const upload = open.get(key(assetId, purpose));
      if (!upload) throw new Error('No open upload');
      upload.parts.set(partNumber, bytes.slice());
      api.bodies.set(key(assetId, purpose), [
        ...(api.bodies.get(key(assetId, purpose)) ?? []),
        bytes.slice(),
      ]);
      return UploadedPart.parse({ partNumber, etag: `etag-${partNumber}` });
    },
    completeUpload: async (assetId, purpose, parts) => {
      api.calls.push(`complete:${purpose}`);
      const request = CompleteUpload.parse({ parts });
      const k = key(assetId, purpose);
      const upload = open.get(k);
      if (!upload) throw new Error('No open upload');
      const chunks = request.parts.map((p) => upload.parts.get(p.partNumber)!);
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.byteLength;
      }
      api.objects.set(k, out);
      open.delete(k);
      return { cloudKey: `tmp/${k}` };
    },
    abortUpload: async (assetId, purpose) => {
      api.calls.push(`abort:${purpose}`);
      open.delete(key(assetId, purpose));
    },
  };
  return api;
}
