import type { IncomingMessage, ServerResponse } from 'node:http';
export function oracleMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void>;
