"""Runs the scenarios on disks built from the remaster's `fixed` branch and records them.

    python3 record.py --build work/u4remasteredA2 [scenario ...]

Writes recordings/<scenario>/ (every snapshot's regions, never committed: they are the game's
memory) and digests/<scenario>.json (a SHA-256 per region per snapshot, safe to commit). With no
scenario named, runs them all.
"""

import argparse
import hashlib
import inspect
import json
import pathlib
import sys

from dos33 import Disk
from labels import read_labels
from machine import Machine
from scenarios import SCENARIOS, Session

HERE = pathlib.Path(__file__).parent
PROGRAMS = {'BOOT': 'program', 'NEWGAME': 'program', 'ULT4': 'program', 'SUBS': 'program', 'END': 'underworld'}


def load_build(build):
    build = pathlib.Path(build)
    disks = {name: Disk((build / 'output' / f'u4{name}.do').read_bytes(), name) for name in ('program', 'britannia', 'towne', 'underworld')}
    labels = {program: read_labels(build / 'src' / 'patchedgame' / disk / f'{program}.lab') for program, disk in PROGRAMS.items()}
    return disks, labels


def record(build, name):
    disks, labels = load_build(build)
    machine = Machine(disks, rng_address=labels['SUBS']['rnd0'])
    machine.boot()
    SCENARIOS[name](Session(machine, labels))
    out = HERE / 'recordings' / name
    out.mkdir(parents=True, exist_ok=True)
    steps = []
    for index, snapshot in enumerate(machine.snapshots):
        for region, data in snapshot['regions'].items():
            (out / f'{index:04d}.{region}.bin').write_bytes(data)
        steps.append({key: snapshot[key] for key in ('key', 'polls', 'cycles', 'pc', 'digests')})
    script = hashlib.sha256(inspect.getsource(SCENARIOS[name]).encode()).hexdigest()
    (out / 'dos.log').write_text('\n'.join(machine.dos_log) + '\n')
    digests = HERE / 'digests'
    digests.mkdir(exist_ok=True)
    (digests / f'{name}.json').write_text(json.dumps({'scenario': name, 'script_sha256': script, 'steps': steps}, indent=1) + '\n')
    return len(steps)


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--build', required=True, help='a checkout of the fixed branch after make all')
    parser.add_argument('scenarios', nargs='*', default=list(SCENARIOS))
    args = parser.parse_args(argv)
    for name in args.scenarios:
        print(f'{name}: {record(args.build, name)} snapshots')


if __name__ == '__main__':
    main(sys.argv[1:])
