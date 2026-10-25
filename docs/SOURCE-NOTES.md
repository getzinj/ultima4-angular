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
   - three opcode stores (phase 5 found the two that go through a constant): `BOOT.s:880` turns the IIgs
     Mockingboard init into `RTS`; `INIT.s:82` turns `SEL`'s `music_ctl` (`$0320`, from `jump_system.i`) into
     `RTS`, and `BOOT.s:1005` turns it back into `JMP` when music is chosen.

   The operand rewrites are all in fast copy and draw loops. They become variables, not code changes. The
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

## Phase 3 findings

- **Which disk is which.** `DISK` is a binary file BLOADed over `disk_id` at zero page `$D0`. It holds
  1 for program, 2 for Britannia, 3 for towne and 4 for underworld (`SUBS.s` `request_disk`). The
  port identifies disks the same way, then checks each one's required files (from the remaster's
  Makefile).
- **Sector order.** DOS sectors 0 and 15 sit at the same offset in DOS order and ProDOS order, so
  a VTOC at track 17 sector 0 does not show which order a `.dsk` is in. The port reads the image
  both ways and keeps the reading whose `DISK` file names an Ultima IV disk.
- **Patch offsets.** The remaster's `.prg` patch offsets count the 2-byte load address. With 2
  taken off, they land where the layouts below predict. Two examples: `DNG3`'s ladder fixes fall
  on whole 8-byte rows of level 4, and the `MAPD` and `MAPF` fixes fall in the towne object
  table's dialogue column.
- **Layouts, confirmed against the patches and the load code:**
  - **Towne maps:** 32×32 tiles, then the 256-byte object table (8 columns of 32: sprite, x, y,
    type, previous x, previous y, movement, dialogue). `ULT4.s` `load_letter_location` copies
    them to `$E800` and `$EE00`.
  - **Arenas (`CON*`, `CAMP`):** 16 foe x, 16 foe y, 8 player x, 8 player y, then 11×11 tiles
    from offset `$40` (memory `$0280`).
  - **Dungeon rooms:** one sector each. Track = dungeon, except the Abyss, which takes 7 + level/2.
    Sector = room. Each room holds, in order:
    - 4 triggers of 4 bytes;
    - 16 foe types;
    - 16 foe x and 16 foe y;
    - entry squares by the side entered (north `$40`, east `$50`, south `$60`, west `$70`;
      8 x then 8 y each);
    - 11×11 tiles from `$80`.

    The Covetous patch, a full row of 11 at `$B7`, confirms where the tiles start.
  - **Dungeon levels (`DNG0`-`DNG7`):** 8 levels of 8×8 squares, level after level.
- **Conversations.** The retail and remaster layouts are described in `data/conversations.ts`.
  The remaster's corrections come to 112 text edits (447 inserted characters) and 9 value changes
  (6 triggers, 3 humility flags). `tools/generate-talk-corrections.ts` checked three things:
  - the retail layout round-trips every record of `documented`'s `talk.json`;
  - the edits turn those records into `fixed`'s exactly;
  - the remaster layout written by the port equals `gen_talk.py`'s `TLK.bin` byte for byte.
- **Not yet checked against a real disk.** World chunks are taken to be row-major. Arena and room
  tiles are taken to start where noted above. Phase 4's oracle confirms all three.

## Phase 4 findings

- **What the game needs from DOS and the ROM** (both branches):
  - **Boot.** `INIT` calls `HOME`, `COUT` and DOS's hook-up entry `$03EA`, and reads the
    machine-ID bytes.
  - **Commands.** Every DOS command goes out through `CSW` from `SUBS.s` `primm_cout`.
  - **Raw sectors.** These go through `RWTS_readblock` (`$B7B5`).
  - **After boot, nothing else.** No other ROM routine and no other DOS entry is called, so the
    oracle traps those few addresses and loads neither DOS nor the ROM.
- **The ROM copy.** `INIT` copies `$F000`-`$FFFF` of ROM into language-card RAM (`rom_SHADOW`),
  so the top 4 KB of the card holds whatever the ROM held. With the stub ROM that is zeros, except
  the ID bytes. The game only uses that area for the interrupt vectors, and the Mockingboard
  driver `MBSM` overwrites `$FD00`-`$FFFF` when it is chosen.
- **The stack after BRUN.** At DOS's output handler the stack holds `primm_cout`'s own `jsr
  @cout` frame. DOS's `BRUN` leaves one frame of its own above that, which makes the "2 frames"
  `HELP`, `LORD` and `END` pop. The oracle pushes one frame. The port has no 6502 stack, so it
  needs no counterpart.
- **TRAINERS.** The `fixed` `BOOT` and `ULT4` always `BLOAD TRAINERS`, a file only `fixed`'s build
  puts on the program disk. The port, which reads retail disks, will have to provide it itself
  (all flags zero, D7) when `BOOT` is ported in phase 7.
- **Two drives.** `numdrives` is toggled from the menu. Britannia and the underworld then go in
  drive 2. The scenarios use one drive, so every disk change prompts for Esc.
- **Polls stand for ticks.** In play, `waitkey` polls `$C000` once per idle tick. The intro does
  not go through `delay`, but it also polls between frames. So the oracle counts keyboard polls
  with nothing waiting, and the port must poll at the same points.

## Phase 4 findings on the real disks

- **The images.** 4am's crack of the original, four DOS-order `.dsk` files. Each identifies by its
  `DISK` file, and each has every file the remaster's Makefile needs; its build accepts them.
- **Locked files.** Every file is locked except the save game on the britannia disk (`PRTY`,
  `ROST`, `LIST`, `TLST`) and everything on the underworld disk. DOS refuses to `BSAVE` over a
  locked file, so applying the data patches with BSAVE failed (`FILE LOCKED: MAPB`). They are now
  written in place, in the file's own sectors, as the remaster's build edits its images; the file
  stays locked. The synthetic disks lock the same files, so CI covers it.
- **Phase 3 holds.** All 26 data patches find the bytes they expect, and all 256 conversations
  convert to the remaster's layout with no correction skipped.
- **Recorded.** `boot-to-title` (8 snapshots), `creation` (53) and `first-steps` (59) in about two
  minutes. The `creation` checkpoint catches the map view half drawn, since `drawview` polls the
  keyboard on every scan line, so a checkpoint's poll count fixes how far a drawing has got.
- **The lifted game agrees.** Run on the same built disks, the lifted modules give the oracle's
  digests at all 53 `creation` snapshots: screen, zero page, memory, language card and RNG.

## Phase 5 findings

- **The lifted game agrees with the oracle.** Its own `creation` run on blank data gives the
  oracle's digests, polls and DOS lines at all 53 snapshots. A one-bit fault in `ADC` breaks the
  match at snapshot 1, so the gate is sensitive.
- **Size.** 36 modules and 20,096 instructions make 2.8 MB of TypeScript. 63 patch points are read
  live: the 61 above plus 2 in `TRAINERS`.
- **Opcode stores.** `INIT` stores `RTS` over `SEL`'s `j_music_ctl` before anything calls it. The
  lifted `SEL` reads that opcode each time, runs `RTS` or the original `JMP`, and fails on any
  other value.
- **The ROM stub runs once.** `INIT` calls the IIgs ID routine at `$FE1F`, which the stub answers
  with an `RTS`. The machine runs that one instruction; any other jump into the ROM fails.
- **Real stack, not exceptions.** The lifted code keeps the 6502 stack, so `primm`, the jump
  tables, `err_resume` and the frame drops run unchanged. The plan's thrown errors move to the
  hand port (phases 7–12), which can check them against the lifted baseline.
- **Speed.** Stopping to check the scenario before every instruction, the lifted game runs about
  2 million cycles a second under Node, twice the Apple's speed and about py65's. That is enough to
  play.
- **Not committed.** The lifted modules carry EA's program bytes and code. They are generated
  locally (`nx run Ultima4:lift`) and ignored by git and ESLint. The gate's fixture holds only
  digests.

## Phase 6 findings

- **Character constants are charmapped.** Every program includes `uscii.i` first, and ca65 puts
  character constants through the charmap, so `status_Good = 'G'` assembles as `$C7`, as do the
  music letters. A port that took `'G'` as `$47` would never match the game's status bytes.
- **Encodings the include files don't give.** Found from the code that reads and writes each
  field:
  - **BCD** (`sed` arithmetic, `printbcd`): character strength, dexterity, intelligence and magic;
    hit points, maximum hit points and experience, two bytes each, high byte first; virtues and
    every count (torches, gems, keys, sextants, armour, weapons, reagents, mixtures); food (four
    digits, plus hundredths in `food_frac`); gold; `ship_hull`; the move counter (eight digits).
  - **Names:** high-bit ASCII as typed, at most 15 characters, zero-padded to 16 bytes
    (`BOOT.s` `input_text`, `NEWGAME.s` `@set_player_name`).
  - **Gender:** the glyph shown, `glyph_male` (`$5C`) or `glyph_female` (`$7B`).
- **Aliases.** `zp_demo.i` defines `game_mode` and `party_size` again, with the same values, and
  uses `$10`-`$13` for its own pointers. That is safe only because the demo runs before a game is
  loaded. The generator accepts a name defined twice with the same value and refuses one defined
  two ways.
- **New games aren't saved by `NEWGAME`.** It builds the party in memory and goes straight into
  the game. The lifted creation run issues no `BSAVE`; the save files are first written when the
  player saves.

## Phase 7a findings

- **SUBS's interface is its registers.** The contract analysis tried first could not say which
  outputs callers rely on: hundreds of the 600 `primm` call sites flow into code whose own inputs
  are unknown. So the port leaves A, X, Y and every flag as the original does, and the
  differential harness proves it per entry.
- **Carry crosses routine boundaries.** `fastrand` adds with the carry it is called with, and
  `animate_view` and `j_update_view_combat` pass their caller's carry on to it through
  `scroll_tiles`, which never touches C. The port keeps the carry in the CPU for that reason.
- **Language-card switching is all reads of odd addresses**, so writing stays enabled
  throughout `drawview` and the tile animation; an extra `bit $C083` is harmless, though the
  port does not add one.
- **Reads past tables.** `idle_combat` and `update_monsters` index `mul_11` with Y up to 255 and
  so read SUBS's own code beyond it; the port reads its tables from memory at their addresses, so
  it does the same.
- **SUBS keeps state in its image:** the RNG (`rnd0`-`rndf`), the cursor, the moons, the
  saved console position, the line drawer's flags, the idle timeout, two sound counters, and
  seven operands it rewrites. They stay there, so memory matches the oracle byte for byte.
- **The drive digit.** `request_disk` writes the drive number into its own `BLOAD DISK,D1`
  string (`$18D6`) before printing it.

## Phase 7b findings

- **The stack's depth is visible.** `primm_cout` stores the stack pointer in `err_resume_stack`
  (`$0328`, in the snapshot's low region), and a BRUN leaves the next program at the depth it
  was run from. So BOOT's own JSRs push their return addresses as the 6502's would, and its JMPs
  out (`load_music`'s `jmp music_ctl`) run SEL with BOOT's return address standing in.
- **`j_music_ctl` is read as an opcode.** INIT stores an RTS over it, and BOOT a JMP again when a
  sound board is fitted; the native SEL reads that byte and fails on anything else.
- **Inline data is called where it is.** `primm_xy` and `primm_cout` keep the address of their
  string (`primmaddr`, `ptr1`), so a ported caller hands over the string at its own address in
  its image (`callInline`), returning past it at the same depth.
- **The pauses are only arithmetic.** `short_pause` polls once and then counts down a triangle
  of A; the port counts it in the CPU and adds its cycles. With that, the title scenario runs in
  2 s instead of 235 s lifted.
- **Unreachable code.** `mystery_routine`, `get_bitmap_byte` and `remove_window` are never
  called and are not ported. `init_mb_iigs` is 65816 code; it is only reached with a sound board
  on a IIgs, and the port fails there.
- **Two sound boards loop.** `menu_which_slot`'s second card bumps `mb_count` by 2 and asks
  again while bit 7 is set, which it always is; the redundant check that would end it is
  commented out in the source. The port keeps the loop.
- **TRAINERS is not on the synthetic disks**, so the CI spec that runs INIT to NEWGAME puts a
  filler one there.

## Phase 8 findings

- **NEWGAME's text is most of its image.** The string table runs from `$6CA6` to the end
  (10,894 bytes, 68 strings, `$FF` for a newline). By the user's decision it is committed in
  `newgame-data.ts` as text, like SUBS's and BOOT's strings.
- **The answers add up in BCD.** `chosen_on_left` sets the decimal flag and carries one `adc`
  into the next: the virtue's level, then strength, dexterity and intelligence.
- **The runoff.** Before the fifth and seventh questions, `mark_runoff_cards` makes every card
  that has not been discarded eligible again; cards are picked by `j_rand` until an eligible one
  comes up, so the RNG's state decides the questions.
- **`insert_disk`, `print_disk_name` and `clear_window` are unused** (the source says so) and
  are not ported.
- **Super-Packer's dead code.** In a pattern, a run with no pattern bytes left first resets the
  pointer to the pattern's start, and then reads the run either way; the port keeps both.

## Phase 9a-1 findings

- **ULT4 is ported in part.** It is 9,364 lines, and the plan spreads it over 9a to 11, so its native
  module keeps the lifted code (`partial: true`) and takes over only the labels ported. Lifted code
  that runs into a ported label stops there and the native routine runs, since ownership is per
  address; lifted code that branches into the middle of a ported routine still runs the lifted
  copy, which stays correct.
- **Routines end in jumps.** Most commands end `jmp cmd_done`, and the turn loops through
  `next_turn` → command → `cmd_done` → `end_turn` → `next_turn` by JMPs, so a native entry returns
  where control goes next and the machine dispatches it; nothing nests, however long the game runs.
- **`pla` / `pla` leaves A behind.** `@try_move`, `try_walk_exit` and `check_enter_moongate` drop
  their caller's return address before jumping on; A is left holding its high byte, with its
  flags, and `try_walk_exit` jumps to `leave_to_world` with it.
- **`is_wind_favorable` reads zero page $02** (`eor $02`, a SIZE_OPT that meant `eor #$02`), which
  is `tile_xpos`, so whether a ship sails before the wind depends on where it is on the map.
- **A blocked move empties the type-ahead buffer** (`done_blocked` clears `key_buf_len`), so a
  scenario that presses keys faster than the game takes them loses them; `transport` waits for
  `next_turn` before each key.
- **The differential harness needs a sane world** for ULT4: the music silenced as INIT leaves it
  (or SEL's wait for the tune never ends), a party that is alive (or `anyone_awake` runs
  `run_file_dead`), and the disk asked for already in the drive (or `request_disk` waits for ESC).

## Phase 9a-2 findings

- **An overlay is a native module of its disk.** SEAR and TMAP exist on the towne and underworld
  disks too, with other code, so a module is keyed by disk and name, and only Britannia's are
  ported. Each installs the bytes it reads as data over the BLOADed file, which the local gate
  checks against the lifted image.
- **Ported ULT4 calls an overlay with the 6502's own return address** (`callInline` with no data),
  not the machine's: HOLE's ambush pulls it (`pla` / `pla`, then `jmp j_initialize_arena`) and
  leaves its high byte in A.
- **Some calls never come back.** The ambush and `run_file_dead` (which resets the stack with `ldx
  #$FF` / `txs`) leave the native routine that called them waiting, and the game runs on inside
  that call. Play is unaffected, but each such escape keeps a JS frame alive until the combat and
  death paths are ported and the caller can return where control goes instead.
- **The originals' quirks, kept:** SEAR's black stone is found only when both moons are dark,
  under a label named `@dark_moons` that is taken when they are not; `increase_hp` caps the hit
  points by comparing the high bytes and then the low bytes separately, so a player whose high
  byte passes the maximum while the low byte is below it keeps the excess; HOLE's `restore_mp`
  counts down through player 0 (`bpl`); USE compares only four letters, and pads the input to six
  even when it is longer; the screen shake copies bytes 1 to $16 of each line, never byte 0.
- **SPACE empties the type-ahead buffer**, so `britannia` waits for `key_buf_len` to reach zero
  after each key, or the next one is lost.
- **The differential harness had the program disk in drive 1**, so every BLOAD a ULT4 command made
  failed the same way on both machines, and those cases agreed without loading anything.
  `LiftedMachine.insertDisk` now puts the disk the random world asks for in drive 1, the smoke
  towne disk has a blank `MAP@` for SAVE, and a case can type a sequence of keys (USE's item name,
  the ESCs `request_disk` waits for).

## Phase 9b-1 findings

- **9b is split.** Combat is about 2,500 lines of ULT4, spells about 860 and wandering monsters
  about 1,000, so 9b-1 ports the fight itself and 9b-2 the monsters that start one and the spells
  cast in one. Dungeon rooms' exits (`combat_exit_room`) wait for the dungeons, phase 11.
- **Several routines read the caller's N flag, not A**: `foe_index_from_tile`,
  `print_target_name`, `collide_terrain` and `math_abs` branch on `bpl` first, so their ports test
  the flag the caller's last `lda` left. In `set_foe_count`, townsfolk reach `foe_index_from_tile`
  with N clear and A 0, and read index $24 past `foe_max_count`'s monsters (a bug the remaster
  notes and keeps).
- **Armour is read through the wrong index.** `do_foe_melee_attack` does `lda #player_armour`
  then `lda (ptr1),y`, so the armour it weighs is the byte at whatever Y `j_get_stats_ptr` left,
  not `player_armour`. Kept.
- **Two more escapes.** `check_scene_over` drops its caller's return for victory or flight, and
  `do_jinx` pulls the foe index it saved and then its caller's return when a jinxed foe strikes
  another; both port as an Exit after the pulls.
- **The differential harness needed a sane battle.** TRAINERS has to be loaded (begin_combat calls
  its `j_active_char_*` hooks), the arena's disk in the drive, the foe slots cleared before
  `initialize_arena` (or it loops looking for a free one), and a missile's deltas never both zero
  (or it never leaves its square); a case stops only at the labels a step jumps to, never at the
  ones it calls, since the port calls those without dispatching. The smoke towne disk gained its
  arenas (`CONA`, the inn's, among them).

## Phase 9b-2 findings

- **The spells' guards escape.** `combat_only`, `dungeon_only`, `outdoors_only`, `not_abyss` and
  `spell_effect` (under a negation) drop their caller's return and jump to `failed`; their ports
  return that Exit, and each spell runs the rest of itself only when the guard returned. `spell_gate`
  JMPs to `outdoors_only` rather than calling it, so its two pulls drop whatever the spell's own
  caller left on the stack. Kept, and since `outdoors_only` is both called and jumped to, the
  differential cases cannot stop there.
- **The originals' quirks, kept:** `spell_sleep` compares a foe with `tile_balron` after
  `is_undead` has left $FF in A, so a balron can be put to sleep; `spell_blink` with no direction
  steps by nothing and never stops (the differential gives it arrows only); `legal_move_world_twn`
  onto the party's own square returns with carry set by its compare; `fire_world_missile` leaves X
  at $FF when nothing is in the way, since `any_obj_at_temp_xy` counts X down; `spawn_world`'s `adc`
  after two `asl`s can never carry.
- **A monster's attack no longer leaves a JS frame behind in Britannia.** `player_attacked` pulls
  `mob_world_take_turn`'s and `mobs_act`'s returns; ULT4's `update_player_health` now calls
  `mobs_act` with `sub`, so the jump to `do_attack` comes back up as an Exit. The townes' and
  dungeons' branches still JMP to lifted code, which runs inside a nested call as before.
- **`Ult4` is abstract.** It declares `check_water_hazards`, `spawn_monsters` and `mobs_act`, which
  only the last subclass, `Ult4Monsters`, ports; the module instantiates that one. TypeScript's
  private names share one namespace down the chain, so a subclass's helper cannot reuse a name its
  ancestors use privately (combat's `try_move` and the monsters' own step are why the latter is
  `mobTryMove`).
- **The generator needed rigging.** The differential harness randomizes SUBS's sixteen-byte
  generator, but `spawn_world` goes on only when the next number is a multiple of sixteen. Its
  cases work out the next number as `rand` would and pick the `rnd0` that gives one, since `rnd0` is
  added last. The pirate ships' turns, the missiles and the stepping checks needed setups of their
  own (a ship in each facing, a monster in line with the party, a square it just left), and a few
  mutations show only over 150 random states.
- **`MIX` is filler on the smoke Britannia disk**, so the Mix command's case puts the towne disk in
  the drive, whose lifted `MIX` runs and is left with ESC.

## Phase 9c-1 findings

- **9c is split.** LORD, HELP and SHRN are about 2,200 lines, and the ULT4 commands no phase named
  (Attack, Enter, Fire, Get, Ignite, Jimmy, Locate, New order, Open, Quit, Ready, Wear, Ztats) about
  as many again, so 9c-1 ports the overlays and 9c-2 the commands.
- **LORD and HELP BRUN each other.** LORD's HELP subject does `jsr j_primm_cout` with `BRUN HELP`,
  which never returns; HELP drops the two frames that leaves (primm_cout's and DOS's own) and ends
  with `BRUN LORD`, which enters LORD at $8800 to drop them again and ask the next question. Their
  ports push primm_cout's return address and return its address as the Exit, a JSR that ends the
  native routine, so no call is left waiting. LORD keeps a second entry, `talk_lord_british`
  ($8807), for ULT4's talk command.
- **The originals' quirks, kept:** SHRN's check for no cycles reads the flags of its `cmp #$04`,
  not the count, so none is never refused and meditates 256 times (`shrines` does not ask for it);
  LORD's level comes from halving the experience's high byte (in binary, after decoding it from BCD)
  until it is empty, plus one; the stats a level raises gain one more than `rand & 7`, in BCD, by an
  `adc` after `sec`; LORD, SHRN and ULT4 each carry their own copies of `decode_bcd_value` or the
  virtue routines.
- **SHRN's delays count nothing.** `short_delay` is 255 × 255 empty loops ending on the keyboard
  strobe; the port does only the strobe reads, so the native game skips the waits. The lifted code
  spends 26 million cycles on one cycle's dots, past the differential harness's 50 million-cycle
  step limit over three cycles, so its cases may set their own (`ICase.cycles`).
- **Keys typed during meditation are thrown away.** SUBS's `scankey` takes a key from the latch into
  the type-ahead buffer as it prints each dot, and SHRN empties the buffer after the dots. A
  machine `press` returns once the key is in the buffer, not when the game uses it, so specs and
  cases that type ahead lose the mantra: `runOverlay` now waits for the buffer to empty after each
  key, as the scenarios do, and the cases' pages take a letter, never SPACE, which empties the
  buffer of whatever is still in it. A mantra's first key waits 300 polls, past the dots.
- **The end state is not enough for a talk.** A long talk with Lord British scrolls its first
  answers off the screen, so a wrong one leaves no trace in the memory the differential compares;
  mutation testing missed a wrong welcome that way. Cases may now set `ICase.screen`, which folds
  every write to the hi-res screen into a hash both sides must share; LORD, HELP and SHRN set it.
  Two mutants survive, and cannot be caught: LORD's level-up caps a stat with `cmp #$51` / `bcc`,
  and `cmp #$50` gives the same $50; SHRN's Super-Packer ORs the rune onto a view it has just
  cleared, so storing it instead looks the same.


## Phase 9c-2 findings

- **ULT4's Britannia is native.** `Ult4Commands` (`ult4-commands.ts`, its data in
  `ult4-commands-data.ts`) is the last of ULT4's subclasses, and the module now builds it: 87
  entries, from Attack to `is_evil`. What stays lifted is the townes' (Talk, the shops,
  `mobs_act_towne`) and the dungeons' (`spawn_dungeon`, `mobs_act_dungeon`, `dng_check_attacked`,
  the rooms and their exits), for phases 10 and 11. The labels the other subclasses still listed as
  lifted moved to `COMMAND_ENTRIES`, and the spells' list emptied.
- **The bridge trolls drop the turn's frame.** `tile_effect` ends a troll ambush with `pla` / `pla`
  / `jmp init_combat`, as the remaster's BUGFIX says it was entered from the main loop. Called
  through the machine, the fight would run inside that call and never unwind, so `next_turn` now
  calls `tileEffect`, abstract in `Ult4`, by `sub`, and passes its Exit on.
- **A fall-through to a label the differential stops at goes back through the dispatcher.**
  `check_on_foot` falls into `begin_dng_load` and `print_shrine` into `load_shrine`; the lifted
  code stops there, so the port returns those labels as Exits rather than calling them.
- **The originals' quirks, kept:** `recover_mp` counts down to player 0, past the party;
  `poison_all` stops at the first player not in good health rather than skipping them; Jimmy asks a
  direction even in Britannia, where it then refuses; Ztats shows a level as the maximum hit points'
  high byte; a chest's trap springs on no one when `curr_player` is 0; `is_evil` spares the sea
  horse, rat, bat, spider, insects and python.
- **The ground under the party comes from the map's chunks, every turn.** `update_view` reads
  `tile_under_player` from the four chunks at (`tile_xpos`, `tile_ypos`), the party's place in the
  tile cache, not its Britannia coordinates; the scenario sets a tile there and passes a turn. A
  step is judged on the neighbours the last update read, so poking the square ahead does not change
  it.
- **Disk prompts take one ESC, once the game waits at them.** Keys pressed while a towne or a
  dungeon loads go into the type-ahead buffer and come back as commands (WHAT?), and
  `Session.pressUntil` stops at each key read, which a load's printing does at every character; so
  `townes` idles until the prompt waits, presses ESC, and runs to the next turn.
- **The harness's disks.** The smoke disks had no towne or dungeon maps, so every load stopped at
  FILE NOT FOUND; they now carry filler `MAP@` to `MAPP` and `DNG0` to `DNG7`. The harness does not
  swap disks at a prompt, so the towne cases have two drives, the towne disk in the first and
  Britannia's in the second, as the towne's loads ask for them.
- **Two mutants survive, and cannot be caught.** A `sub`'s JSR site only changes the return address
  on the stack, which the differential does not compare (Ready's and Wear's newline); and
  `eat_food`'s `clc` when the food runs out follows a `sbc` whose borrow already cleared carry.
  The rest, 63 of 65, are caught: for those that needed it the cases weight their setups (the
  objects an attack makes over, places' own tiles, a ship with targets all round, sleep traps in a
  fight) and rig the generator for the bridge trolls, as the monsters' cases do.

## Phase 10a findings

- **The townes' half of ULT4 is native.** `Ult4Townes` (`ult4-townes.ts`, its data in
  `ult4-townes-data.ts`) sits under `Ult4Commands` and is what the module builds now: Talk and
  `mobs_act_towne`. Only the dungeons' code is still lifted in ULT4 (`spawn_dungeon`,
  `mobs_act_dungeon`, `dng_check_attacked`, the rooms), for phase 11.
- **A shop is found by the row talked across.** `input_direction` leaves the target square's row in
  `dest_y`, and `check_shop` compares it with the towne's eight rows in SHPS (loaded at $8800, eight
  bytes a towne); row 24 in Paws is the horse seller (SHP8) and row 25 in the castle is Hawkwind
  (SHP9). Only a shopkeeper across a sign (tiles $60 to $7D) is a shop; anyone else is talked to
  directly.
- **The dialogue is one sector, read by ULT4 before TALK loads.** Track = location − 1, sector =
  `npc_dialogue` − 1, into $EF00: ten strings each ended by a character without its high bit, the
  two four-letter words at $EFF5, the string their question follows at $EFFD (5 or 6, the person's
  first or second word), humility at $EFFE and the chance of turning away at $EFFF. A companion is
  always record 0 and the last object slot, which is how `check_join` recognises one.
- **TALK's quirks, kept:** `start_combat` turns hostile the object at `zp_index`, which
  `compare_keywords` overwrites with the word's index, so a fight drawn after a word may turn the
  wrong slot; `print_string` never carries into the pointer's high byte; `dec_virtue` leaves a
  wrapped value when a virtue below the amount borrows (only an exact borrow to nothing leaves one);
  a question waits for a key before it is asked.
- **The telescope suspends the game.** SEAR sets `game_mode` to 0 while TMAP is up, and the towne's
  TMAP is Britannia's but for `flash_location`, which returns at once then, so the party's cell is
  not marked. A key typed while SEAR loads the map goes into SUBS's type-ahead buffer, which TMAP
  never reads, so the harness holds TMAP's key back 5,000 polls.
- **Shared overlay code.** USE's, SEAR's and the word input TALK and USE use are each the same in
  Britannia's and the townes' copies but for where they live, so they are base classes now
  (`use-overlay.ts`, `search-overlay.ts`, `keyword-overlay.ts`), each overlay passing its addresses.
  `overlay.ts` moved up from `britannia/` and takes the disk.
- **A native waitkey must stop where the 6502 would.** A scenario waits for the type-ahead buffer to
  empty before pressing the next key. The lifted code is stopped between instructions right after
  `getkey` empties it; native SUBS ran on inside `getnumber` to the next poll first, so the scenario's
  next key came one poll later and the towne's animation drew one more line (the beggar's amount, the
  first `getnumber` from native code in any scenario). `waitkey` is now a checkpoint when it takes a
  key from the buffer.
- **The harness's towne disk.** The smoke towne disk now carries SHPS (a filler of rows within the
  towne) and a townsperson's record in every sector of its raw tracks, from `dialogue.ts`, which the
  TALK cases also put at $EF00 themselves. The trainers are loaded for Talk, whose first call is the
  teleport trainer. A beggar's `j_getnumber` waits for a digit, so every GIVE in the cases' keys is
  followed by an amount, and the shops' keys end with the answers most of them take to leave.
- **Eight mutants survive.** Seven cannot be caught: the music Talk and the shops set (the
  harness's `music_ctl` is an RTS), three `sub`/`jsrOut` JSR sites (the stack is not compared),
  `check_direct`'s dungeon test, which `get_mob_at_temp_xy` makes unreachable by finding no one in a
  dungeon, and `decline_reason`'s loop bound, which changes only X before the next print overwrites
  it. One is out of the random states' reach: the prompt's fight margin, whose roll comes after the
  idle animation has consumed the generator. The other 56 of 64 are caught, some only once the cases
  put the party on a shop's row, weighted the companion's experience and the near-Avatar's last
  virtue, and rigged the first roll for the meeting's fight margin.
