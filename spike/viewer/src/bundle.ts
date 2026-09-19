import type { Bundle } from "./types";

export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

/** Validate untrusted local JSON before allocating scene buffers or indexing arrays. */
export function parseBundle(value: unknown): Bundle {
  const fail = (message: string): never => { throw new Error(`Invalid bundle: ${message}`); };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected a JSON object.");
  const b = value as Record<string, unknown>;
  if (b.schemaVersion !== undefined && b.schemaVersion !== 1) fail("unsupported schema version.");
  if (typeof b.repo !== "string" || !b.repo.trim()) fail("repository name is missing.");
  for (const key of ["nodes", "authors", "commits", "events"]) {
    if (!Array.isArray(b[key])) fail(`${key} must be an array.`);
  }
  const { nodes, authors, commits } = b as unknown as Bundle;
  let { events } = b as unknown as Bundle;
  // The notebook omitted empty commits but kept their original event indices.
  // Recover only that legacy shape: one event-bearing group per exported commit.
  if (b.schemaVersion === undefined && events.every(e => Array.isArray(e) && e.length === 5 && Number.isSafeInteger(e[0]) && e[0] >= 0)) {
    const indices = [...new Set(events.map(e => e[0]))];
    if (indices.length === commits.length && indices.some(ci => ci >= commits.length) &&
        indices.every((ci, i) => i === 0 || ci > indices[i - 1])) {
      const compact = new Map(indices.map((ci, i) => [ci, i]));
      events = events.map(e => [compact.get(e[0])!, e[1], e[2], e[3], e[4]]);
    }
  }
  if (nodes.length > 50_000) fail("this viewer supports up to 50,000 paths.");
  if (!nodes.every(p => typeof p === "string" && p.length > 0)) fail("paths must be nonempty strings.");
  if (new Set(nodes).size !== nodes.length) fail("paths must be unique.");
  if (!authors.every(a => typeof a === "string")) fail("author names must be strings.");
  if (!commits.length) fail("no commits to explore.");
  const index = (n: unknown, length: number) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) < length;
  commits.forEach((c, i) => {
    if (!Array.isArray(c) || c.length !== 3 || typeof c[0] !== "string" || !c[0].length ||
        !Number.isSafeInteger(c[1]) || Math.abs(c[1]) > 8.64e12 || !index(c[2], authors.length)) {
      fail(`commit ${i + 1} is malformed.`);
    }
  });
  let previous = -1;
  events.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 5 || !index(e[0], commits.length) ||
        !index(e[1], nodes.length) || !index(e[2], 4) || !Number.isSafeInteger(e[3]) || e[3] < 0 ||
        (e[2] === 3 ? !index(e[4], nodes.length) || e[4] === e[1] : e[4] !== -1)) {
      fail(`event ${i + 1} is malformed.`);
    }
    if (e[0] < previous) fail("events must be ordered by commit.");
    previous = e[0];
  });
  return { ...(value as Bundle), events };
}
