import { HIRES_BYTES, hiresRowOffset } from '../runtime/apple-hires.constants';
import { glyphTable, messageLines, newLines, readScreenText, statusLines } from './screen-text';

const FONT_BYTES: number = 0x400;


/** A font whose glyphs differ in their first row, which holds the glyph's own code. */
function testFont(): Uint8Array {
  const font: Uint8Array = new Uint8Array(FONT_BYTES);

  for (let glyph: number = 0; glyph < 0x80; glyph++) {
    for (let row: number = 0; row < 8; row++) {
      font[(row * 0x80) + glyph] = (row === 0) ? glyph : row;
    }
  }

  return font;
}


function draw(page: Uint8Array, font: Uint8Array, row: number, column: number, text: string, invert: number = 0x00): void {
  [ ...text ].forEach((character: string, index: number): void => {
    for (let pixelRow: number = 0; pixelRow < 8; pixelRow++) {
      page[hiresRowOffset((row * 8) + pixelRow) + column + index] = font[(pixelRow * 0x80) + character.charCodeAt(0)] ^ invert;
    }
  });
}


function screenWith(...texts: readonly [ number, number, string, number? ][]): string[] {
  const font: Uint8Array = testFont();
  const page: Uint8Array = new Uint8Array(HIRES_BYTES);

  for (const [ row, column, text, invert ] of texts) {
    draw(page, font, row, column, text, invert);
  }

  return readScreenText(page, glyphTable(font));
}


describe('the screen read as text', (): void => {
  describe('readScreenText', (): void => {
    it('reads a glyph drawn in a cell', (): void => {
      expect(screenWith([ 12, 24, 'Pass' ])[12].slice(24, 28)).toBe('Pass');
    });

    it('reads a glyph drawn inverted, as a player\'s name is', (): void => {
      expect(screenWith([ 2, 24, 'IOLO', 0x7F ])[2].slice(24, 28)).toBe('IOLO');
    });

    it('reads a glyph with the palette bit set', (): void => {
      expect(screenWith([ 0, 0, 'A', 0x80 ])[0][0]).toBe('A');
    });

    it('reads an empty cell as a space', (): void => {
      expect(screenWith()[5][5]).toBe(' ');
    });

    it('reads the cursor as a space', (): void => {
      expect(screenWith([ 13, 24, '|' ])[13][24]).toBe(' ');
    });

    it('has 24 lines of 40 columns', (): void => {
      expect(screenWith().map((line: string): number => line.length)).toEqual(Array.from({ length: 24 }, (): number => 40));
    });
  });

  describe('statusLines', (): void => {
    it('takes the party from the right of the map', (): void => {
      expect(statusLines(screenWith([ 1, 24, '1-IOLO 300G' ]))).toEqual([ '1-IOLO 300G' ]);
    });

    it('leaves out the rows below the status pane', (): void => {
      expect(statusLines(screenWith([ 12, 24, 'Pass' ]))).toEqual([]);
    });
  });

  describe('messageLines', (): void => {
    it('takes the message pane', (): void => {
      expect(messageLines(screenWith([ 12, 24, 'Pass' ]))).toEqual([ 'Pass' ]);
    });

    it('leaves out the status pane', (): void => {
      expect(messageLines(screenWith([ 1, 24, '1-IOLO 300G' ]))).toEqual([]);
    });

    it('keeps the wind\'s padded direction with it', (): void => {
      expect(messageLines(screenWith([ 23, 7, 'WIND  WEST' ]))).toEqual([ 'WIND  WEST' ]);
    });

    it('splits a row where its text is far apart', (): void => {
      expect(messageLines(screenWith([ 23, 7, 'WIND NORTH' ], [ 23, 24, 'Pass' ]))).toEqual([ 'WIND NORTH', 'Pass' ]);
    });
  });

  describe('newLines', (): void => {
    it('gives a line not there before', (): void => {
      expect(newLines([ 'North' ], [ 'North', 'Pass' ])).toEqual([ 'Pass' ]);
    });

    it('gives nothing for lines that only scrolled', (): void => {
      expect(newLines([ 'North', 'Pass' ], [ 'Pass' ])).toEqual([]);
    });

    it('gives a message repeated', (): void => {
      expect(newLines([ 'Pass' ], [ 'Pass', 'Pass' ])).toEqual([ 'Pass' ]);
    });
  });
});
