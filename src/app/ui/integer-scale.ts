export const SCREEN_WIDTH: number = 280;
export const SCREEN_HEIGHT: number = 192;

export function integerScaleFor(availableWidth: number, availableHeight: number): number {
  return Math.max(1, Math.floor(Math.min(availableWidth / SCREEN_WIDTH, availableHeight / SCREEN_HEIGHT)));
}
