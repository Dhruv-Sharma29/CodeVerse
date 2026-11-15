# 00 — Charter

## The problem

GitHub is full of things worth exploring and almost nothing that makes exploring it fun. A
profile is a list; trending is a list; a repository's history is a list. The earlier CodeVerse
explorer turned those lists into a planetary system you could look at. Looking is still passive,
and it is a solo activity.

Orbit asks what happens if the same real data becomes a place you **fly through with other
people**: repositories you can grab, commits you collect, a gate that takes you into anyone's
universe, and something to do together once you are there.

## What it is

A browser game served at `/`:

- **Universes from real data.** The trending hub (GitHub's monthly trending repositories) and one
  universe per GitHub account (its public, non-fork repositories, ranked by importance). Planet
  palette and surface come from language; size from repository size or stars.
- **A shared space.** Everyone in the same universe sees each other's ships, shots, thrown planets
  and supernovas through a small WebSocket relay.
- **Something to do.** Alien waves with a boss every fifth wave, a gravity beam, commit satellites
  that charge a supernova, dogfights between every pilot, a moving hyperjump gate, and a comet that
  links to the creator.

The original explorer stays available at `/explorer/` for calm, analytical browsing.

## Scope for v1

### In
- Desktop and touch browsers; WebGL required.
- Public GitHub data only, through the public REST API and the trending page. No token needed.
- Up to 18 planets per universe, 14 recent commits per planet.
- One relay process holding rooms in memory, hosted separately from the website.
- Always-on player-versus-player combat with client-owned ships (no peace mode).

### Out (deliberately, not from running out of time)
- **Accounts, persistence and leaderboards.** Scores are self-reported by clients. Storing or
  ranking them would need server-side simulation or verification; without that, a leaderboard
  measures who edited their client.
- **Server-authoritative aliens.** Each pilot fights their own waves. Sharing them would put a game
  loop on the server and turn a stateless relay into a game server, with the hosting cost that
  implies.
- **Free-text chat.** Six preset emotes cover coordination without a moderation problem.
- **Private repositories.** That would need OAuth and server-side tokens, which the free hosting
  and the "no secrets in the browser" rule both argue against.

## Success criteria

| # | Criterion | How it is checked |
|---|---|---|
| S1 | A first-time player can launch and play within seconds of the page loading | Lobby renders over the live universe; launch reuses it ([03](03-gameplay.md)) |
| S2 | The game rules run identically in the browser and in tests | `sim.ts` has no React or three.js imports; 13 simulation tests ([04](04-simulation.md)) |
| S3 | Pilots in one universe see the same world events | Gate and comet are seeded from room and clock; relay tests ([05](05-multiplayer.md)) |
| S4 | Combat between pilots is fair to the one being hit | The victim's own client decides hits; a respawn shield blocks spawn farming; covered by a simulation test |
| S5 | The live site works on free hosting | Vercel for the site, Render for the relay, a keep-warm schedule, and an in-game waking state ([06](06-deployment.md)) |
| S6 | Every claim in these docs matches the code | Numbers are taken from the code; [10](10-implementation-notes.md) records where the build departed from the plan |
