import { BRITANNIA_HELP } from '../../../src/app/lifted/britannia/help';
import { BRITANNIA_HOLE } from '../../../src/app/lifted/britannia/hole';
import { BRITANNIA_LORD } from '../../../src/app/lifted/britannia/lord';
import { BRITANNIA_SAVE } from '../../../src/app/lifted/britannia/save';
import { BRITANNIA_SEAR } from '../../../src/app/lifted/britannia/sear';
import { BRITANNIA_SHRN } from '../../../src/app/lifted/britannia/shrn';
import { BRITANNIA_TMAP } from '../../../src/app/lifted/britannia/tmap';
import { BRITANNIA_USE } from '../../../src/app/lifted/britannia/use';
import type { ILiftedModule } from '../../../src/app/lifted-runtime/lifted-module';
import type { IInlineData } from '../../../src/app/port/inline-data';
import { HELP_DATA } from '../../../src/app/port/program/britannia/help';
import { HOLE_DATA } from '../../../src/app/port/program/britannia/hole';
import { LORD_DATA } from '../../../src/app/port/program/britannia/lord';
import { SAVE_DATA } from '../../../src/app/port/program/britannia/save';
import { SEAR_DATA } from '../../../src/app/port/program/britannia/sear';
import { SHRN_DATA } from '../../../src/app/port/program/britannia/shrn';
import { TMAP_DATA } from '../../../src/app/port/program/britannia/tmap';
import { USE_DATA } from '../../../src/app/port/program/britannia/use';

// Every byte the overlay ports install, against the image the lifter took from the build. Local
// only, like the rest of the gate: the lifted modules are generated, not committed.

function image(module: ILiftedModule): Uint8Array {
  return Uint8Array.from(atob(module.image), (character: string): number => character.charCodeAt(0));
}


function asLoaded(module: ILiftedModule, block: IInlineData): number[] {
  const offset: number = block.address - module.load;

  return Array.from(image(module).subarray(offset, offset + block.bytes.length));
}


const OVERLAYS: readonly [ string, ILiftedModule, readonly IInlineData[] ][] = [
  [ 'HELP', BRITANNIA_HELP, HELP_DATA ],
  [ 'HOLE', BRITANNIA_HOLE, HOLE_DATA ],
  [ 'LORD', BRITANNIA_LORD, LORD_DATA ],
  [ 'SAVE', BRITANNIA_SAVE, SAVE_DATA ],
  [ 'SEAR', BRITANNIA_SEAR, SEAR_DATA ],
  [ 'SHRN', BRITANNIA_SHRN, SHRN_DATA ],
  [ 'TMAP', BRITANNIA_TMAP, TMAP_DATA ],
  [ 'USE', BRITANNIA_USE, USE_DATA ],
];


describe('the Britannia overlays\' data', (): void => {
  describe.each(OVERLAYS)('%s', (_: string, module: ILiftedModule, data: readonly IInlineData[]): void => {
    it.each(data.map((block: IInlineData): [ string, IInlineData ] => [ `$${ block.address.toString(16) }`, block ]))(
      'holds the bytes at %s as the image does',
      (_address: string, block: IInlineData): void => {
        expect(block.bytes).toEqual(asLoaded(module, block));
      },
    );
  });
});
