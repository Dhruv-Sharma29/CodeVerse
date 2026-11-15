import { fetchProfile, fetchRepositories, normalizeHandle, type Repository } from "../github/api";
import { repositoryImportance } from "../github/planetStyle";
import type { Universe } from "./sim";

const MAX_WORLDS = 18;

export async function loadTrending(signal?: AbortSignal): Promise<Universe> {
  const response = await fetch("/api/trending", { signal });
  if (!response.ok) throw new Error("Trending is unavailable right now. Jump to a GitHub username instead.");
  const data = await response.json() as { repositories?: Repository[] };
  if (!data.repositories?.length) throw new Error("The trending feed came back empty. Jump to a GitHub username instead.");
  return { room: "trending", title: "Trending hub", subtitle: "GitHub's monthly trending repositories", owner: null, repos: data.repositories.slice(0, MAX_WORLDS) };
}

export async function loadUser(input: string, signal?: AbortSignal): Promise<Universe> {
  const login = normalizeHandle(input);
  const profile = await fetchProfile(login, signal);
  const page = await fetchRepositories(profile, 1, signal);
  const repos = page.repositories.filter(r => !r.fork)
    .sort((a, b) => repositoryImportance(b) - repositoryImportance(a))
    .slice(0, MAX_WORLDS);
  if (!repos.length) throw new Error(`${profile.login} has no public repositories of their own yet.`);
  return {
    room: `u:${profile.login.toLowerCase()}`, title: profile.login, owner: profile.login,
    subtitle: `${profile.type === "Organization" ? "Organization" : "Developer"} · ${profile.public_repos} public repositories`, repos,
  };
}

export const loadUniverse = (target: string, signal?: AbortSignal) =>
  target === "trending" ? loadTrending(signal) : loadUser(target.replace(/^u:/, ""), signal);

export const ownerOf = (repo: Repository) => repo.full_name.split("/")[0];
