# CODEVERSE docs

| Document | What it covers | Read it when |
|---|---|---|
| [PLAN.md](PLAN.md) | The build plan: current direction, product definition, competitive landscape, architecture, analyzer and viewer internals, roadmap, risks | Start here. It's the source of truth for what's being built and why |
| [social-layer.md](social-layer.md) | **Proposal.** Turning the viewer into a developer identity/discovery product: share links, universe evolution, trending, social features — priced by infrastructure cost, with the GitHub rate-limit and consent constraints | Considering anything about sharing, profiles, leaderboards, or social features |
| [oracle.md](oracle.md) | Commit messages, code diffs, and optional cited AI explanations; provider setup and limits | Using or developing the Oracle |
| [bundle-schema.md](bundle-schema.md) | The JSON contract between `codeverse analyze` and the viewer, including legacy-export handling | Changing the analyzer's output or the viewer's loader |

## Status at a glance

**Built:** GitHub explorer (monthly trending → handle → repository planets → commit satellites), local-bundle history viewer with time travel, the `codeverse analyze` exporter, a commit inspector with full messages and code diffs, and the optional commit Oracle (cited AI explanations).

**Not built:** file-origin stories, repository-wide retrieval and guided tours, durable server-side storage, accounts, and the proposed additions in [social-layer.md](social-layer.md). The Oracle keeps only bounded in-memory caches and request budgets.

**The two scales, deliberately distinct** — keep them labeled clearly in the UI:

| | GitHub explorer | Local history viewer |
|---|---|---|
| Unit | A repository is a planet | A *file* is a planet |
| Source | GitHub public REST API | `repo.json` from `codeverse analyze` |
| Depth | Up to 60 recent commits | Full first-parent history |
| Needs | Nothing | A local clone |

## Conventions

- Decorative vs. analytical encodings stay separate — rings are decoration; size, color, and heat carry data, and every visible metric must be explainable.
- Honest metric names: "test presence", not "coverage"; "likely bug-fix commits", not "bugs".
- No provider secrets in browser code. Tokens and keys live server-side.
