import type { IncomingMessage, ServerResponse } from "node:http";
export function ogMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> | void;
export function generateUniverseSvg(user: unknown, repos?: unknown[]): string;
