# Ultima IV oracle

Offline tools that run the remaster's `fixed` build of Ultima IV (`sean-gugler/u4remasteredA2` at
`428a793`) in [py65](https://github.com/mnaberez/py65)'s 65C02 and record what it does, so the port
can be checked against it. Nothing here runs in CI. The disks, and everything recorded from them,
stay out of git (`work/` and `recordings/` are ignored); only the per-snapshot digests in `digests/`
are committed.

## Setup

```sh
pip install py65
# cc65 2.19 (ca65, ld65), GNU Make 4.2+ and Python 3.6+ for the remaster's build
./build-disks.sh program.do britannia.do towne.do underworld.do
```

`build-disks.sh` clones the remaster at the pinned commit into `work/`, puts your four original
images (the de-protected DOS-order copies its README names) where its Makefile wants them, runs
`make all`, and checks that the four built disks and the label files the scenarios use are there.

## Recording

```sh
python3 record.py --build work/u4remasteredA2              # every scenario
python3 record.py --build work/u4remasteredA2 creation     # one
```

writes `recordings/<scenario>/` (every snapshot's memory regions and the DOS commands run) and
`digests/<scenario>.json` (a SHA-256 per region per snapshot, plus a SHA-256 of the scenario's
source, so a digest file is tied to the script that made it). Commit the digests.

## The machine

`machine.py` is an Apple IIe with 64 KB and the language card. No DOS and no ROM are loaded; the
places the game reaches them are trapped instead:

- **The Monitor.** `COUT` jumps through `CSW`, and `HOME` returns.
- **DOS's output handler.** It runs a Ctrl-D line's `BLOAD`, `BSAVE` and `BRUN` against the disk
  images, and ignores the rest. `BRUN` leaves one return address on the stack, as DOS does, so
  that `HELP`, `LORD` and `END` find the two frames they pop.
- **RWTS.** It serves the sector the IOB names.
- **Disk swaps.** When the game checks a disk, the one it asked for (`reqdisk`, `$DE`) goes in
  first.

A **poll** is a read of `$C000` with no key latched. The idle loop polls once per tick, so a key
scripted "after n polls" arrives after n ticks of idling, with the idle animation's random numbers
drawn as many times. Every key is snapshotted just before the game reads it.

Snapshots leave out the stack page, the text page and DOS's memory. Those hold what DOS and the
Monitor would have left, which nothing here reproduces and the game does not use.

## Scenarios

`scenarios.py` holds three, written from the remaster's source:
- **`boot-to-title`:** the intro, a checkpoint every 250 polls.
- **`creation`:** a new character, to the moment the game is in Britannia.
- **`first-steps`:** `creation`, five moves, and an idle long enough to pass a turn.

A step that waits for a label or a DOS command stops with an error if the game never gets there.

## Checks without the game

```sh
python3 -m unittest test_oracle   # the machine, on hand-written programs and synthetic disks
python3 smoke.py <fixed checkout> # the remaster's own code on blank data (see its docstring)
```

`smoke.py` runs the assembled `INIT`, `SEL`, `SUBS`, `BOOT`, `NEWGAME` and `ULT4` with filler data,
through the same steps as `creation`. With nothing on the Britannia disk to load, it stops where
the game is in Britannia.
