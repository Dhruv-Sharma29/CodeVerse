import type { IncomingMessage, ServerResponse } from "node:http";

export const SITE_ORIGIN: string;
export const SUCCESS_TTL: number;
export const FAILURE_TTL: number;
export const MAX_CACHE_ENTRIES: number;
export const profileCache: Map<string, { time: number; isError: boolean; data: unknown }>;

export function _clearProfileCache(): void;
export function isValidHandle(input: string): boolean;
export function escapeHtmlAttr(value: unknown): string;
export function buildProfileMeta(user: unknown, repos?: unknown[]): {
  login: string;
  title: string;
  description: string;
  repoCount: number;
  totalStars: number;
};
export function injectProfileMeta(html: string, meta: unknown, handle?: string, siteOrigin?: string): string;
export function fetchProfileData(handle: string): Promise<unknown>;
export function getTemplateHtml(): Promise<string>;
export function createProfileHtmlMiddleware(options?: {
  transformHtml?: (url: string, html: string) => Promise<string> | string;
}): (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void> | void;
export const profileHtmlMiddleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void> | void;
