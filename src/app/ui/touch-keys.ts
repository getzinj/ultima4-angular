import { KEY_DOWN_ARROW, KEY_ESCAPE, KEY_LEFT_ARROW, KEY_RETURN, KEY_RIGHT_ARROW, KEY_UP_ARROW } from '../runtime/keyboard';

export interface ITouchKey {
  readonly label: string;
  /** What a screen reader says: the command, not the key. */
  readonly description: string;
  readonly code: number;
}


function letter(character: string): number {
  return character.charCodeAt(0) | 0x80;
}


/** The four arrows, which move the party and aim every directed command. */
export const MOVEMENT_KEYS: readonly ITouchKey[] = [
  { label: '↑', description: 'North', code: KEY_UP_ARROW },
  { label: '←', description: 'West', code: KEY_LEFT_ARROW },
  { label: '→', description: 'East', code: KEY_RIGHT_ARROW },
  { label: '↓', description: 'South', code: KEY_DOWN_ARROW },
];

/** The commands most turns need; the device keyboard has the rest. */
export const COMMAND_KEYS: readonly ITouchKey[] = [
  { label: 'A', description: 'Attack', code: letter('A') },
  { label: 'T', description: 'Talk', code: letter('T') },
  { label: 'E', description: 'Enter', code: letter('E') },
  { label: 'G', description: 'Get a chest', code: letter('G') },
  { label: 'K', description: 'Klimb', code: letter('K') },
  { label: 'D', description: 'Descend', code: letter('D') },
  { label: 'Pass', description: 'Pass a turn', code: letter(' ') },
  { label: 'Return', description: 'Return', code: KEY_RETURN },
  { label: 'Esc', description: 'Escape', code: KEY_ESCAPE },
];
