const INTERACTIVE: string = 'button, summary, select, textarea, input, a[href]';
const GAME_INPUT: string = '[data-game-input]';


/**
 * Whether a key pressed here belongs to a control rather than the game: Enter or Space on a button,
 * the settings summary, the colour list or the checkbox must work as they do on any page. The touch
 * pad's invisible text field is the game's own input and is not counted.
 */
export function isControl(target: EventTarget | null): boolean {
  const element: Element | null = (target != null) && ('closest' in target) ? (target as Element) : null;

  return (element != null) && (element.closest(INTERACTIVE) != null) && (element.closest(GAME_INPUT) == null);
}
