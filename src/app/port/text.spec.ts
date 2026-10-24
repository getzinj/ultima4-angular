import { RET, encode, msbString, zeroTerminated } from './text';


describe('text', (): void => {
  it('sets bit 7 on each character, as uscii.i\'s charmap does', (): void => {
    expect(encode('A1 ')).toEqual([ 0xC1, 0xB1, 0xA0 ]);
  });

  it('turns a newline into RET', (): void => {
    expect(encode('\n')).toEqual([ RET ]);
  });

  it('ends a primm string with a zero', (): void => {
    expect(zeroTerminated('OK')).toEqual([ 0xCF, 0xCB, 0x00 ]);
  });

  it('ends an msbstring by clearing bit 7 of its last character', (): void => {
    expect(msbString('RAT')).toEqual([ 0xD2, 0xC1, 0x54 ]);
  });
});
