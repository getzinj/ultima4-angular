"""Checks of the oracle's machine on synthetic programs and disks; none needs the game.

    python3 -m unittest test_oracle
"""

import pathlib
import tempfile
import unittest

from dos33 import format_disk
from labels import read_labels
from machine import Machine
from scenarios import ScenarioError, Session


def code_at(address, *parts):
    """A program as (address, bytes); parts are bytes or lists of bytes."""
    data = bytearray()
    for part in parts:
        data.extend(part if isinstance(part, (bytes, bytearray, list)) else [part])
    return address, bytes(data)


def cout_string(text):
    """LDA #c; JSR COUT for each character."""
    out = []
    for character in text:
        out += [0xA9, ord(character) | 0x80, 0x20, 0xED, 0xFD]
    return out


def spin(address):
    return [0x4C, address & 0xFF, address >> 8]


def program_disk(init, extra=None):
    files = {'INIT': init, 'DISK': (0xD0, b'\x01')}
    files.update(extra or {})
    return format_disk(files)


def machine_with(init, extra=None, others=None):
    disks = {'program': program_disk(init, extra)}
    for name, disk_id in (('britannia', 2), ('towne', 3), ('underworld', 4)):
        disks[name] = format_disk({'DISK': (0xD0, bytes([disk_id]))} | (others or {}).get(name, {}))
    machine = Machine(disks, max_cycles_per_step=2_000_000)
    machine.boot()
    return machine


def cout_program(text):
    body = cout_string(text)
    return code_at(0x4000, body, spin(0x4000 + len(body)))


class DosTest(unittest.TestCase):
    def run_to_spin(self, machine, address):
        machine.run_until(lambda: machine.mpu.pc == address)

    def test_bload_puts_a_file_at_its_own_address(self):
        text = '\x04BLOAD DATA\r'
        machine = machine_with(cout_program(text), {'DATA': (0x5000, b'\x11\x22\x33')})
        self.run_to_spin(machine, 0x4000 + (5 * len(text)))
        self.assertEqual(bytes(machine.memory.ram[0x5000:0x5003]), b'\x11\x22\x33')

    def test_bload_puts_a_file_at_the_address_given(self):
        text = '\x04BLOAD DATA,A$6000\r'
        machine = machine_with(cout_program(text), {'DATA': (0x5000, b'\x44')})
        self.run_to_spin(machine, 0x4000 + (5 * len(text)))
        self.assertEqual(machine.memory.ram[0x6000], 0x44)

    def test_ctrl_d_mid_line_is_not_a_command(self):
        text = 'X\x04BLOAD DATA\r'
        machine = machine_with(cout_program(text), {'DATA': (0x5000, b'\x55')})
        self.run_to_spin(machine, 0x4000 + (5 * len(text)))
        self.assertEqual(machine.memory.ram[0x5000], 0)

    def test_brun_jumps_to_the_file(self):
        text = '\x04BRUN NEXT\r'
        machine = machine_with(cout_program(text), {'NEXT': code_at(0x7000, spin(0x7000))})
        self.run_to_spin(machine, 0x7000)
        self.assertEqual(machine.mpu.pc, 0x7000)

    def test_brun_leaves_one_return_address_on_the_stack(self):
        text = '\x04BRUN NEXT\r'
        machine = machine_with(cout_program(text), {'NEXT': code_at(0x7000, spin(0x7000))})
        start = machine.mpu.sp
        self.run_to_spin(machine, 0x7000)
        self.assertEqual((start - machine.mpu.sp) & 0xFF, 4)

    def test_bload_disk_inserts_the_disk_asked_for(self):
        body = [0xA9, 0x03, 0x85, 0xDE] + cout_string('\x04BLOADDISK,D1\r')
        machine = machine_with(code_at(0x4000, body, spin(0x4000 + len(body))))
        self.run_to_spin(machine, 0x4000 + len(body))
        self.assertEqual(machine.drives[1], 'towne')

    def test_bload_disk_loads_its_id(self):
        body = [0xA9, 0x03, 0x85, 0xDE] + cout_string('\x04BLOADDISK,D1\r')
        machine = machine_with(code_at(0x4000, body, spin(0x4000 + len(body))))
        self.run_to_spin(machine, 0x4000 + len(body))
        self.assertEqual(machine.memory.ram[0xD0], 3)

    def test_bsave_writes_the_file_back(self):
        body = [0xA9, 0x77, 0x8D, 0x00, 0x03] + cout_string('\x04BSAVE DATA,A$300,L$1\r')
        machine = machine_with(code_at(0x4000, body, spin(0x4000 + len(body))), {'DATA': (0x0300, b'\x00')})
        self.run_to_spin(machine, 0x4000 + len(body))
        self.assertEqual(machine.disks['program'].bload('DATA'), (0x0300, b'\x77'))

    def test_dos_commands_are_logged(self):
        text = '\x04NOMON I,O,C\r'
        machine = machine_with(cout_program(text))
        self.run_to_spin(machine, 0x4000 + (5 * len(text)))
        self.assertEqual(machine.dos_log[-1], 'NOMON I,O,C')


class RwtsTest(unittest.TestCase):
    def test_a_read_copies_the_sector_into_the_buffer(self):
        body = [0xA9, 0x05, 0x8D, 0xEC, 0xB7,   # track 5
                0xA9, 0x03, 0x8D, 0xED, 0xB7,   # sector 3
                0xA9, 0x00, 0x8D, 0xF0, 0xB7,   # buffer $8B00
                0xA9, 0x8B, 0x8D, 0xF1, 0xB7,
                0xA9, 0x01, 0x8D, 0xF4, 0xB7,   # read
                0xA9, 0xE8, 0xA0, 0xB7, 0x20, 0xB5, 0xB7]
        machine = machine_with(code_at(0x4000, body, spin(0x4000 + len(body))))
        machine.disks['program'].write_sector(5, 3, b'\xAB' * 256)
        machine.memory.ram[0xB7EA] = 1
        machine.run_until(lambda: machine.mpu.pc == 0x4000 + len(body))
        self.assertEqual(machine.memory.ram[0x8B80], 0xAB)


class KeyboardTest(unittest.TestCase):
    # loop: LDA $C000; BPL loop; STA $0300; BIT $C010; JMP loop
    LOOP = [0xAD, 0x00, 0xC0, 0x10, 0xFB, 0x8D, 0x00, 0x03, 0x2C, 0x10, 0xC0, 0x4C, 0x00, 0x40]

    def test_a_key_reaches_the_program(self):
        machine = machine_with(code_at(0x4000, self.LOOP))
        machine.press(ord('A'))
        machine.run_until(lambda: machine.memory.ram[0x0300] != 0)
        self.assertEqual(machine.memory.ram[0x0300], 0xC1)

    def test_a_key_waits_for_its_polls(self):
        machine = machine_with(code_at(0x4000, self.LOOP))
        machine.press(ord('A'), polls=7)
        self.assertEqual(machine.snapshots[0]['polls'], 7)

    def test_each_key_is_snapshotted(self):
        machine = machine_with(code_at(0x4000, self.LOOP))
        for key in 'AB':
            machine.press(ord(key))
        self.assertEqual([snapshot['key'] for snapshot in machine.snapshots], [0x41, 0x42])

    def test_idle_counts_polls(self):
        machine = machine_with(code_at(0x4000, self.LOOP))
        machine.idle(30)
        self.assertEqual(machine.polls, 30)

    def test_a_stuck_program_is_reported(self):
        machine = machine_with(code_at(0x4000, spin(0x4000)))
        with self.assertRaises(Exception):
            machine.press(ord('A'))


class SnapshotTest(unittest.TestCase):
    def test_the_stack_page_is_not_compared(self):
        machine = machine_with(code_at(0x4000, spin(0x4000)))
        before = machine.snapshot(None, 0)['digests']
        machine.memory.ram[0x01F0] = 0x99
        self.assertEqual(machine.snapshot(None, 0)['digests'], before)

    def test_the_hires_page_is_compared(self):
        machine = machine_with(code_at(0x4000, spin(0x4000)))
        before = machine.snapshot(None, 0)['digests']['hgr1']
        machine.memory.ram[0x2000] = 0x7F
        self.assertNotEqual(machine.snapshot(None, 0)['digests']['hgr1'], before)

    def test_language_card_ram_is_compared(self):
        machine = machine_with(code_at(0x4000, spin(0x4000)))
        before = machine.snapshot(None, 0)['digests']['lc_high']
        machine.memory[0xEC00] = 1
        self.assertNotEqual(machine.snapshot(None, 0)['digests']['lc_high'], before)


class LanguageCardTest(unittest.TestCase):
    def test_reads_rom_after_reset(self):
        machine = machine_with(code_at(0x4000, spin(0x4000)))
        self.assertEqual(machine.memory[0xFBB3], 0x06)

    def test_reads_bank_2_after_c083(self):
        machine = machine_with(code_at(0x4000, spin(0x4000)))
        machine.memory[0xD000] = 0x5A
        machine.memory[0xC083]
        self.assertEqual(machine.memory[0xD000], 0x5A)


class SessionTest(unittest.TestCase):
    def test_a_missing_label_is_named(self):
        session = Session(machine_with(code_at(0x4000, spin(0x4000))), {'BOOT': {}})
        with self.assertRaises(ScenarioError):
            session.entered('BOOT', 'input_text')

    def test_press_until_stops_when_the_condition_holds(self):
        machine = machine_with(code_at(0x4000, KeyboardTest.LOOP))
        session = Session(machine, {})
        session.press_until(['X'], session.memory_is(0x0300, 0xD8), limit=5)
        self.assertEqual(len(machine.snapshots), 1)


class LabelsTest(unittest.TestCase):
    def test_reads_global_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / 'SUBS.lab'
            path.write_text('al 000800 .j_waitkey\nal 0007F0 .@local\n')
            self.assertEqual(read_labels(path), {'j_waitkey': 0x0800})


if __name__ == '__main__':
    unittest.main()
