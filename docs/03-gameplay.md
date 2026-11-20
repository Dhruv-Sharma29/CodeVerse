# 03 — Gameplay

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

Hulls repair only between waves: 8% of the hull per second, four seconds after the last hit, once no alien is left, and respawn
near the sun 2.6 seconds after being destroyed. Shots get a light aim assist when already within
about 8° of an alien's lead point.

## Aliens

Waves begin a few seconds after the previous one is cleared. In multiplayer everyone in a universe
fights the same aliens: they chase whichever pilot is nearest, and whoever lands the killing blow gets
the points. Waves grow with company: each extra pilot adds about half a wave of aliens and a quarter more
mothership hull, up to three times the solo wave (see [05-multiplayer.md](05-multiplayer.md)). Grabbing an alien with the gravity beam works
only for the pilot running the aliens; everyone else can still grab planets.

| Alien | Appears | Behaviour | Hits | Score |
|---|---|---|---|---|
| **Saucer** | Every wave | Circles you at range and fires leading shots | 3 | 100 |
| **Hunter** | From wave 2 | Rams you for 15 damage | 1 | 60 |
| **Swarmer** | Packs of six from wave 3 | Weaves toward you; pops on contact for 8 damage | 1 | 40 |
| **Mothership** | Every fifth wave | Orbits at range, fires rings of 16 shots (faster below half health), launches swarmers | 40 + 3 × wave | 1,500 |

Planets are solid: aliens steer around them and cannot pass through. Saucers and the mothership are
solid to your ship too: you bounce off them, and ramming one at speed scrapes a little hull (4, or 8
for the mothership).

### Getting harder

After wave 5 each wave adds 15% alien hull and 4% alien speed and saucer fire rate (capped at
+40%). From wave 6 every third saucer carries a shield (every second one from wave 11): a wireframe
bubble that soaks 4 damage from bullets before the hull takes any. Planets, supernovas and blasts go
straight through it.

Your hull only repairs between waves, so damage taken in a fight stays until the wave is cleared, and
being shot down costs one level of a random perk you have.

### Perks

Clearing a wave offers three upgrades; pick one with a click or tap, or **7**, **8** or **9**. The game
doesn't pause, and the offer stays until you take one. Unclaimed upgrades stack up: clear more waves
without picking and they wait in line, oldest first, with a count of how many more are waiting. Each perk stacks to level 3,
and perks carry through hyperjumps along with your score.

| Perk | Each level |
|---|---|
| **Rapid fire** | 15% less time between shots |
| **Tractor beam** | Grab from 25% farther, throw 20% harder |
| **Nova capacitor** | Supernova charges 30% faster |
| **Hull plating** | +20% hull, and a full repair when taken |
| **Afterburner** | 8% more thrust and top speed |

The mothership can't be grabbed. Planets, supernovas and blasts deal it a capped 12 damage, at most
once every 0.6 seconds, so it takes several big hits or sustained fire. Its health bar shows at the
top of the screen.

## Planets are their repositories

| From the repository | In the game |
|---|---|
| **Language** | How the planet behaves when flung. **Heavy** (Rust, C, C++, Go, Zig…): thrown 25% slower, smashes aliens from 3 units further and shoves other planets twice as hard. **Bouncy** (JavaScript, TypeScript, Vue, Svelte…): ricochets off planets and the sun and stays in flight 5.5 s. **Light** (Python, Ruby, Shell, Lua, PHP…): thrown 30% faster. Everything else is balanced. The planet card names the trait. |
| **Open issues** | Red asteroids orbiting the planet, from 2 up to 10 depending on the count. Shooting one closes it: +30 and +3% nova charge. Trending repos have no issue data, so no rocks. |
| **Stars** | Planets with 50+ stars carry a golden ★. Flying through it gives a 5-second shield and +25 hull; it comes back after 45 s. |
| **Recent activity** | Repositories pushed to in the last 14 days, and every trending repository, glow. |

## Docking

Fly close to a planet and press **Enter** (or **Dock** on its card). The ship glides in over about a
second, then circles the planet slowly just above the surface, held by a tractor beam, shielded and
with weapons off. The camera eases in and holds the planet clear of the panel, which shows the repository: description, stars, forks,
a short excerpt of its README, and its top contributors (bots left out). Each contributor is a
hyperjump: pick one to warp into their universe. That is the way to walk GitHub's real social graph:
repository → person → their repositories → their collaborators.

Enter, **Esc** or any movement key undocks; the ship pushes off nose-first, away from the planet. Docking costs two GitHub requests (README and
contributors), cached for five minutes; when the hourly limit is used up, the panel says so.

## Gravity beam

Hold **E** or **right-click** to lock onto the nearest planet or alien within 18 units, or within 55
units inside a cone in front of you. The held body travels with your ship and can't overlap it.
Release to fling it at your ship's velocity plus 85 units per second along your aim.

- A held or flung **planet** destroys aliens it touches and knocks other planets off their orbits. Every pilot in the universe sees the throw.
- A flung **alien** explodes on impact, destroying aliens within nine units.

## Commits and supernova

Each commit collected gives 25 score and 12% charge; each kill gives 3–60% depending on the alien. Kills made by your own supernova score
as usual but add no charge, so a nova that clears a wave cannot refill itself.
At 100%, press **Q** (or **NOVA**): a shockwave spreads to a radius of 100 over 0.9 seconds,
destroying aliens and pushing planets outward. Other pilots in the universe see it.

## The hyperjump gate

The gate sits in an outer band past the last planet, at a random angle. Every three minutes it
moves to a new random spot. Its position is computed from the universe name and the current
three-minute window, so all pilots agree without asking the server. A violet arrow at the screen
edge points to it with the distance, and the radar pins it to its rim.

Fly into the gate to open the hyperjump dialog: type any GitHub username or organization, pick a
universe where other pilots are flying, or choose a recent or suggested one.

The jump itself takes two seconds. The old universe freezes, the gate disappears, the camera drops in
behind the ship and it flies down a tunnel of light streaks; then it glides out into the new universe while the tunnel
fades and the camera rises back to its usual view. If the new universe takes longer than two seconds
to load, the ship stays in the tunnel until it is ready. If loading fails, the ship comes back out
of the gate it entered.

## Multiplayer

Everyone in the same universe flies together. Ships, shots, thrown planets, supernovas and aliens are
shared.

- **Dogfights, always on.** There is no peace mode: every pilot in a universe can shoot every other
  pilot. 8 damage per shot (16 for the Titan), 45 from a supernova. Shooting someone down gives +300
  and a dogfight win, and the whole universe sees it in the kill feed. Respawning gives a short
  shield, so nobody can be farmed at the spawn point.
- **Invite links.** `/?u=<login>` opens that universe directly; the lobby shows it behind the title
  and the launch button names it. The address bar follows you through hyperjumps, so copying it
  shares the universe you are in. A bad or rate-limited link falls back to the trending hub and says
  why.
- **Pings.** Press **P** (or **PING** on touch) to mark the spot under your mouse, or ahead of your ship
  on keyboard or touch. Everyone in the universe sees a beam, a pulsing ring and a label worked out
  from what is there: Danger near aliens, a planet's name, Hyperjump gate, Comet, or Here.
  Pings last 6 seconds, each pilot has at most 3 at once, there is a 1.2 s cooldown, and they show on
  the radar (pinned to its edge when far away).
- **Pilots board.** Press **Tab** to see everyone here with ship, score and dogfight wins. Touch
  devices have no Tab key, so they get a **Pilots** button instead.
- **Emotes.** Press **1–6** (or use the buttons on the board): Hi, GG, Nice!, Help!,
  Fight me, Truce. They appear above your ship for every pilot. Emotes are preset only.

### Bot pilots

While nobody else is in your universe, two rival bots join you after a few seconds, but not during the first flight: they wait until you finish or skip it. They are marked
**BOT** on red dashed name tags, show as smaller dots on the radar and as "(bot)" on the pilots board.

- They **race you for commits**: a commit a bot reaches first is gone.
- They are **solid**: fly into one and you bounce off each other.
- They **hunt aliens** for points, and **pick fights** with you when you are closer than any alien,
  or for eight seconds after you shoot them. Their aim wobbles and they fire slower than you, so a
  moving pilot can dodge.
- You can **shoot them down** for +150 (a real pilot is worth 300); they come back five seconds later.
- A pop-up tells you when a bot takes the lead, and when you take it back.

They leave you alone while you are docked or shielded, and never contest the gate, take the bounty or
reach the relay and the leaderboards. The moment a real pilot arrives the bots leave; if everyone else
leaves, new ones turn up.

## Feel

- **Damage numbers.** Your hits leave small floating numbers: white damage on aliens, gold points
  on kills, green for closed issues, orange for meteors, red for damage dealt to another pilot.
- **Follow-cam.** When another pilot shoots you down, the camera follows them until you respawn.
- **Gamepad.** Standard layout (Xbox or PlayStation in the browser): left stick flies, right stick aims
  (centre it and aim assist picks targets), RT fires, LT is the gravity beam, A boosts, Y supernova,
  X ping, B docks or undocks, Back/Select opens the pilots board.
- **Music.** An ambient track generated live in the browser (pad chords Am–F–C–G and a soft arpeggio;
  no recordings), only while flying. **M** or the Controls sheet turns it off; **Sound off** silences
  everything. Effects and music go through a compressor so they stay full without clipping.

## Phones, tablets and full screen

- **Touch controls.** Left stick to fly; buttons for **FIRE**, **GRAB**, **BOOST** (hold), **NOVA** and
  **PING**. Two columns in portrait with FIRE under the right thumb; three columns in short landscape.
- **Tilt to steer.** Tap **TILT** to fly by tilting the phone: tilt the top away to fly up the screen,
  toward you to fly down, left and right to steer. It calibrates to however you are holding the phone
  when you switch it on (tap it off and on to re-centre) and re-centres when the screen rotates. The
  stick still works and wins while you touch it. iPhone and iPad ask for motion permission the first
  time. Tilt angles: 3° dead zone, full speed at 18°.
- **Full screen.** **Full screen** in the HUD, or **F** on a keyboard. Phones go full screen
  automatically on Launch where the browser allows it. iPhone Safari has no full-screen API for web
  pages, so the lobby suggests **Share → Add to Home Screen**; the installed game opens full screen.
- **Any window size.** The game fills the window or the screen and re-lays-out on resize; short
  screens (phones in landscape, small laptop windows) get a compact HUD.

## World events

All four are worked out from the universe name and the clock, so every pilot sees the same thing
with no server state.

| Event | When | What it does |
|---|---|---|
| **Meteor storm** | 40 s every 10 minutes (at :00, :10, :20… past the hour), announced 10 s before | Meteors cross the whole map on seeded paths. A hit costs 20 hull; shooting one gives +50. |
| **Bounty** | Whenever two or more pilots are in a universe | The clear top scorer (at least 1,000) carries the bounty: BOUNTY on their name tag and on the pilots board. Shooting them down pays +500 on top of the usual +300. |
| **Hold the gate** | Always | A gold ring of radius 22 around the hyperjump gate. Alone inside it you score +15 per second; any other live pilot inside makes it contested and nobody scores. |
| **Daily challenge** | Each UTC day | A well-known GitHub account and a goal (collect commits or shoot down aliens) picked from the date, the same for everyone. The lobby offers it, the HUD tracks progress from when you arrive, and finishing pays +1,000 once per day. |

## Leaderboards

The lobby shows two boards, top five each:

- **All-time best:** the most points earned in one run (one connection, across hyperjumps).
- **Today in the daily challenge's universe:** the most points earned inside that universe today (UTC).

Nobody submits a score. The relay records a run when the pilot leaves a universe or starts a new
game, and only if the relay's checks passed for the whole connection (see
[05](05-multiplayer.md#trust-model)). Pilots using the default name "Pilot" are not ranked.

## Settings

**Settings** in the lobby or the HUD:

- **Graphics:** Auto, High or Low. Low renders at 1x pixel density without antialiasing, with fewer
  background stars and belt asteroids. Auto picks Low on phones and tablets with four or fewer CPU
  cores or 4 GB or less memory.
- **Colours:** Standard or Colour-blind. The colour-blind palette replaces red-against-green with
  sky blue, orange, yellow and purple (the Okabe-Ito colours) for aliens, bullets, the radar and the
  good and bad colours in the HUD. Alien kinds also differ by shape.
- **Keys (keyboards):** every action can be rebound. A key already in use swaps places with the old
  one. Arrow keys, 1 to 6 for emotes and Esc always work and can't be rebound. The tutorial and the
  Controls sheet show your bindings.

Settings are saved in the browser.

## The creator's comet

One comet crosses every universe. Each two-minute window it enters past the rim at a random angle
and leaves on the far side along a random path, so it can appear anywhere. Like the gate, its path
comes from the universe name and the clock, so every pilot sees it in the same place. It shows on
the radar as a white dot.

- Fly within 28 units to see a card linking to the creator's GitHub profile, [@Dhruv-Sharma29](https://github.com/Dhruv-Sharma29).
- Fly through it (within 6 units) to catch it: +250 score and +25% supernova charge, once per crossing.

## First flight

New pilots see a six-step tutorial: fly, aim and fire, gravity beam, collect a commit, supernova,
hyperjump. Steps complete when you actually do them, in any order, and progress is saved in the
browser. Skip it from the panel; press **H** later for the controls sheet and a replay option.
