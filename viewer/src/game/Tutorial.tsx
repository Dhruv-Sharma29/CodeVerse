import { useEffect, useState } from "react";
import { ACTION_LABELS, DEFAULT_KEYS, keyLabel, rebind, type Action, type KeyMap, type PaletteId, type QualitySetting } from "./settings";

/* First-flight tutorial: one goal at a time, ticked off by real sim events, in any order. */
export type LessonId = "move" | "shot" | "fling" | "commit" | "nova" | "portal";

/** Keycaps name an action ("@fire", shown as the player's binding) or a fixed input ("Mouse"). */
interface Lesson { id: LessonId; title: string; text: string; keys: string[]; touchText: string; touchKeys: string[] }
export const LESSONS: Lesson[] = [
  { id: "move", title: "Fly", text: "Thrust flies where your nose points. Strafe left and right; hold boost to go faster.", keys: ["@up", "@left", "@down", "@right", "@boost"],
    touchText: "Drag the stick, or tap TILT and tilt the phone, to fly. Hold BOOST to go faster.", touchKeys: ["Stick", "TILT", "BOOST"] },
  { id: "shot", title: "Aim and fire", text: "Point with the mouse. Click or press the fire key.", keys: ["Mouse", "Click", "@fire"],
    touchText: "Your guns aim at the closest alien. Hold FIRE.", touchKeys: ["FIRE"] },
  { id: "fling", title: "Gravity beam", text: "Hold the beam key or right-click near a planet, then let go to fling it.", keys: ["@grab", "Right-click"],
    touchText: "Hold GRAB near a planet, then let go to fling it.", touchKeys: ["GRAB"] },
  { id: "commit", title: "Collect a commit", text: "Fly through a gold satellite. Each one is a real recent commit.", keys: [],
    touchText: "Fly through a gold satellite. Each one is a real recent commit.", touchKeys: [] },
  { id: "nova", title: "Supernova", text: "Commits and kills fill the nova bar. Press the nova key when it glows.", keys: ["@nova"],
    touchText: "Commits and kills fill the nova bar. Tap NOVA when it glows.", touchKeys: ["NOVA"] },
  { id: "portal", title: "Hyperjump", text: "Follow the violet arrow to the gate on the outer rim. It moves every few minutes.", keys: [],
    touchText: "Follow the violet arrow to the gate on the outer rim. It moves every few minutes.", touchKeys: [] },
];

const cap = (k: string, map: KeyMap) => k.startsWith("@") ? keyLabel(map[k.slice(1) as Action]) : k;
const Keys = ({ keys, map = DEFAULT_KEYS }: { keys: string[]; map?: KeyMap }) => keys.length
  ? <div className="orbit-keycaps">{keys.map(k => <kbd key={k}>{cap(k, map)}</kbd>)}</div> : null;

export function Tutorial({ done, touch, keys, onSkip }: { done: LessonId[]; touch: boolean; keys?: KeyMap; onSkip: () => void }) {
  const lesson = LESSONS.find(l => !done.includes(l.id));
  if (!lesson) return null;
  return <aside className="orbit-tut" aria-label="First flight" aria-live="polite">
    <div className="orbit-tut-head">
      <span className="orbit-eyebrow">FIRST FLIGHT · {done.length + 1}/{LESSONS.length}</span>
      <button type="button" className="orbit-link" onClick={onSkip}>Skip</button>
    </div>
    <strong key={lesson.id}>{lesson.title}</strong>
    <p>{touch ? lesson.touchText : lesson.text}</p>
    <Keys keys={touch ? lesson.touchKeys : lesson.keys} map={keys} />
    <div className="orbit-dots" aria-hidden="true">{LESSONS.map(l => <i key={l.id} className={done.includes(l.id) ? "on" : l === lesson ? "now" : ""} />)}</div>
  </aside>;
}

export function KeySheet({ touch, keys = DEFAULT_KEYS, music, onMusic, onReplay, onClose }: { touch: boolean; keys?: KeyMap; music: boolean; onMusic: () => void; onReplay: () => void; onClose: () => void }) {
  return <aside className="orbit-tut sheet" aria-label="Controls">
    <div className="orbit-tut-head"><span className="orbit-eyebrow">CONTROLS{touch ? "" : ` · ${keyLabel(keys.controls)}`}</span><button type="button" className="orbit-link" onClick={onClose}>Close</button></div>
    {LESSONS.map(l => <div className="orbit-sheet-row" key={l.id}><span>{l.title}</span><Keys keys={touch ? l.touchKeys : l.keys} map={keys} /></div>)}
    <div className="orbit-sheet-row"><span>Pilots board</span><Keys keys={["@board"]} map={keys} /></div>
    <div className="orbit-sheet-row"><span>Emotes</span><Keys keys={["1", "–", "6"]} /></div>
    <div className="orbit-sheet-row"><span>Ping a spot</span><Keys keys={touch ? ["PING"] : ["@ping"]} map={keys} /></div>
    {!touch && <div className="orbit-sheet-row"><span>Full screen</span><Keys keys={["@fullscreen"]} map={keys} /></div>}
    {!touch && <div className="orbit-sheet-row"><span>Dock at a planet</span><Keys keys={["@dock"]} map={keys} /></div>}
    <div className="orbit-sheet-row"><span>Music</span><button type="button" className="orbit-link" onClick={onMusic}>{music ? "On · turn off" : "Off · turn on"}{touch ? "" : ` (${keyLabel(keys.music)})`}</button></div>
    {!touch && <div className="orbit-sheet-row"><span>Gamepad</span><span className="orbit-pad-hint">Sticks fly and aim · RT fire · LT grab · A boost · Y nova · X ping · B dock</span></div>}
    <button type="button" className="orbit-link" onClick={onReplay}>Replay first flight</button>
  </aside>;
}

/** Settings: graphics quality, colour palette and (on keyboards) key bindings. */
export function SettingsPanel({ touch, quality, resolved, onQuality, palette, onPalette, keys, onKeys, onClose }: {
  touch: boolean; quality: QualitySetting; resolved: "high" | "low"; onQuality: (q: QualitySetting) => void;
  palette: PaletteId; onPalette: (p: PaletteId) => void; keys: KeyMap; onKeys: (k: KeyMap) => void; onClose: () => void;
}) {
  const [listening, setListening] = useState<Action | null>(null);
  useEffect(() => {
    if (!listening) return;
    // Capture phase on window runs before the game's own key handler, which then never sees the key.
    const grab = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key !== "Escape") onKeys(rebind(keys, listening, e.key));
      setListening(null);
    };
    addEventListener("keydown", grab, true);
    return () => removeEventListener("keydown", grab, true);
  }, [listening, keys, onKeys]);
  const choice = <T extends string>(value: T, set: (v: T) => void, options: [T, string][]) => <div className="orbit-choice" role="radiogroup">
    {options.map(([v, label]) => <button type="button" key={v} role="radio" aria-checked={v === value} onClick={() => set(v)}>{label}</button>)}
  </div>;
  return <aside className="orbit-tut sheet orbit-settings" aria-label="Settings">
    <div className="orbit-tut-head"><span className="orbit-eyebrow">SETTINGS</span><button type="button" className="orbit-link" onClick={onClose}>Close</button></div>
    <div className="orbit-sheet-row"><span>Graphics</span>{choice(quality, onQuality, [["auto", `Auto (${resolved})`], ["high", "High"], ["low", "Low"]])}</div>
    <div className="orbit-sheet-row"><span>Colours</span>{choice(palette, onPalette, [["standard", "Standard"], ["colorblind", "Colour-blind"]])}</div>
    {!touch && <>
      <div className="orbit-sheet-row"><span>Keys</span><button type="button" className="orbit-link" onClick={() => onKeys({ ...DEFAULT_KEYS })}>Reset to defaults</button></div>
      <div className="orbit-keymap">
        {(Object.keys(ACTION_LABELS) as Action[]).map(a => <div className="orbit-sheet-row" key={a}>
          <span>{ACTION_LABELS[a]}</span>
          <button type="button" className="orbit-key" aria-pressed={listening === a} onClick={() => setListening(listening === a ? null : a)}>
            {listening === a ? "Press a key" : keyLabel(keys[a])}
          </button>
        </div>)}
      </div>
      <p className="orbit-pad-hint">Arrow keys, 1 to 6 (emotes) and Esc always work and can't be rebound. A key already in use swaps places.</p>
    </>}
  </aside>;
}
