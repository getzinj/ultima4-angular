"""An Apple IIe running Ultima IV in py65's 65C02, with DOS and the ROM stood in for.

No DOS and no ROM are loaded. Instead the few places the game reaches them are trapped:

- COUT ($FDED) jumps through CSW ($36), as the Monitor does.
- DOS's hook-up entry ($03EA) points CSW at DOS's output handler ($9EBD), keeping the old CSW
  as the real output, as DOS does.
- DOS's output handler collects a line that starts with Ctrl-D ($84) after a carriage return
  and runs it: BLOAD, BSAVE and BRUN against the disk images; anything else is ignored.
- RWTS's entry from DOS ($B7B5) serves the sector the IOB at A/Y asks for.
- HOME ($FC58) returns: the text page is not compared.

A disk is in each drive. When the game checks a disk (BLOAD DISK), the disk it asked for in
reqdisk ($DE) is put in that drive first, as a player who follows the prompts would.

A keyboard poll is a read of $C000 with no key latched. Scripted keys arrive after a given number
of such polls; in play the idle loop polls once per tick, so polls stand for ticks.
"""

import hashlib

from py65.devices.mpu65c02 import MPU

from dos33 import Disk

KEYBOARD, STROBE, SPEAKER = 0xC000, 0xC010, 0xC030
COUT, HOME, DOS_HOOK, DOS_OUTPUT, RWTS_ENTRY = 0xFDED, 0xFC58, 0x03EA, 0x9EBD, 0xB7B5
CSW = 0x36
REQDISK = 0xDE
IOB = 0xB7E8
SLOT_6 = 0x60
DISK_IDS = {1: 'program', 2: 'britannia', 3: 'towne', 4: 'underworld'}
RAW_TRACKS = {'program': 3, 'britannia': 16, 'towne': 16, 'underworld': 11}
ROM_BYTES = {0xFBB3: 0x06, 0xFBC0: 0xE0, 0xFE1F: 0x60}

# Snapshot regions, as (name, bank, start, end). The stack page, the text page and DOS's memory
# are left out: they hold what DOS and the Monitor would have left there, which nothing here
# reproduces and the game does not depend on.
REGIONS = [
    ('zero_page', 'main', 0x0000, 0x0100),
    ('low', 'main', 0x0200, 0x0400),
    ('main', 'main', 0x0800, 0x9AA6),
    ('lc_bank1', 'bank1', 0xD000, 0xE000),
    ('lc_bank2', 'bank2', 0xD000, 0xE000),
    ('lc_high', 'high', 0xE000, 0x10000),
]
VIEWS = [
    ('hgr1', 'main', 0x2000, 0x4000),
    ('party', 'main', 0x0000, 0x0020),
    ('roster', 'high', 0xEC00, 0xEE00),
    ('objects', 'high', 0xEE00, 0xEF00),
]


class OracleError(Exception):
    pass


class Memory:
    """The 64 KB bus: main RAM, the language card over the ROM stub, and the soft switches."""

    def __init__(self, machine):
        self.machine = machine
        self.ram = bytearray(0x10000)
        self.bank1 = bytearray(0x1000)
        self.bank2 = bytearray(0x1000)
        self.high = bytearray(0x2000)
        self.lc_read, self.lc_write, self.lc_bank1, self.lc_prewrite = False, True, False, False
        self.text, self.mixed, self.page2, self.hires = True, False, False, False

    def _lc(self, address):
        if address >= 0xE000:
            return self.high, address - 0xE000
        return (self.bank1 if self.lc_bank1 else self.bank2), address - 0xD000

    def _switch(self, address, is_write):
        low = address & 3
        self.lc_bank1 = (address & 8) != 0
        self.lc_read = low in (0, 3)
        if (address & 1) == 0:
            self.lc_write, self.lc_prewrite = False, False
        elif is_write:
            self.lc_prewrite = False
        else:
            if self.lc_prewrite:
                self.lc_write = True
            self.lc_prewrite = True

    def _io(self, address, is_write):
        if address == KEYBOARD and not is_write:
            return self.machine.poll_keyboard()
        if address == STROBE:
            self.machine.key &= 0x7F
            return self.machine.key
        if 0xC050 <= address <= 0xC057:
            on = (address & 1) == 1
            setattr(self, ('text', 'mixed', 'page2', 'hires')[(address & 7) >> 1], on)
        elif 0xC080 <= address <= 0xC08F:
            self._switch(address, is_write)
        return 0

    def __getitem__(self, address):
        if address < 0xC000:
            return self.ram[address]
        if address < 0xD000:
            return self._io(address, False)
        if self.lc_read:
            ram, at = self._lc(address)
            return ram[at]
        return ROM_BYTES.get(address, 0)

    def __setitem__(self, address, value):
        if address < 0xC000:
            self.ram[address] = value & 0xFF
        elif address < 0xD000:
            self._io(address, True)
        elif self.lc_write:
            ram, at = self._lc(address)
            ram[at] = value & 0xFF

    def __len__(self):
        return 0x10000

    def bank_bytes(self, bank, start, end):
        if bank == 'main':
            return bytes(self.ram[start:end])
        if bank == 'high':
            return bytes(self.high[start - 0xE000:end - 0xE000])
        return bytes((self.bank1 if bank == 'bank1' else self.bank2)[start - 0xD000:end - 0xD000])


class Machine:
    def __init__(self, disks, rng_address=None, max_cycles_per_step=200_000_000):
        """disks: {'program': Disk, ...} built from the remaster's `fixed` branch."""
        self.disks = {name: Disk(bytes(disk.image), name) for name, disk in disks.items()}
        self.drives = {1: 'program', 2: 'britannia'}
        self.last_drive = 1
        self.memory = Memory(self)
        self.mpu = MPU(memory=self.memory)
        self.rng_address = rng_address
        self.max_cycles_per_step = max_cycles_per_step
        self.key = 0
        self.polls = 0
        self.pending = None
        self.real_output = 0xFDF0
        self.line = None
        self.at_line_start = True
        self.dos_log = []
        self.loaded = []
        self.snapshots = []
        self.memory.ram[CSW], self.memory.ram[CSW + 1] = DOS_OUTPUT & 0xFF, DOS_OUTPUT >> 8
        self.mpu.sp = 0xF8

    # --- keyboard -------------------------------------------------------------------------

    def poll_keyboard(self):
        if self.key & 0x80:
            return self.key
        if self.pending is not None and self.polls >= self.pending[1]:
            self.snapshots.append(self.snapshot(self.pending[0], self.polls))
            self.key = self.pending[0] | 0x80
            self.pending = None
            self.polls = 0
            return self.key
        self.polls += 1
        return self.key

    def press(self, code, polls=0):
        """Runs until the game has polled `polls` times with nothing waiting, then latches `code`,
        and runs on until the game has read it."""
        self.pending = (code & 0x7F, polls)
        self.polls = 0
        self.run_until(lambda: self.pending is None and not (self.key & 0x80))

    def idle(self, polls):
        """Runs until the game has polled `polls` times with nothing waiting."""
        self.polls = 0
        self.run_until(lambda: self.polls >= polls)

    # --- running ----------------------------------------------------------------------------

    def run_until(self, done):
        start = self.mpu.processorCycles
        while not done():
            if self.mpu.processorCycles - start > self.max_cycles_per_step:
                raise OracleError(f'no progress after {self.max_cycles_per_step} cycles; PC=${self.mpu.pc:04X}')
            if not self._trap(self.mpu.pc):
                self.mpu.step()

    def _rts(self):
        low = self._pull()
        high = self._pull()
        self.mpu.pc = ((high << 8) | low) + 1

    def _pull(self):
        self.mpu.sp = (self.mpu.sp + 1) & 0xFF
        return self.memory.ram[0x100 + self.mpu.sp]

    def _push(self, value):
        self.memory.ram[0x100 + self.mpu.sp] = value & 0xFF
        self.mpu.sp = (self.mpu.sp - 1) & 0xFF

    def _trap(self, pc):
        rom = pc >= 0xD000 and not self.memory.lc_read
        if rom and pc == COUT:
            self.mpu.pc = self.memory.ram[CSW] | (self.memory.ram[CSW + 1] << 8)
        elif rom and pc == HOME:
            self._rts()
        elif pc == DOS_HOOK:
            self.real_output = self.memory.ram[CSW] | (self.memory.ram[CSW + 1] << 8)
            self.memory.ram[CSW], self.memory.ram[CSW + 1] = DOS_OUTPUT & 0xFF, DOS_OUTPUT >> 8
            self._rts()
        elif pc == DOS_OUTPUT:
            self._dos_output(self.mpu.a)
        elif pc == RWTS_ENTRY:
            self._rwts(self.mpu.a | (self.mpu.y << 8))
            self.mpu.p &= ~MPU.CARRY
            self._rts()
        else:
            return False
        return True

    # --- DOS ------------------------------------------------------------------------------

    def _dos_output(self, character):
        character &= 0x7F
        brun = None
        if self.line is not None:
            if character == 0x0D:
                brun = self._dos_command(self.line)
                self.line = None
            else:
                self.line += chr(character)
        elif self.at_line_start and character == 0x04:
            self.line = ''
        self.at_line_start = character == 0x0D
        if brun is None:
            self._rts()
        else:
            # DOS's BRUN leaves one return address of its own above the caller's; HELP, LORD and
            # END pop both ("2 frames left from entering by BRUN"). Its value is never used.
            self._push(DOS_OUTPUT >> 8)
            self._push(DOS_OUTPUT & 0xFF)
            self.mpu.pc = brun

    def _dos_command(self, line):
        self.dos_log.append(line)
        verb = next((v for v in ('BLOAD', 'BSAVE', 'BRUN') if line.startswith(v)), None)
        if verb is None:
            return None
        name, *options = [part.strip() for part in line[len(verb):].split(',')]
        params = {}
        for option in options:
            value = option[1:].strip()
            params[option[0]] = int(value[1:], 16) if value.startswith('$') else int(value)
        drive = params.get('D', self.last_drive)
        self.last_drive = drive
        self.memory.ram[IOB + 1], self.memory.ram[IOB + 2] = SLOT_6, drive
        if name == 'DISK' and self.memory.ram[REQDISK] in DISK_IDS:
            self.drives[drive] = DISK_IDS[self.memory.ram[REQDISK]]
        disk = self.disks[self.drives[drive]]
        if verb == 'BSAVE':
            address, length = params['A'], params['L']
            disk.bsave(name, address, bytes(self.memory[address + i] for i in range(length)), RAW_TRACKS[disk.name])
            return None
        file_address, data = disk.bload(name)
        address = params.get('A', file_address)
        for index, value in enumerate(data):
            self.memory[address + index] = value
        self._mark_loaded(address, len(data), name)
        return address if verb == 'BRUN' else None

    def _rwts(self, iob):
        drive = self.memory.ram[iob + 2]
        track, sector = self.memory.ram[iob + 4], self.memory.ram[iob + 5]
        buffer = self.memory.ram[iob + 8] | (self.memory.ram[iob + 9] << 8)
        command = self.memory.ram[iob + 0x0C]
        disk = self.disks[self.drives[drive]]
        if command == 1:
            for index, value in enumerate(disk.sector(track, sector)):
                self.memory[buffer + index] = value
        elif command == 2:
            disk.write_sector(track, sector, bytes(self.memory[buffer + i] for i in range(256)))

    # --- booting and snapshots --------------------------------------------------------------

    def boot(self):
        """Where DOS's boot leaves off: BRUN the greeting program, INIT."""
        address, data = self.disks['program'].bload('INIT')
        for index, value in enumerate(data):
            self.memory[address + index] = value
        self._mark_loaded(address, len(data), 'INIT')
        self.dos_log.append('BRUN INIT')
        self.mpu.pc = address

    def _mark_loaded(self, address, length, name):
        end = address + length
        self.loaded = [entry for entry in self.loaded if entry[1] <= address or entry[0] >= end] + [(address, end, name)]

    def owner(self, address):
        return next((name for start, end, name in self.loaded if start <= address < end), None)

    def regions(self):
        result = {name: self.memory.bank_bytes(bank, start, end) for name, bank, start, end in REGIONS + VIEWS}
        if self.rng_address is not None:
            result['rng'] = self.memory.bank_bytes('main', self.rng_address, self.rng_address + 16)
        m = self.memory
        result['switches'] = bytes([m.text, m.mixed, m.page2, m.hires, m.lc_read, m.lc_write, m.lc_bank1])
        return result

    def snapshot(self, key, polls):
        regions = self.regions()
        return {
            'key': key,
            'polls': polls,
            'cycles': self.mpu.processorCycles,
            'pc': self.mpu.pc,
            'dos': list(self.dos_log),
            'digests': {name: hashlib.sha256(data).hexdigest() for name, data in regions.items()},
            'regions': regions,
        }
