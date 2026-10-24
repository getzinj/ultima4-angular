// CRDS: the eight virtue cards, 10 bytes wide and 112 rows tall, uncompressed, row by row and then
// card after card (`tools/cards.py`).

export const CARD_COUNT: number = 8;
export const CARD_COLUMNS: number = 10;
export const CARD_ROWS: number = 112;
export const CARDS_BYTES: number = CARD_COUNT * CARD_ROWS * CARD_COLUMNS;


export function cardByte(cards: Uint8Array, card: number, row: number, column: number): number {
  return cards[(((card * CARD_ROWS) + row) * CARD_COLUMNS) + column];
}
