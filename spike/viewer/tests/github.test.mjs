import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, fetchProfile, fetchCommits, fetchRepositories } from '../src/github/api.ts';
import { planetStyle } from '../src/github/planetStyle.ts';
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
