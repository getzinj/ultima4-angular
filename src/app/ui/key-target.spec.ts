import { isControl } from './key-target';

function element(markup: string): Element {
  const holder: HTMLElement = document.createElement('div');

  holder.innerHTML = markup;

  return holder.firstElementChild as Element;
}


describe('isControl', (): void => {
  it('counts a button', (): void => {
    expect(isControl(element('<button>Go</button>'))).toBe(true);
  });

  it('counts the settings summary', (): void => {
    expect(isControl(element('<details><summary>Settings</summary></details>').firstElementChild)).toBe(true);
  });

  it('counts a checkbox', (): void => {
    expect(isControl(element('<input type="checkbox" />'))).toBe(true);
  });

  it('counts a list', (): void => {
    expect(isControl(element('<select><option>a</option></select>'))).toBe(true);
  });

  it('counts something inside a button', (): void => {
    expect(isControl(element('<button><span>Go</span></button>').firstElementChild)).toBe(true);
  });

  it('does not count the page itself', (): void => {
    expect(isControl(element('<div></div>'))).toBe(false);
  });

  it('does not count the touch pad\'s text field, which feeds the game', (): void => {
    expect(isControl(element('<input data-game-input />'))).toBe(false);
  });

  it('does not count nothing', (): void => {
    expect(isControl(null)).toBe(false);
  });
});
