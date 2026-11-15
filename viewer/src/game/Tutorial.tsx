/* First-flight tutorial: one goal at a time, ticked off by real sim events, in any order. */
export type LessonId = "move" | "shot" | "fling" | "commit" | "nova" | "portal";

interface Lesson { id: LessonId; title: string; text: string; keys: string[]; touchText: string; touchKeys: string[] }
export const LESSONS: Lesson[] = [
  { id: "move", title: "Fly", text: "W thrusts where your nose points. A and D strafe, Shift boosts.", keys: ["W", "A", "S", "D", "Shift"],
    touchText: "Drag the stick to fly.", touchKeys: ["Stick"] },
  { id: "shot", title: "Aim and fire", text: "Point with the mouse. Click or press Space to fire.", keys: ["Mouse", "Click", "Space"],
    touchText: "Your guns aim at the closest alien. Hold FIRE.", touchKeys: ["FIRE"] },
  { id: "fling", title: "Gravity beam", text: "Hold E or right-click near a planet, then let go to fling it.", keys: ["E", "Right-click"],
    touchText: "Hold GRAB near a planet, then let go to fling it.", touchKeys: ["GRAB"] },
  { id: "commit", title: "Collect a commit", text: "Fly through a gold satellite. Each one is a real recent commit.", keys: [],
    touchText: "Fly through a gold satellite. Each one is a real recent commit.", touchKeys: [] },
  { id: "nova", title: "Supernova", text: "Commits and kills fill the nova bar. Press Q when it glows.", keys: ["Q"],
    touchText: "Commits and kills fill the nova bar. Tap NOVA when it glows.", touchKeys: ["NOVA"] },
  { id: "portal", title: "Hyperjump", text: "Follow the violet arrow to the gate on the outer rim. It moves every few minutes.", keys: [],
    touchText: "Follow the violet arrow to the gate on the outer rim. It moves every few minutes.", touchKeys: [] },
];

const Keys = ({ keys }: { keys: string[] }) => keys.length ? <div className="orbit-keycaps">{keys.map(k => <kbd key={k}>{k}</kbd>)}</div> : null;

export function Tutorial({ done, touch, onSkip }: { done: LessonId[]; touch: boolean; onSkip: () => void }) {
  const lesson = LESSONS.find(l => !done.includes(l.id));
  if (!lesson) return null;
  return <aside className="orbit-tut" aria-label="First flight" aria-live="polite">
    <div className="orbit-tut-head">
      <span className="orbit-eyebrow">FIRST FLIGHT · {done.length + 1}/{LESSONS.length}</span>
      <button type="button" className="orbit-link" onClick={onSkip}>Skip</button>
    </div>
    <strong key={lesson.id}>{lesson.title}</strong>
    <p>{touch ? lesson.touchText : lesson.text}</p>
    <Keys keys={touch ? lesson.touchKeys : lesson.keys} />
    <div className="orbit-dots" aria-hidden="true">{LESSONS.map(l => <i key={l.id} className={done.includes(l.id) ? "on" : l === lesson ? "now" : ""} />)}</div>
  </aside>;
}

export function KeySheet({ touch, onReplay, onClose }: { touch: boolean; onReplay: () => void; onClose: () => void }) {
  return <aside className="orbit-tut sheet" aria-label="Controls">
    <div className="orbit-tut-head"><span className="orbit-eyebrow">CONTROLS · H</span><button type="button" className="orbit-link" onClick={onClose}>Close</button></div>
    {LESSONS.map(l => <div className="orbit-sheet-row" key={l.id}><span>{l.title}</span><Keys keys={touch ? l.touchKeys : l.keys} /></div>)}
    <button type="button" className="orbit-link" onClick={onReplay}>Replay first flight</button>
  </aside>;
}
