# Ultima IV port — source notes

> Findings from phase 0 of [`2026-10-ultima4-port.md`](2026-10-ultima4-port.md). The paths are in
> [`sean-gugler/u4remasteredA2`](https://github.com/sean-gugler/u4remasteredA2) unless stated otherwise. Nothing
> from that repo or from the game is copied here; this file only describes it.

## Pinned sources

| Branch | Commit | Date | Use |
|---|---|---|---|
| `fixed` | `428a793a4d6327cc9734ec151bf377f3d328f2cc` (release 1.2.12) | 2025-01-21 | What is ported (D2) |
| `documented` | `7016e9d566872d54d98d04b5c3f2238e8950513f` | 2025-01-20 | Builds byte-identical retail binaries; read for comments, and for what the retail data looks like |

The two branches differ in 33 of the 38 `.s` files. The biggest differences are in `ULT4.s` (1,311 changed
lines), `underworld/TMAP.s` (179), `BOOT.s` (142), `TALK.s` (132) and `SUBS.s` (106).

## Licence

- **Two kinds of work in the repo.** It has no `LICENSE` file. Its README says Gugler's own work is
  © 2021 and licensed CC BY-SA 4.0. That covers the symbol names, the comments, the fixes and the Python tools.
  The code those names sit on is a disassembly of EA's 1985 binaries, and no licence of Gugler's covers it.
- **What we may adapt, with attribution.** CC BY-SA 4.0 is one-way compatible with GPL-3.0, so we may adapt his
  tools' logic, his label names and his fixes in GPL-3.0 code, crediting him in the port's `NOTICE`.
  - This corrects the plan, which said nothing from the repo could be used.
- **What stays out.** We never vendor anything that is EA's content:
  - the disassembly itself;
  - `src/talk/talk.json` (the game's dialogue);
  - `files/savegame/` (save files);
  - anything extracted from the disks.
- **The port itself** is a translation of the game's code, as Wizardry's is. Same accepted, uncleared risk (plan
  D6).

## The source at a glance

| Disk | Files | Non-comment lines |
|---|---:|---:|
| program | 8 | 15,614 |
| britannia | 8 | 3,543 |
| towne | 15 | 6,632 |
| underworld | 5 | 3,928 |
| **Total** | **36** | **29,717** |

Not counted above: `src/loadaddr.s`, and the trainer menu (`src/trainer/`, 2 files and 462 lines, only on
`fixed`), which is out of scope under D7. The plan said 38 files; the right count is 36.

## Code files

The load address comes from the file's `.cfg`, or from `overlay8800.cfg` (`$8800`–`$9AA5`) when it has none.
"Loaded by" is the file whose DOS command string names it.

| Disk/file | Lines | Loads at | Loaded by | Role and entry points |
|---|---:|---|---|---|
| program/`INIT` | 154 | `$4000` | boot (DOS `HELLO`) | Loads `SUBS`, `SEL`, `TBLS`, `HTXT`, tile shapes `SHP0`/`SHP1`; `BRUN BOOT` |
| program/`BOOT` | 1,780 | `$6000` | `INIT` | Title, intro animation, options (drives, Mockingboard); `BRUN NEWGAME` or `BRUN ULT4` |
| program/`SUBS` | 2,808 | `$0800` | `INIT` | Resident library. 52 entries `j_waitkey` `$0800` … `j_math_sign` `$0899` (`jump_subs.i`). RNG, printing, map streaming, sector I/O, idle loop |
| program/`SEL` | 81 | `$0320` | `INIT` | Resident. `music_ctl` `$0320`, `spin_drive_motor` `$0323`, `err_resume_addr` `$0326`, `err_resume_stack` `$0328`, `on_dos_error` `$0329` (`jump_system.i`) |
| program/`NEWGAME` | 1,247 | `$6400` | `BOOT` | Character creation (the gypsy); writes `NPRT`/`NRST`/`NLST` as the new save; `BRUN ULT4` |
| program/`ULT4` | 8,463 | `$4000` | `BOOT`, `NEWGAME`, `END` | Main program: the command loop, movement, combat. Entries `j_inn_combat` `$4003`, `j_initialize_arena` `$4006`, `j_game_init` `$4009`. Loads every overlay below |
| program/`MBSI` | 391 | `$8000` | `BOOT` | Mockingboard init, `j_mbsi` `$8000` (phase 17) |
| program/`MBSM` | 690 | `$FD00` (+`$0400` text page) | `BOOT` | Mockingboard music driver (phase 17) |
| britannia/`TMAP` | 443 | `$9000` | `ULT4` | `j_viewmap`: the map view (also on towne and underworld, each different) |
| britannia/`HELP` | 309 | `$8800` | `ULT4` | Lord British's help; `BRUN LORD` |
| britannia/`LORD` | 843 | `$8800` | `ULT4`, `HELP` | Lord British. Entry `$8800` drops two stack frames left by `BRUN` from `HELP`; `talk_lord_british` `$8807` |
| britannia/`HOLE` | 260 | `$8800` | `ULT4` | Hole up and camp; loads `CAMP` |
| britannia/`SAVE` | 159 | `$8800` | `ULT4` | Quit and save |
| britannia/`SEAR` | 241 | `$8800` | `ULT4` | Search |
| britannia/`SHRN` | 816 | `$8800` | `ULT4` | Shrines and meditation; loads `SHRI` |
| britannia/`USE` | 472 | `$8800` | `ULT4` | Use an item |
| towne/`TMAP` | 432 | `$9000` | `ULT4`, `SEAR` | Map view |
| towne/`TALK` | 644 | `$8800` (dialog buffer `$EF00`) | `ULT4` | Conversations, read by raw sector from the `TLK` area |
| towne/`SHP0`–`SHP9` | 75–702 | `$8800` | `ULT4` (`"BLOAD SHP" + digit`) | Shops: 0 weapons, 1 armour, 2 food, 3 pub, 4 reagents, 5 healer, 6 inn, 7 guild, 8 stable, 9 the seer |
| towne/`MIX` | 240 | `$8800` | `ULT4` | Mixing reagents |
| towne/`SEAR`, `USE` | 259, 350 | `$8800` | `ULT4` | Search (also views maps), use |
| underworld/`TMAP` | 264 | `$9000` | `ULT4` | Map view |
| underworld/`DNGD` | 1,618 | `$8C00` | `ULT4`, `USE` | Dungeon 3D view. Entries `$8C00` check update, `$8C03` draw items and monsters, `$8C06` neighbour tiles |
| underworld/`END` | 1,079 | `$8800` | `USE` (`BRUN END`) | The Abyss and Codex ending; loads `CSTRING` |
| underworld/`SEAR`, `USE` | 354, 613 | `$8800` | `ULT4` | Search, use |

Three files are on a disk without source in that disk's folder:
- britannia `MIX`;
- underworld `HOLE` and `MIX`.

Each is presumably the same binary as `towne/MIX.s` or `britannia/HOLE.s`. Phase 3 confirms that by hash.

## Memory map (from `src/include/*.i`)

| Range | What | Include |
|---|---|---|
| `$00`–`$1F` | The `PRTY` save record lives in zero page: position, map chunk, location, mode, transport, party size, moons, timers, the 4-byte move counter | `PRTY.i` |
| `$46`–`$FF` | Working zero page: key buffer, tiles round the player, console cursor, disk I/O parameters, current player, `ptr1`/`ptr2`. Overlays reuse `$D8`–`$F0` as locals, defined in each file | `zp_*.i` |
| `$0200`–`$02FF` | Drawn and actual tiles of the view; arena (`CON*`) and room (`DNG*`) loads at `$0240`/`$0200` | `map_objects.i`, `dungeon.i` |
| `$0300`–`$031F` | Keyboard input queue; dungeon room triggers at `$0310` | `tables.i`, `dungeon.i` |
| `$0320`–`$03CF` | `SEL` (music control, error-resume vector) | `jump_system.i` |
| `$0800`–`$1FFF` | `SUBS` | |
| `$2000`–`$3FFF` | HGR page 1 (the only page the game shows) | `apple.i` |
| `$4000`–`$87FF` | `ULT4` (or `INIT`/`NEWGAME`/images while they run) | |
| `$8800`–`$9AA5` | Overlay; `$8B00` town map load buffer; `$8C00` `DNGD`; `$9000` `TMAP`; `$9200` visited buffer | `view_map.i` |
| `$9A90`–`$9A9A` | Trainer flags (zero = off) | `trainers.i` |
| `$9AA6`–`$BFFF` | DOS 3.3: buffers, command interpreter, RWTS (IOB at `$B7E8`) | `dos.i` |
| `$D000`–`$DFFF` | Tile sheet (language card) | `tables.i` |
| `$E000`–`$E3BD` | `TBLS`: HGR row addresses and column byte/bit tables | `tables.i` |
| `$E400` | Font (`HTXT`) | `tables.i` |
| `$E800` | View buffer; dungeon map (`DNG*`) | `view_map.i` |
| `$EC00`–`$EDFF` | `ROST`: 8 characters × 32 bytes | `ROST.i` |
| `$EE00`–`$EEFF` | `LIST`/`TLST`: map objects | `map_objects.i` |
| `$EF00` | Conversation buffer (`TALK`) | `TALK.cfg` |
| `$F000`, `$FD00` | Music data and the Mockingboard driver | `MBSM.cfg` |

Phase 6 generates the typed accessors from these files. A few names alias one address on purpose (`npc_type`
and `foe_type_combat` are both `$E6`). The generator must allow that.

## Data files per disk

The disks are ordinary DOS 3.3 disks in DOS sector order (`.do`). Each file starts with the 2-byte load address
and 2-byte length that `BLOAD` uses. Several files embed a wrong load address, which the game ignores because it
always names one (`BLOAD FILE,A$nnnn`). Three disks also keep data in raw sectors below the catalogue track,
read through RWTS with no file.

| Disk | Files (not code) | Raw sectors |
|---|---|---|
| program | `TBLS` (HGR tables, `$E000`); `HTXT` (font, 128 glyphs × 8 rows, stored row by row, `$E400`); `SHP0`/`SHP1` (tile sheet, left and right halves, 256 tiles of 14×16 pixels); `ANIM` (`$4000`) and `BGND` (`$7A00`), the intro; `CRDS` (8 virtue cards, 10 bytes × 112 rows each, uncompressed); `FAIR`/`GYPS`/`LOOK`/`PRTL`/`TABL`/`TREE`/`WAGN.SPK` (creation slides, Super Packer, 40 columns × 144 rows stored bottom to top, `$4000`); `NPRT`/`NRST`/`NLST` (new-game save); `MUSB`/`MUSC`/`MUSD`/`MUSO`/`MUST` (music, `$F000`); `DISK` (disk identity) | Tracks 0–2 up to sector 5: the patched DOS 3.3 |
| britannia | `CON` + letter (`CONB` to `CONT`, 14 files) and `CAMP` (combat arenas, `$0240`); `SHRI` (shrine, `$0280`); `PRTY` (`$00`, 32 bytes), `ROST` (`$EC00`, 512), `LIST` and `TLST` (`$EE00`, 256), the save game; `MUSB`/`MUSO`; `DISK` | Tracks 0–15: the world map, 256×256 tiles in 16×16 chunks of one sector each. Track = chunk row, sector = chunk column (`SUBS.s` `loadtiles_*`); four chunks are held round the player |
| towne | `MAP@` and `MAPA`–`MAPP` (a location's map is `'@' + current_location`, `$8B00`); `CON` + letter (10 arenas); `SHPS` (which shop is where); `MUSC`/`MUST`; `DISK` | Tracks 0–15: conversations, one 256-byte record per person. Track = location − 1, sector = the person's dialogue index − 1 (`ULT4.s` talk) |
| underworld | `DNG0`–`DNG7` (dungeon levels, `'0'` + dungeon, `$E800`); `CON0`–`CON6` and `CAMP` (dungeon arenas); `CSTRING` (ending images: the axiom in columns opening outward, then 13 Super Packer layers; `$4000`); `MUSB`/`MUSD`; `DISK` | Tracks 0–10: dungeon rooms (format in phase 3) |

The game also **writes** to the britannia disk, through DOS `BSAVE`:
- `PRTY` (32 bytes), `ROST` (512) and `LIST` (256) on save;
- `TLST` (256) when it enters a town.

So the disk layer needs DOS 3.3 writes as well as reads. Save disks keep the shape Wizardry has: a master and
copies.

## What `fixed` changes besides code

- **Data patches.** `patches/*.patch` hold byte patches checked against the old bytes (offset, match, replace)
  for `towne/MAPB`, `MAPD`, `MAPF`, `SHPS`, `underworld/DNG3`, the raw `DNG` area and `program/DOS`. Examples:
  the healer's row in Serpent's Hold, and the missing entry points in Destard's room 12. Phase 3 re-expresses
  them as our own patch table, applied at import, with credit.
- **Conversations are rebuilt.** `fixed` rebuilds the whole `TLK` area from `talk.json` (`gen_talk.py`), in a
  layout of its own:
  - **Strings:** each ends on a cleared high bit, instead of a zero byte in front.
  - **Keywords:** 4 characters instead of 6.
  - **Flags:** the unused "special" flag is gone, leaving 0xF5 bytes of strings.

  On top of that, 121 lines of `talk.json` differ from `documented`: text fixes, and descriptions for non-human
  people. Phase 3 has to:
  - decode the retail records from the user's disk;
  - convert them to the `fixed` layout;
  - apply a corrections table (record, field, SHA-256 of the retail text, new text) built from the
    `documented`→`fixed` diff.

  The new text is Gugler's, under CC BY-SA, and is credited.
- **Always on in `fixed`, not opt-in:**
  - saving in a dungeon;
  - the corrected NPC descriptions;
  - the campfire that stays put and breathes fire;
  - the library lettering;
  - per-player turns in dungeon rooms and combat (digit keys);
  - the non-binary answer at creation;
  - Ctrl+V for music.

  "Hidden features off by default" (D2) can only mean the trainers, whose flags at `$9A90` stay zero unless the
  trainer menu sets them. The rest come with the `fixed` baseline.
- **Fix markers.** `fixed` marks its changes in the source:
  - `BUGFIX`: 95 in 16 files, 43 in `ULT4`;
  - `ENHANCEMENT`: 88, mostly Mockingboard;
  - `TRAINER:`: 26.

  The README lists 10 critical bugs, 30 other errors, 9 cosmetic ones and 18 enhancements.

## Porting hazards found

1. **The game drives real DOS 3.3.**
   - **Loading.** It loads files by printing commands through the output hook (`$84` = Ctrl-D, then
     `BLOAD …`). 10 of those strings are patched at run time before printing: a file letter, a digit or a drive
     number (`ULT4.s` `@map_number`, `@file_char_shop`, `@file_char_arena`, `@file_char_dungeon`, `towne/SEAR.s`,
     `SEL.s` music, the drive numbers in `BOOT`/`NEWGAME`/`SUBS`/`END`).
   - **Raw sectors.** These go through `SUBS.s` `loadsector`, which calls `RWTS_readblock` (`$B7B5`, DOS's entry
     to RWTS) with the IOB at `$B7E8`.
   - **For the port:** a DOS command shim (parse `BLOAD`/`BSAVE`/`BRUN`, then serve or store the file), plus a
     sector reader.
   - **For the oracle:** trap `$B7B5` and serve the sector from the image. This corrects the plan's `$B600`.
2. **Inline strings after `jsr`.** `j_primm` (597 calls), `j_primm_xy` (63) and `j_primm_cout` (57) print the
   bytes that follow the call and return past them. The lifter turns each into a call with a string argument.
   Where the string is patched at run time (hazard 1), it becomes a template.
3. **Jump tables.** 187 `.addr` entries, such as the command dispatch in `ULT4`. Each becomes a table of
   functions.
4. **Self-modifying code.** 61 operand patch points, written `@name=*+$01`/`*+$02`:
   - where: `DNGD` 32, `SUBS` 12, `BOOT` 11, `ULT4` 3, `NEWGAME` 2, `END` 1;
   - one opcode store: `BOOT.s:880` turns the IIgs Mockingboard init into `RTS`.

   They are all operand rewrites for fast copy and draw loops. They become variables, not code changes. The
   plan's "224 stores to `label+1`" were nearly all pointer setup in zero page: of 629 stores to labels in the
   files, all but one go to data.
5. **Stack tricks.**
   - **DOS-error retry.** `primm_cout` (`SUBS.s:1245`) saves the address of the DOS command it prints, and the
     stack pointer (`tsx`, as `err_resume_stack`). On a DOS error, `on_dos_error` (`SEL.s:30`) restores the
     stack (`txs`) and prints the same command again, so a failed load is retried after a disk swap.
   - `fixed` adds a stack reset in `ULT4.s:8908` (`cmd_done` is the top frame, so the stack is reset there
     whatever the caller left).
   - `HELP`, `LORD` and `END` drop two frames on entry, left over from being started by `BRUN`.
   - `ULT4.s:4527` drops a frame to leave combat.

   Each becomes a thrown error caught at the frame the stack lands on.
6. **The RNG is part of the game state, and idling moves it.**
   - **The generator.** `SUBS.s` `rand` is a 16-byte additive generator held in `SUBS` itself, starting from the
     same bytes every boot.
   - **A second generator.** `fastrand` stirs four of those bytes and depends on the carry flag its caller
     leaves, so the lifter has to carry flags faithfully.
   - **Idling.** While waiting for a key, the idle loop animates water and fields and moves the wind (`rand` and
     `fastrand` in `animate_view`, `animate_fields`, `animate_tiles`, `update_wind`).
   - **So the outcome depends on idle time.** Results depend on how many idle ticks pass before each key.
     - Oracle scripts must therefore give each key with its tick count.
     - The port's tick loop must call the same routines in the same order.
7. **Timing.**
   - **One idle tick** is the `SUBS.s` `delay` loop: `$4B` × 256 passes of 5 cycles, about 96,400 cycles or
     94 ms at 1.023 MHz, plus the animation work.
   - **The pass timeout.** `waitkey` gives up after 128 ticks, about 12 seconds, and the turn passes.
   - That gives the pace a reference after all, which removes most of the plan's risk 4.
8. **Copy protection.** `loadsector` restores the standard DOS data epilogue and nibble table, because the
   retail disks use non-standard ones. The remaster builds from 4am's de-protected images (the `Dockerfile` and
   README name `UltimaIV4amCrack` on archive.org).
   - **Accepted formats.** Phase 3 accepts DOS-order images (`.do`/`.dsk`), and ProDOS-order ones (`.po`) after
     reordering. Nibble images (`.nib`, `.woz`) are refused with an explanation.
   - **Images we can't test.** No disk image has been downloaded for this work, so their hashes are recorded from
     the user's copies in phase 3.

## Building the oracle's disks (D2)

The oracle runs `fixed`, so its disks are built with the remaster's own build. That needs cc65 2.19, Python 3.6+
and GNU Make 4.2+ (or its `Dockerfile`), with the four original images in `files/original/` as `u4program.do`,
`u4britannia.do`, `u4towne.do` and `u4underworld.do`. `make all` writes the four patched images. All of this runs
on the developer's machine. The images, and anything built from them, stay out of git.

## Effects on the plan

- **Licence:** Gugler's tools, labels and fixes may be adapted with credit (CC BY-SA 4.0 → GPL-3.0). EA's code
  and text stay out.
- **Phase 3:** add DOS 3.3 writes (`BSAVE`), the data patch table, the conversation conversion and corrections,
  and the `.po` reorder and nibble-image refusal.
- **Phase 4:** trap `$B7B5`, not `$B600`. Scripts give each key with its idle-tick count.
- **Phase 5:** the lifter models the carry flag, inline strings and the strings patched at run time.
- **Risk 3** (self-modifying code) is smaller than feared: 61 operand patch points and one opcode store, all
  listed above.
- **Risk 4** (timing) is mostly answered: one idle tick is about 94 ms, and the pass timeout is 128 ticks.
