import test from 'node:test';
import assert from 'node:assert/strict';

test('explorer uses the server proxy when configured and loads bounded moon data', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async request => {
    const path = String(request);
    calls.push(path);
    if (path === '/api/github/status') return Response.json({available:true});
    if (path.startsWith('/api/github?kind=profile')) return Response.json({data:{login:'octocat',type:'User'},hasMore:false});
    if (path.includes('kind=moons')) return Response.json({branches:[{name:'main'}],releases:[],branchesHaveMore:false,releasesHaveMore:false});
    throw Error(`Unexpected request: ${path}`);
  };
  try {
    const { fetchProfile, fetchMoons } = await import('../src/github/api.ts?proxy-test');
    assert.equal((await fetchProfile('octocat')).login,'octocat');
    assert.deepEqual((await fetchMoons({full_name:'octocat/Hello-World'})).branches,[{name:'main'}]);
    assert.equal(calls.filter(path => path === '/api/github/status').length,1);
    assert.ok(calls.every(path => path.startsWith('/api/github')));
  } finally { globalThis.fetch = original; }
});
