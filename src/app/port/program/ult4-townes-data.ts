import { inline } from '../inline-data';
import type { IInlineData } from '../inline-data';
import { encode } from '../text';

// Where ULT4's towne code keeps its variables and strings in the `fixed` build, and what they
// hold when ULT4 is loaded.

export const TOWNE_VARIABLES = {
  /** load_shop: the shop's digit, patched into its BLOAD. */
  file_char_shop: 0x5CC3,
} as const;

/** ULT4's entries for the townes that the port takes over. */
export const TOWNE_ENTRIES = {
  cmd_talk: 0x5B70,
  /** Talk's return from LORD: HELP and LORD BRUN each other dropping frames, so LORD's RTS comes back here unawaited. */
  after_lord_british: 0x5C1F,
  mobs_act_towne: 0x6AA8,
} as const;


function text(address: number, value: string): IInlineData {
  return inline(address, [ ...encode(value), 0x00 ]);
}


export const TOWNE_INLINE = {
  talk: text(0x5B76, 'Talk-'),
  no_response: text(0x5BBE, 'FUNNY, NO\nRESPONSE!\n'),
  bload_lord: text(0x5C03, '\u0004BLOAD LORD,A$8800\n'),
  bload_talk: text(0x5C37, '\u0004BLOAD TALK,A$8800\n'),
  bload_shps: text(0x5C5E, '\u0004BLOAD SHPS,A$8800\n'),
  bload_shp: text(0x5CB9, '\u0004BLOAD SHP@,A$8800\n'),
} as const;


export function towneData(): readonly [ number, readonly number[] ][] {
  return Object.values(TOWNE_INLINE).map((block: IInlineData): [ number, readonly number[] ] => [ block.address, block.bytes ]);
}
