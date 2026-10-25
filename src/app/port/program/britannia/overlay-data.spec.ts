import { BRITANNIA_HOLE } from '../../../lifted/britannia/hole';
import { BRITANNIA_SAVE } from '../../../lifted/britannia/save';
import { BRITANNIA_SEAR } from '../../../lifted/britannia/sear';
import { BRITANNIA_TMAP } from '../../../lifted/britannia/tmap';
import { BRITANNIA_USE } from '../../../lifted/britannia/use';
import type { ILiftedModule } from '../../../lifted-runtime/lifted-module';
import type { IInlineData } from '../../inline-data';
import { HOLE_DATA } from './hole';
import { SAVE_DATA } from './save';
import { SEAR_DATA } from './sear';
import { TMAP_DATA } from './tmap';
import { USE_DATA } from './use';

// Every byte the overlay ports install, against the image the lifter took from the build.

function image(module: ILiftedModule): Uint8Array {
  return Uint8Array.from(atob(module.image), (character: string): number => character.charCodeAt(0));
}


function asLoaded(module: ILiftedModule, block: IInlineData): number[] {
  const offset: number = block.address - module.load;

  return Array.from(image(module).subarray(offset, offset + block.bytes.length));
}


const OVERLAYS: readonly [ string, ILiftedModule, readonly IInlineData[] ][] = [
  [ 'HOLE', BRITANNIA_HOLE, HOLE_DATA ],
  [ 'SAVE', BRITANNIA_SAVE, SAVE_DATA ],
  [ 'SEAR', BRITANNIA_SEAR, SEAR_DATA ],
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
