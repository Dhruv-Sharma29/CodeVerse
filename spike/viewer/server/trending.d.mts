import type { IncomingMessage, ServerResponse } from 'node:http';
export function trendingMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void>;
export function parseTrending(html: string): Array<{
  id: number; name: string; full_name: string; description: string | null; language: string | null;
  stargazers_count: number; forks_count: number; monthlyStars: number;
  default_branch: string; fork: boolean; archived: boolean; pushed_at: string;
}>;
