# Ultima IV lifter

Turns the remaster's `fixed` build (`sean-gugler/u4remasteredA2` at `428a793`) into TypeScript, one
module per program, so that the original code runs in the browser before it is rewritten by hand
(D3). The output goes to `src/app/lifted/` and is **not committed**: it is EA's code and program
bytes, which stay out of git like the disks. Generate it locally.

## Lifting

```sh
# cc65 2.19 and GNU Make, and a checkout of the remaster at the pinned commit
npx nx run Ultima4:lift <checkout>
npx nx run Ultima4:lift-gate
```

For each program (everything in `src/patchedgame/` but the Mockingboard drivers, plus
`src/trainer/TRAINERS`), `lift.ts`:

1. builds the `.prg`, `.map` and `.lab` with the remaster's own Makefile;
2. assembles the source again with a listing (`ca65 -l`), which says which bytes each source line
   emitted, and so tells instructions from data, including inside macros;
3. decodes each instruction from the built bytes, checking that it fills its line exactly;
4. writes `<disk>/<program>.ts`, holding the program's image, its labels, and a `run` function with
   one `case` per instruction, plus `lifted-modules.ts` listing all 36.

## How the lifted code runs

`src/app/lifted-runtime/` is committed and has unit tests:

- **`Cpu`** holds the registers and does the arithmetic with py65's semantics, checked against
  vectors exported from py65 (`tools/oracle/export_cpu_vectors.py`).
- **The real stack.** `JSR` pushes and `RTS` pulls, as on the 6502, so `primm`'s inline strings, the
  jump tables, the `err_resume` retry and the frame drops before `BRUN` all work unchanged. Turning
  them into calls and thrown errors is for the hand port.
- **Patch points** (`@x=*+$01`) are read from memory each time. **Opcode stores** are read live
  too; the only ones in lifted code turn SEL's `music_ctl` into `RTS` and back.
- **`LiftedMachine`** runs the modules on an `AppleMachine`, with DOS and the ROM trapped exactly
  as the oracle traps them. A program file the game loads comes from its module, not the disk. A
  write over an instruction byte drops the module's ownership of it, so running it afterwards fails
  instead of running stale code.

## The gate

`gate/` runs the oracle's `creation` scenario on `smoke.py`'s blank data and compares every
snapshot with `gate/creation-blank.json`. That file holds only SHA-256 digests and DOS command
lines; `tools/oracle/export_gate.py` writes it. `gate/run-gate.ts` does the same comparison from
the command line and names the first snapshot and the regions that differ.

The gate is not in CI, because it needs cc65 and the remaster checkout.

## Ported programs

A program ported by hand (`src/app/port/`) is an `INativeModule`: loading its file installs its
variables and tables, and its entry addresses run TypeScript instead of lifted code. Lifted and
ported code call each other, so a program can be ported while its callers are still lifted.
`src/app/port/ported-modules.ts` lists them.

- `gate/run-differential.ts [routine ...] [--seeds n]` runs each routine from the same random
  state lifted and ported, and names every difference. `gate/subs-differential.spec.ts` runs it
  in `lift-gate`.
- `nx run Ultima4:real-gate [--native] [scenario ...]` runs the oracle's scenarios on the disks
  `tools/oracle/build-disks.sh` built from your images, against `tools/oracle/digests/`, with
  the ported programs when `--native` is given.
