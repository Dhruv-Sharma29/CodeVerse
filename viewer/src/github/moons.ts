import type { MoonData, Repository } from './api';

export interface RepositoryMoon { key:string; label:string; kind:'branch' | 'release'; url:string; defaultBranch:boolean }

export function repositoryMoons(repo: Repository, data: MoonData | null): RepositoryMoon[] {
  const base = `https://github.com/${repo.full_name.split('/').map(encodeURIComponent).join('/')}`;
  const result: RepositoryMoon[] = [];
  const seen = new Set<string>();
  const addBranch = (name: string, defaultBranch: boolean) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    result.push({ key:`branch:${name}`, label:name, kind:'branch',
      url:`${base}/tree/${encodeURIComponent(name)}`, defaultBranch });
  };
  addBranch(repo.default_branch, true);
  for (const branch of data?.branches ?? []) addBranch(branch.name, branch.name === repo.default_branch);
  for (const release of data?.releases ?? []) {
    if (!release.tag_name) continue;
    result.push({ key:`release:${release.id}`, label:release.name || release.tag_name, kind:'release',
      url:`${base}/releases/tag/${encodeURIComponent(release.tag_name)}`, defaultBranch:false });
  }
  return result;
}
