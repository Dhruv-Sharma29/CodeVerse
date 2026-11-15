import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invitePath, inviteTarget } from '../src/game/invite.ts';

test('invite links name a GitHub login or fall back to the trending hub', () => {
  assert.equal(inviteTarget('?u=torvalds'), 'torvalds');
  assert.equal(inviteTarget('?u=@vercel'), 'vercel');
  assert.equal(inviteTarget(''), 'trending');
  assert.equal(inviteTarget('?u=trending'), 'trending');
  assert.equal(inviteTarget('?u=../../etc'), 'trending');
  assert.equal(inviteTarget('?u=-bad-'), 'trending');
  assert.equal(invitePath('u:torvalds'), '/?u=torvalds');
  assert.equal(invitePath('trending'), '/');
});
