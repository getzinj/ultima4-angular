"""Runs the remaster's own program code in the oracle with blank data, no game disks needed:

    make -C <fixed checkout> src/patchedgame/program/{INIT,SEL,SUBS,BOOT,NEWGAME,ULT4}.prg \\
        src/trainer/TRAINERS.prg src/trainer/MENU.prg
    python3 smoke.py <fixed checkout>

Every data file is filler (blank images, slides that unpack to nothing, empty saves), so this only
shows the machine carries the real code from boot, through the menu and character creation, into
Britannia: the point where the game's own data starts to matter.
"""

import pathlib
import sys
import time

from dos33 import format_disk
from labels import read_labels
from machine import Machine
from scenarios import ESC, GAME_MODE, MODE_WORLD, Session

BOOT_COMMANDS = ['BRUN INIT', 'NOMON I,O,C', 'MAXFILES 1', 'BLOAD SEL,A$320', 'BLOAD SUBS', 'BLOAD SHP0', 'BLOAD SHP1',
                 'BLOAD TBLS,A$E000', 'BLOAD HTXT,A$E400', 'BRUN BOOT,A$6000']
TOWNE_ARENAS = ('CONA', 'CONB', 'CONC', 'COND', 'CONF', 'CONG', 'CONH', 'CONO', 'CONR', 'CONS')
BRITANNIA_FILES = ['CAMP', 'CONB', 'CONC', 'COND', 'CONE', 'CONF', 'CONG', 'CONH', 'CONI', 'CONO', 'CONP', 'CONR', 'CONS',
                   'CONT', 'HELP', 'HOLE', 'LORD', 'MIX', 'MUSB', 'MUSO', 'SAVE', 'SEAR', 'SHRI', 'SHRN', 'TMAP', 'USE']


def prg(path):
    raw = path.read_bytes()
    return raw[0] | (raw[1] << 8), raw[2:]


def hires_tables():
    """TBLS: HGR row addresses, then each column's byte and bit (tables.i)."""
    rows = [0x2000 + ((row & 7) * 0x400) + (((row >> 3) & 7) * 0x80) + ((row >> 6) * 40) for row in range(192)]
    return 0xE000, bytes([row & 0xFF for row in rows] + [row >> 8 for row in rows] +
                         [x // 7 for x in range(287)] + [1 << (x % 7) for x in range(287)])


def blank_slide():
    stream, remaining = [0xFE, 0xFF], 40 * 144
    while remaining:
        count = min(255, remaining)
        stream += [0xFE, count, 0]
        remaining -= count
    return 0x4000, bytes(stream)


def disks(fixed):
    program = fixed / 'src' / 'patchedgame' / 'program'
    files = {name: prg(program / f'{name}.prg') for name in ('INIT', 'SEL', 'SUBS', 'BOOT', 'NEWGAME', 'ULT4')}
    files.update({name: prg(fixed / 'src' / 'trainer' / f'{name}.prg') for name in ('TRAINERS', 'MENU')})
    files.update({'DISK': (0xD0, b'\x01'), 'TBLS': hires_tables(), 'HTXT': (0xE400, bytes(1024)),
                  'SHP0': (0xD000, bytes(4096)), 'SHP1': (0xD000, bytes(4096)),
                  'ANIM': (0x4000, bytes(0x2000)), 'BGND': (0x7A00, bytes(0x0600)), 'CRDS': (0x4000, bytes(8960)),
                  'NPRT': (0x0000, bytes(32)), 'NRST': (0xEC00, bytes(512)), 'NLST': (0xEE00, bytes(256))})
    files.update({f'{name}.SPK': blank_slide() for name in ('FAIR', 'GYPS', 'LOOK', 'PRTL', 'TABL', 'TREE', 'WAGN')})
    britannia = {'DISK': (0xD0, b'\x02'), 'PRTY': (0, bytes(32)), 'ROST': (0xEC00, bytes(512)),
                 'LIST': (0xEE00, bytes(256)), 'TLST': (0xEE00, bytes(256))}
    britannia.update({name: (0x8800, bytes(16)) for name in BRITANNIA_FILES})
    return {'program': format_disk(files), 'britannia': format_disk(britannia),
            'towne': format_disk({'DISK': (0xD0, b'\x03'), 'MAP@': (0x8B00, bytes(0x500)),
                                  **{name: (0x8800, bytes(16)) for name in TOWNE_ARENAS}}),
            'underworld': format_disk({'DISK': (0xD0, b'\x04')})}


def main(fixed):
    fixed = pathlib.Path(fixed)
    labels = {name: read_labels(fixed / 'src' / 'patchedgame' / 'program' / f'{name}.lab') for name in ('BOOT', 'NEWGAME', 'ULT4', 'SUBS')}
    machine = Machine(disks(fixed), rng_address=labels['SUBS']['rnd0'], max_cycles_per_step=60_000_000)
    session = Session(machine, labels)
    started = time.time()
    machine.boot()
    session.run_until(session.dos_seen('BRUN BOOT'))
    assert machine.dos_log == BOOT_COMMANDS, machine.dos_log
    print(f'INIT ran DOS\'s boot sequence: {", ".join(machine.dos_log)}')
    session.press_until(['I'], session.entered('BOOT', 'input_text'), limit=3000)
    assert not machine.memory.text and machine.memory.hires and not machine.memory.mixed
    print(f'BOOT reached the name prompt in full-screen hi-res after {len(machine.snapshots)} keys')
    session.type('AVATAR\n')
    session.press('M')
    session.press_until(['A', ESC], session.dos_seen('BRUN ULT4'), limit=400)
    print(f'NEWGAME ran to BRUN ULT4 after {len(machine.snapshots)} keys')
    session.press_until([ESC], session.memory_is(GAME_MODE, MODE_WORLD), limit=20)
    print(f'ULT4 is in Britannia (game_mode {machine.memory.ram[GAME_MODE]}) after {machine.mpu.processorCycles:,} cycles, '
          f'{time.time() - started:.0f} s; last DOS command {machine.dos_log[-1]}')


if __name__ == '__main__':
    main(sys.argv[1])
