import type { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
export const PLAY_PATH: string;
export const BOARD_PATH: string;
export const CHECK: { rate: number; burst: number; speed: number };
export interface Leader { name: string; score: number }
export interface Board {
  kind: 'upstash' | 'memory';
  add(name: string, room: string, run: number, stint: number, day?: string): Promise<void>;
  top(room: string, day?: string): Promise<{ all: Leader[]; daily: Leader[] }>;
}
/** Accepts any Node HTTP(S) server, including Vite's dev and preview servers. */
export interface RelayStats { since: string; flagged: number; connections: number; sessions: number; joins: number; joinsWithCompany: number; peakPilots: number; peakRoom: { room: string; pilots: number }; pilotsOnline: number; roomsActive: number; hyperjumpsPerSession: number; shareOfJoinsWithCompany: number }
export interface Relay { stats: () => RelayStats; boards: (room: string) => Promise<{ day: string; room: string; all: Leader[]; daily: Leader[] }> }
export function attachMultiplayer(httpServer: EventEmitter | null | undefined, options?: { origins?: string[]; board?: Board }): Relay | null;
export function boardMiddleware(relay: Relay | null): (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;
export function createRelay(options?: { board?: Board }): unknown;
