import type { IncomingMessage, ServerResponse } from 'node:http';
export function githubMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void>;
