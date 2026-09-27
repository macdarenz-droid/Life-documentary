import { Moment, type MediaAsset, type MomentKind } from '@life/contracts';
import { describe, expect, it } from 'vitest';
import { leavesDevice } from '../src';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const assetKinds: Record<MomentKind, MediaAsset['kind'][]> = {
  answer: ['video', 'audio'],
  clip: ['video'],
  photo: ['photo'],
  note: [],
};

function moment(kind: MomentKind, localOnly: boolean) {
  return Moment.parse({
    id: ID(1),
    documentaryId: ID(2),
    authorUserId: ID(3),
    capturedAt: '2027-03-15T08:14:00Z',
    timeZone: 'Europe/Berlin',
    kind,
    ...(kind === 'answer' ? { questionId: ID(4) } : {}),
    ...(kind === 'note' ? { text: 'Rain on the tram window.' } : { mediaAssetId: ID(5) }),
    localOnly,
    storylineIds: [],
    castIds: [],
    updatedAt: '2027-03-15T08:14:00Z',
  });
}

/** The uploads for each kind and asset kind, without and with Cloud backup. */
function expected(kind: MomentKind, assetKind: MediaAsset['kind'] | undefined, cloudBackup: boolean) {
  switch (kind) {
    case 'answer':
      return assetKind === 'video' ? ['answer', 'keyframe'] : ['answer'];
    case 'photo':
      return cloudBackup ? ['preview', 'original'] : ['preview'];
    case 'clip':
      return cloudBackup ? ['keyframe', 'original'] : ['keyframe'];
    case 'note':
      return [];
  }
}

const cases = (Object.keys(assetKinds) as MomentKind[]).flatMap((kind) =>
  (assetKinds[kind].length ? assetKinds[kind] : [undefined]).flatMap((assetKind) =>
    [false, true].flatMap((localOnly) =>
      [false, true].map((cloudBackup) => ({ kind, assetKind, localOnly, cloudBackup })),
    ),
  ),
);

describe('leavesDevice', () => {
  it.each(cases)(
    '$kind ($assetKind), localOnly $localOnly, cloudBackup $cloudBackup',
    ({ kind, assetKind, localOnly, cloudBackup }) => {
      const result = leavesDevice(
        { ...moment(kind, localOnly), ...(assetKind ? { assetKind } : {}) },
        { cloudBackup },
      );
      if (localOnly) expect(result).toEqual({ row: false, uploads: [] });
      else expect(result).toEqual({ row: true, uploads: expected(kind, assetKind, cloudBackup) });
    },
  );

  it('lists exactly these uploads', () => {
    const lists = (cloudBackup: boolean) =>
      [
        ['answer', 'video'],
        ['answer', 'audio'],
        ['photo', 'photo'],
        ['clip', 'video'],
      ].map(([kind, assetKind]) =>
        leavesDevice(
          { ...moment(kind as MomentKind, false), assetKind: assetKind as MediaAsset['kind'] },
          { cloudBackup },
        ).uploads,
      );
    expect(lists(false)).toEqual([['answer', 'keyframe'], ['answer'], ['preview'], ['keyframe']]);
    expect(lists(true)).toEqual([
      ['answer', 'keyframe'],
      ['answer'],
      ['preview', 'original'],
      ['keyframe', 'original'],
    ]);
  });

  it('covers every kind', () => {
    expect(new Set(cases.map((c) => c.kind))).toEqual(new Set(['answer', 'clip', 'photo', 'note']));
    expect(cases.filter((c) => c.localOnly)).toHaveLength(cases.length / 2);
  });

  it('sends no media for a moment whose asset kind is not known', () => {
    expect(leavesDevice(moment('photo', false), { cloudBackup: false })).toEqual({
      row: true,
      uploads: [],
    });
  });
});
