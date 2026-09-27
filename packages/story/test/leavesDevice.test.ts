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

const expected = {
  false: { answer: 'answer', photo: 'preview', clip: 'none', note: 'none' },
  true: { answer: 'answer', photo: 'original', clip: 'original', note: 'none' },
} as const;

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
      if (localOnly) expect(result).toEqual({ row: false, media: 'none' });
      else expect(result).toEqual({ row: true, media: expected[`${cloudBackup}`][kind] });
    },
  );

  it('covers every kind', () => {
    expect(new Set(cases.map((c) => c.kind))).toEqual(new Set(['answer', 'clip', 'photo', 'note']));
    expect(cases.filter((c) => c.localOnly)).toHaveLength(cases.length / 2);
  });

  it('sends no media for a moment whose asset kind is not known', () => {
    expect(leavesDevice(moment('photo', false), { cloudBackup: false })).toEqual({
      row: true,
      media: 'none',
    });
  });
});
