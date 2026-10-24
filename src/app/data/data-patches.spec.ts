import { DATA_PATCHES, applyPatch } from './data-patches';
import type { IDataPatch } from './data-patches';


const PATCH: IDataPatch = { disk: 'towne', file: 'SHPS', offset: 2, match: [ 0x0C ], replace: [ 0x12 ], reason: 'test' };


describe('applyPatch', (): void => {
  it('replaces the expected bytes', (): void => {
    const bytes: Uint8Array = Uint8Array.of(0, 0, 0x0C, 0);

    applyPatch(bytes, PATCH);

    expect(bytes[2]).toBe(0x12);
  });

  it('says it applied the patch', (): void => {
    expect(applyPatch(Uint8Array.of(0, 0, 0x0C), PATCH)).toBe('applied');
  });

  it('recognises a patch already applied', (): void => {
    expect(applyPatch(Uint8Array.of(0, 0, 0x12), PATCH)).toBe('already-applied');
  });

  it('leaves unexpected bytes alone', (): void => {
    const bytes: Uint8Array = Uint8Array.of(0, 0, 0x55);

    applyPatch(bytes, PATCH);

    expect(bytes[2]).toBe(0x55);
  });

  it('reports unexpected bytes as a mismatch', (): void => {
    expect(applyPatch(Uint8Array.of(0, 0, 0x55), PATCH)).toBe('mismatch');
  });

  it('reports a file too short for the patch as a mismatch', (): void => {
    expect(applyPatch(Uint8Array.of(0), PATCH)).toBe('mismatch');
  });
});


describe('DATA_PATCHES', (): void => {
  it('replaces as many bytes as each patch expects', (): void => {
    expect(DATA_PATCHES.every((patch: IDataPatch): boolean => patch.match.length === patch.replace.length)).toBe(true);
  });

  it('holds all 26 of the remaster\'s data patches', (): void => {
    expect(DATA_PATCHES.length).toBe(26);
  });
});
