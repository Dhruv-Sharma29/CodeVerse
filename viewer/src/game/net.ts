// Thin WebSocket client for the Orbit relay (server/multiplayer.mjs). Reconnects and re-joins.
export type NetMessage = Record<string, unknown> & { t: string };
export type NetStatus = "connecting" | "online" | "offline";

export function connectNet(onMessage: (m: NetMessage) => void, onStatus: (s: NetStatus) => void) {
  let ws: WebSocket | null = null, closed = false, retry = 0, join: NetMessage | null = null;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/play`;
  function open() {
    onStatus("connecting");
    ws = new WebSocket(url);
    ws.onopen = () => { retry = 0; onStatus("online"); if (join) ws?.send(JSON.stringify(join)); };
    ws.onmessage = e => { try { onMessage(JSON.parse(String(e.data))); } catch { /* ignore malformed */ } };
    ws.onclose = () => {
      onStatus("offline");
      if (!closed) setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++));
    };
  }
  open();
  return {
    send(m: NetMessage) { if (m.t === "join") join = m; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    close() { closed = true; ws?.close(); },
  };
}
