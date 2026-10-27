# Ultima IV

A port of the Apple II *Ultima IV: Quest of the Avatar* (Origin Systems, 1985) to
the browser, drawn on an emulated 280x192 hi-res screen scaled to the space
available. You bring your own disk images; nothing from the original disks is
included.

The game is ported from Sean Gugler's reconstructed source,
[`sean-gugler/u4remasteredA2`](https://github.com/sean-gugler/u4remasteredA2),
which is linked, not copied. The plan and progress are in
[`docs/port-plan.md`](docs/port-plan.md),
and the findings about the source in
[`docs/SOURCE-NOTES.md`](docs/SOURCE-NOTES.md).

## Running

```sh
npm ci
npm start           # http://localhost:4203
npm test
npm run lint
npm run e2e         # Playwright: starts the dev server itself
npm run build       # dist/ultima4/browser
npm run inspect-disks -- <image> ...   # check disk images from the command line
```

On first load the app asks for the four disk images (program, Britannia, towne,
underworld; `.do`, `.dsk`, `.po` or `.2mg`). They are kept in the browser's IndexedDB
and never sent anywhere. Tests and CI use synthetic disks
(`src/app/data/testing/synthetic-disks.ts`), never the real ones.

## Tools for the port

These run against a checkout of the remaster at the pinned commit, with cc65 2.19 installed:

```sh
npm run lift -- <checkout>               # generate src/app/lifted/ (not committed)
npm run lift-gate                        # the lifted game against the oracle
npm run real-gate -- [--native]          # every scenario on your disks against the oracle's digests
npm run generate-symbols -- <checkout>   # regenerate src/app/state/symbols.ts
npm run verify-symbols -- <checkout>     # check it against ca65
```

The oracle, in Python, is in [`tools/oracle/`](tools/oracle/README.md), and the lifter is in
[`tools/lift/`](tools/lift/README.md).

## Deploying

The site is a static build for a domain root (`dist/ultima4/browser`), served at
[ultima4.stonequest.org](https://ultima4.stonequest.org). `.github/workflows/deploy.yml` lints, tests, builds and runs
the e2e specs on every pull request and push, and deploys pushes to `main` to GitHub Pages. Pages takes its source
from GitHub Actions and has its custom domain set in the repository settings, because a deploy from Actions ignores
`public/CNAME`.

The port was written as `apps/Ultima4` in `getzinj/Stonequest-Angular` and moved here with its history, so the pull
request numbers in older commit messages are that repository's.

## Licence

GPL-3.0 for the original work of this port only. The game itself belongs to its
rights holder and is not licensed here. See [NOTICE](NOTICE).
