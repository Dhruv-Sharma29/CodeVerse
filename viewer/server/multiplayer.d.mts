import type { EventEmitter } from 'node:events';
export const PLAY_PATH: string;
/** Accepts any Node HTTP(S) server, including Vite's dev and preview servers. */
export interface RelayStats { since: string; connections: number; sessions: number; joins: number; joinsWithCompany: number; peakPilots: number; peakRoom: { room: string; pilots: number }; pilotsOnline: number; roomsActive: number; hyperjumpsPerSession: number; shareOfJoinsWithCompany: number }
export function attachMultiplayer(httpServer: EventEmitter | null | undefined, options?: { origins?: string[] }): { stats: () => RelayStats } | null;
export function createRelay(): unknown;
