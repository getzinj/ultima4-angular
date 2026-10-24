import { LanguageCard } from './language-card';


function readTwice(card: LanguageCard, address: number): void {
  card.switch(address, false);
  card.switch(address, false);
}


describe('LanguageCard', (): void => {
  describe('after reset', (): void => {
    it('reads ROM', (): void => {
      expect(new LanguageCard().readsRam).toBe(false);
    });

    it('writes RAM', (): void => {
      expect(new LanguageCard().writesRam).toBe(true);
    });

    it('is on bank 2', (): void => {
      expect(new LanguageCard().bank).toBe(2);
    });
  });

  describe('$C083 read twice', (): void => {
    it('reads RAM', (): void => {
      const card: LanguageCard = new LanguageCard();

      readTwice(card, 0xC083);

      expect(card.readsRam).toBe(true);
    });

    it('writes RAM', (): void => {
      const card: LanguageCard = new LanguageCard();

      card.switch(0xC082, false);
      readTwice(card, 0xC083);

      expect(card.writesRam).toBe(true);
    });
  });

  describe('$C083 read once after an even switch', (): void => {
    it('does not yet write RAM', (): void => {
      const card: LanguageCard = new LanguageCard();

      card.switch(0xC082, false);
      card.switch(0xC083, false);

      expect(card.writesRam).toBe(false);
    });
  });

  describe('$C083 written twice', (): void => {
    it('does not enable writing', (): void => {
      const card: LanguageCard = new LanguageCard();

      card.switch(0xC082, false);
      card.switch(0xC083, true);
      card.switch(0xC083, true);

      expect(card.writesRam).toBe(false);
    });
  });

  describe('$C08B', (): void => {
    it('selects bank 1', (): void => {
      const card: LanguageCard = new LanguageCard();

      readTwice(card, 0xC08B);

      expect(card.bank).toBe(1);
    });
  });

  describe('$C081', (): void => {
    it('reads ROM', (): void => {
      const card: LanguageCard = new LanguageCard();

      readTwice(card, 0xC083);
      card.switch(0xC081, false);

      expect(card.readsRam).toBe(false);
    });
  });

  describe('banks', (): void => {
    it('keeps $D000 of bank 1 apart from bank 2', (): void => {
      const card: LanguageCard = new LanguageCard();

      readTwice(card, 0xC08B);
      card.write(0xD000, 0x11);
      readTwice(card, 0xC083);
      card.write(0xD000, 0x22);
      readTwice(card, 0xC08B);

      expect(card.read(0xD000)).toBe(0x11);
    });

    it('shares $E000 between the banks', (): void => {
      const card: LanguageCard = new LanguageCard();

      readTwice(card, 0xC08B);
      card.write(0xE000, 0x33);
      readTwice(card, 0xC083);

      expect(card.read(0xE000)).toBe(0x33);
    });

    it('ignores a write while writing is off', (): void => {
      const card: LanguageCard = new LanguageCard();

      card.switch(0xC080, false);
      card.write(0xD123, 0x44);

      expect(card.read(0xD123)).toBe(0);
    });
  });

  describe('contents', (): void => {
    it('shows bank 1 as written', (): void => {
      const card: LanguageCard = new LanguageCard();

      readTwice(card, 0xC08B);
      card.write(0xD010, 0x55);

      expect(card.contents('bank1')[0x10]).toBe(0x55);
    });

    it('shows the high 8 KB as written', (): void => {
      const card: LanguageCard = new LanguageCard();

      card.write(0xE010, 0x66);

      expect(card.contents('high')[0x10]).toBe(0x66);
    });
  });

  describe('armedForWrite', (): void => {
    it('is set by one read of an odd switch', (): void => {
      const card: LanguageCard = new LanguageCard();

      card.switch(0xC083, false);

      expect(card.armedForWrite).toBe(true);
    });

    it('is cleared by an even switch', (): void => {
      const card: LanguageCard = new LanguageCard();

      card.switch(0xC083, false);
      card.switch(0xC080, false);

      expect(card.armedForWrite).toBe(false);
    });
  });
});
