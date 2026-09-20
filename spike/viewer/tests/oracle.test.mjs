import test from 'node:test';
import assert from 'node:assert/strict';
import { createOracle, prepareEvidence, validateExplanation, validateTarget, oracleMiddleware, visitorIdentity } from '../server/oracle.mjs';
import { parsePatch } from '../src/github/diff.ts';

const sha='a'.repeat(40);
const commit=()=>({sha,commit:{message:'Fix the total\n\nAvoid counting the fee twice.'},files:[{filename:'total.py',patch:'@@ -1 +1 @@\n-total = fee + fee\n+total = fee'}]});
const claim=(text,id='C1')=>({text,evidence:[id]});
const result=()=>({summary:claim('The total now includes one fee.','F1'),changes:[claim('Removes the duplicate fee.','F1')],intent:claim('The author says the fee was counted twice.'),limitations:['Tests were not provided.']});
const config=()=>({available:true,baseUrl:'https://provider.example/v1',key:'never-expose-me',model:'test-model'});

test('diff line numbers follow additions, deletions, zero-count hunks and no-newline markers',()=>{
  const {lines}=parsePatch('@@ -10,2 +10,2 @@\n keep\n-old\n+new\n\\ No newline at end of file\n@@ -0,0 +1 @@\n+created');
  assert.deepEqual(lines.map(l=>[l.kind,l.oldLine,l.newLine]),[['hunk',null,null],['context',10,10],['deletion',11,null],['addition',null,11],['meta',null,null],['hunk',null,null],['addition',null,1]]);
  assert.equal(parsePatch('@@ -1 +1 @@\n+x\n+y',2).truncated,true);
  assert.equal(parsePatch('@@ -1 +1 @@\n+'+'x'.repeat(3000)).truncated,true);
});
test('only full SHAs and repository names are accepted, never arbitrary URLs or paths',()=>{
  assert.deepEqual(validateTarget({repo:'owner/repo',sha}),{repo:'owner/repo',sha});
  for(const repo of ['https://github.com/a/b','../secret','a/b?token=x','a/b/c']) assert.throws(()=>validateTarget({repo,sha}));
  assert.throws(()=>validateTarget({repo:'a/b',sha:'HEAD'}));
});
test('bounded evidence reports missing and truncated patches and strips unrelated metadata',()=>{
  const data=commit();data.author={email:'not-in-context@example.com'};
  data.files=[...Array.from({length:12},(_,i)=>({filename:`${i}.py`,patch:'x'.repeat(5000)})),{filename:'image.bin'}];
  const evidence=prepareEvidence('owner/repo',sha,data);
  assert.ok(evidence.sources.reduce((n,s)=>n+s.text.length,0)<=12000);
  assert.equal(evidence.coverage.missingPatches,1);
  assert.equal(evidence.coverage.truncated,true);
  assert.ok(!JSON.stringify(evidence).includes('not-in-context'));
});
test('missing and invented citations are rejected',()=>{
  const sources=prepareEvidence('owner/repo',sha,commit()).sources;
  assert.equal(validateExplanation(JSON.stringify(result()),sources).changes.length,1);
  assert.throws(()=>validateExplanation(JSON.stringify({...result(),summary:claim('Unsupported','F99')}),sources),/valid evidence/);
  assert.throws(()=>validateExplanation(JSON.stringify({...result(),summary:{text:'No citation',evidence:[]}}),sources),/valid evidence/);
  assert.throws(()=>validateExplanation('not JSON',sources),/unreadable/);
});
test('Oracle fetches authoritative evidence, caches answers, and never returns the key',async()=>{
  const calls=[];
  const oracle=createOracle({getConfig:config,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return Response.json(String(url).startsWith('https://api.github.com') ? commit() : {choices:[{message:{content:JSON.stringify(result())}}]});
  }});
  const first=await oracle.explain({repo:'owner/repo',sha});
  const second=await oracle.explain({repo:'owner/repo',sha});
  assert.equal(calls.length,2);assert.equal(second.cached,true);
  assert.ok(calls[0].url.startsWith('https://api.github.com/repos/owner/repo/commits/'));
  assert.ok(!JSON.stringify(first).includes('never-expose-me'));
  assert.ok(!JSON.stringify(first.sources).includes('total = fee'));
  const prompt=JSON.parse(calls[1].options.body);
  assert.match(prompt.messages[0].content,/untrusted data/);
});
test('unconfigured Oracle makes no outbound call; provider errors are sanitized',async()=>{
  const off=createOracle({getConfig:()=>({available:false}),fetchImpl:()=>{throw new Error('must not run');}});
  await assert.rejects(()=>off.explain({repo:'owner/repo',sha}),/not configured/);
  const broken=createOracle({getConfig:config,fetchImpl:async url=>String(url).startsWith('https://api.github.com') ? Response.json(commit()) : new Response('secret provider diagnostics',{status:401})});
  await assert.rejects(()=>broken.explain({repo:'owner/repo',sha}),error=>!error.message.includes('secret') && error.status===502);
});
test('per-client request budget limits uncached generation',async()=>{
  const oracle=createOracle({getConfig:config,fetchImpl:async url=>String(url).startsWith('https://api.github.com') ? Response.json(commit()) : Response.json({choices:[{message:{content:JSON.stringify(result())}}]})});
  for(let i=0;i<10;i++) await oracle.explain({repo:`owner/repo${i}`,sha},'client');
  await assert.rejects(()=>oracle.explain({repo:'owner/extra',sha},'client'),error=>error.status===429);
});
test('cross-origin and malformed-origin requests are rejected before processing',async()=>{
  for(const origin of ['https://attacker.example','malformed']) {
    const response={statusCode:0,setHeader(){},end(body){this.body=JSON.parse(body);}};
    await oracleMiddleware({url:'/api/oracle',method:'POST',headers:{host:'localhost:5173',origin,'content-type':'application/json'}},response,()=>assert.fail('unexpected next'));
    assert.equal(response.statusCode,403);
  }
});

test('Vercel uses x-real-ip, then the first forwarded entry, then the socket', () => {
  const req = { headers: { 'x-real-ip': ' 203.0.113.8 ', 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(visitorIdentity(req, true), '203.0.113.8');
  delete req.headers['x-real-ip'];
  assert.equal(visitorIdentity(req, true), '198.51.100.7');
  req.headers['x-forwarded-for'] = ' 2001:db8::1 , 10.0.0.1';
  assert.equal(visitorIdentity(req, true), '2001:db8::1');
  req.headers['x-forwarded-for'] = '  ';
  assert.equal(visitorIdentity(req, true), '127.0.0.1');
  assert.equal(visitorIdentity({ headers: {} }, true), 'unknown');
});

test('outside Vercel, spoofed forwarding headers never affect visitor identity', () => {
  assert.equal(visitorIdentity({ headers: { 'x-real-ip': 'attacker', 'x-forwarded-for': 'other' }, socket: { remoteAddress: '192.0.2.9' } }, false), '192.0.2.9');
  assert.equal(visitorIdentity({ headers: { 'x-real-ip': 'attacker' } }, false), 'unknown');
});

test('Vercel visitors sharing one proxy have independent per-client budgets', async () => {
  const oracle = createOracle({ getConfig: config, fetchImpl: async url => String(url).startsWith('https://api.github.com') ? Response.json(commit()) : Response.json({ choices: [{ message: { content: JSON.stringify(result()) } }] }) });
  const client = ip => visitorIdentity({ headers: { 'x-real-ip': ip }, socket: { remoteAddress: '127.0.0.1' } }, true);
  for (let i = 0; i < 10; i++) await oracle.explain({ repo: `owner/one${i}`, sha }, client('203.0.113.1'));
  await assert.rejects(() => oracle.explain({ repo: 'owner/extra', sha }, client('203.0.113.1')), error => error.status === 429);
  assert.equal((await oracle.explain({ repo: 'owner/two', sha }, client('203.0.113.2'))).cached, false);
});
