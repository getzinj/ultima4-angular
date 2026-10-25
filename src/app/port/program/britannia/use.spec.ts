import type { LiftedMachine } from '../../../lifted-runtime/lifted-machine';
import { MAP_OBJECTS, PLACES, PRTY, ROST, TILES, ZP_MAIN } from '../../../state/symbols';
import { overlayMachine, runOverlay } from '../../testing/overlay-machine';
import { OVERLAY_ENTRY } from './overlay';
import { USE_MODULE } from './use';

const RETURN: string = '\r';
const BACKSPACE: string = '\b';


function useMachine(): LiftedMachine {
  const machine: LiftedMachine = overlayMachine(USE_MODULE);

  machine.write(PRTY.game_mode, PRTY.mode_world);
  machine.write(ZP_MAIN.sfx_volume, 0x00);

  return machine;
}


function atAbyss(machine: LiftedMachine): LiftedMachine {
  machine.write(PRTY.player_xpos, PLACES.xpos_abyss_entrance);
  machine.write(PRTY.player_ypos, PLACES.ypos_abyss_entrance);

  return machine;
}


function use(machine: LiftedMachine, word: string): Promise<LiftedMachine> {
  return runOverlay(machine, OVERLAY_ENTRY, `${ word }${ RETURN }`);
}


function withVirtues(machine: LiftedMachine, value: number): LiftedMachine {
  for (let virtue: number = 0; virtue < ROST.virtue_last; virtue++) {
    machine.write(ROST.party_stats + virtue, value);
  }

  return machine;
}


describe('USE, ported', (): void => {
  describe('the horn', (): void => {
    function withHorn(): LiftedMachine {
      const machine: LiftedMachine = useMachine();

      machine.write(ROST.horn, 0x01);

      return machine;
    }

    it('wraps the party in its aura', async (): Promise<void> => {
      expect((await use(withHorn(), 'HORN')).read(ZP_MAIN.magic_aura)).toBe(ZP_MAIN.aura_horn);
    });

    it('sounds for ten turns', async (): Promise<void> => {
      expect((await use(withHorn(), 'HORN')).read(ZP_MAIN.aura_duration)).toBe(0x0A);
    });

    it('is known by its first four letters', async (): Promise<void> => {
      expect((await use(withHorn(), 'HORNET')).read(ZP_MAIN.magic_aura)).toBe(ZP_MAIN.aura_horn);
    });

    it('is known after a slip mended with backspace', async (): Promise<void> => {
      expect((await use(withHorn(), `HX${ BACKSPACE }ORN`)).read(ZP_MAIN.magic_aura)).toBe(ZP_MAIN.aura_horn);
    });

    it('does nothing unowned', async (): Promise<void> => {
      expect((await use(useMachine(), 'HORN')).read(ZP_MAIN.aura_duration)).toBe(0x00);
    });
  });

  describe('the bell, book and candle', (): void => {
    it('mark the bell rung at the Abyss', async (): Promise<void> => {
      const machine: LiftedMachine = atAbyss(useMachine());

      machine.write(ROST.bell_book_candle, ROST.item_have_bell);

      expect((await use(machine, 'BELL')).read(ROST.bell_book_candle)).toBe(ROST.item_have_bell | ROST.item_used_bell);
    });

    it('do not mark the bell rung elsewhere', async (): Promise<void> => {
      const machine: LiftedMachine = useMachine();

      machine.write(ROST.bell_book_candle, ROST.item_have_bell);

      expect((await use(machine, 'BELL')).read(ROST.bell_book_candle)).toBe(ROST.item_have_bell);
    });

    it('do not read the book before the bell is rung', async (): Promise<void> => {
      const machine: LiftedMachine = atAbyss(useMachine());

      machine.write(ROST.bell_book_candle, ROST.item_have_book);

      expect((await use(machine, 'BOOK')).read(ROST.bell_book_candle)).toBe(ROST.item_have_book);
    });
  });

  describe('the wheel', (): void => {
    function onShip(hull: number): LiftedMachine {
      const machine: LiftedMachine = useMachine();

      machine.write(ROST.wheel, 0x01);
      machine.write(PRTY.player_transport, TILES.tile_ship_last - 1);
      machine.write(PRTY.ship_hull, hull);

      return machine;
    }

    it('strengthens a whole hull', async (): Promise<void> => {
      expect((await use(onShip(PRTY.ship_hull_full), 'WHEEL')).read(PRTY.ship_hull)).toBe(PRTY.ship_hull_with_wheel);
    });

    it('does nothing for a damaged hull', async (): Promise<void> => {
      expect((await use(onShip(0x30), 'WHEEL')).read(PRTY.ship_hull)).toBe(0x30);
    });
  });

  describe('the skull', (): void => {
    function withSkull(): LiftedMachine {
      const machine: LiftedMachine = withVirtues(useMachine(), 0x50);

      machine.write(ROST.skull, 0x01);
      machine.write(MAP_OBJECTS.object_tile_type, TILES.tile_orc);

      return machine;
    }

    it('destroys the monsters about when held aloft', async (): Promise<void> => {
      expect((await use(withSkull(), 'SKULL')).read(MAP_OBJECTS.object_tile_type)).toBe(0x00);
    });

    it('costs five of every virtue when held aloft', async (): Promise<void> => {
      expect((await use(withSkull(), 'SKULL')).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x45);
    });

    it('does not take a virtue below one', async (): Promise<void> => {
      const machine: LiftedMachine = withVirtues(withSkull(), 0x03);

      expect((await use(machine, 'SKULL')).read(ROST.party_stats)).toBe(0x01);
    });

    it('is gone for good when cast into the Abyss', async (): Promise<void> => {
      expect((await use(atAbyss(withSkull()), 'SKULL')).read(ROST.skull)).toBe(0xFF);
    });

    it('adds ten to every virtue when cast into the Abyss', async (): Promise<void> => {
      expect((await use(atAbyss(withSkull()), 'SKULL')).read(ROST.party_stats + ROST.virtue_honor)).toBe(0x60);
    });
  });
});
