import { paletteByName } from '../runtime/apple-palette';

export interface IDisplaySettings {
  readonly palette: string;
  readonly crt: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: IDisplaySettings = { palette: 'ntsc', crt: true };
const STORAGE_KEY: string = 'ultima4.display';


/** The page's local storage, or null where the browser blocks it. */
export function browserStorage(): Storage | null {
  let storage: Storage | null = null;

  try {
    storage = (typeof localStorage !== 'undefined') ? localStorage : null;
  } catch {
    storage = null;
  }

  return storage;
}


/** What the player chose last time, or the defaults when nothing usable was stored. */
export function loadDisplaySettings(storage: Pick<Storage, 'getItem'> | null): IDisplaySettings {
  let settings: IDisplaySettings = DEFAULT_DISPLAY_SETTINGS;

  try {
    const stored: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');

    if ((typeof stored === 'object') && (stored != null)) {
      const candidate: Partial<IDisplaySettings> = stored as Partial<IDisplaySettings>;

      settings = {
        palette: paletteByName(String(candidate.palette)).name,
        crt: (typeof candidate.crt === 'boolean') ? candidate.crt : DEFAULT_DISPLAY_SETTINGS.crt,
      };
    }
  } catch {
    settings = DEFAULT_DISPLAY_SETTINGS;
  }

  return settings;
}


export function saveDisplaySettings(storage: Pick<Storage, 'setItem'> | null, settings: IDisplaySettings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be blocked or full; the choice then lasts for this visit only.
  }
}
