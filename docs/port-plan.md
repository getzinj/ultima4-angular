# Ultima IV port — Apple II *Ultima IV: Quest of the Avatar* as `apps/Ultima4`

> **Live plan.** Status is tracked in [`docs/PLAN.md`](../PLAN.md) item AJ. D2, D3, D5 and D6 were agreed on
> 2026-10-24; D1, D4, D7 and D8 are proposed defaults that stand unless changed. Questions go to the user one at a
> time, and each answer is recorded here in the same session. Source findings are in
> [`2026-10-ultima4-source-notes.md`](2026-10-ultima4-source-notes.md).
>
> **Legend:** ✅ Done · 🟡 Partial · ⬜ Not started

## Context

This is the fourth port in the family, after Wizardry ([`getzinj/wizardry-angular`](https://github.com/getzinj/wizardry-angular),
UCSD Pascal), Moria ([`getzinj/moria-angular`](https://github.com/getzinj/moria-angular), VAX Pascal) and Akalabeth
([`getzinj/akalabeth-angular`](https://github.com/getzinj/akalabeth-angular), Applesoft). Like Moria and Akalabeth,
it is built here as a new Nx app and extracted to its own repo at the end.

The source is Sean Gugler's disassembly, [`sean-gugler/u4remasteredA2`](https://github.com/sean-gugler/u4remasteredA2):
ca65 6502 assembly that rebuilds byte-exact disk images. Two branches matter:

- `documented` (`7016e9d`): the retail game with labels and comments. This is what gets read.
- `fixed` (`428a793`): the same code plus about 70 listed bug fixes and 18 enhancements. Only the trainers are
  opt-in; the rest (a non-binary answer at creation, per-player turns, a music toggle, saving in dungeons) are
  always available.

### What the source looks like

- **29,717 non-comment lines across 36 files** on `fixed`, one per binary, grouped by the four disks:
  - `program`: `ULT4` (9.4k lines, holding the command loop, movement and combat), `SUBS` (shared routines, the
    RNG and the idle loop), `BOOT`, `INIT`, `SEL`, `NEWGAME` (the gypsy), and `MBSI`/`MBSM` (Mockingboard).
  - `britannia`: `TMAP`, `SEAR`, `USE`, `HOLE` (camping), `HELP`, `SAVE`, `LORD` (Lord British) and `SHRN`
    (shrines).
  - `towne`: `TMAP`, `TALK`, `MIX` (reagents), `SEAR`, `USE` and the shops `SHP0`–`SHP9`.
  - `underworld`: `DNGD` (the 3D view and rooms), `TMAP`, `SEAR`, `USE` and `END` (the Abyss and the Codex).
- **The memory map is in `src/include/*.i`.** It covers zero page (`zp_main`, `zp_combat` and the rest), the
  party and roster records (`PRTY.i`, `ROST.i`), `tables`, `map_objects` and `tiles`. The load addresses are in
  the `.cfg` files.
- **Overlays.** Each disk's code loads at the same address (`$8800`, see `overlay8800.cfg`) and is reached
  through the fixed jump tables in `jump_overlay.i`, `jump_subs.i` and `jump_system.i`.
- **The game uses non-local exits.** `SUBS.s` saves the stack pointer (`err_resume_stack`) so a failed DOS
  command can be retried from a clean stack, and several overlays drop frames on entry. Most of the remaster's "critical" fixes are stack overflows from paths that leave a routine without
  returning.
- **Screen.** The whole screen is hi-res graphics (`hw_FULLSCREEN`, `hw_HIRES`). Text is drawn as glyphs from
  the game's font file (`HTXT`), not by the Apple's text mode.
- **Data stays on the user's disks.** The maps, tiles, conversations, images and music are in the disk files.
  `tools/extract_files.py` and the decoders (`tile_sheet.py`, `font.py`, `spk.py`, `cards.py`,
  `end_screens.py`) document the formats.

### Licence

`u4remasteredA2` has no licence file, but its README licenses Gugler's own work (symbol names, comments, fixes,
tools) under CC BY-SA 4.0, which may be adapted into GPL-3.0 code with credit. The disassembled code, the dialogue
in `src/talk/talk.json` and the save files are EA's content and are never vendored (source notes, §Licence). As with Wizardry, nothing from the original
disks is committed: the player brings their own four disk images, and everything derived from them stays in the
browser or in gitignored folders. The same goes for the lifter's output (phase 5), which is generated locally.

## Lessons carried over

- **From Wizardry:** the runtime/data/port/ui split; the bring-your-own-disk import, which checks each disk on
  arrival and explains a wrong one; keeping a master disk and playing on copies; exporting saves as real disk
  images; a CLI that runs the same disk checks; a built-in stand-in font so CI needs no game data.
- **From Akalabeth:** the `hires-screen`, palette, CRT presenter, touch pad and screen-reader mirror; an offline
  py65 oracle that runs the original code; checking against the oracle key by key; pixel e2e checkpoints; the
  scaffold, extraction guard and deploy workflow.
- **From Moria:** one TS file per source file; a header comment citing the origin of each routine; all game
  state in one object; every routine that can wait for a key is `async`; non-local exits become a thrown error
  caught where the original's stack reset lands.

## Architecture (`apps/Ultima4/src/app/`)

- `runtime/`: an Apple II with nothing game-specific in it. It has a full-screen HGR page, a keyboard latch
  with the original's idle tick (the game passes a turn when you don't type), a speaker, a clock and the RNG.
- `data/`: a DOS 3.3 `.do` reader (Wizardry's reader handles Pascal disks only, so this is new), disk
  identification, the file extractor, and decoders for the tiles, font, packed images, cards, the world map in
  chunks, the town and dungeon maps, and the conversations. Saves (`PRTY`/`ROST`/`LIST`) are written back into
  the save disk's image.
- `state/`: typed accessors generated from `src/include/*.i`, over a real 64 KB memory image. Keeping state at
  its original addresses lets the oracle compare memory byte for byte after every key.
- `port/`: one file per `.s` file, named after it (`subs.ts`, `ult4.ts`, `britannia/lord.ts`, `towne/shp3.ts`,
  …). Each routine cites `ULT4.s:412 cmd_direction_up`. Register passing becomes parameters and return values,
  and a carry-flag result becomes a boolean.
- `renderers/`: the tile view, the status and message panes, the dungeon view, and the full-screen images. All
  draw into the HGR page through an `IPainter` seam, as in Akalabeth.
- `ui/`: the canvas, the CRT presenter, input, settings and disk import.
- `tools/oracle/` (dev only, offline): py65 running the original binaries.
- `tools/lift/` (dev only, D3): a lifter that turns 6502 source into TypeScript.

## Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Location.** `apps/Ultima4` in this monorepo; extracted to `getzinj/ultima4-angular` in the last phase | Proposed |
| D2 | **Behaviour baseline.** Port `fixed` (`428a793`), with its trainers off by default, so retail's stack-overflow crashes are not reproduced. Phase 0 found the other "hidden features" are always on in `fixed`, so they come with it. Retail-exact was rejected. The oracle runs disks built from `fixed` | Agreed |
| D3 | **Method.** Lift first, then hand-port. A lifter (phase 5) turns each `.s` file into instruction-level TS, giving a runnable, faithful baseline early. Each file is then rewritten as structured TS (phases 7–12) and checked against both the baseline and the oracle. Hand-porting straight against the oracle was rejected | Agreed |
| D4 | **Oracle data stays local.** Oracle recordings contain game data, so they are never committed. Only key scripts and per-step SHA-256 digests are committed. CI runs the port on synthetic disks; full fidelity runs locally with `npm run oracle-check -- --disks <dir>` | Proposed |
| D5 | **Sound.** Speaker effects in phase 14. Mockingboard music (`MBSI`/`MBSM`, two AY-3-8910 chips in Web Audio) is phase 17, optional, after the game is released | Agreed |
| D6 | **Name and publishing.** Use the name, as Wizardry does: titled *Ultima IV*, a public repo, deployed at `ultima4.stonequest.org`, with the unofficial-fan-project notice and bring-your-own-disk. It comes down without argument if the rights holder asks | Agreed |
| D7 | **Trainers** (the remaster's cheat menu): out of scope unless asked | Proposed |
| D8 | **Persistence.** IndexedDB in the browser only; no login, no server, nothing touches Stonequest's Firebase | Proposed |
| D9 | **CPU.** The oracle, and so the lifter and the port, model a 65C02, the enhanced IIe that the ROM stub answers as. The game was written for the II+'s 6502, so its code runs the same on both; the two CPUs differ only in undefined flags and cycle counts | Proposed |

## Phases (one PR each)

| Phase | Description | Status |
|---|---|---|
| 0 | **Source notes.** Pin both source commits; inventory each file (disk, load address, entry points, which jump-table slots it fills); write down the memory map from `include/*.i`; list the data files per disk and their formats; record the licence position. D2, D3, D5 and D6 are settled | ✅ [`2026-10-ultima4-source-notes.md`](2026-10-ultima4-source-notes.md): both commits pinned; 36 code files with disk, load address, loader and entry points; the memory map; every data file and the raw-sector areas (world map, conversations, dungeon rooms); the licence is CC BY-SA 4.0 for Gugler's work, not none. Found: the game drives real DOS 3.3 and writes saves with `BSAVE`; `fixed` also patches data files and rebuilds the conversations in a new layout; 61 operand patch points and one opcode store are the only self-modifying code; idle animation consumes the RNG, so oracle keys need tick counts; one idle tick is about 94 ms |
| 1 | **Scaffold** `apps/Ultima4`, copied from the Akalabeth scaffold: port 4203, 500 kB budget, `nx.json` ESLint include, the extraction-guard rule (shown to fire), placeholder 280×192 canvas, e2e smoke spec | ✅ `apps/Ultima4` copied from Akalabeth's `58a0bfb` scaffold (with its later e2e port fix), renamed, on port 4203; `NOTICE` credits EA and Gugler (CC BY-SA 4.0); `nx.json` ESLint include; a `no-restricted-imports` guard on `@getzinj/*`, `@app/*`, `apps/Stonequest` and `libs`, shown to fail on a deliberate import; CI removes and uploads `apps/*/e2e/playwright-report/` and frees `E2E_PORT + 1` too, since Ultima4's e2e takes that port. Lint, typecheck, 7 unit tests, the production build (107 kB initial) and the e2e smoke spec pass |
| 2 | **Apple II runtime.** Adapt Akalabeth's `HiresScreen`, palette, keyboard and machine; drop the Applesoft parts. Add the full-screen HGR mode, the speaker, and the idle tick the keyboard wait drives. Golden-bitmap specs | ✅ `apps/Ultima4/src/app/runtime/`: `AppleMachine`, a 64 KB IIe (48 KB main RAM, soft switches for the keyboard, speaker and display, everything else in `$C000`-`$CFFF` reading zero); `LanguageCard` with the IIe's bank and double-read write-enable rules (the game uses `$C081`, `$C083` and `$C08B`); a ROM stub answering only the machine-ID bytes (enhanced IIe), since no ROM is distributed; `VideoSwitches`; `renderHires` and `hiresToAscii` over any page, with the palette copied from Akalabeth; `Keyboard` as a `$C000`/`$C010` latch with Ctrl+letter (for Ctrl+V) and the IIe arrows; `Speaker`, which keeps the cycles of each `$C030` flip and turns them into a square wave; `Clock`, which counts cycles and sleeps in real time only where the original waited, with `delayLoopCycles` giving 96,309 cycles (about 94 ms) for one idle tick. Applesoft parts not copied. A test pattern (frame and six colour bars) is drawn through the switches and memory until there is a game. 82 unit tests with ASCII goldens and RGBA checks; 3 Playwright specs, two of them reading canvas pixels; lint and build pass (128 kB initial). The real idle loop and its RNG calls come with `SUBS` in phase 7 |
| 3 | **Disks and data.** DOS 3.3 reader and writer (`BSAVE` of the save files); `.po` reordered, nibble images refused; identify all four disks and reject a wrong or misordered one with a reason; extract the files and the raw-sector areas; apply `fixed`'s data patches; convert the retail conversations to `fixed`'s layout and apply its corrections; decoders for tiles, font, packed images, cards, maps and conversations; IndexedDB storage; `npm run inspect-disks`. Synthetic disks for CI | ✅ `apps/Ultima4/src/app/data/`: `disk-image` (`.do`/`.dsk`/`.po`/`.2mg`; nibble and WOZ refused with a reason); `dos33` (catalog, BLOAD, a BSAVE that keeps clear of each disk's raw tracks, a formatter for synthetic disks); `ultima-disks` (each disk identified by its `DISK` file, as the game does, and its required files checked); `raw-areas` (world map, talk and room sectors); `data-patches` (the remaster's 26); conversations converted from the retail to the remaster's layout with `talk-corrections` (112 text and 9 value corrections, generated by `tools/generate-talk-corrections.ts`, stored as edits plus a SHA-256 of each retail field, not as text); decoders for tiles, font, Super Packer slides, cards, towne maps and object tables, dungeon levels, arenas and rooms; `GameDisks` (working copies of the masters with all of that applied); `disk-storage` (masters in IndexedDB); an import screen before the test pattern; `nx run Ultima4:inspect-disks`. The generator confirmed the retail decoder round-trips all 256 of `documented`'s conversations, the corrections turn them into `fixed`'s, and the encoder's output is byte-identical to `gen_talk.py`'s `TLK.bin`. 193 unit tests and 6 e2e specs on synthetic disks; 172 kB initial. No real disk image has been read yet |
| 4 | **Oracle.** py65 Apple II with the four disks. Disks built from `fixed` with its own `make all`. Trap DOS's RWTS entry (`$B7B5`, IOB at `$B7E8`) and serve sectors from the images, so no Disk II emulation is needed. Scripted keys, each with its idle-tick count; after each key record the HGR page, zero page, party/roster/map-object memory and RNG state. Scenarios: boot to title, creation, the first steps in Britannia | 🟡 Harness done; recording waits on the real disks. `apps/Ultima4/tools/oracle/`: `machine.py` (an Apple IIe in py65's 65C02, with no DOS or ROM: `COUT`, `HOME`, DOS's hook and output handler, and RWTS's entry are trapped, and DOS commands are run against the disk images); `scenarios.py` (`boot-to-title`, `creation`, `first-steps`, written from the source, with keys timed in keyboard polls); `record.py` (local recordings, committed digests); `build-disks.sh` (the remaster's own build from your four images, at the pinned commit). Checked without the game: 23 unit tests on hand-written programs and synthetic disks; `smoke.py` runs the remaster's assembled `INIT`, `SEL`, `SUBS`, `BOOT`, `NEWGAME` and `ULT4` on blank data, through boot, the menu, the name and gender prompts, `NEWGAME`'s slides and seven questions (51 keys), and `BRUN ULT4`, into Britannia. Two runs give identical digests over all 53 snapshots. Left to do: `build-disks.sh` and `record.py` on your disks, then commit `digests/` |
| 5 | **Lifter** (D3). Parse the ca65 source and emit TS per file over a flat 64 KB memory. Models the carry flag (`fastrand` depends on it). Handles `.addr` jump tables, inline strings after `jsr` (and the DOS command strings patched at run time), the `err_resume` retry and frame drops (as thrown errors), overlays as modules loaded at the same address, and the 61 operand patch points plus one opcode store listed in the source notes. Gate: the lifted game boots and matches the oracle's boot scenario | ✅ `apps/Ultima4/tools/lift/` (`nx run Ultima4:lift <checkout>`): each program is built with the remaster's Makefile and assembled again with a `ca65` listing, which separates instructions from data. The result is one TS module per program (36 modules, 20,096 instructions), each a `switch` with one case per instruction, in the gitignored `src/app/lifted/`. It is not committed, because it is EA's code and bytes. `src/app/lifted-runtime/`: `Cpu` with py65's semantics, checked against py65 vectors, and `LiftedMachine`, which runs the modules on an `AppleMachine` with the oracle's DOS and ROM traps. Changed from the plan: the real 6502 stack is kept, so the jump tables, inline strings, `err_resume` and frame drops work unchanged, and thrown errors move to the hand port. Patch points and opcode stores are read live; there are three opcode stores, not one. Writing over any other instruction makes running it fail. Gate (`nx run Ultima4:lift-gate`, local only, since it needs cc65): the oracle's `creation` scenario on blank data, which includes boot, matches at all 53 snapshots; a one-bit `ADC` fault breaks it. 67 new unit tests run in CI. The real-disk comparison waits on phase 4's recordings |
| 6 | **State model.** Generate typed accessors from `include/*.i` over the 64 KB image; read and write `PRTY`/`ROST`/`LIST` save files | ✅ `apps/Ultima4/tools/symbols/` (`nx run Ultima4:generate-symbols <checkout>`) reads every `include/*.i` as ca65 does: expressions, names from other files, `\` continuations, macro bodies skipped. It writes `src/app/state/symbols.ts`: 956 constants under Gugler's names, one object per file (`PRTY`, `ROST`, `MAP_OBJECTS`, …). Character constants go through `uscii.i`'s charmap, as in the game, so `ROST.status_Good` is `$C7`, not `'G'`. `nx run Ultima4:verify-symbols` assembles every symbol with ca65 and finds 0 of 956 differ. The accessors are written by hand over those constants, because the include files don't say how wide a field is or how it is encoded. They are views read and written in place over an `IStateMemory`: a flat 64 KB image, or a running `AppleMachine`'s RAM and language card, whichever way its switches are set. `Party` reads `PRTY` by field name and the move counter as 8 BCD digits. `RosterCharacter` covers the eight slots: high-bit names of up to 15 characters, and BCD stats, hit points and experience. `PartyStats` covers virtues, counts, food with its hundredths, gold, and the stone, rune and key bits. `MapObject` covers 32 objects, each field in its own 32-byte slice. `GameState` bundles them all. `loadSaveFiles`/`storeSaveFiles` handle `PRTY` (`$00`, 32 bytes), `ROST` (`$EC00`, 512) and `LIST` (`$EE00`, 256) on the britannia disk, and `NPRT`/`NRST`/`NLST` on the program disk; a file of the wrong length is refused. Checked against the game: after the lifted creation run, the views read the party in Britannia, a party of one, the name typed and the gender chosen (4 gate tests, local). 71 new unit tests |
| 7 | **Core.** `SUBS` (RNG, printing, number input, the idle loop, overlay loading through the jump tables), `BOOT`, `INIT` and `SEL`: title, intro and main menu | ⬜ |
| 8 | **Creation.** `NEWGAME`: the gypsy's questions, the cards and the packed images; the new party written out | ⬜ |
| 9a | **Britannia, part 1.** The `ULT4` command loop, movement and transport (horse, ship, balloon, wind), moons and moongates, `britannia/TMAP`, `SEAR`, `USE`, `HOLE`, `SAVE` | ⬜ |
| 9b | **Combat.** The arenas and combat in `ULT4` (`zp_combat.i`, `arenas.i`), wandering monsters, the inn fight, spells and reagents | ⬜ |
| 9c | **Britannia, part 2.** `LORD` and `HELP` (Lord British), `SHRN` (shrines and meditation), virtues and the quests | ⬜ |
| 10 | **Towns.** `towne/TMAP`, `TALK` (conversations, keywords, humility questions), the shops `SHP0`–`SHP9`, `MIX`, `SEAR`, `USE` | ⬜ |
| 11 | **Dungeons.** `DNGD` (the 3D view, rooms and room exits), `underworld/TMAP`, `SEAR`, `USE`; dungeon combat | ⬜ |
| 12 | **Endgame.** `END`: the Abyss, the Codex questions and the end screens | ⬜ |
| 13 | **Presentation.** The scaling canvas, CRT effect and colours (from Akalabeth); keyboard and touch input; a screen-reader mirror of the message pane; save disks (create, pick, rename, export as a real `.do`, import) | ⬜ |
| 14 | **Sound.** Speaker effects (`sound.i`) | ⬜ |
| 15 | **Hardening.** Local pixel checkpoints against the oracle, accessibility checks, `madge --circular`, a tighter budget, and an error banner for anything the original would not trap | ⬜ |
| 16 | **Deploy and extract.** A GitHub Pages workflow and a CNAME for `ultima4.stonequest.org`, as for Akalabeth; `git filter-repo` into `getzinj/ultima4-angular`; remove `apps/Ultima4` and this plan's working copy from here | ⬜ |
| 17 | **Mockingboard music** (optional, D5). `MBSI`/`MBSM` ported, with two AY-3-8910 chips emulated in Web Audio; the music toggle from `fixed` | ⬜ |

Every hand-port phase (7–12) **replaces lifted code** with structured TS, file by file, and is done when the
oracle digests for its scenarios match exactly.

## Verification

- Per change: lint, unit tests, build and e2e for `apps/Ultima4` through `nx`.
- Fidelity: zero differences from the oracle (HGR page, tracked memory, RNG) over each phase's scenarios, run
  locally with the user's disks.
- CI: synthetic-disk specs only, since the game's data is not available there.

## Risks

1. **`ULT4.s` is a third of the game** and holds the command loop, movement and combat together. Splitting it
   across 9a–9c may need shared context objects, as Moria's `dungeon` did.
2. **The non-local exits** must land where the original's stack reset lands. If they don't, the remaster's
   stack bugs come back in another form.
3. **Self-modifying code.** Smaller than feared: 61 operand patch points (32 of them in `DNGD`), all in fast copy
   and draw loops, and three opcode stores (two of them toggle `music_ctl`), all listed in the source notes.
4. **Timing.** The game passes a turn while you idle, and idle animation consumes the RNG. One idle tick is about
   94 ms at 1.023 MHz and the pass timeout is 128 ticks, so the pace has a reference; the tick count per key
   must match the oracle exactly.
5. **Legal.** Disassembly-derived code of a game EA still owns; only Gugler's own work carries a licence. The risk is accepted, not
   cleared, as for Wizardry; the port comes down on request.

## Effort

Expected to be larger than the Moria port, mainly because of phases 4–5 and `ULT4.s`.
