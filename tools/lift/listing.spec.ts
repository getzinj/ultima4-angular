import { parseListing, readLabels, segmentStarts, statementOf } from './listing';
import type { IListing } from './listing';


/** One line of a ca65 listing: address, include level, up to four bytes, then the source from column 24. */
function line(address: number, bytes: readonly number[], source: string): string {
  const head: string = `${ address.toString(16).toUpperCase().padStart(6, '0') }r 1  ${ bytes.map((byte: number): string => `${ byte.toString(16).toUpperCase().padStart(2, '0') } `).join('') }`;

  return `${ head.padEnd(24) }${ source }`;
}


function listing(...lines: string[]): IListing {
  return parseListing(lines.join('\n'), new Map<string, number>([ [ 'CODE', 0x4000 ] ]));
}


const SEGMENT: string = line(0, [], '\t.segment "CODE"');


describe('statementOf', (): void => {
  it('takes labels off the front', (): void => {
    expect(statementOf('start: @loop: lda #0')).toBe('lda #0');
  });

  it('takes the comment off the end', (): void => {
    expect(statementOf('\tlda #0 ; clear')).toBe('lda #0');
  });

  it('keeps a semicolon inside quotes', (): void => {
    expect(statementOf('\t.byte "A;B" ; text')).toBe('.byte "A;B"');
  });
});


describe('segmentStarts', (): void => {
  it('reads each segment\'s start from the map', (): void => {
    const map: string = [
      'Segment list:',
      '-------------',
      'Name                   Start     End    Size  Align',
      '----------------------------------------------------',
      'LOADADDR              003FFE  003FFF  000002  00001',
      'CODE                  004000  0040FF  000100  00001',
      '',
    ].join('\n');

    expect(Array.from(segmentStarts(map))).toEqual([ [ 'LOADADDR', 0x3FFE ], [ 'CODE', 0x4000 ] ]);
  });
});


describe('parseListing', (): void => {
  it('places lines at their segment\'s start', (): void => {
    expect(listing(SEGMENT, line(0x0002, [ 0xEA ], '\tnop')).spans[0].address).toBe(0x4002);
  });

  it('classifies an instruction line as code', (): void => {
    expect(listing(SEGMENT, line(0, [ 0xA9, 0x00 ], '\tlda #0')).spans[0].kind).toBe('code');
  });

  it('classifies a .byte line as data', (): void => {
    expect(listing(SEGMENT, line(0, [ 0x01 ], '\t.byte 1')).spans[0].kind).toBe('data');
  });

  it('keeps one span per instruction', (): void => {
    expect(listing(SEGMENT, line(0, [ 0xEA ], '\tnop'), line(1, [ 0xEA ], '\tnop')).spans.length).toBe(2);
  });

  it('merges adjacent data lines', (): void => {
    expect(listing(SEGMENT, line(0, [ 0x01 ], '\t.byte 1'), line(1, [ 0x02 ], '\t.byte 2')).spans[0].length).toBe(2);
  });

  it('adds a continuation line\'s bytes to the line before', (): void => {
    expect(listing(SEGMENT, line(0, [ 1, 2, 3, 4 ], '\t.byte 1, 2, 3, 4, 5'), line(4, [ 5 ], '')).spans[0].length).toBe(5);
  });

  it('records a patch point at its offset from the next instruction', (): void => {
    expect(Array.from(listing(SEGMENT, line(0x10, [], '@value=*+$01'), line(0x10, [ 0xA9, 0x00 ], '\tlda #0')).patchPoints)).toEqual([ 0x4011 ]);
  });

  it('classifies a macro that starts with an instruction as code', (): void => {
    expect(listing(
      SEGMENT,
      line(0, [], '.macro clear'),
      line(0, [], '\tlda #0'),
      line(0, [], '.endmacro'),
      line(0, [ 0xA9, 0x00 ], '\tclear'),
    ).spans[0].kind).toBe('code');
  });
});


describe('readLabels', (): void => {
  const labels: string = [ 'al 004000 .start', 'al 004010 .@loop', 'al 005000 .elsewhere' ].join('\n');

  it('keeps the labels inside the range', (): void => {
    expect(Array.from(readLabels(labels, 0x4000, 0x4100).keys())).toEqual([ 'start' ]);
  });
});
