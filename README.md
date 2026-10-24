# Ultima IV

A port of the Apple II *Ultima IV: Quest of the Avatar* (Origin Systems, 1985) to
the browser, drawn on an emulated 280x192 hi-res screen scaled to the space
available. You bring your own disk images; nothing from the original disks is
included.

The game is ported from Sean Gugler's reconstructed source,
[`sean-gugler/u4remasteredA2`](https://github.com/sean-gugler/u4remasteredA2),
which is linked, not copied. The plan and progress are in
[`docs/plans/2026-10-ultima4-port.md`](../../docs/plans/2026-10-ultima4-port.md),
and the findings about the source in
[`docs/plans/2026-10-ultima4-source-notes.md`](../../docs/plans/2026-10-ultima4-source-notes.md).

## Running

```sh
npx nx serve Ultima4        # http://localhost:4203
npx nx test Ultima4
npx nx lint Ultima4
npx nx e2e Ultima4
npx nx run Ultima4:inspect-disks -- <image> ...   # check disk images from the command line
```

On first load the app asks for the four disk images (program, Britannia, towne,
underworld; `.do`, `.dsk`, `.po` or `.2mg`). They are kept in the browser's IndexedDB
and never sent anywhere. Tests and CI use synthetic disks
(`src/app/data/testing/synthetic-disks.ts`), never the real ones.

## Tools for the port

These run against a checkout of the remaster at the pinned commit, with cc65 2.19 installed:

```sh
npx nx run Ultima4:lift <checkout>               # generate src/app/lifted/ (not committed)
npx nx run Ultima4:lift-gate                     # the lifted game against the oracle
npx nx run Ultima4:generate-symbols <checkout>   # regenerate src/app/state/symbols.ts
npx nx run Ultima4:verify-symbols <checkout>     # check it against ca65
```

The oracle, in Python, is in [`tools/oracle/`](tools/oracle/README.md), and the lifter is in
[`tools/lift/`](tools/lift/README.md).

## Licence

GPL-3.0 for the original work of this port only. The game itself belongs to its
rights holder and is not licensed here. See [NOTICE](NOTICE).
