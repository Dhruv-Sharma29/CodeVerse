// Player settings: graphics quality, colour palette and key bindings. Saved in localStorage by the UI.

/** Rebindable keyboard actions and their default keys (KeyboardEvent.key, lower case). */
export const DEFAULT_KEYS = {
  up: "w", down: "s", left: "a", right: "d", fire: " ", grab: "e", boost: "shift",
  nova: "q", ping: "p", dock: "enter", board: "tab", controls: "h", fullscreen: "f", music: "m",
};
export type Action = keyof typeof DEFAULT_KEYS;
export type KeyMap = Record<Action, string>;
export const ACTION_LABELS: Record<Action, string> = {
  up: "Thrust", down: "Reverse", left: "Strafe left", right: "Strafe right", fire: "Fire", grab: "Gravity beam", boost: "Boost",
  nova: "Supernova", ping: "Ping", dock: "Dock / undock", board: "Pilots board", controls: "Controls", fullscreen: "Full screen", music: "Music",
};
/** Always-on keys that can't be rebound: arrows (second set for flying), emotes (1-6), perk picks (7-9), Escape. */
export const RESERVED = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "1", "2", "3", "4", "5", "6", "7", "8", "9", "escape"]);

export function keyLabel(k: string): string {
  const names: Record<string, string> = { " ": "Space", shift: "Shift", enter: "Enter", tab: "Tab", control: "Ctrl", alt: "Alt", meta: "Cmd", backspace: "Backspace" };
  return names[k] ?? (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
}

/** Bind `key` to `action`. A key already used by another action swaps over, so no two actions share a key. */
export function rebind(keys: KeyMap, action: Action, key: string): KeyMap {
  const k = key.toLowerCase();
  if (RESERVED.has(k)) return keys;
  const next = { ...keys }, taken = (Object.keys(next) as Action[]).find(a => a !== action && next[a] === k);
  if (taken) next[taken] = keys[action];
  next[action] = k;
  return next;
}

/** Saved bindings, with defaults for anything missing or invalid. */
export function loadKeys(saved: unknown): KeyMap {
  const out = { ...DEFAULT_KEYS };
  if (saved && typeof saved === "object") for (const a of Object.keys(out) as Action[]) {
    const v = (saved as Record<string, unknown>)[a];
    if (typeof v === "string" && v && !RESERVED.has(v)) out[a] = v;
  }
  return new Set(Object.values(out)).size === Object.keys(out).length ? out : { ...DEFAULT_KEYS };
}

/** The action a key triggers, if any. */
export const actionFor = (keys: KeyMap, key: string) => (Object.keys(keys) as Action[]).find(a => keys[a] === key);

export type QualitySetting = "auto" | "high" | "low";
/** Auto picks low on phones and tablets with few cores or little memory. */
export function resolveQuality(q: QualitySetting, device: { touch: boolean; cores?: number; memory?: number }): "high" | "low" {
  if (q !== "auto") return q;
  return device.touch && ((device.cores ?? 8) <= 4 || (device.memory ?? 8) <= 4) ? "low" : "high";
}
/** What each quality level changes in the renderer. */
export const QUALITY = {
  high: { dpr: [1, 2] as [number, number], antialias: true, stars: 9000, belt: 380 },
  low: { dpr: [1, 1] as [number, number], antialias: false, stars: 2500, belt: 140 },
};

export type PaletteId = "standard" | "colorblind";
/**
 * Colours that carry meaning. The colour-blind palette avoids red against green (Okabe-Ito colours:
 * sky blue, orange, yellow, reddish purple). Alien kinds also differ by shape, so colour is a second cue.
 */
export const PALETTES = {
  standard: { good: "#7dffb4", bad: "#ff6f7f", saucer: "#2fff8a", hunter: "#ff3355", swarmer: "#ffc23d", mothership: "#a13dff", bug: "#3dffd0", ally: "#b6ff8a", alienShot: "#ff4fd8" },
  colorblind: { good: "#56b4e9", bad: "#e69f00", saucer: "#56b4e9", hunter: "#d55e00", swarmer: "#f0e442", mothership: "#cc79a7", bug: "#009e73", ally: "#f0e442", alienShot: "#e69f00" },
};
export type Palette = typeof PALETTES.standard;
