// Colours for the Apple II high-resolution screen. Copied from getzinj/akalabeth-angular, which took
// it from getzinj/wizardry-angular.
//
// The hardware has no per-pixel colour. What a colour monitor shows is an NTSC artifact of the
// pixel pattern itself: an isolated pixel reads as violet or green depending on which column it
// sits in, two neighbouring pixels read as white, and bit 7 of the byte shifts that pair to blue
// and orange. Ultima IV uses the palette bit (`gfx_blue_even` and `gfx_blue_odd` in its `apple.i`),
// so it needs all six colours.
//
// The violet, green and white values match getzinj/wizardry-angular, so the ports draw in the same
// colours. Blue and orange come from the usual references for Apple II artifact colour. This file
// has no Angular and no game dependencies.

export interface IRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}


export interface IApplePalette {
  /** Identifier used by the display settings and by tests. */
  readonly name: string;

  /** Shown where no pixel is lit. */
  readonly background: IRgb;

  /** A lit pixel with a lit neighbour, on either palette. */
  readonly white: IRgb;

  /** An isolated lit pixel in an even column, palette bit clear. */
  readonly violet: IRgb;

  /** An isolated lit pixel in an odd column, palette bit clear. */
  readonly green: IRgb;

  /** An isolated lit pixel in an even column, palette bit set. */
  readonly blue: IRgb;

  /** An isolated lit pixel in an odd column, palette bit set. */
  readonly orange: IRgb;
}


function rgb(r: number, g: number, b: number): IRgb {
  return { r, g, b };
}


/** What the game looked like on a colour monitor. */
export const NTSC_ARTIFACT_PALETTE: IApplePalette = {
  name: 'ntsc',
  background: rgb(0x00, 0x00, 0x00),
  white: rgb(0xE0, 0xE0, 0xE0),
  violet: rgb(0xD4, 0x00, 0xCC),
  green: rgb(0x00, 0xCC, 0x44),
  blue: rgb(0x00, 0x99, 0xFF),
  orange: rgb(0xFF, 0x6A, 0x00),
};


function monochrome(name: string, lit: IRgb, background: IRgb): IApplePalette {
  return { name, background, white: lit, violet: lit, green: lit, blue: lit, orange: lit };
}


/** What the game looked like on the green phosphor monitor most players had. */
export const GREEN_PHOSPHOR_PALETTE: IApplePalette =
  monochrome('green', rgb(0x33, 0xFF, 0x33), rgb(0x00, 0x00, 0x00));

export const AMBER_PHOSPHOR_PALETTE: IApplePalette =
  monochrome('amber', rgb(0xFF, 0xB0, 0x00), rgb(0x00, 0x00, 0x00));

export const WHITE_PHOSPHOR_PALETTE: IApplePalette =
  monochrome('white', rgb(0xE0, 0xE0, 0xE0), rgb(0x00, 0x00, 0x00));

export const APPLE_PALETTES: readonly IApplePalette[] = [
  NTSC_ARTIFACT_PALETTE,
  GREEN_PHOSPHOR_PALETTE,
  AMBER_PHOSPHOR_PALETTE,
  WHITE_PHOSPHOR_PALETTE,
];


export function paletteByName(name: string): IApplePalette {
  const found: IApplePalette | undefined = APPLE_PALETTES.find((palette: IApplePalette): boolean => palette.name === name);

  if (found != null) {
    return found;
  } else {
    return NTSC_ARTIFACT_PALETTE;
  }
}


/**
 * Colour of one pixel, given whether it and its neighbours are lit, its column, and the palette
 * bit of the byte it came from. Exported so the colour rule can be tested on its own, away from
 * the row scanning in HiresScreen.render().
 */
export function artifactColor(palette: IApplePalette,
                              lit: boolean,
                              leftLit: boolean,
                              rightLit: boolean,
                              column: number,
                              paletteBit: boolean): IRgb {
  if (lit) {
    if (leftLit || rightLit) {
      return palette.white;
    } else {
      if ((column & 1) === 0) {
        return paletteBit ? palette.blue : palette.violet;
      } else {
        return paletteBit ? palette.orange : palette.green;
      }
    }
  } else {
    return palette.background;
  }
}
