"""Writes the lifter's gate fixture: the creation scenario on smoke.py's blank data, as digests.

    python3 export_gate.py <fixed checkout> ../lift/gate/creation-blank.json

Only SHA-256 digests and DOS command lines are written, so the fixture holds nothing of the game.
"""

import json
import pathlib
import sys

from labels import read_labels
from machine import Machine
from scenarios import Session, creation
from smoke import disks


def main(fixed, out):
    fixed = pathlib.Path(fixed)
    labels = {name: read_labels(fixed / 'src' / 'patchedgame' / 'program' / f'{name}.lab') for name in ('BOOT', 'NEWGAME', 'ULT4', 'SUBS')}
    machine = Machine(disks(fixed), rng_address=labels['SUBS']['rnd0'], max_cycles_per_step=60_000_000)
    machine.boot()
    creation(Session(machine, labels))
    snapshots = [{'key': s['key'], 'polls': s['polls'], 'dos': s['dos'], 'digests': s['digests']} for s in machine.snapshots]
    pathlib.Path(out).write_text(json.dumps({'scenario': 'creation', 'data': 'blank', 'snapshots': snapshots}, indent=1) + '\n')
    print(f'{len(snapshots)} snapshots, {machine.mpu.processorCycles:,} cycles')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
