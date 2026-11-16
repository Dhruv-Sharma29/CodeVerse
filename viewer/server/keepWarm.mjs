// Render's free plan sleeps a service after 15 minutes without inbound traffic. GitHub's scheduled
// workflow (keep-relay-warm.yml) is best-effort and often skips runs, so once awake the relay also
// pings its own public URL during the waking-hours window. Outside the window it is allowed to sleep
// to stay inside the free 750 instance hours.

/** "2-18" -> is this UTC hour inside the window (inclusive)? */
export function inWindow(hours, date = new Date()) {
  const [from, to] = String(hours).split('-').map(Number);
  const h = date.getUTCHours();
  return from <= to ? h >= from && h <= to : h >= from || h <= to;
}

/** Ping `${url}/health` every `every` ms while inside `hours`. Returns a stop function. */
export function keepWarm(url, { hours = '2-18', every = 10 * 60_000, fetchImpl = fetch } = {}) {
  if (!url) return () => {};
  const timer = setInterval(() => {
    if (inWindow(hours)) fetchImpl(`${url.replace(/\/$/, '')}/health`).catch(() => {});
  }, every);
  timer.unref?.();
  return () => clearInterval(timer);
}
