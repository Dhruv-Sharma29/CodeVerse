
export interface EvolutionTimeline {
  startMs: number;
  endMs: number;
  spanYears: number;
}

export function repoTimestamp(repo: { created_at?: string; pushed_at?: string }): number {
  if (repo.created_at) {
    const time = Date.parse(repo.created_at);
    if (!Number.isNaN(time)) return time;
  }
  if (repo.pushed_at) {
    const time = Date.parse(repo.pushed_at);
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

export function evolutionTimeline<T extends { created_at?: string; pushed_at?: string }>(repositories: T[]): EvolutionTimeline | null {
  const timestamps = repositories
    .map(repoTimestamp)
    .filter((t): t is number => t > 0);

  if (timestamps.length < 2) return null;

  const startMs = Math.min(...timestamps);
  const endMs = Math.max(...timestamps);

  if (startMs >= endMs) return null;

  const spanYears = Math.max(1, Math.round((endMs - startMs) / (365.25 * 86_400_000)));
  return { startMs, endMs, spanYears };
}

export function repositoriesAtTimestamp<T extends { created_at?: string; pushed_at?: string }>(repositories: T[], timestamp: number): T[] {
  return repositories.filter(repo => repoTimestamp(repo) <= timestamp);
}

export function formatEvolutionDate(timestamp: number): string {
  if (!timestamp) return "Beginning";
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(timestamp));
}
