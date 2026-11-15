# Remaining

Everything not done, and whether that is a constraint or a choice.

| Item | Why it is not done | Kind |
|---|---|---|
| Shared alien waves | Needs a game loop on the server: the relay becomes a game server, with hosting cost and latency to manage | Choice |
| Persistent scores and leaderboards | Scores are self-reported; ranking them without server-side verification rewards whoever edits their client | Choice |
| Accounts | Not needed while nothing is stored | Choice |
| Free-text chat | Moderation; six preset emotes cover coordination | Choice |
| Several relay instances | Rooms are in one process's memory; scaling needs a shared pub/sub (for example Redis) | Constraint (free hosting) |
| Relay awake 24/7 | Would use ~730–744 of the workspace's 750 free Render hours a month and starve other free services | Constraint (free hosting) |
| Load testing with many players | No test harness for it yet | Not started |
| Low-end phone performance pass | Not measured; the mothership and particles are the likely cost | Not started |
| Private repositories | Needs OAuth and server-side tokens | Choice |
| Tests for trending-page markup changes | The scraper fails visibly, but the failure is not rehearsed | Not started |
