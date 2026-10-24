import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';

import { SCREEN_HEIGHT, SCREEN_WIDTH, integerScaleFor } from './integer-scale';


@Component({
  selector: 'ultima4-apple-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      [attr.width]="width"
      [attr.height]="height"
      [style.width.px]="width * scale()"
      [style.height.px]="height * scale()"
      aria-label="Ultima IV"
    ></canvas>
  `,
  styles: [ ':host { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; } canvas { image-rendering: pixelated; background: #000; }' ],
})
export class AppleScreenComponent {
  protected readonly width: number = SCREEN_WIDTH;
  protected readonly height: number = SCREEN_HEIGHT;
  protected readonly scale: WritableSignal<number> = signal<number>(1);

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);


  constructor() {
    afterNextRender((): void => {
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver((): void => this.rescale()).observe(this.host.nativeElement);
      }
      this.rescale();
    });
  }


  private rescale(): void {
    const box: DOMRect = this.host.nativeElement.getBoundingClientRect();

    if (box.width > 0 && box.height > 0) {
      this.scale.set(integerScaleFor(box.width, box.height));
    }
  }

}
