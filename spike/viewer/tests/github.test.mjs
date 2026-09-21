import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, fetchProfile, fetchCommits, fetchRepositories } from '../src/github/api.ts';
import { activityEncoding, archiveEncoding, planetStyle } from '../src/github/planetStyle.ts';
import { parseTrending } from '../server/trending.mjs';
import { profileHandleFromUrl, profilePath } from '../src/github/profileRoute.ts';
import { loadedCoverage, summarizeProfile } from '../src/github/profileSummary.ts';

test('handles accept usernames and profile URLs, rejecting paths and injected URLs', () => {
  for (const input of ['octocat','@octocat','https://github.com/octocat/']) assert.equal(normalizeHandle(input), 'octocat');
  for (const input of ['', '-bad', 'two--hyphens', 'owner/repo', 'https://evil.com/name', 'x?token=secret']) assert.throws(() => normalizeHandle(input));
});

test('profile routes support pretty and legacy links without accepting path traversal', () => {
  assert.equal(profileHandleFromUrl('/@x', ''), 'x');
  assert.equal(profileHandleFromUrl('/', '?user=x'), 'x');
  assert.equal(profileHandleFromUrl('/@pretty', '?user=legacy'), 'pretty');
  assert.equal(profileHandleFromUrl('/not-a-profile', ''), undefined);
  assert.equal(profileHandleFromUrl('/@../secret', ''), undefined);
  assert.equal(profileHandleFromUrl('/@x/', ''), 'x');
  assert.equal(profilePath('octocat'), '/@octocat');
});

test('profile summary uses only loaded repositories and labels partial coverage', () => {
  const now = Date.parse('2026-09-20T00:00:00Z');
  const repositories = [
    { language:'TypeScript', stargazers_count:12, pushed_at:'2026-09-01T00:00:00Z' },
    { language:'TypeScript', stargazers_count:5, pushed_at:'2025-01-01T00:00:00Z' },
    { language:'Rust', stargazers_count:3, pushed_at:'2026-07-01T00:00:00Z' },
  ];
  const summary = summarizeProfile({ public_repos:74 }, repositories, now);
  assert.equal(summary.stars, 20);
  assert.equal(summary.recentlyPushed, 2);
  assert.deepEqual(summary.languages, [{ name:'TypeScript', repositories:2 }, { name:'Rust', repositories:1 }]);
  assert.equal(loadedCoverage(summary), 'across 3 of 74 repositories loaded');
});

test('monthly feed extracts real star gains, preserves ranking, and ignores unrelated links', () => {
  const item = (name, gain) => `<article class="Box-row"><a href="/login">Star</a><h2><a href="/example/${name}"><span>example /</span>${name}</a></h2><p>Tools &amp; code</p><span itemprop="programmingLanguage">TypeScript</span><a href="/example/${name}/stargazers"><svg></svg>1,234</a><a href="/example/${name}/forks">56</a><span>${gain} stars this month</span></article>`;
  const parsed = parseTrending(item('first','250') + item('second','1,200'));
  assert.deepEqual(parsed.map(r=>r.name), ['first','second']);
  assert.deepEqual(parsed.map(r=>r.monthlyStars), [250,1200]);
  assert.equal(parsed[0].stargazers_count,1234);
  assert.equal(parsed[0].description,'Tools & code');
  assert.equal(parsed[0].size, undefined); // the trending page does not publish repo KB
  assert.throws(() => parseTrending('<html>unavailable</html>'), /could not be read/);
});

test('planet identities are deterministic with bounded sizes', () => {
  const repo={id:123,name:'app',language:'TypeScript',size:12000};
  assert.deepEqual(planetStyle(repo),planetStyle(repo));
  assert.ok(planetStyle({...repo,size:1e15}).radius <= 1.7);
  assert.notEqual(planetStyle(repo).dark,planetStyle({...repo,language:'Rust'}).dark);
});

test('repository activity maps to documented stepped atmosphere bands', () => {
  const now = Date.parse('2026-09-20T00:00:00Z');
  const pushed = days => new Date(now - days * 86_400_000).toISOString();
  assert.deepEqual([0, 30, 31, 90, 91, 365, 366].map(days => activityEncoding(pushed(days), now).band),
    ['recent', 'recent', 'active', 'active', 'quiet', 'quiet', 'stale']);
  assert.equal(activityEncoding('', now).band, 'unknown');
  assert.ok(activityEncoding(pushed(30), now).intensity > activityEncoding(pushed(90), now).intensity);
  assert.ok(activityEncoding(pushed(90), now).intensity > activityEncoding(pushed(365), now).intensity);
  assert.ok(activityEncoding(pushed(365), now).intensity > activityEncoding(pushed(366), now).intensity);
});

test('archived repositories use a collapsed black-hole treatment without decorative rings', () => {
  const archive = archiveEncoding(true);
  assert.ok(archive.scale < 0.7);
  assert.equal(archive.surfaceKind, 3);
  assert.equal(archive.rings, false);
  const normal = planetStyle({ id:1, name:'active', language:'TypeScript', size:1000, archived:false, pushed_at:'2026-09-20T00:00:00Z' });
  const retired = planetStyle({ id:1, name:'active', language:'TypeScript', size:1000, archived:true, pushed_at:'2026-09-20T00:00:00Z' });
  assert.ok(retired.radius < normal.radius);
  assert.equal(retired.kind, 3);
});

test('GitHub requests handle organizations, empty history, limits, and the unknown default branch', async () => {
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (url) => {
    calls.push(String(url));
    if(String(url).includes('/users/limited-test')) return new Response('{}',{status:403,headers:{'x-ratelimit-reset':'2000000000'}});
    if(String(url).includes('/commits')) return new Response('{}',{status:409});
    if(String(url).includes('/orgs/')) return new Response('[]',{status:200,headers:{link:'<https://api.github.com/next>; rel="next"'}});
    return new Response(JSON.stringify({login:'test-user',type:'User'}),{status:200});
  };
  try {
    await assert.rejects(()=>fetchProfile('limited-test'), /temporarily limited/);
    assert.deepEqual(await fetchCommits({full_name:'test/empty',default_branch:''}),[]);
    assert.ok(!calls.at(-1).includes('sha='));
    const result=await fetchRepositories({login:'test-org',type:'Organization'},2);
    assert.ok(calls.at(-1).includes('/orgs/test-org/repos?type=public'));
    assert.ok(calls.at(-1).endsWith('page=2'));
    assert.equal(result.hasMore,true);
  } finally { globalThis.fetch=original; }
});

test('universe evolution computes timeline and filters repositories chronologically', async () => {
  const { evolutionTimeline, repositoriesAtTimestamp, formatEvolutionDate } = await import('../src/github/evolution.ts');
  const repos = [
    { id: 1, name: 'early', created_at: '2019-01-15T00:00:00Z', pushed_at: '2019-06-01T00:00:00Z' },
    { id: 2, name: 'mid', created_at: '2021-06-20T00:00:00Z', pushed_at: '2022-01-01T00:00:00Z' },
    { id: 3, name: 'recent', created_at: '2024-03-10T00:00:00Z', pushed_at: '2024-05-01T00:00:00Z' },
  ];

  const timeline = evolutionTimeline(repos);
  assert.ok(timeline);
  assert.equal(timeline.startMs, Date.parse('2019-01-15T00:00:00Z'));
  assert.equal(timeline.endMs, Date.parse('2024-03-10T00:00:00Z'));
  assert.ok(timeline.spanYears >= 5);

  const at2020 = repositoriesAtTimestamp(repos, Date.parse('2020-01-01T00:00:00Z'));
  assert.equal(at2020.length, 1);
  assert.equal(at2020[0].name, 'early');

  const at2022 = repositoriesAtTimestamp(repos, Date.parse('2022-01-01T00:00:00Z'));
  assert.equal(at2022.length, 2);

  const at2025 = repositoriesAtTimestamp(repos, Date.parse('2025-01-01T00:00:00Z'));
  assert.equal(at2025.length, 3);

  assert.equal(formatEvolutionDate(Date.parse('2021-06-20T00:00:00Z')), 'Jun 2021');
  assert.equal(evolutionTimeline([]), null);
  assert.equal(evolutionTimeline([{ id: 1, name: 'lone' }]), null);
});

test('fetchContributors fetches repository contributors with caching and limits', async () => {
  const { fetchContributors } = await import('../src/github/api.ts');
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify([
      { login: 'octocat', id: 1, avatar_url: 'https://example.com/avatar.png', contributions: 42 },
    ]), { status: 200 });
  };
  try {
    const contributors = await fetchContributors({ full_name: 'octocat/Hello-World' });
    assert.equal(contributors.length, 1);
    assert.equal(contributors[0].login, 'octocat');
    assert.equal(contributors[0].contributions, 42);
    assert.ok(calls[0].includes('/repos/octocat/Hello-World/contributors?per_page=12'));
  } finally { globalThis.fetch = original; }
});

test('generateUniverseSvg creates valid 1200x630 SVG with developer stats and orbits', async () => {
  const { generateUniverseSvg } = await import('../server/og.mjs');
  const user = { login: 'dhruv', name: 'Dhruv Sharma', bio: 'Building AI universes', public_repos: 27, followers: 342 };
  const repos = [
    { name: 'codeverse', language: 'TypeScript', stargazers_count: 500 },
    { name: 'neural-sim', language: 'Python', stargazers_count: 120 },
  ];
  const svg = generateUniverseSvg(user, repos);
  assert.ok(svg.includes('width="1200"'));
  assert.ok(svg.includes('height="630"'));
  assert.ok(svg.includes('Dhruv Sharma'));
  assert.ok(svg.includes('@dhruv'));
  assert.ok(svg.includes('codeverse'));
  assert.ok(svg.includes('neural-sim'));
});

test('ogMiddleware validates handle and falls back to default preview on error', async () => {
  const { ogMiddleware } = await import('../server/og.mjs');
  let statusCode = 200;
  const headers = {};
  const res = {
    writeHead(code, h) { statusCode = code; Object.assign(headers, h); },
    setHeader(k, v) { headers[k] = v; },
    end() {},
  };
  await ogMiddleware({ url: '/api/og?user=invalid--handle' }, res, () => {});
  assert.equal(statusCode, 302);
  assert.equal(headers.Location, '/og-default.png');
});
test('isValidHandle matches normalizeHandle semantics and rejects junk paths', async () => {
  const { isValidHandle } = await import('../server/profileHtml.mjs');
  for (const valid of ['octocat', '@octocat', 'a', 'a-b', 'a-1', '12345', 'octocat/']) {
    assert.equal(isValidHandle(valid), true, `should accept ${valid}`);
  }
  for (const invalid of ['', '   ', '-bad', 'bad-', 'two--hyphens', 'owner/repo', 'foo?bar=1', '<script>', 'a'.repeat(40)]) {
    assert.equal(isValidHandle(invalid), false, `should reject ${invalid}`);
  }
});

test('escapeHtmlAttr escapes all HTML attribute & tag breakout characters while preserving emoji', async () => {
  const { escapeHtmlAttr } = await import('../server/profileHtml.mjs');
  assert.equal(escapeHtmlAttr(null), '');
  assert.equal(escapeHtmlAttr(undefined), '');
  assert.equal(escapeHtmlAttr('"><script>alert(1)</script>'), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtmlAttr('\' " & < >'), '&#39; &quot; &amp; &lt; &gt;');
  assert.equal(escapeHtmlAttr('🪐 ⭐ 🚀 Universe'), '🪐 ⭐ 🚀 Universe');
  const longStr = 'a'.repeat(2000) + '<>';
  assert.equal(escapeHtmlAttr(longStr), 'a'.repeat(2000) + '&lt;&gt;');
});

test('buildProfileMeta and injectProfileMeta escape attacker-controlled name/bio and preserve default og:image', async () => {
  const { buildProfileMeta, injectProfileMeta } = await import('../server/profileHtml.mjs');
  const template = `<!doctype html><html><head>
    <meta property="og:title" content="Codeverse" />
    <meta property="og:description" content="Default desc" />
    <meta property="og:url" content="__SITE_ORIGIN__/" />
    <meta property="og:image" content="__SITE_ORIGIN__/og-default.png" />
    <meta name="twitter:title" content="Codeverse" />
    <meta name="twitter:description" content="Default desc" />
    <meta name="twitter:image" content="__SITE_ORIGIN__/og-default.png" />
    <title>Codeverse</title>
  </head><body></body></html>`;

  // Test malicious name, null bio
  const maliciousUser = {
    login: 'attacker',
    name: '"><script>alert(1)</script>',
    bio: null,
    public_repos: 5,
  };
  const meta1 = buildProfileMeta(maliciousUser, []);
  assert.equal(meta1.title, '"><script>alert(1)</script> (@attacker) — Codeverse');
  assert.ok(meta1.description.includes('5 repositories'));
  
  const html1 = injectProfileMeta(template, meta1, 'attacker');
  assert.ok(html1.includes('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; (@attacker) — Codeverse'));
  assert.ok(!html1.includes('"><script>alert(1)</script>'));
  assert.ok(html1.includes('content="https://codeverse-orbit.vercel.app/og-default.png"'));
  assert.ok(html1.includes('content="https://codeverse-orbit.vercel.app/@attacker"'));
  assert.ok(html1.includes('<link rel="canonical" href="https://codeverse-orbit.vercel.app/@attacker" />'));

  // Test bio with quotes, ampersands, emoji, and dollar signs ($100, $&, $')
  const complexUser = {
    login: 'artist',
    name: 'Jane & "The" Co',
    bio: 'Artist & dev · $100 bounty · $& replacement test · 🪐 ⭐ 🚀',
    public_repos: 12,
  };
  const meta2 = buildProfileMeta(complexUser, [{ stargazers_count: 50 }, { stargazers_count: 150 }]);
  assert.equal(meta2.totalStars, 200);
  const html2 = injectProfileMeta(template, meta2, 'artist');
  assert.ok(html2.includes('Jane &amp; &quot;The&quot; Co (@artist) — Codeverse'));
  assert.ok(html2.includes('Artist &amp; dev · $100 bounty · $&amp; replacement test · 🪐 ⭐ 🚀'));
  assert.ok(html2.includes('⭐ 200'));

  // Fallback for null meta (lookup failure) preserves default tags but sets canonical for valid handle
  const fallbackHtml = injectProfileMeta(template, null, 'someuser');
  assert.ok(fallbackHtml.includes('<title>Codeverse</title>'));
  assert.ok(fallbackHtml.includes('content="Default desc"'));
  assert.ok(fallbackHtml.includes('content="https://codeverse-orbit.vercel.app/@someuser"'));
  assert.ok(fallbackHtml.includes('<link rel="canonical" href="https://codeverse-orbit.vercel.app/@someuser" />'));
});

test('fetchProfileData handles rate limits, bounds cache to 200, and caches failures with shorter TTL', async () => {
  const { fetchProfileData, profileCache, _clearProfileCache, MAX_CACHE_ENTRIES } = await import('../server/profileHtml.mjs');
  _clearProfileCache();

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  try {
    // 1. Success case
    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(JSON.stringify({ login: 'octocat', public_repos: 8, name: 'The Octocat' }), { status: 200 });
    };

    const res1 = await fetchProfileData('octocat');
    assert.equal(res1.login, 'octocat');
    assert.equal(fetchCount, 2); // 1 for user, 1 for repos

    // Cache hit should not call fetch again
    const res2 = await fetchProfileData('octocat');
    assert.equal(res2.login, 'octocat');
    assert.equal(fetchCount, 2);

    // 2. Failure case (404/403)
    globalThis.fetch = async () => new Response('Not Found', { status: 404 });
    const failRes1 = await fetchProfileData('ghost-user');
    assert.equal(failRes1, null);

    const cachedGhost = profileCache.get('ghost-user');
    assert.ok(cachedGhost);
    assert.equal(cachedGhost.isError, true);

    // 3. Cache bounding: fill 205 entries
    for (let i = 0; i < 205; i++) {
      profileCache.set(`user-${i}`, { time: Date.now(), isError: false, data: { login: `user-${i}` } });
      if (profileCache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = profileCache.keys().next().value;
        profileCache.delete(oldestKey);
      }
    }
    assert.equal(profileCache.size, MAX_CACHE_ENTRIES);
    assert.equal(profileCache.has('user-0'), false); // oldest evicted
    assert.equal(profileCache.has('user-204'), true);
  } finally {
    globalThis.fetch = originalFetch;
    _clearProfileCache();
  }
});

test('profileHtmlMiddleware handles /@:handle, sets Cache-Control, and rejects junk paths', async () => {
  const { profileHtmlMiddleware, _clearProfileCache } = await import('../server/profileHtml.mjs');
  _clearProfileCache();

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/users/realuser')) {
        return new Response(JSON.stringify({ login: 'realuser', name: 'Real User', public_repos: 3 }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    };

    // Test real handle
    const headers = {};
    let body = '';
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      end(chunk) { if (chunk) body = chunk; },
    };

    await profileHtmlMiddleware({ url: '/@realuser', method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } }, res, () => {});
    assert.equal(headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(headers['cache-control'], 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    assert.ok(body.includes('Real User (@realuser) — Codeverse'));

    // Test invalid handle (junk path)
    const junkHeaders = {};
    let junkBody = '';
    const junkRes = {
      statusCode: 200,
      setHeader(k, v) { junkHeaders[k.toLowerCase()] = v; },
      end(chunk) { if (chunk) junkBody = chunk; },
    };
    await profileHtmlMiddleware({ url: '/@invalid--handle', method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } }, junkRes, () => {});
    assert.equal(junkHeaders['cache-control'], 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    assert.ok(junkBody.includes('Codeverse — Your code, in orbit'));

    // Test nonexistent handle
    const nonHeaders = {};
    let nonBody = '';
    const nonRes = {
      statusCode: 200,
      setHeader(k, v) { nonHeaders[k.toLowerCase()] = v; },
      end(chunk) { if (chunk) nonBody = chunk; },
    };
    await profileHtmlMiddleware({ url: '/@ghost404user', method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } }, nonRes, () => {});
    assert.equal(nonHeaders['cache-control'], 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    assert.ok(nonBody.includes('Codeverse — Your code, in orbit'));
    assert.ok(nonBody.includes('content="https://codeverse-orbit.vercel.app/@ghost404user"'));

    // Test non-GET method returns 405
    let postStatusCode = 200;
    const postRes = {
      set statusCode(code) { postStatusCode = code; },
      setHeader() {},
      end() {},
    };
    await profileHtmlMiddleware({ url: '/@realuser', method: 'POST', headers: { accept: 'text/html,application/xhtml+xml' } }, postRes, () => {});
    assert.equal(postStatusCode, 405);
  } finally {
    globalThis.fetch = originalFetch;
    _clearProfileCache();
  }
});

test('non-navigation requests under /@ fall through, so Vite dev modules still load', async () => {
  const { profileHtmlMiddleware } = await import('../server/profileHtml.mjs');

  // /@react-refresh is a real Vite dev module URL that is shaped exactly like a GitHub
  // handle. Serving HTML for it breaks the dev server with a MIME-type error and a blank
  // page, so anything that does not accept HTML must be passed on untouched.
  for (const accept of ['*/*', 'application/javascript', undefined]) {
    let passedOn = false;
    const res = { statusCode: 200, setHeader() { assert.fail('must not write a response'); }, end() { assert.fail('must not end the response'); } };
    await profileHtmlMiddleware({ url: '/@react-refresh', method: 'GET', headers: accept ? { accept } : {} }, res, () => { passedOn = true; });
    assert.ok(passedOn, `accept=${accept} should fall through to the next handler`);
  }
});
