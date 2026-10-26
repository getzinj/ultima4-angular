export const SCREEN_WIDTH: number = 280;
export const SCREEN_HEIGHT: number = 192;

/** An Apple II monitor showed its 280 by 192 picture at 4:3. */
const ASPECT_WIDTH: number = 4;
const ASPECT_HEIGHT: number = 3;

export interface IScreenSize {
  readonly width: number;
  readonly height: number;
}


/** The largest 4:3 picture that fits, never smaller than the picture's own size in pixels. */
export function fitScreen(availableWidth: number, availableHeight: number): IScreenSize {
  const width: number = Math.max(SCREEN_WIDTH, Math.floor(Math.min(availableWidth, (availableHeight * ASPECT_WIDTH) / ASPECT_HEIGHT)));

  return { width, height: Math.round((width * ASPECT_HEIGHT) / ASPECT_WIDTH) };
}
