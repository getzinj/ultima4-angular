import { DEFAULT_DISPLAY_SETTINGS, loadDisplaySettings, saveDisplaySettings } from './display-settings';

function storageHolding(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (): string | null => value };
}


describe('display settings', (): void => {
  it('start with the Apple II colours and the CRT effect on', (): void => {
    expect(loadDisplaySettings(storageHolding(null))).toEqual({ palette: 'ntsc', crt: true });
  });

  it('start with the defaults when there is no storage', (): void => {
    expect(loadDisplaySettings(null)).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it('read what was saved', (): void => {
    expect(loadDisplaySettings(storageHolding('{"palette":"green","crt":false}'))).toEqual({ palette: 'green', crt: false });
  });

  it('fall back to the defaults for text that is not JSON', (): void => {
    expect(loadDisplaySettings(storageHolding('not json'))).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it('fall back to the first palette for a name that is not one', (): void => {
    expect(loadDisplaySettings(storageHolding('{"palette":"purple","crt":true}')).palette).toBe('ntsc');
  });

  it('survive storage that throws on read', (): void => {
    const blocked: Pick<Storage, 'getItem'> = { getItem: (): string => {
      throw new Error('blocked');
    } };

    expect(loadDisplaySettings(blocked)).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it('are saved as JSON', (): void => {
    const saved: string[] = [];

    saveDisplaySettings({ setItem: (_key: string, value: string): void => {
      saved.push(value);
    } }, { palette: 'amber', crt: false });

    expect(saved).toEqual([ '{"palette":"amber","crt":false}' ]);
  });

  it('are not lost to a throw when saving', (): void => {
    expect((): void => saveDisplaySettings({ setItem: (): void => {
      throw new Error('full');
    } }, DEFAULT_DISPLAY_SETTINGS)).not.toThrow();
  });
});
