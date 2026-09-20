# CODEVERSE: Build Plan

> Turn any Git repository into a living 3D universe you can explore, and watch it evolve.

This is the plan for the build. It covers what gets built, in what order, and why. It also calls out the places where the idea looks easy and isn't.

---

## Current product direction — 2026-09-19

> The identity/discovery layer (share links, universe evolution, trending universes,
> social features) is specified separately in **[social-layer.md](social-layer.md)**,
> including its GitHub rate-limit and consent constraints. It is a proposal, not
> committed work.

This update supersedes earlier statements that defer the profile universe to a
later release. The main entry is now **monthly trending → GitHub handle → repository
planet → commit satellites → actual changed files**. The original per-file universe
remains the local-history mode; the two scales must be labeled clearly.

### Shipped in the current prototype

- Open on GitHub’s actual monthly trending ranking, including monthly star gains.
- Enter a public user/organization handle or GitHub profile URL; load repositories
  in pages, filter by name/language, and navigate eight-planet sectors.
- Render individual repository worlds with deterministic language palettes,
  terrain or gas bands, atmospheric rims, optional rings, and rotation controls.
- Open a repository into an orbit of up to 60 recent default-branch commits.
  Selecting or pausing on a commit reveals its message, author, changed files,
  additions/deletions, and a direct evidence link to GitHub.
- Preserve full first-parent history playback for local exported bundles.

### Oracle increment — 2026-09-20

The selected-commit inspector now includes full messages and line-numbered text
patches. An optional **Explain this commit** action fetches authoritative public
GitHub evidence, calls the configured server-side model, and validates every
returned claim’s source IDs. It reports context limits and qualifies inferred
intent. See [oracle.md](oracle.md) for the implementation and verification details.

This is the first cited explanation capability, not completion of §6.2’s file
origin-story workflow. File-history retrieval, symbol-aware answers, epoch
narration, and guided tours remain unbuilt. Local bundles never enter this API.

### Next priorities and acceptance criteria

1. **Make the spatial view easier to read.** Keep planet labels separated as the
   camera moves; add a smooth, interruptible fly-to transition. A repository must
   remain reachable through the keyboard/list when 3D labels overlap. Measure
   frame time with eight worlds and 60 satellites on an integrated GPU.
2. **Connect overview to deep analysis.** Add an explicit analyze-repository action
   that uses the local analyzer, then enters its file universe. Do not infer file
   history from recent commit samples. Preserve the repository identity and a
   clear return path to the profile system.
3. **Give commits spatial meaning.** Extend the selected-commit view with file
   satellites sized by actual changed lines, distinguish additions/deletions/
   renames, and make every visible metric explainable. Keep decorative rings
   separate from analytical encodings.
4. **Build the cited Oracle.** Ground explanations in the selected commit and
   file history; include commit evidence and an explicit insufficient-context
   response. Do not send local source contents to an LLM without an intentional
   user action.
5. **Harden the discovery adapter.** Retain the real monthly trending source,
   expose freshness, and test parser changes. Profile and commit data use the
   official API. Add an optional authenticated backend only when larger quotas
   are needed; never put provider secrets in browser code.

Current limits must remain visible: public repositories only; up to 60 recent
commits in API mode; the first 100 changed files fetched per commit; additional
repository pages loaded on demand. Monthly trending is GitHub’s rolling monthly
view, not a historical calendar-month archive. Its server-side adapter is required
for a hosted initial feed. Rings are decorative; profile size is repository KB,
while trending size uses stars because the feed omits KB.

## 0. The one-sentence strategy

**Launch with the GIF, but don't rely on visuals alone — ship a sliver of the Oracle from day one.** People star the project because of a 10-second clip of a codebase growing like a galaxy. That used to be the whole differentiator; **it no longer is** (see §1.4 — two "repo as a 3D galaxy" tools already exist and one of them, CodeCohesion, is a genuinely mature, feature-rich project). What neither competitor has, and what actually makes CODEVERSE worth building now: an LLM that can look at a file or a moment in history and explain *why* it's the way it is, with citations. So the plan changes in one concrete way from the original draft: a minimal, no-retrieval version of "ask a planet why it exists" ships **in v0.1**, not deferred to v0.2 — it's cheap (`git log --follow` + one LLM call, no vector index needed yet) and it's the one feature that isn't a re-skin of something already shipped elsewhere. The full Oracle (retrieval, epoch narration, guided tours, eval set) still comes in v0.2.

---

## 1. Product definition

### 1.1 Core promise
1. **Explore:** fly through a repo's structure in 3D.
2. **Understand:** hover or click anything to see what it is, who owns it, and how risky it is.
3. **Watch it evolve:** scrub or play through the full Git history.
4. **Ask:** get answers in plain language, backed by commits (v0.2).

### 1.2 Target users (in order of importance for stars)
| User | What they want | What sells them |
|---|---|---|
| Devs scrolling HN/X/Reddit | Something cool | README GIF, live gallery |
| OSS maintainers | Show off their project | Generated GIF or badge for their README |
| New contributors joining a codebase | A map | Click-to-explain, ownership, hotspots |
| Tech leads | Architecture health | Hotspots, coupling, drift over time |

### 1.3 Non-goals (explicitly out of scope until after v0.3)
- Branches as "alternate universes" (hard to do and the payoff is unclear)
- Walkable first-person world with NPCs (fun, but fly-cam gives most of the effect)
- Accounts, auth, Supabase, saved workspaces
- Auto-fixing code ("treatment" patches)
- Real test *coverage* (we can't run the tests; we only detect whether tests exist)
- Monorepos with more than ~50k files in the live viewer (the gallery uses pre-baked ones instead)

### 1.4 Competitive landscape (checked 2026-09-17 — re-verify before launch, this space moves fast)

Before writing a line of viewer code we searched for prior art. Result: **the core visual idea — a Git repo as an orbiting 3D solar system with commit playback — already exists, twice, and one of them is good.** This section exists so nobody on this project re-discovers that the hard way at launch and so the plan below is honest about what's actually novel.

| Project | Stars (checked date above) | What it already does | Overlap with our plan |
|---|---|---|---|
| [Gource](https://gource.io/) | Long-established, the default answer | Tree/particle visualization, files fly out of directories, contributors as walking avatars, full playback | Different visual form (2D-ish tree, not 3D space), but it *is* what most people will compare us to on Show HN. Assume every comment thread mentions it. |
| [CodeCohesion](https://github.com/virtualgenius/codecohesion) | 32★, actively developed since Oct 2025 | Solar-system metaphor (directories = planets, files = moons), **full commit-by-commit Timeline V2 with VCR controls (1x–1000x)**, **11 color modes** (churn, author, age, recency, coupling clusters, stability…), temporal-coupling / bounded-context detection, commit-siblings highlighting, hover/click info panels, repo switcher, GitHub-URL or local-path analysis via a local API server | **Very high.** This covers almost everything in our §2 metaphor table and §4.5 metrics table already, well, in a shipped product. Our "lenses" idea (DNA/MRI/Ghost) is uncomfortably close to their "11 color modes" unless we make the lenses genuinely different *scenes*, not just recolored spheres. |
| [GitGalaxy](https://github.com/alexandrmotologa/gitgalaxy) | 0★, created days ago (Sept 2026) | Same stack we planned (Three.js + React + TS), directory "gravity wells," commit laser beams + shockwaves + procedural audio, a **debt radar mode** (dims stable code, surfaces churn hotspots — literally our "hotspot" idea), **6-DOF cockpit flight mode**, branch belts, sibling "constellation" lines, 4K screenshot export, keyboard-driven UX | High on visual flourish, low on maturity/stars. Confirms the metaphor is an obvious-enough idea that it gets built independently; also sets a *high bar* for "cool factor" we'd need to match or exceed on visuals alone. |
| CodeCity / CodeCharta | Established, academic/SAP-backed | "Code city" — files as buildings, sized by metrics | Different metaphor (city, not space), mostly static snapshots rather than smooth time-lapse |
| [Stack Universe](https://github.com/m-abdullah-06/Stack-Universe) | 5★, created Mar 2026 | **Type a GitHub username → get a solar system.** Repos/languages as planets sized by usage, sun size from stars/account age, CI build status as "space weather," a public leaderboard ("Hall of Giants"), Supabase-backed | Directly overlaps a natural next idea: "enter a username, see their galaxy." But it's **profile-level and stat-based only** — planets are aggregate numbers (total commits, language %), not explorable. No per-repo history, no time-travel, no file-level detail, no way to click into a single repo's story. This is the gap (see point 7 below). |

**What this changes about the plan:**
1. **"Prettier 3D galaxy" is not a moat.** CodeCohesion is already there, with more analytical depth than our v0.1 scope, and open source. Do not gate the project's value proposition on visual novelty alone — Phase 0's "show 5 developers a clip" gate (§9) should now explicitly include showing them CodeCohesion's demo too, and ask "would you use ours instead, and why," not just "does this look cool."
2. **The Oracle is the actual moat**, not a v0.2 nice-to-have — see §0's updated strategy. Neither competitor has any LLM-backed explanation feature. This is pulled into v0.1 (see §9 Phase 4).
3. **Lenses (§2) must be real alternate scenes**, not recolored spheres, or they're just a worse version of CodeCohesion's color-mode switcher. The Ghost lens in particular should change the *interaction* (deleted files become things you can ask "why were you removed?", not just a dimmed sphere).
4. **Real symbol/dependency-level analysis is still mostly unclaimed.** CodeCohesion's coupling analysis is commit-based (temporal coupling — "files that change together"); their AST-based semantic/bounded-context detection is explicitly a *vision doc*, not shipped. Our tree-sitter symbol extraction + real per-language import resolvers (§4.4) — actual `import`/`use`/`#include` edges, not just co-commit correlation — is a legitimate near-term technical edge if we actually ship it in Phase 1, rather than let it slip.
5. **The distribution loop is still unclaimed.** Neither competitor ships a GitHub Action that renders a time-lapse GIF straight into your README on push. That's a growth mechanism, not a feature, and it's still open (§7, §10, Phase 6) — consider pulling it earlier if Phase 0 shows visuals alone won't carry a launch.
6. **Name check already done** (§11): "codeverse" remains fine to use — no dominant existing project claims the name itself, even though the *idea* isn't unclaimed.
7. **"User Galaxy" — a profile view where the planets are real portals, not stat cards.** Stack Universe already proves "type a username, get a solar system" is a good hook, but its planets (repos) are just sized by aggregate stats — you can't click one and see that repo's actual story. Our engine already builds a full, explorable, time-travel-able universe *per repo* (§2–§5) — nest it: `github.com/<username>` → a Stack-Universe-style overview where each planet **is** one of their repos, and clicking it flies you into that repo's own CODEVERSE (real commit history, files, the Oracle). Nobody combines the profile-level hook with actual per-repo depth. This needs real scoping before it's a commitment (cloning/analyzing N repos per profile is expensive — cap it, e.g. their top 5–10 by stars/recent activity, and reuse the bundle cache aggressively), so it's flagged in §9 "Later" rather than pulled into v0.1, but it's a stronger differentiator than either a Stack-Universe clone or a CodeCohesion/GitGalaxy clone alone, and worth prioritizing above the plain "org multiverse" idea it replaces.

---

## 2. One coherent metaphor

The brainstorm maps things inconsistently: files are planets *and* buildings, and functions are buildings *and* roads. A universe only reads well if **scale is nested**. So there's one hierarchy:

| Code concept | Universe object | Visual encoding |
|---|---|---|
| Repository | Universe | Background nebula tinted by main language |
| Top-level directory | Galaxy | Spiral or cluster; size = total LOC |
| Subdirectory | Star system | Star at center; brightness = recent activity |
| File | Planet | Radius ∝ √LOC, color = language, orbit = parent dir |
| Class / function | Moon / surface structure | Shown only up close (level of detail) |
| Import / dependency | Light-bridge (bundled arc) | Thickness = number of imports; red = cycle |
| Commit | Tick of time | Global clock; planets pulse when touched |
| Contributor | Comet / ship | Flies to the files they touch during playback |
| Churn (recent changes) | Heat / glow | Emissive intensity with bloom |
| Hotspot (churn × complexity) | Solar flare | Pulsing corona |
| Test file(s) for a module | Shield ring | Ring around the planet(s) it covers |
| Deleted file | Fossil / ghost | Faint translucent wireframe (GitGhost lens) |
| Bug-fix commits on a file | Scars / craters | Crater count on the surface |
| Security finding | Anomaly | Crackling distortion; critical = black-hole shader |
| Release tag | Epoch marker | Labelled notches on the timeline |

**Lenses:** the other brainstorm ideas become re-skins of the *same data*:
- 🧬 **DNA lens:** each file is a gene strip; the repo is a genome bar that mutates per commit.
- 🧠 **MRI lens:** a grayscale cross-section with a "diagnosis" side panel.
- 👻 **Ghost lens:** only deleted code, abandoned files and departed contributors are visible.

Lenses cost little once the data model exists, and they're great `good first issue` material.

---

## 3. System architecture

### 3.1 Key decision: offline-first bundle, not server-first
The analyzer writes a **portable `.codeverse` bundle**. The viewer is a **static site** that loads a bundle. A server is optional.

Why this matters for stars:
- `pipx run codeverse .` works on private repos with nothing leaving the laptop, which removes a common objection.
- The gallery of famous repos is free to host (static files on a CDN).
- The GitHub Action can build a bundle in CI and render a GIF with no infra.
- Hosted "paste a URL" mode is just the same analyzer running in a queue.

```
                ┌──────────────────────────────────────────────┐
                │                 ANALYZER (Python)            │
 git repo ────▶ │ ingest → history → structure → symbols/deps  │
 (local/URL)    │  → metrics → layout → keyframes → bundle     │
                └───────────────────────┬──────────────────────┘
                                        │  repo.codeverse (zip: JSON + binary arrays)
             ┌──────────────────────────┼───────────────────────────┐
             ▼                          ▼                           ▼
   ┌───────────────────┐    ┌─────────────────────┐     ┌──────────────────────┐
   │ VIEWER (static)   │    │ GITHUB ACTION       │     │ HOSTED API (FastAPI) │
   │ React + R3F       │    │ analyze + headless  │     │ URL → job queue →    │
   │ loads bundle      │    │ render → GIF/MP4    │     │ bundle in object     │
   └─────────┬─────────┘    └─────────────────────┘     │ storage → viewer     │
             │                                          └──────────┬───────────┘
             ▼                                                     │
   ┌───────────────────┐        (v0.2)                             │
   │ AI ORACLE         │ ◀─────────────────────────────────────────┘
   │ retrieval over    │  LLM provider interface:
   │ commits + code    │  Nemotron (NIM) / Ollama / any OpenAI-compatible API
   └───────────────────┘
```

### 3.2 Stack (trimmed for the MVP)
| Layer | Choice | Notes |
|---|---|---|
| Analyzer | Python 3.12, `uv`, Typer CLI | Ships as `pipx`/`uvx` |
| Git | `git` CLI via subprocess (+ `pygit2` where it helps) | Much faster than GitPython for bulk log parsing |
| Parsing | `tree-sitter` + `tree-sitter-language-pack` | Many languages, one API |
| Graph | NetworkX (analysis) | Cycles, centrality, communities |
| Complexity | tree-sitter queries (per-language), `lizard` as fallback | lizard covers ~20 languages |
| Viewer | Vite + React + TypeScript + React Three Fiber + drei | Static build |
| Rendering | `InstancedMesh`, custom shaders, `@react-three/postprocessing` (bloom) | One draw call per object type |
| Text | `troika-three-text` | Labels only near the camera |
| State | Zustand | Timeline clock, selection, lens |
| Workers | Web Workers + Comlink | Timeline sampling off the main thread |
| UI | Tailwind + Radix | HUD, panels, timeline |
| Hosted API (v0.3) | FastAPI + Redis queue (arq/RQ) + S3/R2 storage | No database needed at first |
| AI (v0.2) | Provider interface; Nemotron via NVIDIA NIM (OpenAI-compatible), Ollama for local | Every answer cites commits |
| Security (v0.4) | Semgrep CE / `osv-scanner` for dependencies | **Check the rule-registry license before running rules in a hosted service** |

Dropped from the original stack for now: **Supabase** (no accounts needed yet) and **Semgrep in the MVP** (slow, and its rule licensing is tricky for SaaS).

---

## 4. The analyzer in detail

### 4.1 Pipeline stages
```
1. ingest       clone / open repo, resolve default branch, size checks
2. history      stream commit log → file-event timeline
3. snapshot     pick keyframe commits; checkout trees at each keyframe
4. structure    directory tree over the UNION of all paths ever seen
5. symbols      tree-sitter: classes, functions, imports (at keyframes)
6. deps         resolve imports → file→file edges (per language resolver)
7. metrics      LOC, complexity, churn, ownership, bug-fix density, hotspots
8. layout       stable 3D positions for every node ever seen
9. narrate      (v0.2) LLM epoch summaries
10. bundle      write repo.codeverse
```
Each stage caches its output in `.codeverse-cache/<stage>/<commit-sha>` so re-runs are incremental.

### 4.2 History: cheap and complete
One streaming pass:
```bash
git log --first-parent --reverse --date=unix \
  --format='%x1e%H%x1f%an%x1f%ae%x1f%at%x1f%s' \
  --numstat -M
```
- `--first-parent` gives a linear history, which is what a timeline needs. Merges become single events.
- `-M` detects renames, so a planet **moves** when a file is renamed instead of dying and respawning. This matters a lot for good-looking animation.
- The output is an **event stream**: `(commit_idx, path, op[A|M|D|R], +lines, -lines, author_idx)`.
- The file's size over time is a running sum of `+lines - -lines` (and gets corrected at keyframes).

**Big repos:** for more than ~100k commits, use `git clone --filter=blob:none` and `--name-status --no-renames`, which reads trees only and skips content. Sizes then come only from keyframes. Linux-scale repos are pre-baked for the gallery rather than analyzed live.

### 4.3 Keyframes: the expensive work, done sparingly
Symbols, dependencies and complexity need file contents, so they can't run for every commit. Keyframes are chosen as:
1. every release tag (after deduplication and version sorting),
2. plus evenly spaced commits so there are at most **K = 60** keyframes,
3. plus HEAD.

Between keyframes, the viewer **interpolates**: dependency edges fade in or out across the interval, and complexity lerps. At playback speed nobody can tell.

Use `git worktree` or `git archive <sha> | tar -x` into a temp directory per keyframe, and process keyframes in parallel with a process pool.

### 4.4 Dependency resolution (per-language resolvers)
Tree-sitter gives the import *strings*. Resolving them to *files* depends on the language. Ship these first:

| Language | Resolver strategy | Phase |
|---|---|---|
| Python | package roots (`src/`, `__init__.py`), relative imports | v0.1 |
| JS/TS | relative paths, `tsconfig` `paths`/`baseUrl`, index files, extensions | v0.1 |
| Go | `go.mod` module path → directory | v0.1 |
| Rust | `mod` declarations + `use crate::` | v0.2 |
| Java/Kotlin | package → directory convention | v0.2 |
| C/C++ | `#include "..."` relative + `-I` heuristics | v0.3 |
| Anything else | no edges; structure + history still work | always |

The resolver interface is a plugin (`codeverse/resolvers/<lang>.py`). This is **the best contributor surface** in the project.

### 4.5 Metrics (and honest definitions)
| Metric | Definition | Caveat shown in UI |
|---|---|---|
| LOC | non-blank lines | none |
| Complexity | sum of cyclomatic complexity per file (tree-sitter/lizard) | approximation |
| Churn | lines changed in a trailing 90-day window at time *t* | none |
| Hotspot score | percentile(churn) × percentile(complexity) | from *Your Code as a Crime Scene* |
| Ownership | share of lines changed per author (decayed); bus factor = number of authors covering 50% | from history, not blame |
| Bug-fix density | commits touching the file whose message matches `fix|bug|patch|regress|hotfix|#\d+` | heuristic, labelled "likely" |
| Test shield | a test file matches by naming (`test_x.py`, `x.test.ts`, `x_test.go`) or by importing the module | presence, **not coverage** |
| Coupling | fan-in / fan-out; cycles via `nx.simple_cycles` on SCCs | static imports only |
| Change coupling | files that often change in the same commit (lift over 5+ co-changes) | the "hidden" architecture |

### 4.6 Layout: the most important visual problem
If planets jump around between frames, the time-lapse looks bad. Requirements: **stable, hierarchical, deterministic, and it must look like space.**

Approach:
1. Build the tree from the **union of every path that ever existed**. Every node gets one permanent slot, and a node that doesn't exist yet is invisible but still has a position.
2. **Galaxies (top-level dirs):** placed on a Fibonacci sphere or disc, with spacing weighted by each galaxy's peak LOC.
3. **Inside each galaxy:** a recursive layout where each subdirectory becomes a star system on a logarithmic spiral arm. The angle comes from a stable hash of the path, and the radius from depth.
4. **Planets:** orbit their star system. The orbital angle comes from the path hash, and the orbit radius from sorted size rank at the *peak* snapshot.
5. **Relaxation pass:** a light force simulation (collision only, no attraction) run once over the union, then frozen.
6. **Dependency-aware option (toggle):** blend toward a force layout in which strongly coupled files move closer, computed at HEAD and frozen.

Renames keep identity through a `node_id` that follows `-M` rename chains, so a renamed planet glides to its new slot.

### 4.7 Bundle format (`repo.codeverse`)
A zip file with:
```
manifest.json          version, repo name, url, default branch, stats, generator version
commits.json           [{sha, t, author_idx, msg(trimmed), tags[]}]
authors.json           [{name, email_hash, color, commits}]
nodes.json             [{id, path_history[], kind(dir|file), parent, lang, layout:{x,y,z,r}}]
events.bin             Int32 array: (commit_idx, node_id, op, add, del, author_idx) × N
keyframes.json         [{commit_idx, sha}]
kf/<i>/edges.bin       Int32 pairs (src_node, dst_node, weight)
kf/<i>/metrics.bin     Float32 per node: loc, complexity, hotspot, …
kf/<i>/symbols.json    per file: [{name, kind, line, complexity}] (top-N per file)
cochange.bin           top change-coupling pairs
narrative.json         (v0.2) epoch summaries with commit citations
```
- Binary columns keep typical repos under **5–20 MB**.
- `email_hash` is SHA-256, so raw emails never go into public bundles.
- The schema is versioned from day one (`manifest.version`), and the viewer rejects unknown major versions with a clear message.

Full schema: see `docs/bundle-schema.md` (to be written in Phase 1).

---

## 5. The viewer in detail

### 5.1 Scene graph
```
<Canvas>
  <Nebula />                       background shader, language-tinted
  <Galaxies />                     instanced star sprites + spiral dust
  <StarSystems />                  instanced emissive spheres
  <Planets />                      ONE InstancedMesh; per-instance attrs: size, color, heat, visible
  <DependencyArcs />               ONE LineSegments2 w/ edge bundling, alpha by timeline
  <Comets />                       contributor particles, trails
  <Shields />, <Flares />, <Ghosts />
  <DetailLOD />                    real meshes + moons + labels for the ~50 nearest planets only
  <EffectComposer><Bloom/><Vignette/></EffectComposer>
</Canvas>
<HUD>  search · lens switcher · legend · selection panel · timeline · playback controls
```

### 5.2 Performance budget
- Target **60 fps with 20k files** on an M1 or mid-range GPU laptop; degrade gracefully to 50k.
- Draw calls stay under 30 because everything is instanced.
- The timeline worker samples `events.bin` into a `Float32Array` of per-node size/heat at time *t*. The main thread only uploads instance attributes, and only for nodes that changed since the last frame.
- Labels: only the 50 nearest nodes, pooled `troika` instances.
- Dependency arcs: hierarchical edge bundling precomputed per keyframe, with at most 5k arcs rendered and the rest aggregated into galaxy-to-galaxy bridges.

### 5.3 Time travel UX
```
 v1.0      v1.5          v2.0                 v3.0         HEAD
──┼─────────┼─────────────┼────────────────────┼────────────┼──▶
  ▲                                         ◆ "The Great Refactor"
  └ you are here   [⏮] [▶ PLAY EVOLUTION] [⏭]  speed 1× 10× 100×   2019-03-14
```
- Scrubbing is instant (the worker sampling is O(events in the window) using a prefix index).
- In **Play Evolution**, time advances along a *commit index* rather than wall-clock time, so quiet years don't drag. A toggle switches to real time.
- New files: planets pop in with a scale-overshoot and a brief flash.
- Deleted files: they shrink into a ghost wireframe that lingers for about 200 commits.
- Renames: planets glide along a curved path.
- Each commit briefly lights up the planets it touched and flies the author's comet to them.
- **Director camera:** during playback the camera automatically drifts toward the center of mass of recent activity. This one feature makes the GIF work.

### 5.4 Interaction
- Orbit/fly controls (WASD + mouse), double-click to fly to a node, Esc to zoom out.
- `/` opens fuzzy search over paths and symbols, then flies to the result.
- Selection panel: path, language, LOC over time (sparkline), top authors, bus factor, hotspot score, bug-fix commits, tests, imports in/out, change-coupled files, and "Ask" (v0.2).
- Shareable URLs: `#t=<commit>&focus=<path>&lens=ghost&cam=...`, so any view can be linked.

### 5.5 Export (built in the MVP because it drives the marketing)
- **Record a clip:** `canvas.captureStream()` → WebM in the browser.
- **Deterministic render:** `?render=1` mode steps frames manually. Playwright drives it headlessly in CI, and ffmpeg turns the frames into GIF/MP4. The GitHub Action uses this.

---

## 6. AI layer: "The Oracle" (MVP in v0.1, full version in v0.2)

This is the actual differentiator (§0, §1.4) — the one thing neither GitGalaxy nor CodeCohesion has. The **first row of §6.2 ships in v0.1** as the "Oracle MVP" (§9 Phase 4); everything else in this section is v0.2 (§9 Phase 5).

### 6.1 Principles
- **Grounded or silent:** every claim cites commits, files or lines. If no evidence is retrieved, the answer says "I don't know."
- **Pluggable provider:** one `LLMProvider` interface. Default adapters: NVIDIA NIM (Nemotron), Ollama (local, for private repos), and a generic OpenAI-compatible endpoint. The user supplies the key; nothing is hardcoded.
- **The LLM is optional:** the product is fully usable without one.

### 6.2 Features
| Feature | How it works |
|---|---|
| **"Why does this exist?"** (click a file or function) | `git log --follow -L:<func>:<file>` finds the introducing commit plus major rewrites → gathers commit messages, diffs (truncated) and linked PR/issue text (GitHub API when a token is present) → LLM writes a short origin story with citations |
| **Ask a planet** | Retrieval over the file's content, symbols, its history, and neighbors in the dependency and change-coupling graphs |
| **Epoch narration** | For each keyframe interval: top changed dirs, new or removed galaxies, big commits → LLM names the era ("The TypeScript Migration, 2021") → shown as timeline chapters during playback |
| **Diagnosis (MRI lens)** | Top hotspots, cycles, low bus factor and untested hotspots → LLM explains in plain language, ranked; no auto-fixing |
| **Guided tour** | LLM builds a 6–10 stop tour for a new contributor (entry points → core → edges); the camera flies it |

### 6.3 Retrieval
- Chunk by tree-sitter symbol boundaries rather than fixed token windows.
- Local embedding model (e.g. `bge-small` via fastembed) → local vector index (LanceDB or a simple numpy index). No database server.
- Hybrid ranking: BM25 + embeddings + graph proximity boost.

---

## 7. Distribution and hosted mode

### 7.1 Three ways to use it
1. **CLI (v0.1):** `uvx codeverse .`, or `codeverse https://github.com/user/repo` → analyzes → opens the local viewer.
2. **Gallery website (v0.1):** static site with about 12 pre-baked famous repos, plus drag-and-drop for your own `.codeverse` file.
3. **GitHub Action (v0.3):** `uses: codeverse/action@v1` → commits `codeverse.gif` or publishes to Pages. **This is the viral loop:** every README that embeds the GIF advertises the project.

### 7.2 Hosted "paste any URL" (v0.3)
- FastAPI endpoint `POST /analyze {url}` → job in Redis → a worker clones into an ephemeral dir with size caps → bundle to R2/S3 → viewer URL.
- Limits: public repos only, at most 1 GB clone, at most 50k files, at most 200k commits, a 10-minute timeout, and per-IP rate limits.
- Cache by `(repo, HEAD sha)`, so popular repos cost almost nothing.
- Security: shallow sandbox (container, no network after clone, read-only FS except the work dir). Repository code is **never executed**, only parsed.

---

## 8. Monorepo layout

```
codeverse/
├── PLAN.md
├── README.md
├── LICENSE                         MIT (maximizes adoption)
├── analyzer/                       Python package `codeverse`
│   ├── pyproject.toml
│   ├── codeverse/
│   │   ├── cli.py                  Typer: analyze, serve, render
│   │   ├── ingest.py
│   │   ├── history.py              git log stream → events
│   │   ├── keyframes.py
│   │   ├── structure.py
│   │   ├── symbols/                tree-sitter queries per language
│   │   ├── resolvers/              python.py, typescript.py, go.py, …
│   │   ├── metrics/                loc, complexity, churn, ownership, hotspots, cochange
│   │   ├── layout/                 galaxy.py, relax.py
│   │   ├── bundle/                 writer.py, schema.py (pydantic)
│   │   ├── oracle/                 (v0.2) providers/, retrieval.py, prompts/
│   │   └── server/                 local static server + (v0.3) hosted API
│   └── tests/
│       └── fixtures/               tiny synthetic git repos built by scripts
├── viewer/                         Vite + React + R3F
│   ├── src/
│   │   ├── scene/                  Nebula, Galaxies, Planets, Arcs, Comets, LOD…
│   │   ├── shaders/
│   │   ├── lenses/                 universe/, dna/, mri/, ghost/
│   │   ├── timeline/               worker.ts, sampler.ts, Timeline.tsx
│   │   ├── hud/
│   │   ├── bundle/                 loader + schema types (generated from pydantic)
│   │   └── store.ts
│   └── public/gallery/             pre-baked bundles
├── action/                         GitHub Action (composite: analyze + playwright render)
├── gallery/                        scripts to (re)bake famous repos
└── docs/
    ├── bundle-schema.md
    ├── metaphor.md
    ├── writing-a-resolver.md
    └── writing-a-lens.md
```

---

## 9. Roadmap and milestones

Estimates assume **one strong full-stack developer working full-time**. Double them for part-time.

### Phase 0: "Is it beautiful?" spike (Week 1) ⚠️ go/no-go gate
Goal: prove the GIF before building any infrastructure.
- [ ] Hacky Python script: `git log --numstat` on 3 repos (small: `httpie`, medium: `fastapi`, large: `react`)
- [ ] Naive union-tree galaxy layout → JSON
- [ ] R3F page: instanced planets, bloom, a timeline slider, play button, director camera
- [ ] Record a 10-second clip of FastAPI growing from the first commit to HEAD
- **Exit criteria:** show the clip to 5 developers **alongside [CodeCohesion's live demo](https://codecohesion.virtualgenius.com/)** (see §1.4). If fewer than 4 say "whoa," or can't articulate a reason they'd want ours over the existing tools, **iterate on visuals/layout or lean harder into the Oracle differentiator before moving on.** Everything else depends on this.

### Phase 1: Analyzer core (Weeks 2–3)
- [ ] Package skeleton, CLI (`analyze`, `serve`), caching
- [ ] History stream with renames, stable `node_id`s, author table with hashed emails
- [ ] Keyframe selection plus parallel snapshot extraction
- [ ] Tree-sitter symbols for Python, JS/TS and Go; import resolvers for those languages
- [ ] Metrics: LOC, complexity, churn, hotspots, ownership, test shields, change coupling
- [ ] Stable galaxy layout with a relaxation pass
- [ ] Bundle writer with pydantic schema, TS types generated from it, `docs/bundle-schema.md`
- [ ] Fixture repos built by scripts, plus golden-file tests for events, layout determinism and resolvers
- **Exit:** `codeverse analyze` on `fastapi` in under 60 s; the bundle loads in the Phase 0 viewer.

### Phase 2: Viewer MVP (Weeks 4–6)
- [ ] Bundle loader (zip in a worker) with version checks
- [ ] Full scene: nebula, galaxies, systems, planets, arcs with bundling, LOD, labels
- [ ] HUD: search, legend, selection panel with sparklines, lens switcher (Universe only)
- [ ] Fly controls, fly-to, shareable URL state
- [ ] Performance pass: 20k-file synthetic bundle at 60 fps on a mid-range laptop
- **Exit:** a stranger can load a bundle and understand the repo layout in 2 minutes without instructions.

### Phase 3: Time travel (Weeks 7–8)
- [ ] Timeline worker with prefix-indexed event sampling
- [ ] Spawn, death-to-ghost and rename-glide animations
- [ ] Comets for contributors, activity pulses
- [ ] Director camera, commit-index vs real-time toggle, tags as epoch markers
- [ ] Keyframe interpolation for edges and metrics
- [ ] Clip recording (WebM) plus deterministic `?render=1` mode and Playwright → ffmpeg script
- **Exit:** a 15-second MP4 of `react` evolving that you'd happily put at the top of the README.

### Phase 4: Launch v0.1 (Weeks 9–10) 🚀
- [ ] Gallery: about 12 bundles (see §10.2), hosted on Vercel or Cloudflare Pages
- [ ] Drag-and-drop your own bundle
- [ ] `uvx codeverse .` one-liner tested on macOS, Linux and Windows
- [ ] README with a hero GIF above the fold, a 3-step quick start and gallery links
- [ ] Ghost lens (cheap, very shareable) as a second visual hook — implemented as a real alternate scene/interaction, not a recolor (see §1.4 point 3)
- [ ] **"Oracle MVP"** (pulled forward from Phase 5 — this is the actual differentiator, see §0/§1.4): click a file → `git log --follow -L` for its introducing commit + major rewrites → one `llm.chat()` call → a short, citation-linked origin story. No retrieval index, no epoch narration yet — just enough to prove the "ask a planet why it exists" hook works and isn't a re-skin of an existing tool
- [ ] 10+ `good first issue`s: resolvers, lenses, themes, gallery repos
- [ ] Launch sequence (§10.3) — and in the launch post, name Gource/CodeCohesion/GitGalaxy explicitly and say what's different, rather than let a comment thread "discover" them first

### Phase 5: The full Oracle, v0.2 (Weeks 11–13) 🚀 second launch
Builds on the Oracle MVP shipped in v0.1 (above).
- [ ] `LLMProvider` interface plus NIM (Nemotron), Ollama and OpenAI-compatible adapters
- [ ] Symbol-chunked retrieval index built at analyze time (opt-in: `--with-oracle`)
- [ ] Epoch narration as timeline chapters
- [ ] MRI lens with Diagnosis panel
- [ ] Guided tour
- [ ] Rust and Java resolvers; DNA lens
- [ ] Eval set: 30 hand-written "why" questions on 3 repos with known answers; track citation accuracy

### Phase 6: Viral loop and hosted mode, v0.3 (Weeks 14–16)
- [ ] GitHub Action: analyze → render GIF → commit or upload, with a README badge snippet
- [ ] Hosted "paste a URL" API with queue, caps, cache and sandboxing
- [ ] Public "Universe of the week" page

### Later (v0.4+, driven by demand)
- **"User Galaxy"** — `github.com/<username>` → a profile-level universe (repos as planets, Stack-Universe-style overview) where each planet is a real portal into that repo's full CODEVERSE (see §1.4 point 7). **Now specified in [social-layer.md](social-layer.md)**, which supersedes this bullet. Highest-priority item in this list — a strong differentiator, and a more scoped, concrete replacement for what used to be a vague "multi-repo/org multiverse" idea here
- Security anomalies (osv-scanner for dependencies; Semgrep after the license review)
- Issue and PR overlay via the GitHub API (issues as anomalies near the files they reference)
- Branches as alternate universes (split-screen diverging timelines)
- First-person "walk" mode and WebXR
- C/C++ resolver for Linux-scale showcases

---

## 10. Growth plan (optimizing for stars)

### 10.1 README rules
1. The **first screen is the GIF**, not a badge wall or a paragraph.
2. A one-line tagline, then `uvx codeverse .`, then the gallery link.
3. A second GIF showing the ghost lens or, better, the **Oracle MVP** answering "why does this exist?" — this is the clip that's actually hard to find anywhere else (§1.4).
4. A short, explicit **"How is this different from Gource / CodeCohesion / GitGalaxy?"** section. Naming them ourselves, honestly, reads as confidence; letting the first HN comment "gotcha" us with it reads as naive. Answer: those are pure visualizers; this one talks back, with citations.
5. "How it works" diagram, then contribute links (resolvers and lenses).

### 10.2 Gallery repos (recognizable, visually different histories)
`react`, `vscode` (subset), `django`, `fastapi`, `rust-lang/rust` (subset), `kubernetes` (subset), `three.js`, `linux` (`kernel/` + `mm/` + `fs/`, pre-baked), `tensorflow`, `bitcoin`, `git/git` (meta), and **CODEVERSE itself** (self-reference plays well).

### 10.3 Launch sequence
| Day | Channel | Asset |
|---|---|---|
| D-7 | X/Bluesky teaser | 5-second clip, "what is this?" |
| D0 AM (US Tue/Wed) | **Show HN** | "Show HN: Watch any Git repo evolve as a 3D universe" + gallery link |
| D0 | r/programming, r/threejs, r/dataisbeautiful (the `linux` or `react` clip) | platform-specific clips |
| D0 | X thread | one clip per famous repo, tagging maintainers ("here's 10 years of your repo") |
| D+2 | dev.to / blog post | "How we render 50k files at 60 fps" (technical credibility) |
| D+7 | Product Hunt | |
| v0.2 | Second Show HN | "Ask any file why it exists" |
| v0.3 | Action launch | "Put your repo's universe in your README" |

**Tagging maintainers** with a clip of their own repo is the single highest-leverage move.

### 10.4 Success metrics
| Milestone | Target |
|---|---|
| Phase 0 gate | 4 of 5 developers say "whoa" |
| v0.1 launch week | 1k stars, front page of HN |
| 30 days | 3k stars, 10 external contributors, 3 community resolvers or lenses |
| v0.3 + 60 days | 100+ repos using the GitHub Action (count via code search) |

---

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Direct competitors already exist and one (CodeCohesion) is mature** (§1.4) — visuals alone won't win a Show HN thread a second time | **Confirmed, not hypothetical** | High | Don't lead with "3D galaxy" alone; the Oracle MVP ships in v0.1 (§9 Phase 4), not v0.2; Phase 0 gate now benchmarks against CodeCohesion directly, not in a vacuum |
| Looks like a pretty screensaver with no insight | High | High | Selection panel, hotspots and "why" answers; always pair beauty with one concrete insight per view |
| Layout jitter ruins the time-lapse | High | High | Union-tree stable layout (§4.6); Phase 0 gate |
| Huge repos are slow or crash | High | Med | Caps, level of detail, aggregation, blobless clones, pre-baked gallery for giants |
| Import resolution is wrong or incomplete | Med | Med | Label edges "static imports"; show resolver coverage %; plugin resolvers |
| LLM hallucinates history | Med | High | Mandatory citations, "don't know" fallback, eval set |
| Name collision: ~~"Codeverse" is already used by other products~~ — **checked 2026-09-17, resolved**: no dominant project owns the name (top GitHub match: 46★), PyPI name is free; only npm is taken by something unrelated (irrelevant until we publish a JS package) | Low (was Med) | Low | Confirmed via GitHub search + PyPI/npm registry checks; re-check npm if we ever publish the viewer as a library; backups if needed later: `repoverse`, `gitcosmos`, `commitverse` |
| Hosted mode abuse or cost | Med | Med | Cache by SHA, caps, rate limits, public repos only, launch it late (v0.3) |
| Privacy of contributor emails | Low | Med | Hash emails; opt-in display names only from Git metadata |
| Semgrep rule licensing in a hosted service | Med | Low | Defer; use osv-scanner first; review the license before shipping |
| Scope creep (NPCs, VR, branches) | High | High | §1.3 non-goals; features only move up after they prove demand |

---

## 12. Immediate next steps (this week)
1. ~~Check name availability~~ — done (§11): `codeverse` confirmed clear of PyPI/dominant-project conflicts.
2. Build the Phase 0 spike: `analyzer/codeverse/history.py` + `spike/viewer/` — **done**, currently rendering FastAPI's history (5,448 files, 7,679 commits) in a live 3D scene.
3. Build the **Oracle MVP** (§0, §6.2 row 1) next — `llm.py` and the NIM connection already work; this is now higher priority than more viewer polish, since it's the part competitors don't have.
4. Record the FastAPI clip, run the 5-developer gate **against CodeCohesion's live demo** (§1.4, §9 Phase 0 exit criteria).
5. If it passes, write `docs/bundle-schema.md` and start Phase 1.
