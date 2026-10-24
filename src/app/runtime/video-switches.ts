/** The display soft switches, $C050-$C057: each pair is off at its even address and on at its odd one. */
export class VideoSwitches {
  public text: boolean = true;
  public mixed: boolean = false;
  public page2: boolean = false;
  public hires: boolean = false;


  /** A read or write of $C050-$C057. */
  public switch(address: number): void {
    const on: boolean = (address & 1) === 1;

    switch (address & 0x0E) {
      case 0x00:
        this.text = on;
        break;
      case 0x02:
        this.mixed = on;
        break;
      case 0x04:
        this.page2 = on;
        break;
      default:
        this.hires = on;
        break;
    }
  }


  /** Whether the whole screen shows hi-res graphics, as it does through all of Ultima IV. */
  public get fullScreenHires(): boolean {
    return !this.text && !this.mixed && this.hires;
  }

}
