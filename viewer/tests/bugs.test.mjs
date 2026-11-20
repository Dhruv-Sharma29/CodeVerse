import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALIENS, BUG, bugTarget, createSim, emptyInput, setHost, step, takeSnap } from '../src/game/sim.ts';

const repo = (id, issues) => ({ id, name: `r${id}`, full_name: `o/r${id}`, description: null, language: 'Go', stargazers_count: 10, forks_count: 1, open_issues_count: issues, pushed_at: '', default_branch: '', fork: false, archived: false });
const universe = issues => ({ room: 'trending', title: 't', subtitle: '', owner: null, repos: [repo(1, issues), repo(2, 0)] });
const tick = sim => { const ev = []; step(sim, emptyInput(), 1 / 60, ev); return ev; };
const waveOf = (issues, n) => { const sim = createSim(universe(issues)); Object.assign(sim, { waveFloor: n, waveTimer: 0 }); tick(sim); return sim; };
const bugs = sim => sim.aliens.filter(a => a.kind === 'bug').length;
const alien = (kind, x, z, hp, max) => ({ id: Math.floor(Math.random() * 1e6), kind, x, z, vx: 0, vz: 0, hp, max, cool: 99, held: false, flung: 0, spin: 0, orbitDir: 1, t: 0, hitCool: 0 });

test('bugs come every third wave, only where the repos have plenty of open issues', () => {
  assert.equal(bugs(waveOf(500, 3)), 1);
  assert.equal(bugs(waveOf(500, 4)), 0);
  assert.equal(bugs(waveOf(500, 6)), 1);
  assert.equal(bugs(waveOf(BUG.minIssues - 1, 3)), 0, 'a quiet universe has none');
  assert.equal(bugs(waveOf(BUG.manyIssues, 9)), 2, 'a very buggy universe gets two from wave 9');
  assert.equal(bugs(waveOf(500, 15)), 1, 'even a boss wave: the bug mends the mothership');
});

test('a bug heals the most damaged alien near it until it is shot, and keeps away from you', () => {
  const sim = createSim(universe(0)); sim.planets.length = 0;
  Object.assign(sim, { wave: 1, waveTimer: 999 });
  Object.assign(sim.ship, { x: -200, z: 0, inv: 999 });
  const bug = alien('bug', 100, 0, 4, 4), hurt = alien('saucer', 110, 0, 1, 6), fine = alien('saucer', 95, 5, 6, 6), worse = alien('hunter', 300, 0, 1, 9);
  bug.cool = 0; sim.aliens.push(bug, hurt, fine, worse);
  assert.equal(bugTarget(sim, bug), hurt, 'the far, worse-hurt hunter is out of range');
  for (let t = 0; t < 3; t += 1 / 60) { Object.assign(hurt, { x: bug.x + 10, z: bug.z, vx: 0, vz: 0 }); Object.assign(fine, { x: bug.x - 5, z: bug.z + 5, vx: 0, vz: 0 }); tick(sim); }
  assert.ok(hurt.hp >= 3, `healed to ${hurt.hp}`);
  assert.equal(fine.hp, 6);
  assert.equal(sim.bullets.filter(b => b.from === 'alien').length, 0, 'bugs never shoot');

  Object.assign(sim.ship, { x: bug.x - 8, z: bug.z });
  const before = Math.hypot(bug.x - sim.ship.x, bug.z - sim.ship.z);
  for (let t = 0; t < 1; t += 1 / 60) tick(sim);
  assert.ok(Math.hypot(bug.x - sim.ship.x, bug.z - sim.ship.z) > before + 5, 'it backs off from a pilot');
  assert.equal(ALIENS.bug.pts, 250);
});

test('bugs travel in the shared-alien snapshot', () => {
  const host = waveOf(500, 3); host.myId = 1;
  host.remotes.set(2, { id: 2, name: 'p', color: '#fff', x: 0, z: 0, a: 0, vx: 0, vz: 0, hp: 100, tx: 0, tz: 0, seen: 0 });
  setHost(host, 1);
  const guest = createSim(universe(500)); guest.myId = 2; setHost(guest, 1);
  guest.snap = takeSnap(host); tick(guest);
  assert.equal(bugs(guest), 1);
});
