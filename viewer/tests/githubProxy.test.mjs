import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubProxy } from '../server/github.mjs';

const url = query => new URL(`http://localhost/api/github?${new URLSearchParams(query)}`);

test('proxy needs a server token and accepts only public GitHub routes', async () => {
  const requests = [];
  const proxy = createGitHubProxy({ token:() => 'test-token', fetchImpl:async (request, options) => {
    requests.push({ request, authorization:options.headers.Authorization });
    return new Response('{}');
  }});
  assert.equal(proxy.available(), true);
  for (const query of [
    {kind:'profile',handle:'two--hyphens'},
    {kind:'profile',handle:'../private'},
    {kind:'commit',owner:'octocat',repo:'Hello-World',sha:'bad'},
    {kind:'moons',owner:'octocat',repo:'..'},
    {kind:'anything',owner:'octocat',repo:'Hello-World'},
  ]) await assert.rejects(() => proxy.get(url(query), 'visitor'), {status:400});
  assert.equal(requests.length, 0);
  await proxy.get(url({kind:'profile',handle:'octocat'}), 'visitor');
  assert.deepEqual(requests, [{request:'https://api.github.com/users/octocat',authorization:'Bearer test-token'}]);
  const disabled = createGitHubProxy({token:() => '',fetchImpl:() => { throw Error('must not fetch'); }});
  assert.equal(disabled.available(), false);
  await assert.rejects(() => disabled.get(url({kind:'profile',handle:'octocat'}), 'visitor'), {status:503});
});

test('proxy caches profile data and coalesces concurrent requests', async () => {
  let clock = 1_000;
  let calls = 0;
  const proxy = createGitHubProxy({token:() => 'test-token',now:() => clock,fetchImpl:async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response('{"login":"octocat"}',{headers:{link:'<next>; rel="next"'}});
  }});
  const query = url({kind:'profile',handle:'octocat'});
  const [first, second] = await Promise.all([proxy.get(query,'first'),proxy.get(query,'second')]);
  assert.deepEqual(first, {data:{login:'octocat'},hasMore:true});
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  await proxy.get(query,'third');
  assert.equal(calls, 1);
  clock += 300_001;
  await proxy.get(query,'third');
  assert.equal(calls, 2);
});

test('proxy caps each client before the shared upstream quota is exhausted', async () => {
  let calls = 0;
  const proxy = createGitHubProxy({token:() => 'test-token',fetchImpl:async () => {
    calls++;
    return new Response('{}');
  }});
  for (let index = 0; index < 100; index++) {
    await proxy.get(url({kind:'profile',handle:`visitor${index}`}), 'same-ip');
  }
  await assert.rejects(() => proxy.get(url({kind:'profile',handle:'extra'}), 'same-ip'), {status:429});
  await proxy.get(url({kind:'profile',handle:'extra'}), 'another-ip');
  assert.equal(calls, 101);
});

test('moons combine bounded branches and releases and preserve pagination disclosure', async () => {
  const requests = [];
  const proxy = createGitHubProxy({token:() => 'test-token',fetchImpl:async request => {
    requests.push(request);
    if (request.includes('/branches?')) return new Response('[{"name":"main"},{"name":"develop"}]',{headers:{link:'<next>; rel="next"'}});
    return new Response('[{"id":1,"tag_name":"v1","name":"Version 1","html_url":"https://github.com/octocat/Hello-World/releases/tag/v1"}]');
  }});
  const result = await proxy.get(url({kind:'moons',owner:'octocat',repo:'Hello-World'}), 'visitor');
  assert.deepEqual(result.branches.map(branch => branch.name), ['main','develop']);
  assert.deepEqual(result.releases.map(release => release.tag_name), ['v1']);
  assert.equal(result.branchesHaveMore, true);
  assert.equal(result.releasesHaveMore, false);
  assert.equal(requests.length, 2);
  assert.ok(requests[0].endsWith('/branches?per_page=6'));
  assert.ok(requests[1].endsWith('/releases?per_page=4'));
});
