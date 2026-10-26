import { BRITANNIA_HELP } from '../../../src/app/lifted/britannia/help';
import { BRITANNIA_HOLE } from '../../../src/app/lifted/britannia/hole';
import { BRITANNIA_LORD } from '../../../src/app/lifted/britannia/lord';
import { BRITANNIA_SAVE } from '../../../src/app/lifted/britannia/save';
import { BRITANNIA_SEAR } from '../../../src/app/lifted/britannia/sear';
import { BRITANNIA_SHRN } from '../../../src/app/lifted/britannia/shrn';
import { BRITANNIA_TMAP } from '../../../src/app/lifted/britannia/tmap';
import { BRITANNIA_USE } from '../../../src/app/lifted/britannia/use';
import { TOWNE_MIX } from '../../../src/app/lifted/towne/mix';
import { TOWNE_SEAR } from '../../../src/app/lifted/towne/sear';
import { TOWNE_SHP0 } from '../../../src/app/lifted/towne/shp0';
import { TOWNE_SHP1 } from '../../../src/app/lifted/towne/shp1';
import { TOWNE_SHP2 } from '../../../src/app/lifted/towne/shp2';
import { TOWNE_SHP3 } from '../../../src/app/lifted/towne/shp3';
import { TOWNE_SHP4 } from '../../../src/app/lifted/towne/shp4';
import { TOWNE_TALK } from '../../../src/app/lifted/towne/talk';
import { TOWNE_TMAP } from '../../../src/app/lifted/towne/tmap';
import { TOWNE_USE } from '../../../src/app/lifted/towne/use';
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
import { MIX_DATA } from '../../../src/app/port/program/towne/mix';
import { TOWNE_SEAR_DATA } from '../../../src/app/port/program/towne/sear';
import { SHP0_DATA } from '../../../src/app/port/program/towne/shp0';
import { SHP1_DATA } from '../../../src/app/port/program/towne/shp1';
import { SHP2_DATA } from '../../../src/app/port/program/towne/shp2';
import { SHP3_DATA } from '../../../src/app/port/program/towne/shp3';
import { SHP4_DATA } from '../../../src/app/port/program/towne/shp4';
import { TALK_DATA } from '../../../src/app/port/program/towne/talk';
import { TOWNE_TMAP_DATA } from '../../../src/app/port/program/towne/tmap';
import { TOWNE_USE_DATA } from '../../../src/app/port/program/towne/use';

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
  [ 'towne SEAR', TOWNE_SEAR, TOWNE_SEAR_DATA ],
  [ 'towne TALK', TOWNE_TALK, TALK_DATA ],
  [ 'towne TMAP', TOWNE_TMAP, TOWNE_TMAP_DATA ],
  [ 'towne USE', TOWNE_USE, TOWNE_USE_DATA ],
  [ 'MIX', TOWNE_MIX, MIX_DATA ],
  [ 'SHP0', TOWNE_SHP0, SHP0_DATA ],
  [ 'SHP1', TOWNE_SHP1, SHP1_DATA ],
  [ 'SHP2', TOWNE_SHP2, SHP2_DATA ],
  [ 'SHP3', TOWNE_SHP3, SHP3_DATA ],
  [ 'SHP4', TOWNE_SHP4, SHP4_DATA ],
];


describe('the Britannia and towne overlays\' data', (): void => {
  describe.each(OVERLAYS)('%s', (_: string, module: ILiftedModule, data: readonly IInlineData[]): void => {
    it.each(data.map((block: IInlineData): [ string, IInlineData ] => [ `$${ block.address.toString(16) }`, block ]))(
      'holds the bytes at %s as the image does',
      (_address: string, block: IInlineData): void => {
        expect(block.bytes).toEqual(asLoaded(module, block));
      },
    );
  });
});
