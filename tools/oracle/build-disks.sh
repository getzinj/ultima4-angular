#!/bin/sh
# Builds the remaster's `fixed` disks, which the oracle runs, from your own four original disk
# images (the de-protected DOS-order copies the remaster expects), with the port's deviations
# (deviations/*.patch) applied to its source:
#
#   ./build-disks.sh <program.do> <britannia.do> <towne.do> <underworld.do>
#
# Needs git, GNU Make 4.2+, Python 3.6+ and cc65 2.19 (ca65 and ld65 on the PATH). Everything goes
# under work/, which is gitignored: the disks and anything built from them are the game's.
set -eu

COMMIT=428a793a4d6327cc9734ec151bf377f3d328f2cc
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HERE/work/u4remasteredA2"

if [ "$#" -ne 4 ]; then
  sed -n '2,8p' "$0"
  exit 2
fi
for tool in git make python3 ca65 ld65; do
  command -v "$tool" >/dev/null || { echo "missing: $tool"; exit 1; }
done

if [ ! -d "$WORK/.git" ]; then
  git clone --quiet https://github.com/sean-gugler/u4remasteredA2 "$WORK"
fi
git -C "$WORK" fetch --quiet origin fixed
git -C "$WORK" checkout --quiet --force --detach "$COMMIT"
for patch in "$HERE"/deviations/*.patch; do
  git -C "$WORK" apply "$patch"
done

mkdir -p "$WORK/files/original"
cp "$1" "$WORK/files/original/u4program.do"
cp "$2" "$WORK/files/original/u4britannia.do"
cp "$3" "$WORK/files/original/u4towne.do"
cp "$4" "$WORK/files/original/u4underworld.do"

make -C "$WORK" all

for disk in program britannia towne underworld; do
  test -s "$WORK/output/u4$disk.do" || { echo "make did not write output/u4$disk.do"; exit 1; }
done
for program in BOOT NEWGAME ULT4 SUBS; do
  test -s "$WORK/src/patchedgame/program/$program.lab" || { echo "make did not write $program.lab"; exit 1; }
done
echo "built: $WORK/output (record with: python3 record.py --build $WORK)"
