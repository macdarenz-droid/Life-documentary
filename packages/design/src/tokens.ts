import { color } from './color';
import { haptics, motion } from './motion';
import { type } from './type';

export const space = [0, 4, 8, 12, 16, 24, 32, 48, 64] as const;
export const radius = { sm: 6, md: 12, lg: 20 } as const;
export const border = { outline: 1, ring: 2 } as const;

export const tokens = { color, type, motion, space, radius, border, haptics } as const;

export type Tokens = typeof tokens;
