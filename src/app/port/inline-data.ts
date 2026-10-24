/** A block of inline data after a JSR: where it sits in the program's image, and its bytes. */
export interface IInlineData {
  readonly address: number;
  readonly bytes: readonly number[];
}


export function inline(address: number, bytes: readonly number[]): IInlineData {
  return { address, bytes };
}
