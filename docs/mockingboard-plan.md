# Phase 17 plan: Mockingboard music

> **Status: planned, not started.** Phase 17 of [`port-plan.md`](port-plan.md) is optional (D5). This file is the
> plan to pick it up from. Until it is done, `src/app/port/program/mbsi.ts` stands in for `MBSI`: choosing
> "Activate Sound Board" on the main menu goes back to the menu, as on an Apple whose board does not answer.

## Context

The port plays the Apple speaker's clicks (phase 14) but no music. On the Apple, *Ultima IV* plays music only with
a Mockingboard: a slot card with a 6522 VIA in front of an AY-3-8910 sound chip, or two of them on one card. This
phase would add:

- the tune for each place: the overworld, townes, castles, dungeons, combat, shrines and Lord British's hall;
- the in-game Music command (Ctrl+V) to mute and unmute it.

The music is on the player's disks (`MUSB`, `MUSC`, `MUSD`, `MUSO`, `MUST`), so nothing from the game ships with
the port.

## What the original does

Read from the remaster at the pinned commit: `src/patchedgame/program/MBSI.s`, `MBSM.s`, `SEL.s` and `BOOT.s`.

### Choosing a board

BOOT's menu offers "Activate Sound Board" (`BOOT.s:857-1031`). It asks for one board or two, the kind of each, and
its slot; the kinds are the Mockingboard A, B and C, plus the remaster's Echo+. It then:

1. BLOADs `MBSM` at `$F000` and `MBSI` at `$8000`;
2. calls `jsr j_mbsi`;
3. with carry set:
   - stores a JMP back over SEL's `music_ctl`, where INIT had stored RTS;
   - loads the towne music (`MUST`) and plays "explore";
   - marks the board active.

### `MBSI` (447 lines): set-up

1. Relocates `MBSM`: `$F000-$F3F7` goes to the text page (`$0400-$07F7`, skipping DOS's 8 bytes at the end of
   each half page), and `$F400-$F7FF` goes to `$FD00-$FFFF`. It keeps the interrupt vectors.
2. Works out the PSG I/O bases (`$Cn00` for socket A, `$Cn80` for B) and the channel tables:
   - 3 voices for one board (`one_mb_table`);
   - 6 voices for two (`two_mb_table`).
3. Sets each VIA's data directions (port A all output; port B the command bits, plus the Echo+ chip selects).
4. Resets each AY and zeroes its registers, with the mixer set to "noise off".
5. Points `vector_IRQ` at `mb_irq_handler` and enables Timer 1's interrupt.
6. Fails (carry clear) if no slot is valid or the IRQ vector is not writable.

### `MBSM` (804 lines): the driver

- **Starting.** `music_start` reads the tune table at `mus_ptr`, clears the channels, and starts Timer 1 in
  free-run mode every `mb_irq_clock` = `$429A` cycles (17,050: one video frame).
- **Each tick.** `mb_irq_handler` runs `music_update`, then `set_psg_registers`, which writes only the AY registers
  that changed, through the VIA: ORA carries data, and ORB carries the commands latch (`$07`), write (`$06`),
  inactive (`$04`) and reset (`$00`).
- **The music data.** Each channel reads its own byte stream:
  - notes go through `freq_table_lo`/`freq_table_hi` and `chan_transpose`;
  - commands from `$10` set the release duration, transpose, pitch bend, attack rate, decay, sustain level,
    release rate and attack level;
  - `$80` to `$83` are pattern JSR, pattern RTS, end of pattern and poll interval.
- **Envelopes are software.** Each channel has its own stage, rates and levels, written to the AY's amplitude
  registers.
- **Stopping and muting.** `music_stop` silences every voice and disables the interrupt. `music_mute` (a remaster
  ENHANCEMENT) is the in-game Music toggle.

### SEL's `music_ctl`

Already ported, in `src/app/port/program/sel.ts`.

- A ≥ `$80` BLOADs `MUSx` at `$F000`, where x is O, T, D, C or B.
- A < `$80` plays that tune number, or stops for `music_off`.
- It is called from ULT4 (overworld, towne, castle, dungeon, combat), the overlays (LORD, HELP, SHRN, END) and
  NEWGAME.

## The design problem: the port has no interrupts

Native code runs whole routines and counts only explicit cycles (idle ticks, delays, sound loops), so an IRQ cannot
land between two instructions as it does on the 6502. It does not need to. The handler touches only the music's
state (`zp_music`, the driver's data in the text page, and the AYs), never game state. Two consequences:

- **Deliver the timer at checkpoints.** `LiftedMachine` keeps Timer 1's next deadline, in `cpu.cycles`. Wherever the
  port already yields (`checkpoint()`, key polls, the idle tick, explicit delays), each deadline passed runs the
  native `mb_irq_handler` once, unless the I flag is set. The tempo then follows the game's own clock, as the
  speaker's pitch does.
- **Compare by tick, not by cycle.** The oracle's IRQs land on exact instructions; the port's land at checkpoints.
  So the gate does two checks:
  - the game-state comparison, with the music's bytes masked out;
  - the music, separately: the AY register values after each tick must match the oracle's, tick for tick.

## Phases (one PR each)

### 17a. Oracle support

In `tools/oracle/machine.py`:

- add a 6522 VIA at slot 4, and a second for two boards:
  - Timer 1 counts `processorCycles` and reloads in free-run mode;
  - the IFR and IER registers;
- add two AY register files behind the VIA's ORB command protocol;
- deliver IRQs with py65's `mpu.irq()` when the I flag is clear;
- log every AY register write with its tick number.

Add scenarios to `scenarios.py`, and mirror them in `tools/lift/gate/session.ts`:

- `music-boot`: activate one board in slot 4, of the first kind, and play the title's music;
- `music-play`: Britannia, a towne, a fight and a dungeon, with Ctrl+V to mute and unmute;
- `music-two-boards`: two cards, to cover the 6-voice routing.

What gets committed and what stays local:

- committed: the digests, plus a digest of the AY registers after each tick;
- local only: the raw logs, like the recordings.

Python tests in `test_oracle.py` cover the VIA and the AY protocol on hand-written programs.

### 17b. Port `MBSI` and `MBSM`

Native modules `src/app/port/program/mbsi.ts` (replacing today's stand-in) and `mbsm.ts`:

- built on `PortProgram` (`src/app/port/port-program.ts`), keeping registers and flags as the original leaves them;
- data tables checked byte for byte against the build, as `boot-data.ts` was.

In `src/app/lifted-runtime/lifted-machine.ts`:

- route the chosen slot's `$Cn00-$CnFF` to a new `src/app/runtime/via6522.ts`, which passes AY register writes to
  `src/app/runtime/ay38910.ts`;
- deliver timer ticks at checkpoints, as above.

Add `MBSM` entries to the differential harness (`tools/lift/gate/differential.ts`), as SUBS has. The lifter skips
the Mockingboard programs today. Either lift them (handling `MBSM`'s two load areas) or rely on the oracle's tick
stream alone.

**Gate:** the music scenarios match per tick, and every existing scenario still matches.

### 17c. The sound chip

`src/app/runtime/ay38910.ts`:

- **Tone:** three generators, each a 12-bit period at the clock ÷ 16.
- **Noise:** a 17-bit LFSR with a 5-bit period.
- **Mixer:** register 7.
- **Amplitude:** 4-bit, or the envelope; the hardware envelope has a 16-bit period and the shapes in register 13.
- **Output:** logarithmic DAC levels from the datasheet.

The clock is the Apple's φ0 (1.023 MHz). It renders timestamped register writes to samples, as `Speaker.drain` does
(`src/app/runtime/speaker.ts`, `PortedGame.drainSound`), with one chip on each stereo side.

Unit tests cover each register's behaviour: periods to frequency, the noise sequence, every envelope shape, the
mixer. A DAC table taken from another emulator is credited in `THIRD-PARTY-NOTICES.md`, and only under a compatible
licence.

### 17d. Hearing it

`SpeakerPlayer` (`src/app/ui/speaker-player.ts`) becomes a mixer of the speaker and the AYs, keeping:

- its DC blocker;
- its cap on latency;
- its start at the first key or touch.

The Sound setting covers both, and the game's own Music command mutes the music, as in the original.

Tests:

- **e2e:** activating a board on synthetic disks returns to the menu with the board active.
- **Listening:** someone plays the towne, overworld, dungeon and combat music and judges it. Nothing else can check
  that.

### 17e. Docs

- row 17 of `port-plan.md`;
- "Phase 17 findings" in `SOURCE-NOTES.md`;
- the oracle README (the VIA, the AY log, the music scenarios);
- the README (playing with music).

## Decisions to make when it starts

- **D9. Remember the board?** Should a setting remember the board (for example "Mockingboard in slot 4"), so the
  music starts without the menu every time? The faithful default is no: ask, as the original does.
- **D10. Which board?** Which kinds does the menu offer in practice? Only the slot and the kind the player gives
  matter to the emulation; the menu's answers are the original's.
- **D11. A partial chip first?** If the chip stalls, is playback without the hardware envelope or noise acceptable
  as a first release? Recommendation: no. Do the chip properly; it is small.

## Risks

- **Timing.** The tempo rests on the idle-tick and delay cycle counts. They are measured, but music exposes any
  error to the ear.
- **Disk access.** The original's `sei`/`cli` pause the music during disk access. The port's disk access takes no
  time, so this is likely moot.
- **The text page holds the driver.** Anything reading `$0400-$07FF` would see the driver's bytes. The
  screen-reader mirror reads the hi-res page, so nothing known does.
- **The two-board routing is suspect in the original.** Its own authors doubt it (`MBSI.s`: "Why are these
  reversed?"). Port it as written.

## Verification

- `npm run real-gate -- --native` on every scenario, the three music ones included, and `npm run lift-gate`.
- `npm test`, `npm run lint`, `npm run build` (the port's lazy chunk stays under the 1 MB script budget), and
  `npm run e2e`.
- Listening on the real disks.
