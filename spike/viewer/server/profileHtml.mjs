import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const SITE_ORIGIN = 'https://codeverse-orbit.vercel.app';

export const SUCCESS_TTL = 3600_000; // 1 hour
export const FAILURE_TTL = 120_000;  // 2 minutes
export const MAX_CACHE_ENTRIES = 200;

export const profileCache = new Map();

export function _clearProfileCache() {
  profileCache.clear();
}

export function isValidHandle(input) {
  const handle = (input || '').trim().replace(/^@/, '').replace(/\/$/, '');
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(handle) && !handle.includes('--');
}

export function escapeHtmlAttr(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);

export function buildProfileMeta(user, repos = []) {
  const login = user.login;
  const name = user.name && user.name.trim() ? user.name.trim() : null;
  const title = name && name !== login ? `${name} (@${login}) — Codeverse` : `@${login} — Codeverse`;

  const repoCount = Number(user.public_repos ?? (Array.isArray(repos) ? repos.length : 0)) || 0;
  const totalStars = Array.isArray(repos) ? repos.reduce((sum, r) => sum + (Number(r?.stargazers_count) || 0), 0) : 0;

  let description;
  if (user.bio && typeof user.bio === 'string' && user.bio.trim()) {
    const cleanBio = user.bio.trim().replace(/\s+/g, ' ').slice(0, 300);
    const parts = [cleanBio];
    if (repoCount) parts.push(`${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}`);
    if (totalStars) parts.push(`⭐ ${compact(totalStars)}`);
    parts.push('Explore this GitHub universe in 3D orbit.');
    description = parts.join(' · ');
  } else {
    description = `Explore @${login}’s GitHub universe: ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}${totalStars ? `, ⭐ ${compact(totalStars)}` : ''}, and recent commits in 3D orbit.`;
  }

  return { login, title, description, repoCount, totalStars };
}

export function injectProfileMeta(html, meta, handle = '', siteOrigin = SITE_ORIGIN) {
  const cleanOrigin = siteOrigin.replace(/\/$/, '');
  let result = html.replaceAll('__SITE_ORIGIN__', cleanOrigin);

  if (!meta) {
    // Fallback: keep default title and description, update URL and canonical if handle is valid
    if (handle && isValidHandle(handle)) {
      const pageUrl = `${cleanOrigin}/@${escapeHtmlAttr(handle.replace(/^@/, '').replace(/\/$/, ''))}`;
      result = result.replace(/<meta property="og:url" content="[^"]*"/, () => `<meta property="og:url" content="${pageUrl}"`);
      if (!result.includes('rel="canonical"')) {
        result = result.replace(/<meta property="og:url"[^>]*>/, (match) => `${match}\n    <link rel="canonical" href="${pageUrl}" />`);
      } else {
        result = result.replace(/<link rel="canonical" href="[^"]*"/, () => `<link rel="canonical" href="${pageUrl}"`);
      }
    }
    return result;
  }

  const pageUrl = `${cleanOrigin}/@${escapeHtmlAttr(meta.login)}`;
  const titleEsc = escapeHtmlAttr(meta.title);
  const descEsc = escapeHtmlAttr(meta.description);

  result = result.replace(/<title>[^<]*<\/title>/, () => `<title>${titleEsc}</title>`);
  result = result.replace(/<meta name="description" content="[^"]*"/, () => `<meta name="description" content="${descEsc}"`);
  result = result.replace(/<meta property="og:title" content="[^"]*"/, () => `<meta property="og:title" content="${titleEsc}"`);
  result = result.replace(/<meta property="og:description" content="[^"]*"/, () => `<meta property="og:description" content="${descEsc}"`);
  result = result.replace(/<meta property="og:url" content="[^"]*"/, () => `<meta property="og:url" content="${pageUrl}"`);
  result = result.replace(/<meta name="twitter:title" content="[^"]*"/, () => `<meta name="twitter:title" content="${titleEsc}"`);
  result = result.replace(/<meta name="twitter:description" content="[^"]*"/, () => `<meta name="twitter:description" content="${descEsc}"`);

  if (!result.includes('rel="canonical"')) {
    result = result.replace(/<meta property="og:url"[^>]*>/, (match) => `${match}\n    <link rel="canonical" href="${pageUrl}" />`);
  } else {
    result = result.replace(/<link rel="canonical" href="[^"]*"/, () => `<link rel="canonical" href="${pageUrl}"`);
  }

  return result;
}

function recordCacheEntry(normalized, isError, data) {
  profileCache.delete(normalized);
  if (profileCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = profileCache.keys().next().value;
    profileCache.delete(oldestKey);
  }
  profileCache.set(normalized, { time: Date.now(), isError, data });
}

export async function fetchProfileData(handle) {
  const normalized = handle.toLowerCase();
  const cached = profileCache.get(normalized);
  if (cached) {
    const ttl = cached.isError ? FAILURE_TTL : SUCCESS_TTL;
    if (Date.now() - cached.time < ttl) {
      return cached.data;
    }
    profileCache.delete(normalized);
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Codeverse-Metadata-Server',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`https://api.github.com/users/${encodeURIComponent(handle)}/repos?per_page=6&sort=pushed`, { headers, signal: AbortSignal.timeout(5000) }),
    ]);

    if (!userRes.ok) {
      // 404, 403, 429, etc.
      recordCacheEntry(normalized, true, null);
      return null;
    }

    const user = await userRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];
    const meta = buildProfileMeta(user, Array.isArray(repos) ? repos : []);

    recordCacheEntry(normalized, false, meta);
    return meta;
  } catch {
    recordCacheEntry(normalized, true, null);
    return null;
  }
}

let cachedTemplate;
export async function getTemplateHtml() {
  if (cachedTemplate) return cachedTemplate;
  const candidates = [
    resolve(process.cwd(), 'dist/index.html'),
    resolve(process.cwd(), 'spike/viewer/dist/index.html'),
    fileURLToPath(new URL('../dist/index.html', import.meta.url)),
    resolve(process.cwd(), 'index.html'),
    resolve(process.cwd(), 'spike/viewer/index.html'),
    fileURLToPath(new URL('../index.html', import.meta.url)),
  ];
  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, 'utf-8');
      if (content) {
        cachedTemplate = content;
        return content;
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('index.html template not found');
}

export function createProfileHtmlMiddleware(options = {}) {
  return async function profileHtmlMiddleware(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    let rawHandle;
    const match = url.pathname.match(/^\/@([^/]+)\/?$/);
    if (match) {
      rawHandle = match[1];
    } else if (url.pathname === '/api/handle' || url.pathname.startsWith('/api/handle/')) {
      rawHandle = url.searchParams.get('handle') || (req.query && req.query.handle);
      if (!rawHandle) return next();
    } else {
      return next();
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end();
      return;
    }

    let handle;
    try { handle = decodeURIComponent(rawHandle); } catch { handle = rawHandle; }
    handle = handle.trim().replace(/^@/, '').replace(/\/$/, '');

    let template;
    try {
      template = await getTemplateHtml();
    } catch {
      return next();
    }

    if (!isValidHandle(handle)) {
      let html = injectProfileMeta(template, null, handle, SITE_ORIGIN);
      if (options.transformHtml) {
        try { html = await options.transformHtml(req.url, html); } catch { /* ignore transform error */ }
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
      res.end(req.method === 'HEAD' ? undefined : html);
      return;
    }

    const meta = await fetchProfileData(handle);
    let html = injectProfileMeta(template, meta, handle, SITE_ORIGIN);
    if (options.transformHtml) {
      try { html = await options.transformHtml(req.url, html); } catch { /* ignore transform error */ }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (meta) {
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    } else {
      // Graceful fallback on lookup failure / rate limit
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    }

    res.end(req.method === 'HEAD' ? undefined : html);
  };
}

export const profileHtmlMiddleware = createProfileHtmlMiddleware();

