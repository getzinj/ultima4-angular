import { conversationSector, dungeonRoomSector, worldChunk, worldTile } from './raw-areas';


function numberedArea(tracks: number): Uint8Array {
  const area: Uint8Array = new Uint8Array(tracks * 16 * 256);

  for (let sector: number = 0; sector < (tracks * 16); sector++) {
    area[sector * 256] = sector;
  }

  return area;
}


describe('raw areas', (): void => {
  it('finds a world chunk at track = chunk row, sector = chunk column', (): void => {
    expect(worldChunk(numberedArea(16), 3, 2)[0]).toBe((2 * 16) + 3);
  });

  it('finds a world tile row by row within its chunk', (): void => {
    const area: Uint8Array = numberedArea(16);

    area[(((1 * 16) + 2) * 256) + (5 * 16) + 4] = 0x99;

    expect(worldTile(area, (2 * 16) + 4, (1 * 16) + 5)).toBe(0x99);
  });

  it('finds a conversation at track = location - 1, sector = dialogue - 1', (): void => {
    expect(conversationSector(numberedArea(16), 6, 3)[0]).toBe((5 * 16) + 2);
  });

  it('finds a dungeon room at track = dungeon', (): void => {
    expect(dungeonRoomSector(numberedArea(11), 2, 5, 12)[0]).toBe((2 * 16) + 12);
  });

  it('gives the Abyss a track for each two levels', (): void => {
    expect(dungeonRoomSector(numberedArea(11), 7, 5, 1)[0]).toBe((9 * 16) + 1);
  });
});
