// The 16 KB of RAM over the ROM at $D000-$FFFF, switched by $C080-$C08F the way the IIe's MMU does
// it: bit 3 picks the $D000 bank (set for bank 1), bits 0 and 1 both clear or both set read RAM,
// and an odd address enables writing only on its second read in a row. After reset the IIe reads
// ROM and writes bank 2.

const BANK_SIZE: number = 0x1000;
const HIGH_SIZE: number = 0x2000;


export class LanguageCard {
  private readonly bank1: Uint8Array = new Uint8Array(BANK_SIZE);
  private readonly bank2: Uint8Array = new Uint8Array(BANK_SIZE);
  private readonly high: Uint8Array = new Uint8Array(HIGH_SIZE);

  private bankOne: boolean = false;
  private readEnabled: boolean = false;
  private writeEnabled: boolean = true;
  private preWrite: boolean = false;


  public get readsRam(): boolean {
    return this.readEnabled;
  }


  public get writesRam(): boolean {
    return this.writeEnabled;
  }


  public get bank(): number {
    return this.bankOne ? 1 : 2;
  }


  /** An access to $C080-$C08F. */
  public switch(address: number, isWrite: boolean): void {
    const low: number = address & 3;

    this.bankOne = (address & 8) !== 0;
    this.readEnabled = (low === 0) || (low === 3);

    if ((address & 1) === 0) {
      this.writeEnabled = false;
      this.preWrite = false;
    } else if (isWrite) {
      this.preWrite = false;
    } else {
      if (this.preWrite) {
        this.writeEnabled = true;
      }
      this.preWrite = true;
    }
  }


  /** $D000-$FFFF from RAM. */
  public read(address: number): number {
    const [ ram, offset ]: [ Uint8Array, number ] = this.locate(address);

    return ram[offset];
  }


  /** $D000-$FFFF into RAM, when writing is enabled. */
  public write(address: number, value: number): void {
    if (this.writeEnabled) {
      const [ ram, offset ]: [ Uint8Array, number ] = this.locate(address);

      ram[offset] = value;
    }
  }


  private locate(address: number): [ Uint8Array, number ] {
    if (address >= 0xE000) {
      return [ this.high, address - 0xE000 ];
    } else {
      return [ this.bankOne ? this.bank1 : this.bank2, address - 0xD000 ];
    }
  }

}
