import { HIRES_BYTES, HIRES_PAGE_1, HIRES_PAGE_2 } from './apple-hires.constants';
import { Clock } from './clock';
import { Keyboard } from './keyboard';
import { LanguageCard } from './language-card';
import { readRomStub } from './rom-stub';
import { Speaker } from './speaker';
import { VideoSwitches } from './video-switches';


const MAIN_RAM_TOP: number = 0xC000;
const LANGUAGE_CARD_BASE: number = 0xD000;
const KEYBOARD_DATA: number = 0xC000;
const KEYBOARD_STROBE: number = 0xC010;
const SPEAKER: number = 0xC030;
const VIDEO_FIRST: number = 0xC050;
const VIDEO_LAST: number = 0xC057;
const LANGUAGE_CARD_FIRST: number = 0xC080;
const LANGUAGE_CARD_LAST: number = 0xC08F;


/**
 * A 64 KB Apple IIe as Ultima IV uses it: 48 KB of main RAM, the language card over the ROM, and
 * the soft switches for the keyboard, speaker, display and language card. Everything else in
 * $C000-$CFFF reads as zero and ignores writes.
 */
export class AppleMachine {
  public readonly clock: Clock;
  public readonly keyboard: Keyboard = new Keyboard();
  public readonly speaker: Speaker = new Speaker();
  public readonly video: VideoSwitches = new VideoSwitches();
  public readonly languageCard: LanguageCard = new LanguageCard();

  /** Set by any write to the page on show; cleared by whoever paints it. */
  public dirty: boolean = true;

  private readonly ram: Uint8Array = new Uint8Array(MAIN_RAM_TOP);


  constructor(clock: Clock = new Clock()) {
    this.clock = clock;
  }


  /** The hi-res page on show, as a view of main RAM. */
  public get displayedPage(): Uint8Array {
    const base: number = this.video.page2 ? HIRES_PAGE_2 : HIRES_PAGE_1;

    return this.ram.subarray(base, base + HIRES_BYTES);
  }


  public read(address: number): number {
    if (address < MAIN_RAM_TOP) {
      return this.ram[address];
    } else if (address < LANGUAGE_CARD_BASE) {
      return this.access(address, false);
    } else if (this.languageCard.readsRam) {
      return this.languageCard.read(address);
    } else {
      return readRomStub(address);
    }
  }


  public write(address: number, value: number): void {
    if (address < MAIN_RAM_TOP) {
      this.ram[address] = value & 0xFF;
      this.markIfShown(address);
    } else if (address < LANGUAGE_CARD_BASE) {
      this.access(address, true);
    } else {
      this.languageCard.write(address, value & 0xFF);
    }
  }


  /** BLOAD's copy into main RAM. */
  public load(address: number, bytes: Uint8Array): void {
    this.ram.set(bytes, address);
    this.dirty = true;
  }


  private access(address: number, isWrite: boolean): number {
    let value: number = 0;

    if (address === KEYBOARD_DATA) {
      value = this.keyboard.peekData();
    } else if (address === KEYBOARD_STROBE) {
      value = this.keyboard.peekData() & 0x7F;
      this.keyboard.clearStrobe();
    } else if (address === SPEAKER) {
      this.speaker.toggle(this.clock.cycles);
    } else if ((address >= VIDEO_FIRST) && (address <= VIDEO_LAST)) {
      this.video.switch(address);
      this.dirty = true;
    } else if ((address >= LANGUAGE_CARD_FIRST) && (address <= LANGUAGE_CARD_LAST)) {
      this.languageCard.switch(address, isWrite);
    }

    return value;
  }


  private markIfShown(address: number): void {
    const base: number = this.video.page2 ? HIRES_PAGE_2 : HIRES_PAGE_1;

    if ((address >= base) && (address < (base + HIRES_BYTES))) {
      this.dirty = true;
    }
  }

}
