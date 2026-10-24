import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
  ],
};
