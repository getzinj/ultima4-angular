import { checkIndex, readBcd, writeBcd, writeByte } from './fields';
import type { IStateMemory } from './state-memory';
import { StateError } from './state-memory';
import { ROST } from './symbols';

// The ROST save file at $EC00: eight characters of 32 bytes, then the party's virtues and
// belongings at $ED00. Counts, stats, hit points and experience are BCD; names are high-bit ASCII,
// at most 15 characters, padded with zeros.

export const CHARACTER_COUNT: number = ROST.player_last;
export const CHARACTER_LENGTH: number = 0x20;
export const NAME_LENGTH: number = 15;

/** ROST's file: both pages. */
export const ROSTER_LENGTH: number = 0x200;

export const VIRTUE_COUNT: number = ROST.virtue_last;
export const ARMOUR_COUNT: number = ROST.armour_last;
export const WEAPON_COUNT: number = ROST.weapon_last;
export const REAGENT_COUNT: number = ROST.reagent_max;
export const MIXTURE_COUNT: number = ROST.spells_max;


export class RosterCharacter {
  private readonly base: number;


  constructor(private readonly memory: IStateMemory, public readonly slot: number) {
    this.base = ROST.player_stats + (checkIndex(slot, CHARACTER_COUNT, 'character slot') * CHARACTER_LENGTH);
  }


  public get name(): string {
    let name: string = '';
    let index: number = 0;

    while ((index < NAME_LENGTH) && (this.memory.read(this.base + index) !== 0)) {
      name = name + String.fromCharCode(this.memory.read(this.base + index) & 0x7F);
      index = index + 1;
    }

    return name;
  }


  public set name(value: string) {
    if ((value.length > NAME_LENGTH) || !/^[\x20-\x7E]*$/.test(value)) {
      throw new StateError(`"${ value }" is not a name of up to ${ NAME_LENGTH } printable characters`);
    } else {
      for (let index: number = 0; index <= NAME_LENGTH; index++) {
        this.memory.write(this.base + index, (index < value.length) ? (value.charCodeAt(index) | 0x80) : 0);
      }
    }
  }


  /** The glyph the game shows: `CHAR.glyph_male` or `CHAR.glyph_female`. */
  public get gender(): number {
    return this.memory.read(this.base + ROST.player_gender);
  }


  public set gender(value: number) {
    writeByte(this.memory, this.base + ROST.player_gender, value);
  }


  public get classIndex(): number {
    return this.memory.read(this.base + ROST.player_class_index);
  }


  public set classIndex(value: number) {
    writeByte(this.memory, this.base + ROST.player_class_index, value);
  }


  /** One of `ROST.status_Good`, `status_Poison`, `status_Sleep`, `status_Dead`; zero for an empty slot. */
  public get status(): number {
    return this.memory.read(this.base + ROST.player_status);
  }


  public set status(value: number) {
    writeByte(this.memory, this.base + ROST.player_status, value);
  }


  public get strength(): number {
    return readBcd(this.memory, this.base + ROST.player_strength, 1);
  }


  public set strength(value: number) {
    writeBcd(this.memory, this.base + ROST.player_strength, 1, value);
  }


  public get dexterity(): number {
    return readBcd(this.memory, this.base + ROST.player_dexterity, 1);
  }


  public set dexterity(value: number) {
    writeBcd(this.memory, this.base + ROST.player_dexterity, 1, value);
  }


  public get intelligence(): number {
    return readBcd(this.memory, this.base + ROST.player_intelligence, 1);
  }


  public set intelligence(value: number) {
    writeBcd(this.memory, this.base + ROST.player_intelligence, 1, value);
  }


  public get magicPoints(): number {
    return readBcd(this.memory, this.base + ROST.player_magic_points, 1);
  }


  public set magicPoints(value: number) {
    writeBcd(this.memory, this.base + ROST.player_magic_points, 1, value);
  }


  /** The class as a single bit, for the weapon and armour tables. */
  public get classBit(): number {
    return this.memory.read(this.base + ROST.player_class_bit);
  }


  public set classBit(value: number) {
    writeByte(this.memory, this.base + ROST.player_class_bit, value);
  }


  public get hitPoints(): number {
    return readBcd(this.memory, this.base + ROST.player_cur_hp_hi, 2);
  }


  public set hitPoints(value: number) {
    writeBcd(this.memory, this.base + ROST.player_cur_hp_hi, 2, value);
  }


  public get maxHitPoints(): number {
    return readBcd(this.memory, this.base + ROST.player_max_hp_hi, 2);
  }


  public set maxHitPoints(value: number) {
    writeBcd(this.memory, this.base + ROST.player_max_hp_hi, 2, value);
  }


  public get experience(): number {
    return readBcd(this.memory, this.base + ROST.player_experience_hi, 2);
  }


  public set experience(value: number) {
    writeBcd(this.memory, this.base + ROST.player_experience_hi, 2, value);
  }


  /** An index into the weapons, `ROST.weapon_none` for none. */
  public get weapon(): number {
    return this.memory.read(this.base + ROST.player_weapon);
  }


  public set weapon(value: number) {
    writeByte(this.memory, this.base + ROST.player_weapon, value);
  }


  /** An index into the armours, `ROST.armour_none` for none. */
  public get armour(): number {
    return this.memory.read(this.base + ROST.player_armour);
  }


  public set armour(value: number) {
    writeByte(this.memory, this.base + ROST.player_armour, value);
  }
}


/** The party's virtues and belongings, at `ROST.party_stats`. */
export class PartyStats {
  constructor(private readonly memory: IStateMemory) {
  }


  public virtue(index: number): number {
    return readBcd(this.memory, ROST.party_stats + checkIndex(index, VIRTUE_COUNT, 'virtue'), 1);
  }


  public setVirtue(index: number, value: number): void {
    writeBcd(this.memory, ROST.party_stats + checkIndex(index, VIRTUE_COUNT, 'virtue'), 1, value);
  }


  public get torches(): number {
    return readBcd(this.memory, ROST.torches, 1);
  }


  public set torches(value: number) {
    writeBcd(this.memory, ROST.torches, 1, value);
  }


  public get gems(): number {
    return readBcd(this.memory, ROST.gems, 1);
  }


  public set gems(value: number) {
    writeBcd(this.memory, ROST.gems, 1, value);
  }


  public get keys(): number {
    return readBcd(this.memory, ROST.keys, 1);
  }


  public set keys(value: number) {
    writeBcd(this.memory, ROST.keys, 1, value);
  }


  public get sextants(): number {
    return readBcd(this.memory, ROST.sextant, 1);
  }


  public set sextants(value: number) {
    writeBcd(this.memory, ROST.sextant, 1, value);
  }


  /** A bit per stone, `ROST.stone_blue` to `stone_black`. */
  public get stones(): number {
    return this.memory.read(ROST.stones);
  }


  public set stones(value: number) {
    writeByte(this.memory, ROST.stones, value);
  }


  /** A bit per rune. */
  public get runes(): number {
    return this.memory.read(ROST.runes);
  }


  public set runes(value: number) {
    writeByte(this.memory, ROST.runes, value);
  }


  /** `ROST.item_have_*` and `item_used_*` bits for the bell, book and candle. */
  public get bellBookCandle(): number {
    return this.memory.read(ROST.bell_book_candle);
  }


  public set bellBookCandle(value: number) {
    writeByte(this.memory, ROST.bell_book_candle, value);
  }


  /** `ROST.key3_have_*` bits. */
  public get threePartKey(): number {
    return this.memory.read(ROST.threepartkey);
  }


  public set threePartKey(value: number) {
    writeByte(this.memory, ROST.threepartkey, value);
  }


  /** Whole rations, four digits; the game also keeps hundredths, in `foodFraction`. */
  public get food(): number {
    return readBcd(this.memory, ROST.food_hi, 2);
  }


  public set food(value: number) {
    writeBcd(this.memory, ROST.food_hi, 2, value);
  }


  public get foodFraction(): number {
    return readBcd(this.memory, ROST.food_frac, 1);
  }


  public set foodFraction(value: number) {
    writeBcd(this.memory, ROST.food_frac, 1, value);
  }


  public get gold(): number {
    return readBcd(this.memory, ROST.gold_hi, 2);
  }


  public set gold(value: number) {
    writeBcd(this.memory, ROST.gold_hi, 2, value);
  }


  public get horn(): number {
    return this.memory.read(ROST.horn);
  }


  public set horn(value: number) {
    writeByte(this.memory, ROST.horn, value);
  }


  public get wheel(): number {
    return this.memory.read(ROST.wheel);
  }


  public set wheel(value: number) {
    writeByte(this.memory, ROST.wheel, value);
  }


  public get skull(): number {
    return this.memory.read(ROST.skull);
  }


  public set skull(value: number) {
    writeByte(this.memory, ROST.skull, value);
  }


  public armour(index: number): number {
    return readBcd(this.memory, ROST.armour + checkIndex(index, ARMOUR_COUNT, 'armour'), 1);
  }


  public setArmour(index: number, value: number): void {
    writeBcd(this.memory, ROST.armour + checkIndex(index, ARMOUR_COUNT, 'armour'), 1, value);
  }


  public weapon(index: number): number {
    return readBcd(this.memory, ROST.weapons + checkIndex(index, WEAPON_COUNT, 'weapon'), 1);
  }


  public setWeapon(index: number, value: number): void {
    writeBcd(this.memory, ROST.weapons + checkIndex(index, WEAPON_COUNT, 'weapon'), 1, value);
  }


  public reagent(index: number): number {
    return readBcd(this.memory, ROST.reagents + checkIndex(index, REAGENT_COUNT, 'reagent'), 1);
  }


  public setReagent(index: number, value: number): void {
    writeBcd(this.memory, ROST.reagents + checkIndex(index, REAGENT_COUNT, 'reagent'), 1, value);
  }


  public mixture(index: number): number {
    return readBcd(this.memory, ROST.mixtures + checkIndex(index, MIXTURE_COUNT, 'mixture'), 1);
  }


  public setMixture(index: number, value: number): void {
    writeBcd(this.memory, ROST.mixtures + checkIndex(index, MIXTURE_COUNT, 'mixture'), 1, value);
  }
}
