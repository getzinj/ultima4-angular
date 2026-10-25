import type { INativeModule } from '../lifted-runtime/native-module';
import { HELP_MODULE } from './program/britannia/help';
import { HOLE_MODULE } from './program/britannia/hole';
import { LORD_MODULE } from './program/britannia/lord';
import { SAVE_MODULE } from './program/britannia/save';
import { SEAR_MODULE } from './program/britannia/sear';
import { SHRN_MODULE } from './program/britannia/shrn';
import { TMAP_MODULE } from './program/britannia/tmap';
import { USE_MODULE } from './program/britannia/use';
import { BOOT_MODULE } from './program/boot-module';
import { INIT_MODULE } from './program/init-module';
import { NEWGAME_MODULE } from './program/newgame-module';
import { SEL_MODULE } from './program/sel-module';
import { SUBS_MODULE } from './program/subs-module';
import { TALK_MODULE } from './program/towne/talk';
import { TOWNE_SEAR_MODULE } from './program/towne/sear';
import { TOWNE_TMAP_MODULE } from './program/towne/tmap';
import { TOWNE_USE_MODULE } from './program/towne/use';
import { ULT4_MODULE } from './program/ult4-module';

/** Every program ported so far; the machine runs them in place of their lifted modules. */
export const PORTED_MODULES: readonly INativeModule[] = [
  INIT_MODULE,
  BOOT_MODULE,
  NEWGAME_MODULE,
  SEL_MODULE,
  SUBS_MODULE,
  ULT4_MODULE,
  HELP_MODULE,
  HOLE_MODULE,
  LORD_MODULE,
  SAVE_MODULE,
  SEAR_MODULE,
  SHRN_MODULE,
  TMAP_MODULE,
  USE_MODULE,
  TALK_MODULE,
  TOWNE_SEAR_MODULE,
  TOWNE_TMAP_MODULE,
  TOWNE_USE_MODULE,
];
