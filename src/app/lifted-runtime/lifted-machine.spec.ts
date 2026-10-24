import { Dos33Disk, formatDos33 } from '../data/dos33';
import { DISK_IDS, DISK_NAMES } from '../data/ultima-disks';
import type { UltimaDiskName } from '../data/ultima-disks';
import { CARRY } from './cpu';
import type { Cpu } from './cpu';
import { COUT, DOS_OUTPUT, HOME, LiftedMachine, LiftedMachineError, RWTS_ENTRY } from './lifted-machine';
import type { DiskSet } from './lifted-machine';
import type { ILiftedModule } from './lifted-module';

const LOOP: number = 0x4000;
const SEEN: number = 0x10;

// INIT, as a hand-lifted loop: poll the keyboard until a key comes, store it at $10, clear the strobe, repeat.
function runInit(c: Cpu, start: number): void {
  let pc: number = start;

  for (;;) {
    switch (pc) {
      case 0x4000: if (c.tracing && c.stopAt(0x4000)) { return; } c.a = c.nz(c.read(0xC000)); pc = 0x4003; continue;
      case 0x4003: if (c.tracing && c.stopAt(0x4003)) { return; } if ((c.p & 0x80) === 0) { pc = 0x4000; continue; } pc = 0x4005; continue;
      case 0x4005: if (c.tracing && c.stopAt(0x4005)) { return; } c.write(SEEN, c.a); pc = 0x4007; continue;
      case 0x4007: if (c.tracing && c.stopAt(0x4007)) { return; } c.read(0xC010); pc = 0x400A; continue;
      case 0x400A: if (c.tracing && c.stopAt(0x400A)) { return; } c.cycles += 3; pc = 0x4000; continue;
      default: c.pc = pc; return;
    }
  }
}


const INIT: ILiftedModule = {
  disk: 'program',
  name: 'INIT',
  load: 0x4000,
  image: btoa(String.fromCharCode(0xAD, 0x00, 0xC0, 0x10, 0xFB, 0x85, 0x10, 0xAD, 0x10, 0xC0, 0x4C, 0x00, 0x40)),
  code: [ [ 0x4000, 0x400D ] ],
  opcodeStores: [ 0x400A ],
  patchPoints: [],
  labels: { loop: 0x4000 },
  run: runInit,
};


function disks(): DiskSet {
  const set: Record<string, Dos33Disk> = {};

  for (const name of DISK_NAMES) {
    set[name] = new Dos33Disk(formatDos33());
    set[name].writeBinary('DISK', 0xD0, Uint8Array.of(DISK_IDS[name]));
  }
  set['program'].writeBinary('DATA', 0x2000, Uint8Array.of(1, 2, 3));
  set['towne'].writeBinary('TOWN', 0x2000, Uint8Array.of(9));

  return set as Record<UltimaDiskName, Dos33Disk>;
}


function booted(): LiftedMachine {
  const machine: LiftedMachine = new LiftedMachine(disks(), [ INIT ]);

  machine.boot();

  return machine;
}


/** Calls a trapped routine the way the game does, with JSR from the loop, and runs until it returns. */
function call(machine: LiftedMachine, routine: number, a: number = 0): void {
  machine.cpu.pushWord(LOOP - 1);
  machine.cpu.a = a;
  machine.cpu.pc = routine;
  machine.runUntil((): boolean => machine.cpu.pc === LOOP);
}


function print(machine: LiftedMachine, text: string): void {
  for (const character of `\r\u0004${ text }\r`) {
    call(machine, DOS_OUTPUT, character.charCodeAt(0) | 0x80);
  }
}


describe('LiftedMachine', (): void => {
  describe('boot', (): void => {
    it('logs BRUN INIT', (): void => {
      expect(booted().dosLog).toEqual([ 'BRUN INIT' ]);
    });

    it('starts at INIT\'s load address', (): void => {
      expect(booted().cpu.pc).toBe(0x4000);
    });

    it('puts DOS\'s output handler in CSW', (): void => {
      const machine: LiftedMachine = booted();

      expect(machine.apple.read(0x36) | (machine.apple.read(0x37) << 8)).toBe(DOS_OUTPUT);
    });
  });

  describe('the keyboard', (): void => {
    it('counts each poll with nothing waiting', (): void => {
      const machine: LiftedMachine = booted();

      machine.idle(5);

      expect(machine.polls).toBe(5);
    });

    it('delivers a pressed key to the game', (): void => {
      const machine: LiftedMachine = booted();

      machine.press(0x41);
      machine.runUntil((): boolean => machine.cpu.pc === 0x400A);

      expect(machine.apple.read(SEEN)).toBe(0xC1);
    });

    it('snapshots just before the game reads the key', (): void => {
      const machine: LiftedMachine = booted();

      machine.press(0x41, 3);

      expect(machine.snapshots.map((snapshot: { key: number | null; polls: number }): [ number | null, number ] => [ snapshot.key, snapshot.polls ])).toEqual([ [ 0x41, 3 ] ]);
    });
  });

  describe('DOS', (): void => {
    it('logs a line that starts with Ctrl-D', (): void => {
      const machine: LiftedMachine = booted();

      print(machine, 'NOMON I,O,C');

      expect(machine.dosLog).toEqual([ 'BRUN INIT', 'NOMON I,O,C' ]);
    });

    it('ignores a line that does not', (): void => {
      const machine: LiftedMachine = booted();

      for (const character of '\rHELLO\r') {
        call(machine, DOS_OUTPUT, character.charCodeAt(0) | 0x80);
      }

      expect(machine.dosLog).toEqual([ 'BRUN INIT' ]);
    });

    it('BLOADs a file at its own address', (): void => {
      const machine: LiftedMachine = booted();

      print(machine, 'BLOAD DATA');

      expect([ 0, 1, 2 ].map((index: number): number => machine.apple.read(0x2000 + index))).toEqual([ 1, 2, 3 ]);
    });

    it('BLOADs a file where A says', (): void => {
      const machine: LiftedMachine = booted();

      print(machine, 'BLOAD DATA,A$3000');

      expect(machine.apple.read(0x3002)).toBe(3);
    });

    it('BSAVEs memory to the disk', (): void => {
      const machine: LiftedMachine = booted();

      machine.apple.write(0x2100, 0x77);
      print(machine, 'BSAVE SAVE,A$2100,L$1');
      print(machine, 'BLOAD SAVE,A$2200');

      expect(machine.apple.read(0x2200)).toBe(0x77);
    });

    it('puts the disk reqdisk asks for in the drive when the game checks DISK', (): void => {
      const machine: LiftedMachine = booted();

      machine.apple.write(0xDE, 3);
      print(machine, 'BLOAD DISK,D2');
      print(machine, 'BLOAD TOWN,D2');

      expect(machine.apple.read(0x2000)).toBe(9);
    });

    it('BRUNs a lifted program at its load address', (): void => {
      const machine: LiftedMachine = booted();

      machine.cpu.pushWord(LOOP - 1);
      machine.cpu.pc = DOS_OUTPUT;
      for (const character of '\r\u0004BRUN INIT') {
        call(machine, DOS_OUTPUT, character.charCodeAt(0) | 0x80);
      }
      machine.cpu.a = 0x8D;
      machine.cpu.pc = DOS_OUTPUT;
      machine.runUntil((): boolean => machine.cpu.pc !== DOS_OUTPUT);

      expect(machine.cpu.pc).toBe(0x4000);
    });

    it('refuses to load a lifted program anywhere but its own address', (): void => {
      const machine: LiftedMachine = booted();

      expect((): void => print(machine, 'BLOAD INIT,A$5000')).toThrow(LiftedMachineError);
    });
  });

  describe('the ROM', (): void => {
    it('HOME returns to its caller', (): void => {
      const machine: LiftedMachine = booted();

      call(machine, HOME);

      expect(machine.cpu.pc).toBe(LOOP);
    });

    it('COUT jumps through CSW', (): void => {
      const machine: LiftedMachine = booted();

      for (const character of '\r\u0004NOMON C\r') {
        call(machine, COUT, character.charCodeAt(0) | 0x80);
      }

      expect(machine.dosLog).toEqual([ 'BRUN INIT', 'NOMON C' ]);
    });
  });

  describe('RWTS', (): void => {
    function read(machine: LiftedMachine): void {
      const iob: number = 0xB7E8;

      machine.apple.write(iob + 2, 1);
      machine.apple.write(iob + 4, 17);
      machine.apple.write(iob + 5, 0);
      machine.apple.write(iob + 8, 0x00);
      machine.apple.write(iob + 9, 0x30);
      machine.apple.write(iob + 0x0C, 1);
      machine.cpu.y = iob >> 8;
      machine.cpu.p = machine.cpu.p | CARRY;
      call(machine, RWTS_ENTRY, iob & 0xFF);
    }

    it('reads the sector the IOB asks for', (): void => {
      const machine: LiftedMachine = booted();

      read(machine);

      expect(machine.apple.read(0x3001)).toBe(17);
    });

    it('clears carry for success', (): void => {
      const machine: LiftedMachine = booted();

      read(machine);

      expect(machine.cpu.p & CARRY).toBe(0);
    });
  });

  describe('code ownership', (): void => {
    it('finds the lifted module at an instruction', (): void => {
      expect(booted().moduleAt(0x4005)?.name).toBe('INIT');
    });

    it('refuses to run an instruction the game wrote over', (): void => {
      const machine: LiftedMachine = booted();

      machine.write(0x4005, 0xEA);
      machine.cpu.pc = 0x4005;

      expect((): void => machine.runUntil((): boolean => false)).toThrow('no lifted code at $4005');
    });

    it('keeps an opcode store owned when the game rewrites it', (): void => {
      const machine: LiftedMachine = booted();

      machine.write(0x400A, 0x60);

      expect(machine.moduleAt(0x400A)?.name).toBe('INIT');
    });
  });

  describe('snapshots', (): void => {
    it('record the display switches', (): void => {
      const machine: LiftedMachine = booted();

      machine.read(0xC050);
      machine.read(0xC057);

      expect(Array.from(machine.regions()['switches'])).toEqual([ 0, 0, 0, 1, 0, 1, 0 ]);
    });
  });
});
