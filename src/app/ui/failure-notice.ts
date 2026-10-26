import { Injectable, inject, signal } from '@angular/core';
import type { ErrorHandler, Signal, WritableSignal } from '@angular/core';


export function messageOf(thrown: unknown): string {
  return (thrown instanceof Error) ? thrown.message : String(thrown);
}


/** What went wrong that the player should know of, for the banner; the latest failure, until dismissed. */
@Injectable({ providedIn: 'root' })
export class FailureNotice {
  private readonly latest: WritableSignal<string | null> = signal<string | null>(null);
  public readonly message: Signal<string | null> = this.latest.asReadonly();


  public report(message: string, thrown: unknown): void {
    console.error(message, thrown);
    this.latest.set(`${ message }: ${ messageOf(thrown) }`);
  }


  public dismiss(): void {
    this.latest.set(null);
  }

}


/** Anything thrown that nothing caught, the browser's own errors among them, put on the banner rather than lost in the console. */
@Injectable({ providedIn: 'root' })
export class FailureNoticeErrorHandler implements ErrorHandler {
  private readonly notice: FailureNotice = inject(FailureNotice);


  public handleError(thrown: unknown): void {
    this.notice.report('Something went wrong', thrown);
  }

}
