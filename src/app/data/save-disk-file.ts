import type { ISaveDisk } from './save-disks';
import { UltimaDiskError, identifyDisk } from './ultima-disks';
import type { IIdentifiedDisk } from './ultima-disks';

// Taking a save disk out of the browser, and putting one back. What comes out is the Britannia
// disk itself, a real DOS 3.3 image, so an emulator takes it beside the other three, and what goes
// back in is read by the same identification as the masters.

export interface IExportedDisk {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}


/** A file name that will survive whatever the player's system objects to. */
function toFileName(name: string): string {
  const cleaned: string = name.trim().replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '-');

  return `${ (cleaned.length > 0) ? cleaned : 'ultima4-save' }.do`;
}


export function exportSaveDisk(disk: ISaveDisk): IExportedDisk {
  return { fileName: toFileName(disk.name), bytes: disk.image.slice() };
}


/** A disk image the player handed back, as a Britannia disk's image in DOS order, or why it is none. */
export function importSaveDisk(fileName: string, bytes: Uint8Array): Uint8Array {
  const disk: IIdentifiedDisk = identifyDisk(fileName, bytes);

  if (disk.name !== 'britannia') {
    throw new UltimaDiskError(`${ fileName } is the ${ disk.name } disk; a save disk is a Britannia disk.`);
  } else {
    return disk.dos.image.bytes.slice();
  }
}


/** The name a save disk imported from `fileName` starts with: the file's, without its extension. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, '').trim();
}


/** Hands the file to the browser to save, the only part of this that needs a browser at all. */
export function offerDownload(exported: IExportedDisk): void {
  const url: string = URL.createObjectURL(new Blob([ exported.bytes as BlobPart ], { type: 'application/octet-stream' }));
  const link: HTMLAnchorElement = document.createElement('a');

  link.href = url;
  link.download = exported.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
