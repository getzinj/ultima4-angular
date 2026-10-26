"""Records when the speaker clicks in a scenario, or compares two such records.

    python3 clicks.py record --build work/u4remasteredA2 <scenario> <out.json>
    python3 clicks.py compare <oracle.json> <port.json>

A record is the cycle count at every $C030 access. The port's comes from
tools/lift/gate/record-clicks.ts; compare buckets the intervals between clicks by the oracle's
length and prints the port's ratio to it, so a sound timed wrong stands out.
"""

import json
import statistics
import sys

import machine
from record import load_build
from scenarios import SCENARIOS, Session

LONGEST_TONE = 20000


def record(build, name, out):
    disks, labels = load_build(build)
    game = machine.Machine(disks, rng_address=labels['SUBS']['rnd0'])
    clicks = []
    io = machine.Memory._io

    def heard(memory, address, is_write):
        if address == machine.SPEAKER:
            clicks.append(memory.machine.mpu.processorCycles)
        return io(memory, address, is_write)

    machine.Memory._io = heard
    game.boot()
    SCENARIOS[name](Session(game, labels))
    with open(out, 'w') as file:
        json.dump(clicks, file)
    print(f'{len(clicks)} clicks')


def compare(oracle_path, port_path):
    with open(oracle_path) as file:
        oracle = json.load(file)
    with open(port_path) as file:
        port = json.load(file)
    print(f'clicks: oracle {len(oracle)}, port {len(port)}')
    buckets = {}
    for i in range(1, min(len(oracle), len(port))):
        interval = oracle[i] - oracle[i - 1]
        if 0 < interval < LONGEST_TONE:
            buckets.setdefault(10 ** (len(str(interval)) - 1), []).append((port[i] - port[i - 1]) / interval)
    for size in sorted(buckets):
        ratios = buckets[size]
        print(f'{size:>6}+ cycles: {len(ratios):6} intervals, port/oracle median {statistics.median(ratios):.3f}, min {min(ratios):.3f}, max {max(ratios):.3f}')


if __name__ == '__main__':
    if sys.argv[1:2] == ['record'] and sys.argv[2:3] == ['--build']:
        record(sys.argv[3], sys.argv[4], sys.argv[5])
    elif sys.argv[1:2] == ['compare']:
        compare(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
