import test from 'node:test';
import assert from 'node:assert/strict';

test('without a token, selected-repository moons load public branches and releases once', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async request => {
    const path = String(request);
    calls.push(path);
    if (path === '/api/github/status') return Response.json({available:false});
    if (path.endsWith('/branches?per_page=6')) return Response.json([{name:'main'},{name:'feature/one'}], {headers:{link:'<next>; rel="next"'}});
    if (path.endsWith('/releases?per_page=4')) return Response.json([{id:1,tag_name:'v1',name:'Version 1'}]);
    throw Error(`Unexpected request: ${path}`);
  };
  try {
    const { fetchMoons } = await import('../src/github/api.ts?moon-fallback');
    const repo = {full_name:'octocat/Hello-World'};
    const first = await fetchMoons(repo);
    assert.deepEqual(first.branches.map(branch => branch.name),['main','feature/one']);
    assert.deepEqual(first.releases.map(release => release.tag_name),['v1']);
    assert.equal(first.branchesHaveMore,true);
    assert.equal(first.releasesHaveMore,false);
    assert.equal(first.branchesError,false);
    assert.equal(first.releasesError,false);
    assert.equal(calls.length,3);
    assert.ok(calls.slice(1).every(path => path.startsWith('https://api.github.com/repos/octocat/Hello-World/')));
    assert.deepEqual(await fetchMoons(repo),first);
    assert.equal(calls.length,3); // revisit uses the five-minute client cache
  } finally { globalThis.fetch = original; }
});

test('one unavailable moon endpoint does not hide the other kind', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async request => {
    const path = String(request);
    if (path === '/api/github/status') return Response.json({available:false});
    if (path.includes('/branches?')) return new Response('{}',{status:403});
    if (path.includes('/releases?')) return Response.json([{id:2,tag_name:'v2',name:'Version 2'}]);
    throw Error(`Unexpected request: ${path}`);
  };
  try {
    const { fetchMoons } = await import('../src/github/api.ts?moon-partial');
    const data = await fetchMoons({full_name:'owner/repo'});
    assert.deepEqual(data.branches,[]);
    assert.equal(data.branchesError,true);
    assert.deepEqual(data.releases.map(release => release.tag_name),['v2']);
    assert.equal(data.releasesError,false);
  } finally { globalThis.fetch = original; }
});
