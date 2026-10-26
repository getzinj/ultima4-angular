import type { OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import type { InputSignal, Signal, WritableSignal } from '@angular/core';

import type { AppleMachine } from '../runtime/apple-machine';
import type { IApplePalette } from '../runtime/apple-palette';
import { NTSC_ARTIFACT_PALETTE } from '../runtime/apple-palette';
import { renderHires } from '../runtime/hires-renderer';
import type { IScreenSize } from './screen-fit';
import { SCREEN_HEIGHT, SCREEN_WIDTH, fitScreen } from './screen-fit';


/**
 * The monitor: the 280 by 192 picture at 4:3, scaled to the space it has. With the CRT effect on it
 * is smoothed a little, lit up by a blurred copy of itself (the phosphor glow) and crossed by one
 * dark scanline for each of the Apple's 192 rows; with it off the pixels stay hard.
 */
@Component({
  selector: 'ultima4-apple-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="monitor"
      [class.crt]="crt()"
      [style.width.px]="size().width"
      [style.height.px]="size().height"
      [style.--row]="rowHeight() + 'px'"
    >
      <canvas #canvas class="picture" [attr.width]="width" [attr.height]="height" role="img" aria-label="Ultima IV"></canvas>
      @if (crt()) {
        <canvas #glow class="glow" [attr.width]="width" [attr.height]="height" aria-hidden="true"></canvas>
        <div class="scanlines" aria-hidden="true"></div>
      }
    </div>
  `,
  styles: [ `
    :host { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
    .monitor { position: relative; background: #000; overflow: hidden; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; }
    .crt canvas.picture { image-rendering: auto; }
    .glow { image-rendering: auto; filter: blur(calc(var(--row) * 0.9)) brightness(1.3); mix-blend-mode: screen; opacity: 0.55; pointer-events: none; }
    .scanlines {
      position: absolute; inset: 0; pointer-events: none;
      background: repeating-linear-gradient(to bottom,
        rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0) calc(var(--row) * 0.55),
        rgba(0, 0, 0, 0.35) calc(var(--row) * 0.55), rgba(0, 0, 0, 0.35) var(--row));
    }
  ` ],
})
export class AppleScreenComponent implements OnDestroy {
  public readonly machine: InputSignal<AppleMachine> = input.required<AppleMachine>();
  public readonly palette: InputSignal<IApplePalette> = input<IApplePalette>(NTSC_ARTIFACT_PALETTE);
  public readonly crt: InputSignal<boolean> = input<boolean>(true);

  protected readonly width: number = SCREEN_WIDTH;
  protected readonly height: number = SCREEN_HEIGHT;
  protected readonly available: WritableSignal<IScreenSize> = signal<IScreenSize>({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
  protected readonly size: Signal<IScreenSize> = computed((): IScreenSize => fitScreen(this.available().width, this.available().height));
  protected readonly rowHeight: Signal<number> = computed((): number => this.size().height / SCREEN_HEIGHT);

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly canvas: Signal<ElementRef<HTMLCanvasElement>> = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly glow: Signal<ElementRef<HTMLCanvasElement> | undefined> = viewChild<ElementRef<HTMLCanvasElement>>('glow');
  private frameHandle: number = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lastPalette: IApplePalette | null = null;
  private lastGlow: HTMLCanvasElement | null = null;


  constructor() {
    afterNextRender((): void => {
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((): void => this.measure());
        this.resizeObserver.observe(this.host.nativeElement);
      }
      this.measure();
      this.paintLoop();
    });
  }


  public ngOnDestroy(): void {
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.frameHandle);
    }
    this.resizeObserver?.disconnect();
  }


  /** Paints the machine's page if it or the palette changed since the last frame, and the glow from it. */
  public paint(): void {
    const machine: AppleMachine = this.machine();
    const palette: IApplePalette = this.palette();
    const picture: HTMLCanvasElement = this.canvas().nativeElement;
    const glow: HTMLCanvasElement | null = this.glow()?.nativeElement ?? null;
    const context: CanvasRenderingContext2D | null = picture.getContext('2d');

    if ((context != null) && (machine.dirty || (palette !== this.lastPalette))) {
      const pixels: ImageData = context.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

      renderHires(machine.displayedPage, pixels.data, palette);
      context.putImageData(pixels, 0, 0);
      machine.dirty = false;
      this.lastPalette = palette;
      this.lastGlow = null;
    }

    if ((context != null) && (glow != null) && (glow !== this.lastGlow)) {
      glow.getContext('2d')?.drawImage(picture, 0, 0);
      this.lastGlow = glow;
    }
  }


  private paintLoop(): void {
    this.paint();

    if (typeof requestAnimationFrame !== 'undefined') {
      this.frameHandle = requestAnimationFrame((): void => this.paintLoop());
    }
  }


  private measure(): void {
    const box: DOMRect = this.host.nativeElement.getBoundingClientRect();

    if ((box.width > 0) && (box.height > 0)) {
      this.available.set({ width: box.width, height: box.height });
    }
  }

}
