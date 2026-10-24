// The lifted game on an AppleMachine, with DOS and the ROM stood in for exactly as the oracle
// (tools/oracle/machine.py) stands in for them, so that the two can be compared snapshot for
// snapshot: COUT, HOME, DOS's hook-up and output handler, BLOAD, BSAVE, BRUN and RWTS are trapped,
// the ROM stub's RTS is run as one, and a keyboard poll is a read of $C000 with no key latched.
//
// A program file the game loads is taken from its lifted module, not from the disk: the modules
// are the remaster's `fixed` build, the player's disks hold the original. Its instruction bytes
// are then owned by the module, and control at an owned address runs the module's code. A write
// over an instruction byte drops that ownership, so running it afterwards fails loudly instead of
// running stale code. Only the patch points and the opcode stores are rewritten in place.
//
// A program ported by hand (an INativeModule) replaces its lifted module: loading it installs the
// program's variables (over the lifted image, when there is one, so memory still matches the
// oracle's byte for byte), and control at one of its entries runs the native routine. Native and
// lifted code call each other freely. The machine runs as a coroutine: `runUntil` resumes it, and
// it stops at the first instruction boundary, or the first checkpoint a native routine reaches,
// where the condition holds, as the oracle stops between instructions.

import { AppleMachine } from '../runtime/apple-machine';
import type { IBinaryFile } from '../data/dos33';
import type { Dos33Disk } from '../data/dos33';
import { DISK_IDS, DISK_NAMES, RAW_TRACKS } from '../data/ultima-disks';
import type { UltimaDiskName } from '../data/ultima-disks';
import { CARRY, Cpu } from './cpu';
import type { IBus } from './cpu';
import type { ILiftedModule } from './lifted-module';
import type { INativeModule, NativeRoutine } from './native-module';

export const COUT: number = 0xFDED;
export const HOME: number = 0xFC58;
export const DOS_HOOK: number = 0x03EA;
export const DOS_OUTPUT: number = 0x9EBD;
export const RWTS_ENTRY: number = 0xB7B5;
/** The ROM stub's one instruction, an RTS. */
export const ID_ROUTINE: number = 0xFE1F;
/** Where `call` returns to: in the I/O page, so no program can own it. */
const CALL_RETURN: number = 0xC0FF;

export const KEYBOARD: number = 0xC000;
export const STROBE: number = 0xC010;
const CSW: number = 0x36;
const REQDISK: number = 0xDE;
const IOB: number = 0xB7E8;
const SLOT_6: number = 0x60;
const RETURN: number = 0x0D;
const CTRL_D: number = 0x04;

/** Ownership slots: main RAM by address, the language card's bank 1 after the 64 KB. */
const SLOTS: number = 0x11000;
const BANK1_SLOTS: number = 0x10000;

export type RegionBank = 'main' | 'bank1' | 'bank2' | 'high';

/** The oracle's snapshot regions; the stack page, the text page and DOS's memory are left out. */
export const REGIONS: readonly (readonly [ string, RegionBank, number, number ])[] = [
  [ 'zero_page', 'main', 0x0000, 0x0100 ],
  [ 'low', 'main', 0x0200, 0x0400 ],
  [ 'main', 'main', 0x0800, 0x9AA6 ],
  [ 'lc_bank1', 'bank1', 0xD000, 0xE000 ],
  [ 'lc_bank2', 'bank2', 0xD000, 0xE000 ],
  [ 'lc_high', 'high', 0xE000, 0x10000 ],
  [ 'hgr1', 'main', 0x2000, 0x4000 ],
  [ 'party', 'main', 0x0000, 0x0020 ],
  [ 'roster', 'high', 0xEC00, 0xEE00 ],
  [ 'objects', 'high', 0xEE00, 0xEF00 ],
];

export type DiskSet = Readonly<Record<UltimaDiskName, Dos33Disk>>;


export class LiftedMachineError extends Error {
}


export interface ISnapshot {
  readonly key: number | null;
  readonly polls: number;
  readonly dos: readonly string[];
  readonly regions: Readonly<Record<string, Uint8Array>>;
}


interface IStop {
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}


interface IPendingKey {
  readonly code: number;
  readonly polls: number;
}


function decodeImage(image: string): Uint8Array {
  const binary: string = atob(image);
  const bytes: Uint8Array = new Uint8Array(binary.length);

  for (let index: number = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}


function hex(value: number): string {
  return `$${ value.toString(16).toUpperCase().padStart(4, '0') }`;
}


export class LiftedMachine implements IBus {
  public readonly apple: AppleMachine = new AppleMachine();
  public readonly cpu: Cpu = new Cpu(this);
  public readonly dosLog: string[] = [];
  public readonly snapshots: ISnapshot[] = [];
  public key: number = 0;
  public polls: number = 0;
  public pending: IPendingKey | null = null;
  public maxCyclesPerStep: number = 200_000_000;

  private readonly disks: Record<UltimaDiskName, Dos33Disk>;
  private readonly drives: Map<number, UltimaDiskName> = new Map<number, UltimaDiskName>([ [ 1, 'program' ], [ 2, 'britannia' ] ]);
  private readonly owners: Int16Array = new Int16Array(SLOTS).fill(-1);
  private readonly rewritable: Uint8Array = new Uint8Array(SLOTS);
  private readonly images: Uint8Array[];
  private lastDrive: number = 1;
  private line: string | null = null;
  private atLineStart: boolean = true;
  private running: number = -1;
  private condition: () => boolean = (): boolean => true;
  private stepStart: number = 0;
  private task: Promise<void> | null = null;
  private stop: IStop | null = null;
  private resume: (() => void) | null = null;
  private failure: unknown = null;
  private nativeAt: { readonly name: string; readonly address: number } | null = null;


  constructor(
    disks: DiskSet,
    public readonly modules: readonly ILiftedModule[],
    private readonly rngAddress: number | null = null,
    public readonly natives: readonly INativeModule[] = [],
  ) {
    this.disks = { ...disks };
    this.images = modules.map((module: ILiftedModule): Uint8Array => decodeImage(module.image));
    this.apple.write(CSW, DOS_OUTPUT & 0xFF);
    this.apple.write(CSW + 1, DOS_OUTPUT >> 8);
    this.cpu.sp = 0xF8;
    this.cpu.tracing = true;
    this.cpu.trace = (pc: number): boolean => this.shouldStop(pc);
  }


  // --- the bus ------------------------------------------------------------------------------

  public read(address: number): number {
    if (address === KEYBOARD) {
      return this.pollKeyboard();
    } else if (address === STROBE) {
      return this.clearStrobe();
    } else {
      return this.apple.read(address);
    }
  }


  public write(address: number, value: number): void {
    if (address === STROBE) {
      this.clearStrobe();
    } else {
      const slot: number = this.writeSlot(address);

      if ((slot >= 0) && (this.rewritable[slot] === 0)) {
        this.owners[slot] = -1;
      }
      this.apple.write(address, value);
    }
  }


  // --- the keyboard -------------------------------------------------------------------------

  /** Runs until the game has polled `polls` times with nothing waiting, latches `code`, and runs on until the game has read it. */
  public press(code: number, polls: number = 0): Promise<void> {
    this.pending = { code: code & 0x7F, polls };
    this.polls = 0;

    return this.runUntil((): boolean => (this.pending == null) && ((this.key & 0x80) === 0));
  }


  public idle(polls: number): Promise<void> {
    this.polls = 0;

    return this.runUntil((): boolean => this.polls >= polls);
  }


  // --- running ------------------------------------------------------------------------------

  /** BLOAD outside the game, for tests and tools. */
  public bload(disk: UltimaDiskName, name: string, at: number | null = null): number {
    return this.load(disk, name, at);
  }


  public boot(): void {
    this.dosLog.push('BRUN INIT');
    this.cpu.pc = this.load('program', 'INIT', null);
  }


  /** Runs the game until `done` holds between two instructions, or at a native routine's checkpoint. */
  public runUntil(done: () => boolean): Promise<void> {
    let result: Promise<void>;

    if (this.failure != null) {
      result = Promise.reject(this.failure);
    } else if (done()) {
      result = Promise.resolve();
    } else {
      this.condition = done;
      this.stepStart = this.cpu.cycles;
      result = new Promise<void>((resolve: () => void, reject: (error: unknown) => void): void => {
        const resume: (() => void) | null = this.resume;

        this.stop = { resolve, reject };
        this.resume = null;
        if (resume != null) {
          resume();
        } else if (this.task == null) {
          this.task = this.execute();
        }
      });
    }

    return result;
  }


  /** For native code, where an instruction boundary would be: stops here if the condition holds. */
  public async checkpoint(): Promise<void> {
    this.checkProgress();
    if (this.condition()) {
      await new Promise<void>((resume: () => void): void => {
        const stop: IStop | null = this.stop;

        this.resume = resume;
        this.stop = null;
        stop?.resolve();
      });
    }
  }


  /** For native code: as if the 6502 were at `address` in `program`, for scenarios that wait for a label. */
  public async at(program: string, address: number): Promise<void> {
    this.cpu.pc = address;
    this.nativeAt = { name: program, address };
    await this.checkpoint();
    this.nativeAt = null;
  }


  /** For native code: JSR to `address`, lifted, native or trapped, and run until it returns. */
  public async call(address: number): Promise<void> {
    this.cpu.pushWord(CALL_RETURN - 1);
    this.cpu.pc = address;
    while (this.cpu.pc !== CALL_RETURN) {
      await this.dispatch();
    }
  }


  /**
   * For native code: the JSR at `data - 3` to a routine that takes the bytes after it, such as
   * primm, and runs until it returns past them to the same stack depth.
   */
  public async callInline(address: number, data: number, length: number): Promise<void> {
    const depth: number = this.cpu.sp;
    const returnTo: number = data + length;

    this.cpu.pushWord(data - 1);
    this.cpu.pc = address;
    while ((this.cpu.pc !== returnTo) || (this.cpu.sp !== depth)) {
      await this.dispatch();
    }
  }


  /** For native code: the RTS that ends a routine entered by JSR. */
  public rts(): void {
    this.cpu.pc = (this.cpu.pullWord() + 1) & 0xFFFF;
  }


  /** For native code: a keyboard read, which a scenario may stop just after. */
  public async readKeyboard(): Promise<number> {
    const value: number = this.read(KEYBOARD);

    await this.checkpoint();

    return value;
  }


  /** For native code: `bit hw_STROBE`. */
  public async clearKeyboardStrobe(): Promise<number> {
    const value: number = this.read(STROBE);

    await this.checkpoint();

    return value;
  }


  /** The name of the program whose code is at `address`, lifted or native. */
  public programAt(address: number): string | null {
    const owner: number = this.ownerAt(address);
    let name: string | null = null;

    if ((this.nativeAt != null) && (this.nativeAt.address === address)) {
      name = this.nativeAt.name;
    } else if (owner >= 0) {
      name = this.modules[owner].name;
    } else if (owner <= -2) {
      name = this.natives[-2 - owner].name;
    }

    return name;
  }


  private async execute(): Promise<void> {
    try {
      for (;;) {
        await this.dispatch();
      }
    } catch (error: unknown) {
      const stop: IStop | null = this.stop;

      this.failure = error;
      this.stop = null;
      stop?.reject(error);
    }
  }


  private async dispatch(): Promise<void> {
    if (this.condition()) {
      await this.checkpoint();
    }
    this.checkProgress();
    if (!this.trap(this.cpu.pc)) {
      const owner: number = this.ownerAt(this.cpu.pc);

      if (owner >= 0) {
        this.running = owner;
        this.modules[owner].run(this.cpu, this.cpu.pc);
        this.running = -1;
      } else if (owner <= -2) {
        const routine: NativeRoutine | undefined = this.natives[-2 - owner].entries.get(this.cpu.pc);

        if (routine == null) {
          throw new LiftedMachineError(`no native routine at ${ hex(this.cpu.pc) }`);
        } else {
          await routine(this);
        }
      } else {
        throw new LiftedMachineError(`no lifted code at ${ hex(this.cpu.pc) }`);
      }
    }
  }


  /** The module whose code is at `address` as the CPU would fetch it now, or null. */
  public moduleAt(address: number): ILiftedModule | null {
    const owner: number = this.ownerAt(address);

    return (owner >= 0) ? this.modules[owner] : null;
  }


  public snapshot(key: number | null): ISnapshot {
    return { key, polls: this.polls, dos: [ ...this.dosLog ], regions: this.regions() };
  }


  public regions(): Record<string, Uint8Array> {
    const result: Record<string, Uint8Array> = {};
    const card: AppleMachine['languageCard'] = this.apple.languageCard;
    const video: AppleMachine['video'] = this.apple.video;

    for (const [ name, bank, start, end ] of REGIONS) {
      result[name] = this.bankBytes(bank, start, end);
    }
    if (this.rngAddress != null) {
      result['rng'] = this.bankBytes('main', this.rngAddress, this.rngAddress + 16);
    }
    result['switches'] = Uint8Array.from([ video.text, video.mixed, video.page2, video.hires, card.readsRam, card.writesRam, card.bank === 1 ]
      .map((on: boolean): number => (on ? 1 : 0)));

    return result;
  }


  private bankBytes(bank: RegionBank, start: number, end: number): Uint8Array {
    if (bank === 'main') {
      return Uint8Array.from({ length: end - start }, (_: unknown, index: number): number => this.apple.read(start + index));
    } else if (bank === 'high') {
      return this.apple.languageCard.contents('high').slice(start - 0xE000, end - 0xE000);
    } else {
      return this.apple.languageCard.contents(bank).slice(start - 0xD000, end - 0xD000);
    }
  }


  private shouldStop(pc: number): boolean {
    this.checkProgress();

    return (this.ownerAt(pc) !== this.running) || this.isTrap(pc) || this.condition();
  }


  private checkProgress(): void {
    if ((this.cpu.cycles - this.stepStart) > this.maxCyclesPerStep) {
      throw new LiftedMachineError(`no progress after ${ this.maxCyclesPerStep } cycles; PC=${ hex(this.cpu.pc) }`);
    }
  }


  private pollKeyboard(): number {
    if ((this.key & 0x80) !== 0) {
      return this.key;
    } else if ((this.pending != null) && (this.polls >= this.pending.polls)) {
      this.snapshots.push(this.snapshot(this.pending.code));
      this.key = this.pending.code | 0x80;
      this.pending = null;
      this.polls = 0;

      return this.key;
    } else {
      this.polls = this.polls + 1;

      return this.key;
    }
  }


  private clearStrobe(): number {
    this.key = this.key & 0x7F;

    return this.key;
  }


  // --- ownership ----------------------------------------------------------------------------

  private ownerAt(address: number): number {
    const card: AppleMachine['languageCard'] = this.apple.languageCard;

    if (address < 0xC000) {
      return this.owners[address];
    } else if ((address < 0xD000) || !card.readsRam) {
      return -1;
    } else if ((address < 0xE000) && (card.bank === 1)) {
      return this.owners[BANK1_SLOTS + (address - 0xD000)];
    } else {
      return this.owners[address];
    }
  }


  private writeSlot(address: number): number {
    const card: AppleMachine['languageCard'] = this.apple.languageCard;

    if (address < 0xC000) {
      return address;
    } else if ((address < 0xD000) || !card.writesRam) {
      return -1;
    } else if ((address < 0xE000) && (card.bank === 1)) {
      return BANK1_SLOTS + (address - 0xD000);
    } else {
      return address;
    }
  }


  // --- traps --------------------------------------------------------------------------------

  private isTrap(pc: number): boolean {
    const rom: boolean = (pc >= 0xD000) && !this.apple.languageCard.readsRam;

    return (rom && ((pc === COUT) || (pc === HOME))) || (pc === DOS_HOOK) || (pc === DOS_OUTPUT) || (pc === RWTS_ENTRY);
  }


  private trap(pc: number): boolean {
    const rom: boolean = (pc >= 0xD000) && !this.apple.languageCard.readsRam;
    let trapped: boolean = true;

    if (rom && (pc === COUT)) {
      this.cpu.pc = this.apple.read(CSW) | (this.apple.read(CSW + 1) << 8);
    } else if (rom && ((pc === HOME) || (pc === ID_ROUTINE))) {
      this.rts();
    } else if (pc === DOS_HOOK) {
      this.apple.write(CSW, DOS_OUTPUT & 0xFF);
      this.apple.write(CSW + 1, DOS_OUTPUT >> 8);
      this.rts();
    } else if (pc === DOS_OUTPUT) {
      this.dosOutput(this.cpu.a);
    } else if (pc === RWTS_ENTRY) {
      this.rwts(this.cpu.a | (this.cpu.y << 8));
      this.cpu.p = this.cpu.p & ~CARRY;
      this.rts();
    } else {
      trapped = false;
    }

    return trapped;
  }


  // --- DOS ----------------------------------------------------------------------------------

  private dosOutput(value: number): void {
    const character: number = value & 0x7F;
    let brun: number | null = null;

    if (this.line != null) {
      if (character === RETURN) {
        brun = this.dosCommand(this.line);
        this.line = null;
      } else {
        this.line = this.line + String.fromCharCode(character);
      }
    } else if (this.atLineStart && (character === CTRL_D)) {
      this.line = '';
    }
    this.atLineStart = character === RETURN;

    if (brun == null) {
      this.rts();
    } else {
      // DOS's BRUN leaves one return address of its own above the caller's; its value is never used.
      this.cpu.push(DOS_OUTPUT >> 8);
      this.cpu.push(DOS_OUTPUT & 0xFF);
      this.cpu.pc = brun;
    }
  }


  private dosCommand(line: string): number | null {
    const verb: string | undefined = [ 'BLOAD', 'BSAVE', 'BRUN' ].find((candidate: string): boolean => line.startsWith(candidate));
    let brun: number | null = null;

    this.dosLog.push(line);
    if (verb != null) {
      const [ name, ...options ]: string[] = line.slice(verb.length).split(',').map((part: string): string => part.trim());
      const params: Map<string, number> = new Map<string, number>(options.map((option: string): [ string, number ] => {
        const value: string = option.slice(1).trim();

        return [ option[0], value.startsWith('$') ? parseInt(value.slice(1), 16) : parseInt(value, 10) ];
      }));
      const drive: number = params.get('D') ?? this.lastDrive;

      this.lastDrive = drive;
      this.apple.write(IOB + 1, SLOT_6);
      this.apple.write(IOB + 2, drive);
      if (name === 'DISK') {
        const requested: UltimaDiskName | undefined = DISK_NAMES.find((disk: UltimaDiskName): boolean => DISK_IDS[disk] === this.apple.read(REQDISK));

        if (requested != null) {
          this.drives.set(drive, requested);
        }
      }

      if (verb === 'BSAVE') {
        this.bsave(this.driveDisk(drive), name, params);
      } else {
        const address: number = this.load(this.driveDisk(drive), name, params.get('A') ?? null);

        brun = (verb === 'BRUN') ? address : null;
      }
    }

    return brun;
  }


  private driveDisk(drive: number): UltimaDiskName {
    const disk: UltimaDiskName | undefined = this.drives.get(drive);

    if (disk == null) {
      throw new LiftedMachineError(`no disk in drive ${ drive }`);
    } else {
      return disk;
    }
  }


  private bsave(disk: UltimaDiskName, name: string, params: ReadonlyMap<string, number>): void {
    const address: number | undefined = params.get('A');
    const length: number | undefined = params.get('L');

    if ((address == null) || (length == null)) {
      throw new LiftedMachineError(`BSAVE ${ name } without A and L`);
    } else {
      const data: Uint8Array = Uint8Array.from({ length }, (_: unknown, index: number): number => this.read(address + index));

      this.disks[disk].writeBinary(name, address, data, RAW_TRACKS[disk]);
    }
  }


  /**
   * BLOAD: a program's image from its lifted module, or the file. A native program is installed over
   * whatever image there is and owns only its entries. Returns where it went.
   */
  private load(disk: UltimaDiskName, name: string, at: number | null): number {
    const index: number = this.modules.findIndex((module: ILiftedModule): boolean => (module.disk === disk) && (module.name === name));
    const nativeIndex: number = this.natives.findIndex((native: INativeModule): boolean => (native.disk === disk) && (native.name === name));
    let address: number;

    if ((index >= 0) || (nativeIndex >= 0)) {
      const load: number = (nativeIndex >= 0) ? this.natives[nativeIndex].load : this.modules[index].load;

      address = at ?? load;
      if (address !== load) {
        throw new LiftedMachineError(`${ disk } ${ name } is ported for ${ hex(load) }, not ${ hex(address) }`);
      } else if (nativeIndex >= 0) {
        if (index >= 0) {
          this.copyIn(address, this.images[index]);
        }
        this.natives[nativeIndex].install(this);
        this.claimNative(nativeIndex);
      } else {
        this.copyIn(address, this.images[index]);
        this.claim(index);
      }
    } else {
      const file: IBinaryFile = this.disks[disk].readBinary(name);

      address = at ?? file.address;
      this.copyIn(address, file.data);
    }

    return address;
  }


  /** Writes loaded bytes, which take every byte they land on from whatever code was there. */
  private copyIn(address: number, data: Uint8Array): void {
    for (let index: number = 0; index < data.length; index++) {
      const slot: number = this.writeSlot(address + index);

      if (slot >= 0) {
        this.owners[slot] = -1;
        this.rewritable[slot] = 0;
      }
      this.write(address + index, data[index]);
    }
  }


  private claim(index: number): void {
    for (const [ start, end ] of this.modules[index].code) {
      for (let address: number = start; address < end; address++) {
        const slot: number = this.writeSlot(address);

        if (slot >= 0) {
          this.owners[slot] = index;
        }
      }
    }
    for (const address of this.modules[index].opcodeStores) {
      const slot: number = this.writeSlot(address);

      if (slot >= 0) {
        this.rewritable[slot] = 1;
      }
    }
  }


  private claimNative(index: number): void {
    const native: INativeModule = this.natives[index];

    for (const address of native.entries.keys()) {
      const slot: number = this.writeSlot(address);

      if (slot >= 0) {
        this.owners[slot] = -2 - index;
      }
    }
    for (const address of native.opcodeStores ?? []) {
      const slot: number = this.writeSlot(address);

      if (slot >= 0) {
        this.rewritable[slot] = 1;
      }
    }
  }


  private rwts(iob: number): void {
    const disk: Dos33Disk = this.disks[this.driveDisk(this.apple.read(iob + 2))];
    const track: number = this.apple.read(iob + 4);
    const sector: number = this.apple.read(iob + 5);
    const buffer: number = this.apple.read(iob + 8) | (this.apple.read(iob + 9) << 8);
    const command: number = this.apple.read(iob + 0x0C);

    if (command === 1) {
      this.copyIn(buffer, disk.image.readSector(track, sector));
    } else if (command === 2) {
      disk.image.writeSector(track, sector, Uint8Array.from({ length: 256 }, (_: unknown, index: number): number => this.read(buffer + index)));
    }
  }
}
