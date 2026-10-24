import { GameDisks } from './game-disks';
import type { DiskSet } from './game-disks';
import { decodeRetailConversation } from './conversations';
import type { IDataPatch, PatchOutcome } from './data-patches';
import { syntheticDiskSet } from './testing/synthetic-disks';


async function prepared(): Promise<GameDisks> {
  return GameDisks.prepare(syntheticDiskSet());
}


describe('GameDisks.prepare', (): void => {
  it('applies every data patch to disks that hold the expected bytes', async (): Promise<void> => {
    const outcomes: PatchOutcome[] = (await prepared()).report.patches.map((entry: { readonly patch: IDataPatch; readonly outcome: PatchOutcome }): PatchOutcome => entry.outcome);

    expect(new Set(outcomes)).toEqual(new Set([ 'applied' ]));
  });

  it('patches a file', async (): Promise<void> => {
    expect((await prepared()).bload('towne', 'SHPS').data[0x1D]).toBe(0x12);
  });

  it('keeps a patched file\'s load address', async (): Promise<void> => {
    expect((await prepared()).bload('towne', 'SHPS').address).toBe(0x4000);
  });

  it('patches a raw area', async (): Promise<void> => {
    expect((await prepared()).rawArea('underworld')[0x6901]).toBe(0x98);
  });

  it('converts the conversations to the remaster\'s layout', async (): Promise<void> => {
    expect((await prepared()).report.conversations).toBe('converted');
  });

  it('writes the first conversation\'s name with bit 7 set', async (): Promise<void> => {
    expect((await prepared()).rawArea('towne')[0] & 0x80).toBe(0x80);
  });

  it('reports every text correction, since a synthetic disk has none of the retail text', async (): Promise<void> => {
    const skipped: readonly string[] = (await prepared()).report.skippedCorrections;

    expect(skipped.filter((line: string): boolean => line.endsWith('the text is not the retail text')).length).toBe(112);
  });

  it('leaves the masters untouched', async (): Promise<void> => {
    const masters: DiskSet = syntheticDiskSet();

    await GameDisks.prepare(masters);

    expect(decodeRetailConversation(masters.towne.image.bytes.subarray(0, 256)).text.name).toBe('NAME 0');
  });

  it('leaves already-converted conversations alone', async (): Promise<void> => {
    const first: GameDisks = await prepared();
    const again: GameDisks = await GameDisks.prepare({
      program: first.disk('program'), britannia: first.disk('britannia'), towne: first.disk('towne'), underworld: first.disk('underworld'),
    });

    expect(again.report.conversations).toBe('already-converted');
  });

  it('recognises patches already applied', async (): Promise<void> => {
    const first: GameDisks = await prepared();
    const again: GameDisks = await GameDisks.prepare({
      program: first.disk('program'), britannia: first.disk('britannia'), towne: first.disk('towne'), underworld: first.disk('underworld'),
    });

    expect(again.report.patches.every((entry: { readonly outcome: PatchOutcome }): boolean => entry.outcome === 'already-applied')).toBe(true);
  });
});


describe('GameDisks.bsave', (): void => {
  it('saves a file BLOAD then reads', async (): Promise<void> => {
    const disks: GameDisks = await prepared();

    disks.bsave('britannia', 'PRTY', 0x0000, new Uint8Array(0x20).fill(3));

    expect(disks.bload('britannia', 'PRTY').data[0x1F]).toBe(3);
  });

  it('leaves the raw area alone', async (): Promise<void> => {
    const disks: GameDisks = await prepared();
    const before: Uint8Array = disks.rawArea('britannia').slice();

    for (let round: number = 0; round < 50; round++) {
      disks.bsave('britannia', 'ROST', 0xEC00, new Uint8Array(0x200).fill(round));
    }

    expect(disks.rawArea('britannia')).toEqual(before);
  });
});
