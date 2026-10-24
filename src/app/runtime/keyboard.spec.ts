import { KEY_DELETE, KEY_LEFT_ARROW, KEY_RETURN, KEY_UP_ARROW, Keyboard, appleKeyCodeOf } from './keyboard';


describe('appleKeyCodeOf', (): void => {
  it('gives a letter in upper case with bit 7 set', (): void => {
    expect(appleKeyCodeOf('a')).toBe(0xC1);
  });

  it('gives Return for Enter', (): void => {
    expect(appleKeyCodeOf('Enter')).toBe(KEY_RETURN);
  });

  it('gives the left arrow for Backspace', (): void => {
    expect(appleKeyCodeOf('Backspace')).toBe(KEY_LEFT_ARROW);
  });

  it('gives the IIe up arrow for ArrowUp', (): void => {
    expect(appleKeyCodeOf('ArrowUp')).toBe(KEY_UP_ARROW);
  });

  it('gives DEL for Delete', (): void => {
    expect(appleKeyCodeOf('Delete')).toBe(KEY_DELETE);
  });

  it('gives Ctrl+V as $96', (): void => {
    expect(appleKeyCodeOf('v', true)).toBe(0x96);
  });

  it('ignores Ctrl with a digit', (): void => {
    expect(appleKeyCodeOf('1', true)).toBeNull();
  });

  it('ignores keys with no Apple code', (): void => {
    expect(appleKeyCodeOf('F1')).toBeNull();
  });
});


describe('Keyboard', (): void => {
  it('latches a pressed key with the strobe set', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.pressKey('n');

    expect(keyboard.peekData()).toBe(0xCE);
  });

  it('says a key is waiting once one is pressed', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.pressKey('n');

    expect(keyboard.keyWaiting).toBe(true);
  });

  it('keeps the character but clears bit 7 when the strobe is cleared', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.pressKey('n');
    keyboard.clearStrobe();

    expect(keyboard.peekData()).toBe(0x4E);
  });

  it('replaces an unread key with the next one', (): void => {
    const keyboard: Keyboard = new Keyboard();

    keyboard.pressKey('n');
    keyboard.pressKey('s');

    expect(keyboard.peekData()).toBe(0xD3);
  });

  it('reports a key it cannot translate as meaningless', (): void => {
    expect(new Keyboard().pressKey('Shift')).toBe(false);
  });
});
