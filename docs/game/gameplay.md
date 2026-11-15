# Gameplay

## The loop

1. **Launch** from the lobby into the trending hub.
2. **Fly** between repository planets, **collect commits** from their gold satellites, and **fight** alien waves.
3. **Charge** the supernova with commits and kills, then unleash it.
4. **Find the gate** on the outer rim and **hyperjump** into any GitHub user's or organization's universe. Your score, kills, charge and commits come with you.

## Universes

| Universe | Planets |
|---|---|
| Trending hub | Up to 18 of GitHub's monthly trending repositories |
| `u:<login>` | Up to 18 of that account's public, non-fork repositories, ranked by importance |

Planet palette and surface follow the repository's language; size follows repository size (or
stars, for trending). Each planet's 14 most recent commits become satellites the first time you fly
close to it.

## Ships

Choose a hull and colour in the lobby hangar. Other pilots see your choice.

| Hull | Hull points | Cruise / boost speed | Fire interval | Weapon |
|---|---|---|---|---|
| **Dart** | 100 | 46 / 74 | 0.13 s | Twin blasters, 1 damage |
| **Wasp** | 70 | 58 / 90 | 0.085 s | Twin blasters, 1 damage |
| **Titan** | 160 | 38 / 60 | 0.30 s | Three-way spread, 2 damage per shot |

All hulls regenerate 4% of their hull per second after four seconds without damage, and respawn
near the sun 2.6 seconds after being destroyed. Shots get a light aim assist when already within
about 8° of an alien's lead point.

## Aliens

Waves begin a few seconds after the previous one is cleared.

| Alien | Appears | Behaviour | Hits | Score |
|---|---|---|---|---|
| **Saucer** | Every wave | Circles you at range and fires leading shots | 3 | 100 |
| **Hunter** | From wave 2 | Rams you for 15 damage | 1 | 60 |
| **Swarmer** | Packs of six from wave 3 | Weaves toward you; pops on contact for 8 damage | 1 | 40 |
| **Mothership** | Every fifth wave | Orbits at range, fires rings of 16 shots (faster below half health), launches swarmers | 40 + 3 × wave | 1,500 |

Planets are solid: aliens steer around them and cannot pass through.

The mothership can't be grabbed. Planets, supernovas and blasts deal it a capped 12 damage, at most
once every 0.6 seconds, so it takes several big hits or sustained fire. Its health bar shows at the
top of the screen.

## Gravity beam

Hold **E** or **right-click** to lock onto the nearest planet or alien within 18 units, or within 55
units inside a cone in front of you. The held body travels with your ship and can't overlap it.
Release to fling it at your ship's velocity plus 85 units per second along your aim.

- A held or flung **planet** destroys aliens it touches and knocks other planets off their orbits. Every pilot in the universe sees the throw.
- A flung **alien** explodes on impact, destroying aliens within nine units.

## Commits and supernova

Each commit collected gives 25 score and 12% charge; each kill gives 3–60% depending on the alien.
At 100%, press **Q** (or **NOVA**): a shockwave spreads to a radius of 100 over 0.9 seconds,
destroying aliens and pushing planets outward. Other pilots in the universe see it.

## The hyperjump gate

The gate sits in an outer band past the last planet, at a random angle. Every three minutes it
moves to a new random spot. Its position is computed from the universe name and the current
three-minute window, so all pilots agree without asking the server. A violet arrow at the screen
edge points to it with the distance, and the radar pins it to its rim.

Fly into the gate to open the hyperjump dialog: type any GitHub username or organization, pick a
universe where other pilots are flying, or choose a recent or suggested one.

## First flight

New pilots see a six-step tutorial: fly, aim and fire, gravity beam, collect a commit, supernova,
hyperjump. Steps complete when you actually do them, in any order, and progress is saved in the
browser. Skip it from the panel; press **H** later for the controls sheet and a replay option.
