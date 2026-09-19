// Fixed upstream: this is intentionally not a general-purpose URL proxy.
const SOURCE = 'https://github.com/trending?since=monthly';
const plain = value => value.replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '})[entity]).replace(/\s+/g, ' ').trim();
const number = value => Number(value.replace(/,/g, ''));
export function parseTrending(html) {
  const articles = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
  const repositories = [];
  for (const article of articles) {
    const heading = article.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '';
    const fullName = heading.match(/href="\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)"/)?.[1];
    const stars = article.match(/href="[^"\s]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/)?.[1];
    const forks = article.match(/href="[^"\s]+\/forks"[^>]*>([\s\S]*?)<\/a>/)?.[1];
    const monthly = plain(article).match(/([\d,]+) stars this month/);
    if (!fullName || !stars || !forks || !monthly) continue;
    const id = article.match(/(?:repository_id|record_id)&quot;:(\d+)/)?.[1];
    let hash = 0;
    for (const ch of fullName) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
    repositories.push({
      id: id ? Number(id) : -Math.abs(hash), name: fullName.split('/')[1], full_name: fullName,
      description: plain(article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '') || null,
      language: plain(article.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '') || null,
      stargazers_count: number(plain(stars)), forks_count: number(plain(forks)), monthlyStars: number(monthly[1]),
      default_branch: '', fork: false, archived: false, pushed_at: '',
    });
  }
  if (!repositories.length || repositories.some(r => !Number.isFinite(r.stargazers_count) || !Number.isFinite(r.forks_count))) {
    throw new Error('GitHub trending markup could not be read');
  }
  return repositories;
}
let cached;
let pending;
async function getTrending() {
  if (cached && Date.now() - cached.time < 30 * 60 * 1000) return cached.data;
  if (!pending) pending = (async () => {
    const response = await fetch(SOURCE, { headers: { 'User-Agent': 'Codeverse repository explorer', Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GitHub trending responded ${response.status}`);
    const html = await response.text();
    if (html.length > 3_000_000) throw new Error('Trending response too large');
    const data = { repositories: parseTrending(html), fetchedAt: new Date().toISOString(), source: SOURCE };
    cached = { time: Date.now(), data };
    return data;
  })().finally(() => { pending = undefined; });
  return pending;
}
export async function trendingMiddleware(req, res, next) {
  if (new URL(req.url, 'http://localhost').pathname !== '/api/trending') return next();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405;res.setHeader('Allow','GET, HEAD');res.end();return; }
  try {
    const data = await getTrending();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
  } catch {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Monthly trending is temporarily unavailable. Please try again.' }));
  }
}
