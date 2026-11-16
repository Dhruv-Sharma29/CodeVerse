// Thin WebSocket client for the Orbit relay (server/multiplayer.mjs). Reconnects and re-joins.
export type NetMessage = Record<string, unknown> & { t: string };
/** "waking": a hosted relay that sleeps when idle (Render free plan) is starting up. */
export type NetStatus = "connecting" | "waking" | "online" | "offline";

/** How long a sleeping hosted relay may take to start before we call it offline. */
export const WAKE_MS = 90_000;
/** No connection after this long on first load means the hosted relay is probably asleep. */
export const WAKE_HINT_MS = 3_500;

const relayUrl = () => import.meta.env?.VITE_RELAY_URL as string | undefined;

/** Leaderboards live on the relay: same origin locally, the hosted relay in production. */
export function boardUrl(room: string, relay = relayUrl()) {
  const base = relay ? relay.replace(/^ws/, "http").replace(/\/api\/play$/, "") : "";
  return `${base}/board?room=${encodeURIComponent(room)}`;
}
export interface Leader { name: string; score: number }

export function connectNet(onMessage: (m: NetMessage) => void, onStatus: (s: NetStatus) => void,
  { url = relayUrl() || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/play`, hosted = !!relayUrl() } = {}) {
  let ws: WebSocket | null = null, closed = false, retry = 0, join: NetMessage | null = null, everOnline = false, wakingShown = false;
  let hint: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  // Only a separately hosted relay can be asleep; a local server that refuses is simply offline.
  const mayBeWaking = () => hosted && !everOnline && Date.now() - started < WAKE_MS;
  // Once "waking" is shown, keep showing it until online, so the label doesn't flicker between retries.
  const report = (s: NetStatus) => { if (s === "waking") wakingShown = true; onStatus(s); };

  // Start waking a sleeping relay right away with a plain HTTP request; the response is not needed.
  if (hosted) fetch(url.replace(/^ws/, "http").replace(/\/api\/play$/, "/health"), { mode: "no-cors" }).catch(() => {});

  function open() {
    report(mayBeWaking() && (wakingShown || Date.now() - started > WAKE_HINT_MS) ? "waking" : "connecting");
    clearTimeout(hint);
    hint = setTimeout(() => { if (ws?.readyState !== WebSocket.OPEN && mayBeWaking()) report("waking"); }, WAKE_HINT_MS);
    ws = new WebSocket(url);
    ws.onopen = () => { everOnline = true; retry = 0; clearTimeout(hint); onStatus("online"); if (join) ws?.send(JSON.stringify(join)); };
    ws.onmessage = e => { try { onMessage(JSON.parse(String(e.data))); } catch { /* ignore malformed */ } };
    ws.onclose = () => {
      if (closed) return;
      if (mayBeWaking()) { report("waking"); setTimeout(open, 3_000); return; } // keep knocking while it boots
      onStatus("offline");
      setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++));
    };
  }
  open();
  return {
    send(m: NetMessage) { if (m.t === "join") join = m; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    close() { closed = true; clearTimeout(hint); ws?.close(); },
  };
}
