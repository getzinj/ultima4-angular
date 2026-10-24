import type { OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import type { InputSignal, Signal, WritableSignal } from '@angular/core';

import type { AppleMachine } from '../runtime/apple-machine';
import type { IApplePalette } from '../runtime/apple-palette';
import { NTSC_ARTIFACT_PALETTE } from '../runtime/apple-palette';
import { renderHires } from '../runtime/hires-renderer';
import { SCREEN_HEIGHT, SCREEN_WIDTH, integerScaleFor } from './integer-scale';


@Component({
  selector: 'ultima4-apple-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #canvas
      [attr.width]="width"
      [attr.height]="height"
      [style.width.px]="width * scale()"
      [style.height.px]="height * scale()"
      aria-label="Ultima IV"
    ></canvas>
  `,
  styles: [ ':host { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; } canvas { image-rendering: pixelated; background: #000; }' ],
})
export class AppleScreenComponent implements OnDestroy {
  public readonly machine: InputSignal<AppleMachine> = input.required<AppleMachine>();
  public readonly palette: InputSignal<IApplePalette> = input<IApplePalette>(NTSC_ARTIFACT_PALETTE);

  protected readonly width: number = SCREEN_WIDTH;
  protected readonly height: number = SCREEN_HEIGHT;
  protected readonly scale: WritableSignal<number> = signal<number>(1);

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly canvas: Signal<ElementRef<HTMLCanvasElement>> = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private frameHandle: number = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lastPalette: IApplePalette | null = null;


  constructor() {
    afterNextRender((): void => {
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((): void => this.rescale());
        this.resizeObserver.observe(this.host.nativeElement);
      }
      this.rescale();
      this.paintLoop();
    });
  }


  public ngOnDestroy(): void {
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.frameHandle);
    }
    this.resizeObserver?.disconnect();
  }


  /** Paints the machine's page if it changed since the last frame. */
  public paint(): void {
    const machine: AppleMachine = this.machine();
    const palette: IApplePalette = this.palette();
    const context: CanvasRenderingContext2D | null = this.canvas().nativeElement.getContext('2d');

    if ((context != null) && (machine.dirty || (palette !== this.lastPalette))) {
      const pixels: ImageData = context.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

      renderHires(machine.displayedPage, pixels.data, palette);
      context.putImageData(pixels, 0, 0);
      machine.dirty = false;
      this.lastPalette = palette;
    }
  }


  private paintLoop(): void {
    this.paint();

    if (typeof requestAnimationFrame !== 'undefined') {
      this.frameHandle = requestAnimationFrame((): void => this.paintLoop());
    }
  }


  private rescale(): void {
    const box: DOMRect = this.host.nativeElement.getBoundingClientRect();

    if ((box.width > 0) && (box.height > 0)) {
      this.scale.set(integerScaleFor(box.width, box.height));
    }
  }

}
