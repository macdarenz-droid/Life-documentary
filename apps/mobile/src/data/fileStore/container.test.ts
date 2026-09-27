import { containerOf } from './container';
import { JPEG_HEAD, PNG_HEAD, fileWithHead, ftyp } from './testing/containerFixtures';

describe('containerOf', () => {
  it.each([
    ['qt  ', 'mov'],
    ['M4A ', 'm4a'],
    ['heic', 'heic'],
    ['heix', 'heic'],
    ['mif1', 'heic'],
    ['msf1', 'heic'],
    ['isom', 'mp4'],
    ['mp42', 'mp4'],
  ])('reads the ftyp brand %j as %s', (brand, expected) => {
    expect(containerOf(ftyp(brand))).toBe(expected);
  });

  it('reads the JPEG and PNG signatures', () => {
    expect(containerOf(fileWithHead(JPEG_HEAD, 12))).toBe('jpg');
    expect(containerOf(fileWithHead(PNG_HEAD, 12))).toBe('png');
  });

  it('gives null for a head shorter than 12 bytes, even with a known signature', () => {
    expect(containerOf(JPEG_HEAD.slice(0, 5))).toBeNull();
  });

  it('gives null for an unknown head', () => {
    expect(containerOf(new Uint8Array(12).map((_, i) => i + 1))).toBeNull();
    expect(
      containerOf(
        new Uint8Array([
          0,
          0,
          0,
          0x14,
          ...'moov'.split('').map((c) => c.charCodeAt(0)),
          1,
          2,
          3,
          4,
        ]),
      ),
    ).toBeNull();
  });
});
