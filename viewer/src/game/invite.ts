// Invite links: /?u=<github-login> opens straight into that universe; / is the trending hub.

const LOGIN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

/** The universe an invite link points at: a GitHub login, or "trending" when absent or invalid. */
export function inviteTarget(search: string): string {
  const u = new URLSearchParams(search).get("u")?.trim().replace(/^@/, "") ?? "";
  return u && u.toLowerCase() !== "trending" && LOGIN.test(u) ? u : "trending";
}

/** Path (with query) that opens the given room: "/" for the hub, "/?u=login" for a universe. */
export function invitePath(room: string): string {
  return room.startsWith("u:") ? `/?u=${encodeURIComponent(room.slice(2))}` : "/";
}
