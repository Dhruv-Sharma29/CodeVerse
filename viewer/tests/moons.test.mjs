import test from 'node:test';
import assert from 'node:assert/strict';
import { repositoryMoons } from '../src/github/moons.ts';

test('known default branch stays visible without enhanced GitHub access', () => {
  const moons = repositoryMoons({full_name:'owner/project',default_branch:'main'}, null);
  assert.deepEqual(moons, [{key:'branch:main',label:'main',kind:'branch',url:'https://github.com/owner/project/tree/main',defaultBranch:true}]);
});

test('fetched branches and releases become distinct linked moons', () => {
  const moons = repositoryMoons({full_name:'owner/project',default_branch:'main'}, {
    branches:[{name:'main'},{name:'feature/foo'}],
    releases:[{id:8,tag_name:'v1.0',name:'First release',html_url:'https://github.com/owner/project/releases/tag/v1.0'}],
  });
  assert.equal(moons.length, 3);
  assert.equal(moons.filter(moon => moon.defaultBranch).length, 1);
  assert.deepEqual(moons.map(moon => moon.kind), ['branch','branch','release']);
  assert.equal(moons[1].url, 'https://github.com/owner/project/tree/feature%2Ffoo');
  assert.equal(moons[2].label, 'First release');
  assert.equal(moons[2].url, 'https://github.com/owner/project/releases/tag/v1.0');
});
