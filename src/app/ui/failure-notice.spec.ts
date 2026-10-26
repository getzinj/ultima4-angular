import { TestBed } from '@angular/core/testing';

import { FailureNotice, FailureNoticeErrorHandler, messageOf } from './failure-notice';


describe('FailureNotice', (): void => {
  let notice: FailureNotice;

  beforeEach((): void => {
    vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    notice = TestBed.inject(FailureNotice);
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('has nothing to say at first', (): void => {
    expect(notice.message()).toBeNull();
  });

  it('says what failed and why', (): void => {
    notice.report('The save disk could not be kept', new Error('quota exceeded'));

    expect(notice.message()).toBe('The save disk could not be kept: quota exceeded');
  });

  it('still logs the failure for whoever opens the console', (): void => {
    const thrown: Error = new Error('quota exceeded');

    notice.report('The save disk could not be kept', thrown);

    expect(console.error).toHaveBeenCalledWith('The save disk could not be kept', thrown);
  });

  it('is cleared when dismissed', (): void => {
    notice.report('The save disk could not be kept', new Error('quota exceeded'));
    notice.dismiss();

    expect(notice.message()).toBeNull();
  });

  it('is given whatever nothing else caught', (): void => {
    TestBed.inject(FailureNoticeErrorHandler).handleError(new TypeError('x is undefined'));

    expect(notice.message()).toBe('Something went wrong: x is undefined');
  });

  it('reads a thrown value that is not an Error as text', (): void => {
    expect(messageOf('disk full')).toBe('disk full');
  });
});
