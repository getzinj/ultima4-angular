"""DOS 3.3 disk images in DOS sector order: the catalog, BLOAD and BSAVE, as the oracle's DOS
stand-in needs them. The TypeScript port has its own (src/app/data/dos33.ts); this one only has
to agree with real disks."""

SECTOR = 256
SECTORS_PER_TRACK = 16
TRACKS = 35
IMAGE_SIZE = TRACKS * SECTORS_PER_TRACK * SECTOR
CATALOG_TRACK = 17
BINARY = 0x04


class DosError(Exception):
    pass


def offset(track, sector):
    return ((track * SECTORS_PER_TRACK) + sector) * SECTOR


class Disk:
    def __init__(self, image, name=''):
        if len(image) != IMAGE_SIZE:
            raise DosError(f'{name}: {len(image)} bytes is not a 140 KB DOS-order image')
        self.image = bytearray(image)
        self.name = name

    def sector(self, track, sector):
        start = offset(track, sector)
        return self.image[start:start + SECTOR]

    def write_sector(self, track, sector, data):
        if track >= TRACKS or sector >= SECTORS_PER_TRACK:
            raise DosError(f'track {track} sector {sector} is off the disk')
        start = offset(track, sector)
        self.image[start:start + SECTOR] = bytes(data[:SECTOR]).ljust(SECTOR, b'\0')

    def _entries(self):
        vtoc = self.sector(CATALOG_TRACK, 0)
        track, sector = vtoc[1], vtoc[2]
        seen = set()
        while track != 0 and (track, sector) not in seen:
            seen.add((track, sector))
            data = self.sector(track, sector)
            for slot in range(7):
                at = 0x0B + ((slot % 7) * 35)
                if data[at] not in (0x00, 0xFF):
                    name = ''.join(chr(c & 0x7F) for c in data[at + 3:at + 33] if (c & 0x7F) >= 0x20).rstrip()
                    yield name, track, sector, at
            track, sector = data[1], data[2]

    def catalog(self):
        return [name for name, *_ in self._entries()]

    def _find(self, name):
        for entry in self._entries():
            if entry[0] == name:
                return entry
        raise DosError(f'FILE NOT FOUND: {name} on {self.name}')

    def _data_sectors(self, list_track, list_sector):
        sectors, lists = [], []
        while list_track != 0:
            lists.append((list_track, list_sector))
            tsl = self.sector(list_track, list_sector)
            for pair in range(122):
                sectors.append((tsl[0x0C + (pair * 2)], tsl[0x0D + (pair * 2)]))
            list_track, list_sector = tsl[1], tsl[2]
        while sectors and sectors[-1][0] == 0:
            sectors.pop()
        return sectors, lists

    def bload(self, name):
        """(load address, data) as BLOAD sees them."""
        _, track, sector, at = self._find(name)
        entry = self.sector(track, sector)
        if (entry[at + 2] & 0x7F) != BINARY:
            raise DosError(f'FILE TYPE MISMATCH: {name}')
        sectors, _ = self._data_sectors(entry[at], entry[at + 1])
        raw = b''.join(bytes(SECTOR) if t == 0 else bytes(self.sector(t, s)) for t, s in sectors)
        length = raw[2] | (raw[3] << 8)
        return raw[0] | (raw[1] << 8), raw[4:4 + length]

    def bsave(self, name, address, data, reserved_tracks):
        """BSAVE over an existing binary file of the same name, reusing as many of its sectors as
        it needs and taking any more from the VTOC, never from the reserved tracks."""
        _, track, sector, at = self._find(name)
        catalog = bytearray(self.sector(track, sector))
        sectors, lists = self._data_sectors(catalog[at], catalog[at + 1])
        content = bytes([address & 0xFF, address >> 8, len(data) & 0xFF, len(data) >> 8]) + bytes(data)
        needed = (len(content) + SECTOR - 1) // SECTOR
        if needed > 122 or len(lists) != 1:
            raise DosError(f'{name}: only single-list files can be rewritten here')
        vtoc = bytearray(self.sector(CATALOG_TRACK, 0))
        while len(sectors) < needed:
            sectors.append(self._allocate(vtoc, reserved_tracks))
        self.write_sector(CATALOG_TRACK, 0, vtoc)
        tsl = bytearray(SECTOR)
        for index, (t, s) in enumerate(sectors[:needed]):
            tsl[0x0C + (index * 2)], tsl[0x0D + (index * 2)] = t, s
            self.write_sector(t, s, content[index * SECTOR:(index + 1) * SECTOR])
        self.write_sector(lists[0][0], lists[0][1], tsl)
        count = needed + 1
        catalog[at + 33], catalog[at + 34] = count & 0xFF, count >> 8
        self.write_sector(track, sector, catalog)

    @staticmethod
    def _allocate(vtoc, reserved_tracks):
        for track in list(range(CATALOG_TRACK + 1, TRACKS)) + list(range(CATALOG_TRACK - 1, 0, -1)):
            if track < reserved_tracks:
                continue
            for sector in range(SECTORS_PER_TRACK - 1, -1, -1):
                byte = 0x38 + (track * 4) + (0 if sector >= 8 else 1)
                bit = 1 << (sector & 7)
                if vtoc[byte] & bit:
                    vtoc[byte] &= ~bit
                    return track, sector
        raise DosError('DISK FULL')


def format_disk(files):
    """A synthetic disk holding the given {name: (address, data)} binary files, for tests."""
    image = bytearray(IMAGE_SIZE)
    vtoc = bytearray(SECTOR)
    vtoc[1], vtoc[2], vtoc[3], vtoc[0x27], vtoc[0x34], vtoc[0x35], vtoc[0x37] = CATALOG_TRACK, 15, 3, 122, TRACKS, 16, 1
    disk = Disk(image)
    free = [(t, s) for t in list(range(CATALOG_TRACK + 1, TRACKS)) + list(range(3, CATALOG_TRACK)) for s in range(SECTORS_PER_TRACK)]
    used = set()

    def take():
        if not free:
            raise DosError('DISK FULL')
        used.add(free[0])
        return free.pop(0)

    catalogs = [bytearray(SECTOR) for _ in range(15)]
    for sector_index in range(14):
        catalogs[sector_index][1], catalogs[sector_index][2] = CATALOG_TRACK, 14 - sector_index
    for slot, (name, (address, data)) in enumerate(files.items()):
        catalog = catalogs[slot // 7]
        content = bytes([address & 0xFF, address >> 8, len(data) & 0xFF, len(data) >> 8]) + bytes(data)
        list_at = take()
        tsl = bytearray(SECTOR)
        for index in range((len(content) + SECTOR - 1) // SECTOR):
            t, s = take()
            tsl[0x0C + (index * 2)], tsl[0x0D + (index * 2)] = t, s
            disk.write_sector(t, s, content[index * SECTOR:(index + 1) * SECTOR])
        disk.write_sector(*list_at, tsl)
        at = 0x0B + ((slot % 7) * 35)
        catalog[at], catalog[at + 1], catalog[at + 2] = list_at[0], list_at[1], BINARY
        catalog[at + 3:at + 33] = bytes((ord(c) | 0x80) for c in name.ljust(30))
        catalog[at + 33] = 2
    for sector_index, catalog in enumerate(catalogs):
        disk.write_sector(CATALOG_TRACK, 15 - sector_index, catalog)
    for track, sector in free:
        vtoc[0x38 + (track * 4) + (0 if sector >= 8 else 1)] |= 1 << (sector & 7)
    disk.write_sector(CATALOG_TRACK, 0, vtoc)
    return disk
