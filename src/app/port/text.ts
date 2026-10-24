// Text as the game assembles it: every character through uscii.i's charmap, which sets bit 7, and
// a newline as RET ($8D).

export const RET: number = 0x8D;


export function encode(text: string): number[] {
  return Array.from(text, (character: string): number => ((character === '\n') ? RET : (character.charCodeAt(0) | 0x80)));
}


/** A string as `primm` takes it: the text, then a zero. */
export function zeroTerminated(text: string): number[] {
  return [ ...encode(text), 0x00 ];
}


/** SUBS.s `msbstring`: the text with bit 7 of its last character cleared to end it. */
export function msbString(text: string): number[] {
  const bytes: number[] = encode(text);

  bytes[bytes.length - 1] = bytes[bytes.length - 1] ^ 0x80;

  return bytes;
}
