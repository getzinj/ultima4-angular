import { hiresRowOffset } from '../../runtime/apple-hires.constants';
import { CARDS_BYTES, cardByte } from './cards';
import { FONT_BYTES, Font } from './font';
import { arenaOf, dungeonRoomOf, dungeonSquare, objectsOf, towneMapOf, towneTile } from './maps';
import { SuperPackerError, slideToHires, unpackSuperPacker } from './super-packer';
import { TILE_BYTES, TileSheet } from './tiles';


describe('TileSheet', (): void => {
  it('takes a row\'s left byte from SHP0 at row * 256 + tile', (): void => {
    const left: Uint8Array = new Uint8Array(TILE_BYTES);

    left[(3 * 256) + 0x41] = 0x2A;

    expect(new TileSheet(left, new Uint8Array(TILE_BYTES)).row(0x41, 3)[0]).toBe(0x2A);
  });

  it('takes a row\'s right byte from SHP1', (): void => {
    const right: Uint8Array = new Uint8Array(TILE_BYTES);

    right[(15 * 256) + 0xFF] = 0x55;

    expect(new TileSheet(new Uint8Array(TILE_BYTES), right).row(0xFF, 15)[1]).toBe(0x55);
  });

  it('refuses a half that is too short', (): void => {
    expect((): TileSheet => new TileSheet(new Uint8Array(10), new Uint8Array(TILE_BYTES))).toThrow(RangeError);
  });
});


describe('Font', (): void => {
  it('takes a glyph row from row * 128 + glyph', (): void => {
    const bytes: Uint8Array = new Uint8Array(FONT_BYTES);

    bytes[(7 * 128) + 0x41] = 0x3E;

    expect(new Font(bytes).row(0x41, 7)).toBe(0x3E);
  });

  it('ignores bit 7 of the glyph number', (): void => {
    const bytes: Uint8Array = new Uint8Array(FONT_BYTES);

    bytes[0x41] = 0x7F;

    expect(new Font(bytes).row(0xC1, 0)).toBe(0x7F);
  });
});


describe('unpackSuperPacker', (): void => {
  it('passes ordinary bytes through', (): void => {
    expect(Array.from(unpackSuperPacker(Uint8Array.of(0xFE, 0xFF, 1, 2, 3)))).toEqual([ 1, 2, 3 ]);
  });

  it('expands a repeat', (): void => {
    expect(Array.from(unpackSuperPacker(Uint8Array.of(0xFE, 0xFF, 0xFE, 4, 9)))).toEqual([ 9, 9, 9, 9 ]);
  });

  it('expands a pattern', (): void => {
    expect(Array.from(unpackSuperPacker(Uint8Array.of(0xFE, 0xFF, 0xFF, 2, 3, 1, 2)))).toEqual([ 1, 2, 1, 2, 1, 2 ]);
  });

  it('expands a repeat inside a pattern', (): void => {
    expect(Array.from(unpackSuperPacker(Uint8Array.of(0xFE, 0xFF, 0xFF, 4, 2, 0xFE, 2, 7, 8)))).toEqual([ 7, 7, 8, 7, 7, 8 ]);
  });

  it('refuses a repeat cut short', (): void => {
    expect((): Uint8Array => unpackSuperPacker(Uint8Array.of(0xFE, 0xFF, 0xFE, 4))).toThrow(SuperPackerError);
  });
});


describe('slideToHires', (): void => {
  it('puts the first byte at the bottom of the rightmost column', (): void => {
    const stream: number[] = [ 0xFE, 0xFF, 0x11 ];

    for (let remaining: number = (40 * 144) - 1; remaining > 0; remaining = remaining - Math.min(255, remaining)) {
      stream.push(0xFE, Math.min(255, remaining), 0);
    }

    expect(slideToHires(Uint8Array.from(stream))[hiresRowOffset(143) + 39]).toBe(0x11);
  });

  it('refuses a slide that unpacks short', (): void => {
    expect((): Uint8Array => slideToHires(Uint8Array.of(0xFE, 0xFF, 1))).toThrow(SuperPackerError);
  });
});


describe('cardByte', (): void => {
  it('takes card c, row r, column x from ((c * 112) + r) * 10 + x', (): void => {
    const cards: Uint8Array = new Uint8Array(CARDS_BYTES);

    cards[(((5 * 112) + 20) * 10) + 3] = 0xAA;

    expect(cardByte(cards, 5, 20, 3)).toBe(0xAA);
  });
});


describe('maps', (): void => {
  it('reads a towne tile row by row', (): void => {
    const file: Uint8Array = new Uint8Array(0x500);

    file[(4 * 32) + 9] = 0x3C;

    expect(towneTile(towneMapOf(file), 9, 4)).toBe(0x3C);
  });

  it('reads the object table after a towne\'s tiles', (): void => {
    const file: Uint8Array = new Uint8Array(0x500);

    file[0x400 + 0xE0 + 28] = 2;

    expect(towneMapOf(file).objects[28].dialogue).toBe(2);
  });

  it('reads an object\'s column of the table', (): void => {
    const table: Uint8Array = new Uint8Array(0x100);

    table[0x40 + 3] = 17;

    expect(objectsOf(table)[3].y).toBe(17);
  });

  it('reads a dungeon square level by level, row by row', (): void => {
    const file: Uint8Array = new Uint8Array(512);

    file[(3 * 64) + (3 * 8) + 0] = 0xF0;

    expect(dungeonSquare(file, 3, 0, 3)).toBe(0xF0);
  });

  it('reads an arena\'s tiles from $0280', (): void => {
    const file: Uint8Array = new Uint8Array(0xC0);

    file[0x40 + (5 * 11) + 5] = 0x16;

    expect(arenaOf(file).tiles[(5 * 11) + 5]).toBe(0x16);
  });

  it('reads a room\'s east entry from $50', (): void => {
    const sector: Uint8Array = new Uint8Array(256);

    sector.set([ 8, 8, 8, 9, 9, 9, 10, 10 ], 0x50);

    expect(dungeonRoomOf(sector).entries[1].x).toEqual([ 8, 8, 8, 9, 9, 9, 10, 10 ]);
  });

  it('reads a room\'s tiles from $80', (): void => {
    const sector: Uint8Array = new Uint8Array(256);

    sector[0xB7] = 0x7F;

    expect(dungeonRoomOf(sector).tiles[55]).toBe(0x7F);
  });
});
