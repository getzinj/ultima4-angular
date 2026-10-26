import type { OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, afterNextRender, input, signal } from '@angular/core';
import type { InputSignal, WritableSignal } from '@angular/core';

import type { AppleMachine } from '../runtime/apple-machine';
import { glyphTable, messageLines, newLines, readScreenText, statusLines } from './screen-text';

const POLL_MILLISECONDS: number = 250;
/** The font's place in the language card's high RAM ($E400-$E7FF). */
const FONT_START: number = 0x0400;
const FONT_END: number = 0x0800;
const KEPT_MESSAGES: number = 50;

interface IMessage {
  readonly id: number;
  readonly text: string;
}


/**
 * The screen's text for screen readers, read back through the game's own font: the party's status
 * to be looked at, and every new message announced once the screen has held still for a poll, so a
 * line caught half drawn is not.
 */
@Component({
  selector: 'ultima4-text-mirror',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mirror" aria-label="Party">
      @for (line of status(); track $index) {
        <p>{{ line }}</p>
      }
    </section>
    <div class="mirror" role="log" aria-label="Messages">
      @for (message of messages(); track message.id) {
        <p>{{ message.text }}</p>
      }
    </div>
  `,
  styles: [ '.mirror { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }' ],
})
export class TextMirrorComponent implements OnDestroy {
  public readonly machine: InputSignal<AppleMachine> = input.required<AppleMachine>();

  protected readonly status: WritableSignal<string[]> = signal<string[]>([]);
  protected readonly messages: WritableSignal<IMessage[]> = signal<IMessage[]>([]);

  private shown: string[] = [];
  private settling: string[] = [];
  private nextId: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;


  constructor() {
    afterNextRender((): void => {
      this.refresh();
      this.timer = setInterval((): void => this.refresh(), POLL_MILLISECONDS);
    });
  }


  public ngOnDestroy(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
    }
  }


  /** The screen read again: the status replaced, and what is new added to the messages if the screen read the same last time. */
  public refresh(): void {
    const machine: AppleMachine = this.machine();
    const screen: string[] = readScreenText(machine.displayedPage, glyphTable(machine.languageCard.contents('high').subarray(FONT_START, FONT_END)));
    const lines: string[] = messageLines(screen);
    const status: string[] = statusLines(screen);
    let added: string[] = [];

    if (lines.join('\n') === this.settling.join('\n')) {
      added = newLines(this.shown, lines);
      this.shown = lines;
    } else {
      this.settling = lines;
    }
    if (status.join('\n') !== this.status().join('\n')) {
      this.status.set(status);
    }
    if (added.length > 0) {
      this.messages.update((messages: IMessage[]): IMessage[] =>
        [ ...messages, ...added.map((text: string): IMessage => ({ id: this.nextId++, text })) ].slice(-KEPT_MESSAGES));
    }
  }

}
