import type { EventEmitter } from 'node:events';
export const PLAY_PATH: string;
/** Accepts any Node HTTP(S) server, including Vite's dev and preview servers. */
export function attachMultiplayer(httpServer: EventEmitter | null | undefined, options?: { origins?: string[] }): unknown;
export function createRelay(): unknown;
