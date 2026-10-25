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

`scenarios.py` holds twelve, written from the remaster's source:
- **`boot-to-title`:** the intro, a checkpoint every 250 polls.
- **`creation`:** a new character, to the moment the game is in Britannia.
- **`first-steps`:** `creation`, five moves, and an idle long enough to pass a turn.
- **`transport`:** a new game moved, before ULT4 starts, to (E7,88) by Britain, with a horse and a
  ship placed beside it (`Session.poke`): mount, gallop into the shallows, dismount, board the ship,
  turn and sail against the wind. Each key waits for the game to come back to `next_turn`, so the
  type-ahead buffer never holds one (a blocked move empties it).
- **`britannia`:** a new game moved to (E1,85) by Britain, with the moongate beside it open and the
  moons set to send it to another, two gems and the horn: search where nothing is, step through
  the gate, peer at a gem, use the horn and the bell, camp, then die and wake in Lord British's
  castle. Each key waits for the type-ahead buffer to empty (SPACE flushes it).
- **`combat`:** a new game by Britain with a strong avatar, in three fights: a sword against two
  orcs, waiting for them and killing both; a bow against two pythons, killing one and wounding the
  other, poisoned, then fleeing off the arena's edge; and, on a ship, a bow against a pirate ship's
  crew. Each turn's keys wait for the next player's turn, or the next turn in Britannia.
- **`spells`:** a new game by Britain, poisoned, with nine of every mixture and the caster's magic
  topped up before each cast: twenty-one casts in Britannia (light, wind, blink, heal, cure, awake,
  jinx, gate, view and the rest, with the combat-only and dungeon-only ones refused, a second
  player's cast, and a negated one), then a fight with two orcs where each attack spell and the
  others are cast, which ends in victory.
- **`monsters`:** a new game on Britain's shore with a strong avatar, a pirate ship to the west, a
  twister to the east and an orc to the south, passing turn after turn: the twister strikes, the
  orcs attack and die, then the pirate sails in and attacks, and the avatar flees its crew.
- **`shrines`:** a new game by the shrine of Honesty: turned away without its rune, then a vision
  after one cycle, too weary to meditate again, a wrong mantra with spirituality spent, three cycles
  with honesty at 99 for the partial avatarhood and the rune drawn, and no focus on another virtue.
  Each key waits for the type-ahead buffer to empty, since keys typed during the dots are lost.
- **`lord-british`:** a new game into Lord British's castle, with him placed beside the party
  (`Session.poke` into a townsperson's slot): the newcomer's welcome, every subject he answers
  (healing declined and taken, HELP early in the game), one he cannot, and farewell; then a level
  gained and the help that asks for runes; then his greeting to a party of four.
- **`commands`:** a new game by Britain with three in the party, a sextant, a torch, arms and the
  quest's items: Locate, Ignite, Ztats through every page both ways, Ready and Wear (taken,
  refused by class, lacking, aborted), New order, Volume and Music, starving, four chests, Attack
  at nothing, at a whirlpool and at a rat (a fight with Ztats and Ready in it), Fire from a ship,
  a turn on each of swamp, fire, sleep, poison and lava (poked under the party into the map's
  chunks), three on a bridge, and Quit.
- **`townes`:** a new game by Moonglow with eight in the party: into the towne, where the
  companion who lives there is gone; a door opened and left to close, a locked one jimmied, the
  towne's chests stolen and a dropped one opened, a sleeper attacked; then, each time by poking
  `britannia_x` and `_y` before leaving, out to Deceit (on a horse, then on foot, and up its
  ladder), Paws, Magincia, the Lycaeum and the Abyss (shut, then opened), and Enter in a balloon
  and where nothing is. Each disk prompt is answered with one ESC once the game waits at it.

A step that waits for a label or a DOS command stops with an error if the game never gets there.

## Checks without the game

```sh
python3 -m unittest test_oracle   # the machine, on hand-written programs and synthetic disks
python3 smoke.py <fixed checkout> # the remaster's own code on blank data (see its docstring)
```

`smoke.py` runs the assembled `INIT`, `SEL`, `SUBS`, `BOOT`, `NEWGAME` and `ULT4` with filler data,
through the same steps as `creation`. With nothing on the Britannia disk to load, it stops where
the game is in Britannia.

## Fixtures for the lifter

Two scripts write committed fixtures for the lifter (`../lift/`). Neither holds any of the game:

- **`export_gate.py`** runs `creation` on `smoke.py`'s blank data and writes the digests and DOS
  lines to `../lift/gate/creation-blank.json`.
- **`export_cpu_vectors.py`** writes py65's `ADC`, `SBC` and `CMP` results over a spread of
  operands, in both modes, to `../../src/app/lifted-runtime/cpu-vectors.json`.
