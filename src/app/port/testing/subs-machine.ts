import { syntheticDiskSet } from '../../data/testing/synthetic-disks';
import { LiftedMachine } from '../../lifted-runtime/lifted-machine';
import type { DiskSet } from '../../lifted-runtime/lifted-machine';
import type { INativeModule } from '../../lifted-runtime/native-module';
import { TABLES } from '../../state/symbols';
import { SUBS_MODULE } from '../program/subs-module';

// A machine with the ported SUBS loaded, and any other ported programs, and nothing lifted: what
// the specs run the port on. The hi-res row tables are computed, as TBLS holds them, and the font
// is a stand-in whose rows are the glyph number.

export const RETURN: number = 0xC0FE;
export const INLINE: number = 0x9000;


export function subsMachine(others: readonly INativeModule[] = [], disks: DiskSet = syntheticDiskSet()): LiftedMachine {
  const machine: LiftedMachine = new LiftedMachine(disks, [], null, [ SUBS_MODULE, ...others ]);
  const high: Uint8Array = machine.apple.languageCard.contents('high');

  for (let row: number = 0; row < 192; row++) {
    const address: number = 0x2000 + ((row & 7) * 0x400) + (((row >> 3) & 7) * 0x80) + ((row >> 6) * 40);

    high[(TABLES.bmplineaddr_lo - 0xE000) + row] = address & 0xFF;
    high[(TABLES.bmplineaddr_hi - 0xE000) + row] = address >> 8;
  }
  for (let glyph: number = 0; glyph < 0x80; glyph++) {
    for (let line: number = 0; line < 8; line++) {
      high[(TABLES.font_data - 0xE000) + (line * 0x80) + glyph] = glyph;
    }
  }
  machine.read(0xC083);
  machine.read(0xC083);
  machine.bload('program', 'SUBS');
  machine.cpu.sp = 0xF0;

  return machine;
}


/** JSR to a SUBS entry and run until it returns; with inline data, the call returns past it. */
export async function callSubs(machine: LiftedMachine, entry: number, inline: readonly number[] = []): Promise<void> {
  const returnTo: number = (inline.length > 0) ? INLINE + inline.length : RETURN;

  inline.forEach((value: number, index: number): void => machine.write(INLINE + index, value));
  machine.cpu.pushWord(((inline.length > 0) ? INLINE : RETURN) - 1);
  machine.cpu.pc = entry;
  await machine.runUntil((): boolean => machine.cpu.pc === returnTo);
}
