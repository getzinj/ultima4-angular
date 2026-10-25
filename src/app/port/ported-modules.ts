import type { INativeModule } from '../lifted-runtime/native-module';
import { BOOT_MODULE } from './program/boot-module';
import { INIT_MODULE } from './program/init-module';
import { NEWGAME_MODULE } from './program/newgame-module';
import { SEL_MODULE } from './program/sel-module';
import { SUBS_MODULE } from './program/subs-module';
import { ULT4_MODULE } from './program/ult4-module';

/** Every program ported so far; the machine runs them in place of their lifted modules. */
export const PORTED_MODULES: readonly INativeModule[] = [
  INIT_MODULE,
  BOOT_MODULE,
  NEWGAME_MODULE,
  SEL_MODULE,
  SUBS_MODULE,
  ULT4_MODULE,
];
