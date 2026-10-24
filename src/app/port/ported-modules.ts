import type { INativeModule } from '../lifted-runtime/native-module';
import { SUBS_MODULE } from './program/subs-module';

/** Every program ported so far; the machine runs them in place of their lifted modules. */
export const PORTED_MODULES: readonly INativeModule[] = [
  SUBS_MODULE,
];
