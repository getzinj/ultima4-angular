// The keyboard as Ultima IV reads it: $C000 gives the last key with bit 7 set while it is unread,
// and any access to $C010 clears that bit. There is no buffer in the hardware: a second key before
// the first is read replaces it. The game keeps its own queue (`SUBS.s` `scankey`).

export const KEY_RETURN: number = 0x8D;
export const KEY_LEFT_ARROW: number = 0x88;
export const KEY_RIGHT_ARROW: number = 0x95;
export const KEY_UP_ARROW: number = 0x8B;
export const KEY_DOWN_ARROW: number = 0x8A;
export const KEY_ESCAPE: number = 0x9B;
export const KEY_DELETE: number = 0xFF;

const STROBE: number = 0x80;
const CONTROL_MASK: number = 0x1F;


/** The $C000 code a browser key stands for, upper case as the game expects, or null. */
export function appleKeyCodeOf(key: string, control: boolean = false): number | null {
  let code: number | null = null;

  if (key === 'Enter') {
    code = KEY_RETURN;
  } else if ((key === 'ArrowLeft') || (key === 'Backspace')) {
    code = KEY_LEFT_ARROW;
  } else if (key === 'ArrowRight') {
    code = KEY_RIGHT_ARROW;
  } else if (key === 'ArrowUp') {
    code = KEY_UP_ARROW;
  } else if (key === 'ArrowDown') {
    code = KEY_DOWN_ARROW;
  } else if (key === 'Escape') {
    code = KEY_ESCAPE;
  } else if (key === 'Delete') {
    code = KEY_DELETE;
  } else if (key.length === 1) {
    const ascii: number = key.toUpperCase().charCodeAt(0);

    if (control) {
      if ((ascii >= 0x40) && (ascii <= 0x5F)) {
        code = (ascii & CONTROL_MASK) | STROBE;
      }
    } else if ((ascii >= 0x20) && (ascii <= 0x5F)) {
      code = ascii | STROBE;
    }
  }

  return code;
}


export class Keyboard {
  private data: number = 0;


  /** A key arriving: latched with the strobe set, replacing whatever was there. */
  public press(code: number): void {
    this.data = code | STROBE;
  }


  /** Translates and latches a browser key. Returns whether it meant anything. */
  public pressKey(key: string, control: boolean = false): boolean {
    const code: number | null = appleKeyCodeOf(key, control);

    if (code != null) {
      this.press(code);
    }

    return code != null;
  }


  /** A read of $C000. */
  public peekData(): number {
    return this.data;
  }


  /** Any access to $C010. */
  public clearStrobe(): void {
    this.data = this.data & 0x7F;
  }


  public get keyWaiting(): boolean {
    return (this.data & STROBE) !== 0;
  }

}
