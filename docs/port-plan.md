# Ultima IV port — Apple II *Ultima IV: Quest of the Avatar* as `apps/Ultima4`

> **Draft plan.** Status is tracked in [`docs/PLAN.md`](../PLAN.md) item AJ. No phase starts until the open
> decisions below are answered. Questions go to the user one at a time, and each answer is recorded here in the
> same session.
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
- `fixed` (`428a793`): the same code plus about 70 listed bug fixes and the opt-in "hidden features" (trainers, a
  non-binary answer at creation, per-player dungeon turns, a music toggle).

### What the source looks like

- **About 30,000 non-comment lines across 38 files**, one per binary, grouped by the four disks:
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
- **The game uses non-local exits.** `SUBS.s` saves the stack pointer (`err_resume_stack`) and later unwinds to
  it. Most of the remaster's "critical" fixes are stack overflows from paths that leave a routine without
  returning.
- **Screen.** The whole screen is hi-res graphics (`hw_FULLSCREEN`, `hw_HIRES`). Text is drawn as glyphs from
  the game's font file (`HTXT`), not by the Apple's text mode.
- **Data stays on the user's disks.** The maps, tiles, conversations, images and music are in the disk files.
  `tools/extract_files.py` and the decoders (`tile_sheet.py`, `font.py`, `spk.py`, `cards.py`,
  `end_screens.py`) document the formats.

### Licence

`u4remasteredA2` has **no licence file**, so it is read and cited, never copied. That covers its assembly, its
Python tools and `src/talk/talk.json`. The game is still EA's. As with Wizardry, nothing from the original
disks is committed: the player brings their own four disk images, and everything derived from them stays in the
browser or in gitignored folders.

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
- `tools/lift/` (dev only, if D3 is accepted): a lifter that turns 6502 source into TypeScript.

## Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Location.** `apps/Ultima4` in this monorepo; extracted to `getzinj/ultima4-angular` in the last phase | Proposed |
| D2 | **Behaviour baseline.** Port `fixed` (`428a793`), with its hidden features off by default, so retail's stack-overflow crashes are not reproduced. Retail-exact was rejected. The oracle runs disks built from `fixed` | Agreed |
| D3 | **Method.** Recommended: lift first, then hand-port. A lifter turns each `.s` file into instruction-level TS, giving a runnable, faithful baseline early. Each file is then rewritten as structured TS and checked against both the baseline and the oracle. The alternative is to hand-port straight against the oracle, as Akalabeth did. That is cheaper up front, but riskier for `ULT4.s` | **Open** |
| D4 | **Oracle data stays local.** Oracle recordings contain game data, so they are never committed. Only key scripts and per-step SHA-256 digests are committed. CI runs the port on synthetic disks; full fidelity runs locally with `npm run oracle-check -- --disks <dir>` | Proposed |
| D5 | **Sound.** Speaker effects in phase 14. Mockingboard music (two AY-3-8910 chips) as a later, optional phase | **Open** |
| D6 | **Name and publishing.** Unofficial-fan-project wording and bring-your-own-disk, as for Wizardry. Whether to use the name "Ultima IV" in the title and domain is the user's call | **Open** |
| D7 | **Trainers** (the remaster's cheat menu): out of scope unless asked | Proposed |
| D8 | **Persistence.** IndexedDB in the browser only; no login, no server, nothing touches Stonequest's Firebase | Proposed |

## Phases (one PR each)

| Phase | Description | Status |
|---|---|---|
| 0 | **Source notes.** Write `SOURCE-NOTES.md`: pin both source commits; inventory each file (disk, load address, entry points, which jump-table slots it fills); write down the memory map from `include/*.i`; list the data files per disk and their formats; record the licence position. Settle D2–D6 | ⬜ |
| 1 | **Scaffold** `apps/Ultima4`, copied from the Akalabeth scaffold: port 4203, 500 kB budget, `nx.json` ESLint include, the extraction-guard rule (shown to fire), placeholder 280×192 canvas, e2e smoke spec | ⬜ |
| 2 | **Apple II runtime.** Adapt Akalabeth's `HiresScreen`, palette, keyboard and machine; drop the Applesoft parts. Add the full-screen HGR mode, the speaker, and the idle tick the keyboard wait drives. Golden-bitmap specs | ⬜ |
| 3 | **Disks and data.** DOS 3.3 reader; identify all four disks and reject a wrong or misordered one with a reason; extract the files; decoders for tiles, font, packed images, cards, maps and conversations; IndexedDB storage; `npm run inspect-disks`. Synthetic disks for CI | ⬜ |
| 4 | **Oracle.** py65 Apple II with the four disks. Trap the game's RWTS (`$B600`) and serve sectors from the images, so no Disk II emulation is needed. Scripted keys; after each key record the HGR page, zero page, party/roster/map-object memory and RNG state. Scenarios: boot to title, creation, the first steps in Britannia | ⬜ |
| 5 | **Lifter** (if D3). Parse the ca65 source and emit TS per file over a flat 64 KB memory. Handles `.addr` jump tables, inline strings after `jsr`, the `err_resume` stack reset (as a thrown error), overlays as modules loaded at the same address, and stores into code (self-modifying sites listed and handled one by one). Gate: the lifted game boots and matches the oracle's boot scenario | ⬜ |
| 6 | **State model.** Generate typed accessors from `include/*.i` over the 64 KB image; read and write `PRTY`/`ROST`/`LIST` save files | ⬜ |
| 7 | **Core.** `SUBS` (RNG, printing, number input, the idle loop, overlay loading through the jump tables), `BOOT`, `INIT` and `SEL`: title, intro and main menu | ⬜ |
| 8 | **Creation.** `NEWGAME`: the gypsy's questions, the cards and the packed images; the new party written out | ⬜ |
| 9a | **Britannia, part 1.** The `ULT4` command loop, movement and transport (horse, ship, balloon, wind), moons and moongates, `britannia/TMAP`, `SEAR`, `USE`, `HOLE`, `SAVE` | ⬜ |
| 9b | **Combat.** The arenas and combat in `ULT4` (`zp_combat.i`, `arenas.i`), wandering monsters, the inn fight, spells and reagents | ⬜ |
| 9c | **Britannia, part 2.** `LORD` and `HELP` (Lord British), `SHRN` (shrines and meditation), virtues and the quests | ⬜ |
| 10 | **Towns.** `towne/TMAP`, `TALK` (conversations, keywords, humility questions), the shops `SHP0`–`SHP9`, `MIX`, `SEAR`, `USE` | ⬜ |
| 11 | **Dungeons.** `DNGD` (the 3D view, rooms and room exits), `underworld/TMAP`, `SEAR`, `USE`; dungeon combat | ⬜ |
| 12 | **Endgame.** `END`: the Abyss, the Codex questions and the end screens | ⬜ |
| 13 | **Presentation.** The scaling canvas, CRT effect and colours (from Akalabeth); keyboard and touch input; a screen-reader mirror of the message pane; save disks (create, pick, rename, export as a real `.do`, import) | ⬜ |
| 14 | **Sound.** Speaker effects; Mockingboard music if D5 says so | ⬜ |
| 15 | **Hardening.** Local pixel checkpoints against the oracle, accessibility checks, `madge --circular`, a tighter budget, and an error banner for anything the original would not trap | ⬜ |
| 16 | **Deploy and extract.** A GitHub Pages workflow and CNAME as for Akalabeth; `git filter-repo` into `getzinj/ultima4-angular`; remove `apps/Ultima4` and this plan's working copy from here | ⬜ |

Every hand-port phase (7–12) **replaces lifted code** with structured TS, file by file, and is done when the
oracle digests for its scenarios match exactly. If D3 is declined, phase 5 is dropped and phases 7–12 are checked
against the oracle alone.

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
3. **Self-modifying code.** There are 224 stores to `label+1`/`label+2`. Most are pointer setup in zero page
   (`sta ptr1 + 1`), but 63 go to labels not named as pointers, and any that write into code must be found in
   phase 0.
4. **Timing.** The game passes a turn while you idle, and its animations run off the same loop. The pace has to
   be tuned by feel, since there is no reference clock.
5. **Legal.** Disassembly-derived code under no licence, of a game EA still owns. The risk is accepted, not
   cleared, as for Wizardry; the port comes down on request.

## Effort

Expected to be larger than the Moria port, mainly because of phases 4–5 and `ULT4.s`.
