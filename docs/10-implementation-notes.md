# 10 — Implementation notes

Where building the game proved the plan, or an earlier version of the code, wrong. Each entry
says what happened, how it was found, and what changed.

## The asteroid belt re-scattered ten times a second

**What happened.** The belt placed its rocks inside an inline React ref callback. A new callback
is created on every render, so React re-ran it on every render, and the HUD re-rendered ten times
a second. Every rock jumped to a new random spot each time: visible as flicker and "distortion".

**How it was found.** A player screenshot, not a test. Nothing failed; the code did exactly what
it said.

**What changed.** Rocks are placed once per universe in a layout effect, from a seeded random
generator, so every pilot sees the same belt. The 3D scene is also memoised, so HUD updates no
longer re-render it at all. The rule is now in [11](11-contributing.md): no randomness during render.

## A failed hyperjump left the camera stretched

**What happened.** The warp effect widens the field of view while a universe loads. If the load
failed quickly (GitHub's rate limit), the error path started winding the warp down while the
wind-up animation was still running. The wind-up finished last and left the view at maximum width.

**What changed.** Warp tweens share one token; starting a new one stops the old. Reproduced in the
browser with a username that does not exist.

## Planets were not solid for aliens, or for the ship holding them

**What happened.** Two separate collision gaps. Aliens had no planet collision at all. And the ship
skipped collision with the planet it was holding, while the beam damped the held planet towards
rest, so flying forward put the ship inside it.

**What changed.** Aliens steer around planets and are pushed out on contact. A held body is damped
relative to the ship, so it travels with it, and is shoved clear if it ever overlaps. Both have
tests.

## Production deploys failed for five weeks

**What happened.** The web app moved from `spike/viewer/` to `viewer/`, but Vercel's Root Directory
setting still pointed at the old folder. Every deploy after the move failed in about one second,
including the merge that introduced the game. The code built fine the whole time.

**How it was found.** Comparing the last successful deployment with the first failing one, then
Vercel's own message: the specified root directory does not exist.

**What changed.** The setting now points at `viewer`. The lesson is in [06](06-deployment.md):
hosting settings live outside Git and need checking when folders move.

## The free relay sleeps

**What happened.** Render's free plan stops a service after 15 idle minutes and takes up to a
minute to start again. The game showed "Connecting…" for that whole minute with no explanation.

**What changed.** A scheduled GitHub Action keeps it awake during waking hours in India, sized to
the workspace's free-hour budget, and the client says "waking" and keeps retrying instead of
looking broken. The first version of that status flickered between "waking" and "connecting"
between retries; the test written for it caught that before it shipped.

## The crossed-swords symbol rendered as an "x"

**What happened.** The crossed-swords character (U+2694) without an emoji selector rendered in the game font as a plain "x", so the
Dogfights button read "x Dogfights on" and pilots looked like "x Ada".

**How it was found.** Taking the README screenshots.

**What changed.** First the symbol was written with the emoji selector U+FE0F. Later the game dropped emoji altogether and uses plain words ("Wins", "bounty", "Gate contested").

## Dogfights stopped being optional

**What happened.** Dogfights started as a per-pilot opt-in with a switch in the lobby and the HUD,
and a five-second delay when switching off. The switch could get stuck on "Leaving…" when its timer
was lost on a remount; that was fixed by deriving the timer from state.

**What changed.** The design moved to **no peace mode**: every pilot in a universe can shoot every
other pilot. The switch, the delay and the `p` field in the relay's `state` message were removed.
The respawn shield remains the protection against being farmed at the spawn point.

