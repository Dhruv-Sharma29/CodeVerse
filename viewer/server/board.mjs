// Leaderboards: the best run ever (all-time) and the best score earned in one universe today
// (the daily board, read for today's challenge universe). Scores come from the relay's own checks
// in multiplayer.mjs, never from a "submit score" call.
// Storage: Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL and _TOKEN are set;
// otherwise in memory (local dev and tests), which is lost whenever the relay restarts or sleeps.

export const TOP = 10;
const KEEP = 100;            // all-time entries kept in the store
const DAY_TTL = 3 * 86_400;  // daily boards expire after three days
export const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const ALL = 'board:all', dayKey = (day, room) => `board:${day}:${room}`;

const rows = flat => {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ name: String(flat[i]), score: Number(flat[i + 1]) });
  return out;
};

export function createBoard({ url, token, fetchImpl = fetch } = {}) {
  if (url && token) {
    const call = async cmds => {
      const r = await fetchImpl(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
      });
      if (!r.ok) throw new Error(`Upstash ${r.status}`);
      return (await r.json()).map(x => x.result);
    };
    return {
      kind: 'upstash',
      async add(name, room, run, stint, day = dayOf()) {
        const cmds = [];
        // GT: a pilot's entry only ever goes up.
        if (run > 0) cmds.push(['ZADD', ALL, 'GT', String(run), name], ['ZREMRANGEBYRANK', ALL, '0', String(-KEEP - 1)]);
        if (stint > 0) cmds.push(['ZADD', dayKey(day, room), 'GT', String(stint), name], ['EXPIRE', dayKey(day, room), String(DAY_TTL)]);
        if (cmds.length) await call(cmds);
      },
      async top(room, day = dayOf()) {
        const [all, daily] = await call([
          ['ZRANGE', ALL, '0', String(TOP - 1), 'REV', 'WITHSCORES'],
          ['ZRANGE', dayKey(day, room), '0', String(TOP - 1), 'REV', 'WITHSCORES'],
        ]);
        return { all: rows(all ?? []), daily: rows(daily ?? []) };
      },
    };
  }
  const sets = new Map(); // key -> Map<name, score>
  const put = (key, name, score) => {
    const m = sets.get(key) ?? sets.set(key, new Map()).get(key);
    if (score > (m.get(name) ?? 0)) m.set(name, score);
  };
  const best = key => [...(sets.get(key) ?? [])].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([name, score]) => ({ name, score }));
  return {
    kind: 'memory',
    async add(name, room, run, stint, day = dayOf()) {
      for (const k of sets.keys()) if (k !== ALL && !k.startsWith(`board:${day}:`)) sets.delete(k); // drop old days
      if (run > 0) put(ALL, name, run);
      if (stint > 0) put(dayKey(day, room), name, stint);
    },
    async top(room, day = dayOf()) { return { all: best(ALL), daily: best(dayKey(day, room)) }; },
  };
}
