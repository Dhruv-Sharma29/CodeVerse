import { visitorIdentity } from './oracle.mjs';

const API = 'https://api.github.com';
const HOUR = 3_600_000;
const CLIENT_LIMIT = 100;
const INSTANCE_LIMIT = 3_000;
const CACHE_LIMIT = 500;
const HANDLE = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const REPO = /^[a-z\d_.-]{1,100}$/i;
const SHA = /^[a-f\d]{40}$/i;

function target(url) {
  const kind = url.searchParams.get('kind');
  const handle = url.searchParams.get('handle') ?? '';
  const owner = url.searchParams.get('owner') ?? '';
  const repo = url.searchParams.get('repo') ?? '';
  const page = Number(url.searchParams.get('page') ?? '1');
  const sha = url.searchParams.get('sha') ?? '';
  const branch = url.searchParams.get('branch') ?? '';
  if (!Number.isInteger(page) || page < 1 || page > 10) return null;
  const validHandle = value => HANDLE.test(value) && !value.includes('--');
  if (kind === 'profile' && validHandle(handle)) return { kind, paths:[`/users/${handle}`] };
  if (kind === 'repositories' && validHandle(handle)) {
    const organization = url.searchParams.get('type') === 'organization';
    return { kind, paths:[organization
      ? `/orgs/${handle}/repos?type=public&sort=pushed&direction=desc&per_page=100&page=${page}`
      : `/users/${handle}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=${page}`] };
  }
  if (!validHandle(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  const prefix = `/repos/${owner}/${repo}`;
  if (kind === 'commits' && branch.length <= 255 && ![...branch].some(character => character.charCodeAt(0) < 32)) {
    return { kind, paths:[`${prefix}/commits?${branch ? `sha=${encodeURIComponent(branch)}&` : ''}per_page=60`] };
  }
  if (kind === 'commit' && SHA.test(sha)) return { kind, paths:[`${prefix}/commits/${sha}?per_page=100`] };
  if (kind === 'contributors') return { kind, paths:[`${prefix}/contributors?per_page=12`] };
  if (kind === 'moons') return { kind, paths:[`${prefix}/branches?per_page=6`, `${prefix}/releases?per_page=4`] };
  return null;
}

export function createGitHubProxy({ fetchImpl = fetch, token = () => process.env.GITHUB_TOKEN, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  const clients = new Map();
  let windowStart = 0;
  let total = 0;
  function charge(client, amount) {
    if (now() - windowStart >= HOUR) { windowStart = now(); total = 0; clients.clear(); }
    if (clients.size >= 1_000 && !clients.has(client)) throw { status:429, message:'The GitHub request budget is temporarily full.' };
    if ((clients.get(client) ?? 0) + amount > CLIENT_LIMIT || total + amount > INSTANCE_LIMIT) {
      throw { status:429, message:'The GitHub request budget is temporarily full.' };
    }
    clients.set(client, (clients.get(client) ?? 0) + amount);
    total += amount;
  }
  async function upstream(path, credential) {
    const response = await fetchImpl(`${API}${path}`, {
      headers:{ Accept:'application/vnd.github+json', Authorization:`Bearer ${credential}`, 'User-Agent':'Codeverse public explorer' },
      signal:AbortSignal.timeout(12_000),
    });
    if (response.status === 204 || response.status === 409) return { data:[], hasMore:false };
    if (!response.ok) throw { status:response.status === 404 ? 404 : response.status === 403 || response.status === 429 ? 429 : 502,
      message:response.status === 404 ? 'GitHub could not find this public resource.' : 'GitHub is temporarily unavailable or its request budget is full.' };
    const raw = await response.text();
    if (raw.length > 3_000_000) throw { status:502, message:'GitHub returned too much data.' };
    return { data:JSON.parse(raw), hasMore:(response.headers.get('link') ?? '').includes('rel="next"') };
  }
  async function get(url, client) {
    const credential = token();
    if (!credential || credential.includes('your-key-here')) throw { status:503, message:'The GitHub proxy is not configured.' };
    const request = target(url);
    if (!request) throw { status:400, message:'Choose a public GitHub profile or repository.' };
    const key = request.paths.join('|');
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.value;
    if (pending.has(key)) return pending.get(key);
    charge(client, request.paths.length);
    const work = (async () => {
      const values = await Promise.all(request.paths.map(path => upstream(path, credential)));
      const value = request.kind === 'moons'
        ? { branches:values[0].data, releases:values[1].data, branchesHaveMore:values[0].hasMore, releasesHaveMore:values[1].hasMore }
        : values[0];
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires:now() + (request.kind === 'moons' ? 600_000 : 300_000) });
      return value;
    })().finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  }
  return { available:() => { const credential = token(); return Boolean(credential && !credential.includes('your-key-here')); }, get };
}

const proxy = createGitHubProxy();
export async function githubMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/github' && url.pathname !== '/api/github/status') return next();
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error:'Use GET for public GitHub data.' });
  if (url.pathname === '/api/github/status') return send(200, { available:proxy.available() });
  try { return send(200, await proxy.get(url, visitorIdentity(req))); }
  catch (error) { return send(error.status ?? 502, { error:error.status ? error.message : 'GitHub data could not be loaded.' }); }
}
