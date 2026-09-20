// Dynamic social preview card generator for Codeverse universes (1200x630).
// Generates an SVG card with the developer's identity, planetary orbits, and language styling.
// Respects GitHub rate limits and gracefully falls back to /og-default.png.

const LANGUAGE_COLORS = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
};

const escapeXml = (unsafe) => (unsafe ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);

const ogCache = new Map();

export function generateUniverseSvg(user, repos = []) {
  const name = escapeXml(user.name || user.login);
  const login = escapeXml(user.login);
  const bio = escapeXml((user.bio || 'Exploring public repositories in 3D orbit.').slice(0, 100));
  const publicRepos = user.public_repos || repos.length || 0;
  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const followers = user.followers || 0;

  // Build 6 orbit planets around center (width 1200, height 630 -> center at x=880, y=315)
  const cx = 860;
  const cy = 315;
  const planetsSvg = repos.slice(0, 6).map((repo, i) => {
    const angle = (i / 6) * Math.PI * 2 - 0.4;
    const distance = 140 + (i % 3) * 45;
    const px = Math.round(cx + Math.cos(angle) * distance);
    const py = Math.round(cy + Math.sin(angle) * distance);
    const color = LANGUAGE_COLORS[repo.language] || '#9d8ec2';
    const radius = Math.min(22, Math.max(12, Math.round(Math.sqrt((repo.stargazers_count || 10) + 10) * 2.2)));
    const repoName = escapeXml(repo.name.slice(0, 16));

    return `
      <g>
        <circle cx="${px}" cy="${py}" r="${radius + 6}" fill="${color}" opacity="0.15" />
        <circle cx="${px}" cy="${py}" r="${radius}" fill="${color}" stroke="#ffffff30" stroke-width="2" />
        <text x="${px}" y="${py + radius + 14}" text-anchor="middle" fill="#c3c0d2" font-size="11" font-family="ui-monospace, monospace">${repoName}</text>
      </g>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#141829" />
      <stop offset="100%" stop-color="#05070d" />
    </radialGradient>
    <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fedaa2" stop-opacity="0.9" />
      <stop offset="35%" stop-color="#e2b265" stop-opacity="0.6" />
      <stop offset="70%" stop-color="#d49b42" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#d49b42" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f5e6ce" />
      <stop offset="100%" stop-color="#d9b67b" />
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="8" />
    </filter>
  </defs>

  <!-- Deep space background -->
  <rect width="1200" height="630" fill="url(#bg)" />

  <!-- Stars -->
  <g fill="#ffffff" opacity="0.4">
    <circle cx="80" cy="90" r="1.5" /><circle cx="210" cy="180" r="1" /><circle cx="340" cy="70" r="1.2" />
    <circle cx="480" cy="240" r="1" /><circle cx="150" cy="420" r="1.5" /><circle cx="280" cy="530" r="1.2" />
    <circle cx="560" cy="460" r="1" /><circle cx="700" cy="120" r="1.5" /><circle cx="950" cy="80" r="1.2" />
    <circle cx="1120" cy="150" r="1" /><circle cx="1080" cy="490" r="1.5" /><circle cx="740" cy="560" r="1" />
  </g>

  <!-- Planetary Orbit Rings -->
  <ellipse cx="${cx}" cy="${cy}" rx="140" ry="140" fill="none" stroke="#d5b77f" stroke-width="1" stroke-opacity="0.18" stroke-dasharray="6,6" />
  <ellipse cx="${cx}" cy="${cy}" rx="185" ry="185" fill="none" stroke="#d5b77f" stroke-width="1" stroke-opacity="0.14" />
  <ellipse cx="${cx}" cy="${cy}" rx="230" ry="230" fill="none" stroke="#d5b77f" stroke-width="1" stroke-opacity="0.10" stroke-dasharray="4,8" />

  <!-- Central Star / Sun -->
  <circle cx="${cx}" cy="${cy}" r="75" fill="url(#sun-glow)" filter="url(#blur)" />
  <circle cx="${cx}" cy="${cy}" r="38" fill="#ffeed1" stroke="#f6c880" stroke-width="3" />
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#583e16" font-size="11" font-weight="700" font-family="ui-monospace, monospace" letter-spacing="0.15em">SUN</text>

  <!-- Orbiting Planets -->
  ${planetsSvg}

  <!-- Left Identity Card -->
  <g transform="translate(90, 85)">
    <!-- Brand / Eyebrow -->
    <text x="0" y="30" fill="#bca77e" font-size="13" font-weight="700" letter-spacing="0.2em" font-family="system-ui, sans-serif">✳ CODEVERSE · DEVELOPER UNIVERSE</text>
    
    <!-- User Full Name -->
    <text x="0" y="105" fill="url(#gold)" font-size="52" font-family="Georgia, serif" font-weight="bold">${name}</text>
    
    <!-- Handle -->
    <text x="0" y="148" fill="#9e9ab2" font-size="22" font-family="ui-monospace, monospace">@${login}</text>
    
    <!-- Bio -->
    <text x="0" y="205" fill="#a7a4b8" font-size="18" font-family="system-ui, sans-serif">${bio}</text>

    <!-- Stats Grid -->
    <g transform="translate(0, 260)">
      <rect x="0" y="0" width="460" height="90" rx="10" fill="#101320" stroke="#bfa67533" stroke-width="1" />
      
      <g transform="translate(30, 32)">
        <text x="0" y="0" fill="#7a7d92" font-size="11" font-weight="600" letter-spacing="0.1em" font-family="system-ui, sans-serif">REPOSITORIES</text>
        <text x="0" y="34" fill="#f0dfc1" font-size="26" font-weight="bold" font-family="Georgia, serif">${compact(publicRepos)}</text>
      </g>
      
      <g transform="translate(180, 32)">
        <text x="0" y="0" fill="#7a7d92" font-size="11" font-weight="600" letter-spacing="0.1em" font-family="system-ui, sans-serif">TOTAL STARS</text>
        <text x="0" y="34" fill="#f0dfc1" font-size="26" font-weight="bold" font-family="Georgia, serif">⭐ ${compact(totalStars)}</text>
      </g>
      
      <g transform="translate(330, 32)">
        <text x="0" y="0" fill="#7a7d92" font-size="11" font-weight="600" letter-spacing="0.1em" font-family="system-ui, sans-serif">FOLLOWERS</text>
        <text x="0" y="34" fill="#f0dfc1" font-size="26" font-weight="bold" font-family="Georgia, serif">${compact(followers)}</text>
      </g>
    </g>

    <!-- Footer URL -->
    <text x="0" y="420" fill="#78778a" font-size="14" font-family="ui-monospace, monospace">codeverse-orbit.vercel.app/@${login}</text>
  </g>
</svg>`;
}

export async function ogMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/og') return next();

  const handle = (url.searchParams.get('user') || '').trim().replace(/^@/, '');
  if (!handle || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(handle)) {
    res.writeHead(302, { Location: '/og-default.png' });
    res.end();
    return;
  }

  // Check in-memory cache
  const cached = ogCache.get(handle.toLowerCase());
  if (cached && Date.now() - cached.time < 3600_000) {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600');
    res.end(cached.svg);
    return;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Codeverse-OG-Generator',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`, { headers, signal: AbortSignal.timeout(6000) }),
      fetch(`https://api.github.com/users/${encodeURIComponent(handle)}/repos?per_page=6&sort=pushed`, { headers, signal: AbortSignal.timeout(6000) }),
    ]);

    if (!userRes.ok) {
      res.writeHead(302, { Location: '/og-default.png' });
      res.end();
      return;
    }

    const user = await userRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];

    const svg = generateUniverseSvg(user, Array.isArray(repos) ? repos : []);
    ogCache.set(handle.toLowerCase(), { time: Date.now(), svg });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600');
    res.end(svg);
  } catch {
    res.writeHead(302, { Location: '/og-default.png' });
    res.end();
  }
}
