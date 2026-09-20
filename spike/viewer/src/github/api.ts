export interface GitHubProfile {
  login: string; name: string | null; bio: string | null; public_repos: number;
  followers: number; type: string;
}
export interface Repository {
  id: number; name: string; full_name: string; description: string | null;
  language: string | null; stargazers_count: number; forks_count: number;
  size?: number; pushed_at: string; default_branch: string; fork: boolean; archived: boolean;
}
export interface GitCommit {
  sha: string;
  commit: { message: string; author: { name: string; date: string } | null };
}
export interface CommitDetail extends GitCommit {
  stats: { additions: number; deletions: number; total: number };
  files: { filename: string; previous_filename?: string; status: string; additions: number; deletions: number; patch?: string }[];
}
export interface RepoPage { repositories: Repository[]; hasMore: boolean }

export function normalizeHandle(input: string): string {
  const handle = input.trim().replace(/^https?:\/\/(?:www\.)?github\.com\//i, "").replace(/^@/, "").replace(/\/$/, "");
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(handle) || handle.includes("--")) {
    throw new Error("Enter a GitHub username, such as octocat, or a GitHub profile URL.");
  }
  return handle;
}

const cache = new Map<string, { expires: number; data: unknown; hasMore: boolean }>();
async function request<T>(path: string, signal?: AbortSignal): Promise<{ data: T; hasMore: boolean }> {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return { data: cached.data as T, hasMore: cached.hasMore };
  const response = await fetch(`https://api.github.com${path}`, {
    signal, headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("GitHub couldn’t find this public profile or repository. Check the spelling and try again.");
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const time = reset ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : " Try again shortly.";
      throw new Error(`GitHub has temporarily limited requests from this connection.${time}`);
    }
    if (response.status === 409) return { data: [] as T, hasMore: false }; // empty repository
    throw new Error(`GitHub is unavailable (${response.status}). Please try again.`);
  }
  const data = await response.json() as T;
  const hasMore = (response.headers.get("link") ?? "").includes('rel="next"');
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(path, { data, hasMore, expires: Date.now() + 300_000 });
  return { data, hasMore };
}
export async function fetchProfile(handle: string, signal?: AbortSignal) {
  return (await request<GitHubProfile>(`/users/${encodeURIComponent(normalizeHandle(handle))}`, signal)).data;
}
export async function fetchRepositories(profile: GitHubProfile, page = 1, signal?: AbortSignal): Promise<RepoPage> {
  const kind = profile.type === "Organization" ? "orgs" : "users";
  const type = kind === "orgs" ? "public" : "owner";
  const result = await request<Repository[]>(`/${kind}/${encodeURIComponent(profile.login)}/repos?type=${type}&sort=pushed&direction=desc&per_page=100&page=${page}`, signal);
  return { repositories: result.data, hasMore: result.hasMore };
}
function repoPath(repo: Repository) { return repo.full_name.split("/").map(encodeURIComponent).join("/"); }
export async function fetchCommits(repo: Repository, signal?: AbortSignal) {
  return (await request<GitCommit[]>(`/repos/${repoPath(repo)}/commits?${repo.default_branch ? `sha=${encodeURIComponent(repo.default_branch)}&` : ""}per_page=60`, signal)).data;
}
export async function fetchCommit(repo: Repository, sha: string, signal?: AbortSignal) {
  return (await request<CommitDetail>(`/repos/${repoPath(repo)}/commits/${encodeURIComponent(sha)}?per_page=100`, signal)).data;
}
export const repoUrl = (repo: Repository) => `https://github.com/${repoPath(repo)}`;
export const commitUrl = (repo: Repository, sha: string) => `${repoUrl(repo)}/commit/${encodeURIComponent(sha)}`;
export function errorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Couldn’t reach GitHub. Check your connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
