# CODEVERSE: the identity and discovery layer

**Status:** proposal, not committed work. Nothing here is scheduled until the open questions in §9 are answered.
**Companion docs:** [PLAN.md](PLAN.md) (the build plan and competitive landscape), [bundle-schema.md](bundle-schema.md) (the local-history format).
**Last verified against live APIs:** 2026-09-20.

---

## 1. The reframing

Today CodeVerse answers *"what does this repository look like?"*. The proposal is to make it answer *"who is this developer, and how do they build?"* — so a person's universe becomes something they **send to other people**, and something a visitor can **fall out of into someone else's**.

| | Today | Proposed |
|---|---|---|
| Unit | A repository | A developer |
| Verb | Look at | Explore, then share |
| Entry | Trending feed, or type a handle | A link someone sent you |
| Return reason | None — you've seen it | New universes, your own changing over time |

The single sentence to design against: people should say **"check out my universe"**, not "check out my GitHub".

This is a real gap. The current app has no reason to come back after the first "wow", which is the same weakness identified for the visual layer in [PLAN.md §0](PLAN.md). But the fix is not more 3D effects — it's giving the thing a social surface.

---

## 2. What already exists (the starting line)

Worth being precise, because a lot of the loop is closer than it looks:

- **Shareable profile URLs already work.** `Explorer.tsx` writes `?user=<handle>` with `history.replaceState`, and reads it on load. A link to someone's universe already opens their universe.
- **Trending is already a real feed** — GitHub's monthly trending, with genuine monthly star gains, cached 30 minutes server-side.
- **Profile → repository planet → commit satellites → changed files** is built, using the official REST API.
- **Deep per-repo history** exists via the local analyzer bundle (full first-parent history, time travel).
- **Archived repositories are already in the data** (`archived` on `Repository`), so "black holes" cost nothing but a shader.

What does **not** exist: any server-side state. No database, no accounts, no sessions. One serverless function (`/api/trending`) and a static SPA. Every feature below is priced against that fact.

---

## 3. Competitive reality check

[PLAN.md §1.4](PLAN.md) documents this in full, but it matters doubly here, because **the social/discovery layer is the part a competitor has already built**:

[**Stack Universe**](https://github.com/m-abdullah-06/Stack-Universe) already ships: type a username → solar system, a public leaderboard ("Hall of Giants"), a "warp drive" that drops you into a random developer's universe, profile-stat-driven nebulas, and CI status as space weather. Items 2, 3, 4 and 10 of the original brainstorm are, in substance, that product.

So the honest split:

| Brainstorm item | Verdict |
|---|---|
| Universe card, trending universes, visiting other universes, global galaxy clustering | **Already exists elsewhere.** Build only with a sharper angle than theirs, or skip |
| Achievements, planet discussions, astronaut avatars, multiplayer, challenges | **Unclaimed, but generic.** These are standard social mechanics; they're cost, not moat |
| **Universe Evolution (a timeline of how someone's universe grew)** | **Unclaimed and ours.** Nobody else has a git-history time-travel engine. Stack Universe is a snapshot; CodeCohesion is a single repo. A *developer-level* time-lapse across every repo is something only this codebase is positioned to build |
| **The Oracle** (cited, LLM-explained history) | **Unclaimed.** Still the strongest differentiator in the whole project |

**Recommendation:** treat "Universe Evolution" as the headline of this layer, not item 8 of 10. The share link should open on *motion* — a developer's universe assembling itself year by year — not on a static stat card that looks like everyone else's.

---

## 4. The binding constraint: GitHub rate limits

This decides the shape of everything else, so it goes before the feature list. Measured live on 2026-09-20:

| Bucket | Unauthenticated | With a token |
|---|---|---|
| REST core (`/users`, `/repos`, `/commits`) | **60 / hour / IP** | 5,000 / hour |
| Search (`/search/repositories`) | **10 / minute** | 30 / minute |

What that means in practice, at today's call pattern (1 call for the profile, 1 per repo page, 1 for commits, 1 per commit detail):

- Opening one profile and one repository ≈ **4–5 calls**.
- A visitor exploring **~10 profiles exhausts the hour** — on a shared office or campus IP, one person can burn it for everyone.
- Any "find a developer with 500+ stars and a Python repo" challenge (§6, item 9) needs the **Search** API — 10 requests per minute unauthenticated. A discovery product cannot run on that.

**Therefore:** every discovery feature in this document requires a server-side proxy holding a GitHub token, with caching. That is not optional, and it is the first infrastructure to build. Consequences:

- A token is a **secret** — it lives in a serverless function's environment, never in browser code ([PLAN.md §5](PLAN.md) next-priority 5 already states this).
- 5,000/hour is a *shared* budget across all visitors, so cache aggressively (the existing 30-minute trending cache is the right pattern) and cache by handle.
- Add a per-IP request budget in the proxy, or one scraper drains the shared quota.

---

## 5. Feature catalog, priced by infrastructure

Grouped by what each tier *forces you to own*. The jump from Tier 1 to Tier 2 is where this stops being a static site, and the jump to Tier 3 is where it becomes a community you have to police.

### Tier 0 — no backend, no accounts

| Feature | Notes |
|---|---|
| **Universe card** (name, repo count, stars, active projects, "Enter universe") | Pure derived data. Cheap, and it's the frame the share link needs |
| **Share/OG image** | The highest-leverage item in this doc. A link with no preview image does not travel. Needs a rendering route, but no database |
| **Pretty URLs** — `/@handle` instead of `?user=` | Needs a rewrite rule; cosmetic but it's literally the positioning |
| **Universe Evolution** ⭐ | The differentiator (§3). Needs the analyzer, not a server |
| **Moons** (branches/releases), **satellites** (contributors) | Verified available: `/branches`, `/releases`, `/contributors` all return 200. Each is an extra call — respect §4 |
| **Black holes** (archived repos) | `archived` is already in the fetched data. Free |

### Tier 1 — read-only backend (a token + a cache)

| Feature | Notes |
|---|---|
| **The token proxy** | Prerequisite for everything below. Build first |
| **Trending universes / categories** (Most Active, Rising, AI, Web, Games, Mobile) | Needs Search API, so needs the proxy. Overlaps Stack Universe's leaderboard — see §7 on consent before ranking real people |
| **Global developer galaxy** (clustering by language/domain) | Expensive to compute per request; precompute on a schedule, serve a static artifact |

### Tier 2 — identity (GitHub OAuth + a database)

| Feature | Notes |
|---|---|
| **Sign in with GitHub** | Brings a per-user 5,000/hr quota, which mostly solves §4 for signed-in users. Also the consent mechanism for §7 |
| **Claimed universes** (bio, title, pinned repos) | First real persistence. Pick boring storage |
| **Achievements / badges** | Cheap to compute, but needs storage to be durable and rules that can't be farmed. Purely additive — defer past a launch |

### Tier 3 — social (moderation burden)

| Feature | Notes |
|---|---|
| **Visit counts** ("1,248 explorers") | Needs write-heavy storage + bot filtering, or the number is a lie |
| **Planet discussions** | User-generated content on *other people's* repositories. Needs moderation, reporting, and a policy. GitHub already has Issues and Discussions — be sure this isn't a worse copy attached to someone else's project without their consent |
| **Astronaut avatars / multiplayer presence** | Realtime infrastructure (WebSocket/presence), a per-room cost, and an empty-room problem: "23 developers exploring" is magic at scale and depressing at zero |
| **Challenges / scavenger hunts** | Depends on Search (§4) and on enough traffic for the hunt to feel alive |

---

## 6. The loop, and the cheapest version of it

The proposed loop is right:

```
land on a shared link → explore a universe → click a repo → discover its author
       ↑                                                              │
       └───────────────── share your own ←── generate yours ←─────────┘
```

The cheapest complete version of that loop needs **no database and no accounts** — Tier 0 plus the §4 proxy:

1. Someone shares `codeverse.../@dhruv`.
2. The link unfurls with a **real OG image** of that universe (not a logo).
3. It opens on **Universe Evolution** — the universe assembling year by year — then settles into the explorable system.
4. Clicking a planet shows the repository; its contributors are satellites, each one a **link to that person's universe**. That is the discovery edge, and it needs no social graph of our own.
5. A persistent "**Create your universe →**" affordance turns a visitor into a sharer.

Everything in Tiers 2–3 is optional on top of that. Build the loop first and measure whether anyone actually shares; if they don't, discussions and achievements won't save it.

---

## 7. Consent, privacy, and abuse

The brainstorm proposes ranking, tracking, and hosting discussion about **real people who never signed up**. That needs deciding before launch, not after:

- **Leaderboards of unconsenting people.** Public data doesn't make a public ranking welcome. Rank *repositories* (already public, already ranked by GitHub) and let **people opt in** by signing in, before ranking humans.
- **Removal request path.** Have one, honor it, and don't require an account to use it.
- **Visit counts are surveillance-shaped.** "1,248 explorers visited this planet" is engagement framing for data the repo owner never asked to collect. Aggregate, don't personalize, and never show *who* visited.
- **Discussions attached to someone else's repo** are the highest-risk feature here: harassment surface, no owner consent, and moderation cost that doesn't scale with a side project. Strongest recommendation in this doc: **don't build Tier 3 discussions.** Link to the project's own Issues/Discussions instead.
- **Achievements amplify a status game.** "100-day streak" rewards a habit that GitHub's own community has criticized. Prefer craft-based badges (breadth of languages, long-maintained projects) over streaks.
- **No secrets in browser code.** Any token lives server-side (§4).

---

## 8. Suggested sequence

Each step is gated on the previous one being *used*, not merely shipped.

| Step | Contents | Done when |
|---|---|---|
| **S1. Make it shareable** | Pretty `/@handle` URLs, universe card, OG image | A pasted link unfurls with that developer's actual universe in the preview |
| **S2. Make it move** | Universe Evolution on open (§3) | A first-time visitor sees motion before any UI chrome, and can replay it |
| **S3. Make it survivable** | Token proxy + per-IP budget + caching (§4) | Ten profiles in a row from one IP don't hit a limit |
| **S4. Make it lead somewhere** | Contributor satellites link to their universes; "Create your universe" | Median session visits more than one universe |
| **S5. Only then, identity** | OAuth, claimed universes, opt-in ranking (§7) | People are sharing without being asked to |

**Kill criteria for the whole layer:** if S1+S2 ship and the share rate is negligible, the problem isn't missing achievements or multiplayer — it's that the universe isn't interesting enough to send. Go back to the Oracle and Evolution instead of adding social mechanics.

---

## 9. Open questions

1. **Does the repo view survive the reframing?** [PLAN.md](PLAN.md) has the deep single-repo universe as the core; this doc makes the developer the unit. Both can't be the front door. Current answer in PLAN: trending → handle → repo → commits, with local bundles as the deep mode. Keep it explicit.
2. **Who pays for the shared token quota** and what happens when it's exhausted — degrade to cached data, or ask the visitor to sign in?
3. **Is a leaderboard worth the consent problem** (§7), given Stack Universe already has one?
4. **Which storage**, the first time something needs persisting? Deferred deliberately in [PLAN.md §3.2](PLAN.md); Tier 2 forces the decision.
5. **Domain** — `codeverse.dev` and similar are unverified. The name itself was checked (PLAN.md §11), the domain was not.
