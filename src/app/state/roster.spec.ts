import { PartyStats, RosterCharacter } from './roster';
import { FlatStateMemory, StateError } from './state-memory';
import { ROST } from './symbols';


describe('RosterCharacter', (): void => {
  it('puts each slot 32 bytes after the last', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new RosterCharacter(memory, 2).gender = 0x5C;

    expect(memory.read(0xEC40 + ROST.player_gender)).toBe(0x5C);
  });

  it('refuses a ninth slot', (): void => {
    expect((): RosterCharacter => new RosterCharacter(new FlatStateMemory(), 8)).toThrow(StateError);
  });

  describe('name', (): void => {
    it('writes high-bit ASCII', (): void => {
      const memory: FlatStateMemory = new FlatStateMemory();

      new RosterCharacter(memory, 0).name = 'IOLO';

      expect(memory.read(0xEC00)).toBe(0xC9);
    });

    it('pads with zeros to 16 bytes', (): void => {
      const memory: FlatStateMemory = new FlatStateMemory();

      memory.bytes.fill(0xFF, 0xEC00, 0xEC10);
      new RosterCharacter(memory, 0).name = 'IOLO';

      expect(Array.from(memory.bytes.subarray(0xEC04, 0xEC10)).every((byte: number): boolean => byte === 0)).toBe(true);
    });

    it('reads back what was written', (): void => {
      const character: RosterCharacter = new RosterCharacter(new FlatStateMemory(), 0);

      character.name = 'SHAMINO';

      expect(character.name).toBe('SHAMINO');
    });

    it('stops at 15 characters with no terminator', (): void => {
      const memory: FlatStateMemory = new FlatStateMemory();

      memory.bytes.fill(0xC1, 0xEC00, 0xEC10);

      expect(new RosterCharacter(memory, 0).name).toBe('A'.repeat(15));
    });

    it('refuses 16 characters', (): void => {
      expect((): void => {
        new RosterCharacter(new FlatStateMemory(), 0).name = 'A'.repeat(16);
      }).toThrow(StateError);
    });
  });

  it('reads strength as BCD', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(0xEC00 + ROST.player_strength, 0x19);

    expect(new RosterCharacter(memory, 0).strength).toBe(19);
  });

  it('writes hit points as two BCD bytes', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new RosterCharacter(memory, 0).hitPoints = 800;

    expect([ memory.read(0xEC18), memory.read(0xEC19) ]).toEqual([ 0x08, 0x00 ]);
  });

  it('reads experience as two BCD bytes', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(0xEC00 + ROST.player_experience_hi, 0x12);
    memory.write(0xEC00 + ROST.player_experience_lo, 0x34);

    expect(new RosterCharacter(memory, 0).experience).toBe(1234);
  });

  it('keeps the status letter as the game assembles it', (): void => {
    const character: RosterCharacter = new RosterCharacter(new FlatStateMemory(), 0);

    character.status = ROST.status_Good;

    expect(character.status).toBe(0xC7);
  });
});


describe('PartyStats', (): void => {
  it('reads a virtue as BCD', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(ROST.party_stats + ROST.virtue_valor, 0x55);

    expect(new PartyStats(memory).virtue(ROST.virtue_valor)).toBe(55);
  });

  it('refuses a ninth virtue', (): void => {
    expect((): number => new PartyStats(new FlatStateMemory()).virtue(8)).toThrow(StateError);
  });

  it('writes food as four BCD digits', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new PartyStats(memory).food = 2500;

    expect([ memory.read(ROST.food_hi), memory.read(ROST.food_lo) ]).toEqual([ 0x25, 0x00 ]);
  });

  it('keeps the hundredths of food apart', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(ROST.food_frac, 0x75);

    expect(new PartyStats(memory).foodFraction).toBe(75);
  });

  it('reads gold as four BCD digits', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(ROST.gold_hi, 0x01);
    memory.write(ROST.gold_lo, 0x50);

    expect(new PartyStats(memory).gold).toBe(150);
  });

  it('keeps the stones as bits', (): void => {
    const stats: PartyStats = new PartyStats(new FlatStateMemory());

    stats.stones = ROST.stone_blue | ROST.stone_black;

    expect(stats.stones).toBe(0x81);
  });

  it('puts the weapon counts at weapons', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new PartyStats(memory).setWeapon(ROST.weapon_dagger, 12);

    expect(memory.read(ROST.weapons + ROST.weapon_dagger)).toBe(0x12);
  });

  it('puts the mixture counts at mixtures', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    new PartyStats(memory).setMixture(25, 3);

    expect(memory.read(ROST.mixtures + 25)).toBe(0x03);
  });

  it('refuses a 27th mixture', (): void => {
    expect((): number => new PartyStats(new FlatStateMemory()).mixture(26)).toThrow(StateError);
  });

  it('reads a reagent count as BCD', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(ROST.reagents + ROST.reagent_mandrake, 0x10);

    expect(new PartyStats(memory).reagent(ROST.reagent_mandrake)).toBe(10);
  });

  it('reads an armour count as BCD', (): void => {
    const memory: FlatStateMemory = new FlatStateMemory();

    memory.write(ROST.armour + 7, 0x02);

    expect(new PartyStats(memory).armour(7)).toBe(2);
  });
});
