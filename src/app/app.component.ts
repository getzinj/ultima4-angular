import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AppleMachine } from './runtime/apple-machine';
import { drawTestPattern } from './runtime/test-pattern';
import { AppleScreenComponent } from './ui/apple-screen.component';


@Component({
  selector: 'ultima4-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ AppleScreenComponent ],
  template: '<ultima4-apple-screen [machine]="machine" />',
  styles: [ ':host { display: block; width: 100%; height: 100%; }' ],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
  },
})
export class AppComponent {
  protected readonly machine: AppleMachine = new AppleMachine();


  constructor() {
    drawTestPattern(this.machine);
  }


  protected onKeyDown(event: KeyboardEvent): void {
    if (!event.altKey && !event.metaKey && this.machine.keyboard.pressKey(event.key, event.ctrlKey)) {
      event.preventDefault();
    }
  }

}
