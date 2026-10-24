"""Writes py65's ADC, SBC and CMP results over a spread of operands, for the lifted CPU's spec:

    python3 export_cpu_vectors.py ../../src/app/lifted-runtime/cpu-vectors.json
"""

import json
import pathlib
import sys

from py65.devices.mpu65c02 import MPU

VALUES = [0x00, 0x01, 0x09, 0x0A, 0x0F, 0x10, 0x19, 0x45, 0x50, 0x7F, 0x80, 0x81, 0x99, 0x9A, 0xF0, 0xFF]
OPCODES = {'adc': 0x69, 'sbc': 0xE9, 'cmp': 0xC9}


def run(opcode, a, data, p):
    mpu = MPU()
    mpu.memory[0], mpu.memory[1] = opcode, data
    mpu.a, mpu.p, mpu.pc = a, p, 0
    mpu.step()
    return [mpu.a, mpu.p]


def main(out):
    vectors = {}
    for name, opcode in OPCODES.items():
        rows = []
        for decimal in (False, True):
            for carry in (False, True):
                p = 0x30 | (0x08 if decimal else 0) | (0x01 if carry else 0)
                for a in VALUES:
                    for data in VALUES:
                        rows.append([a, data, p] + run(opcode, a, data, p))
        vectors[name] = rows
    pathlib.Path(out).write_text(json.dumps(vectors) + '\n')


if __name__ == '__main__':
    main(sys.argv[1])
