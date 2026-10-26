import { applyConversationCorrections } from './conversation-corrections';
import type { ICorrectionResult } from './conversation-corrections';
import type { IConversation } from './conversations';
import { decodeRetailConversation, encodeFixedConversation } from './conversations';
import { DATA_PATCHES, applyPatch } from './data-patches';
import type { IDataPatch, PatchOutcome } from './data-patches';
import { DiskImage, SECTOR_SIZE, SECTORS_PER_TRACK } from './disk-image';
import { Dos33Disk } from './dos33';
import type { IBinaryFile } from './dos33';
import { DISK_NAMES, RAW_TRACKS } from './ultima-disks';
import type { UltimaDiskName } from './ultima-disks';

// The four disks as the port plays them: working copies of the player's masters with the
// remaster's data fixes applied and the conversations in the remaster's layout, which is what the
// `fixed` branch's own build puts on its disks. The masters are never written.

export type DiskSet = Readonly<Record<UltimaDiskName, Dos33Disk>>;

const TALK_RECORDS: number = RAW_TRACKS.towne * SECTORS_PER_TRACK;


export interface IPreparationReport {
  readonly patches: readonly { readonly patch: IDataPatch; readonly outcome: PatchOutcome }[];
  readonly conversations: 'converted' | 'already-converted';
  readonly skippedCorrections: readonly string[];
}


function copyOf(disk: Dos33Disk): Dos33Disk {
  return new Dos33Disk(new DiskImage(disk.image.bytes.slice()));
}


/** Whether a talk area is already in the remaster's layout: retail records start with a zero byte. */
function talkIsConverted(area: Uint8Array): boolean {
  return area[0] !== 0;
}


async function convertConversations(towne: Dos33Disk): Promise<ICorrectionResult> {
  const area: Uint8Array = towne.image.bytes;
  const retail: IConversation[] = [];

  for (let record: number = 0; record < TALK_RECORDS; record++) {
    retail.push(decodeRetailConversation(area.subarray(record * SECTOR_SIZE, (record + 1) * SECTOR_SIZE)));
  }

  const result: ICorrectionResult = await applyConversationCorrections(retail);

  result.conversations.forEach((conversation: IConversation, record: number): void => {
    area.set(encodeFixedConversation(conversation), record * SECTOR_SIZE);
  });

  return result;
}


function applyDataPatch(disks: DiskSet, patch: IDataPatch): PatchOutcome {
  const disk: Dos33Disk = disks[patch.disk];
  let outcome: PatchOutcome;

  if (patch.file == null) {
    outcome = applyPatch(disk.image.bytes, patch);
  } else {
    const file: IBinaryFile = disk.readBinary(patch.file);
    const data: Uint8Array = file.data.slice();

    outcome = applyPatch(data, patch);
    if (outcome === 'applied') {
      disk.patchBinary(patch.file, data);
    }
  }

  return outcome;
}


export class GameDisks {
  private constructor(private readonly disks: DiskSet, public readonly report: IPreparationReport) {
  }


  public static async prepare(masters: DiskSet): Promise<GameDisks> {
    const disks: DiskSet = Object.fromEntries(DISK_NAMES.map((name: UltimaDiskName): [ UltimaDiskName, Dos33Disk ] => [ name, copyOf(masters[name]) ])) as DiskSet;
    const patches: { patch: IDataPatch; outcome: PatchOutcome }[] = DATA_PATCHES.map((patch: IDataPatch): { patch: IDataPatch; outcome: PatchOutcome } =>
      ({ patch, outcome: applyDataPatch(disks, patch) }));
    let conversations: 'converted' | 'already-converted' = 'already-converted';
    let skippedCorrections: readonly string[] = [];

    if (!talkIsConverted(disks.towne.image.bytes)) {
      skippedCorrections = (await convertConversations(disks.towne)).skipped;
      conversations = 'converted';
    }

    return new GameDisks(disks, { patches, conversations, skippedCorrections });
  }


  /** The working copies, which the game reads and saves to. */
  public get all(): DiskSet {
    return this.disks;
  }


  public disk(name: UltimaDiskName): Dos33Disk {
    return this.disks[name];
  }


  /** BLOAD. */
  public bload(disk: UltimaDiskName, name: string): IBinaryFile {
    return this.disks[disk].readBinary(name);
  }


  /** BSAVE, kept clear of the disk's raw-sector tracks. */
  public bsave(disk: UltimaDiskName, name: string, address: number, data: Uint8Array): void {
    this.disks[disk].writeBinary(name, address, data, RAW_TRACKS[disk]);
  }


  /** The raw-sector area of a disk, tracks 0 up, as `raw-areas.ts` addresses it. */
  public rawArea(disk: UltimaDiskName): Uint8Array {
    return this.disks[disk].image.bytes.subarray(0, RAW_TRACKS[disk] * SECTORS_PER_TRACK * SECTOR_SIZE);
  }

}
