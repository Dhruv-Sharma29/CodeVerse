import type { GitHubProfile, Repository } from "./api";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export interface ProfileSummary {
  publicRepositories: number;
  loadedRepositories: number;
  isComplete: boolean;
  stars: number;
  recentlyPushed: number;
  languages: { name: string; repositories: number }[];
}

export function summarizeProfile(profile: GitHubProfile, repositories: Repository[], now = Date.now()): ProfileSummary {
  const languages = new Map<string, number>();
  let stars = 0;
  let recentlyPushed = 0;
  const cutoff = now - NINETY_DAYS_MS;

  for (const repository of repositories) {
    stars += repository.stargazers_count;
    const pushed = Date.parse(repository.pushed_at);
    if (Number.isFinite(pushed) && pushed >= cutoff) recentlyPushed += 1;
    if (repository.language) languages.set(repository.language, (languages.get(repository.language) ?? 0) + 1);
  }

  return {
    publicRepositories: profile.public_repos,
    loadedRepositories: repositories.length,
    isComplete: repositories.length >= profile.public_repos,
    stars,
    recentlyPushed,
    languages: [...languages].map(([name, count]) => ({ name, repositories: count }))
      .sort((a, b) => b.repositories - a.repositories || a.name.localeCompare(b.name))
      .slice(0, 3),
  };
}

export function loadedCoverage(summary: ProfileSummary): string {
  return summary.isComplete
    ? `across all ${summary.publicRepositories.toLocaleString()} public repositories`
    : `across ${summary.loadedRepositories.toLocaleString()} of ${summary.publicRepositories.toLocaleString()} repositories loaded`;
}
