import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { commitUrl, errorMessage, fetchCommits, repoUrl, type GitCommit } from "../github/api";
import { GameScene, ShipPreview, type Control, type Peer } from "./GameScene";
import { connectNet, type NetMessage, type NetStatus } from "./net";
import { ALIENS, HULLS, SPAWN, createSim, isHull, type HullId, emptyInput, explode, leavePortal, remoteGrab, step, type Planet, type Sim, type SimEvent, type Universe } from "./sim";
import { loadUniverse, ownerOf } from "./universe";
import { KeySheet, LESSONS, Tutorial, type LessonId } from "./Tutorial";
import "./game.css";

/** The creator's GitHub profile, shown by the comet. */
const CREATOR = { name: "Dhruv Sharma", login: "Dhruv-Sharma29", url: "https://github.com/Dhruv-Sharma29" };
const COLORS = ["#74e2ff", "#ffb547", "#7dffb4", "#ff6fae", "#b18cff", "#ff8a5c"];
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem("orbit:" + k); return v == null ? d : JSON.parse(v) as T; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem("orbit:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const firstLine = (m: string) => m.split("\n")[0];
const clip = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const roomLabel = (room: string) => room === "trending" ? "Trending hub" : room.slice(2);

/* ---- sound: tiny synth, starts after the first interaction ---- */
let ac: AudioContext | null = null;
function tone(freq: number, dur = .08, type: OscillatorType = "sine", vol = .05, slide = 1) {
  if (!ac || store.get("muted", false)) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  shot: () => tone(1400, .05, "square", .012, .5), kill: () => tone(160, .35, "sawtooth", .05, .3),
  hurt: () => tone(110, .2, "square", .04, .6), commit: () => { tone(880, .08, "triangle"); setTimeout(() => tone(1320, .1, "triangle"), 70); },
  grab: () => tone(220, .4, "sine", .05, 2.5), fling: () => tone(600, .3, "sawtooth", .04, .25),
  nova: () => { tone(60, 1.2, "sawtooth", .09, .5); tone(900, .8, "sine", .05, .2); }, warp: () => tone(120, 1.4, "sawtooth", .05, 8),
  wave: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, .18, "square", .03), i * 140)),
};

interface Toast { id: number; text: string; kind: "" | "good" | "bad" }
interface Hud { score: number; hp: number; charge: number; wave: number; aliens: number; kills: number; dead: boolean; near: Planet | null; grabbing: boolean; comet: boolean; gate: { a: number; d: number }; boss: { hp: number; max: number } | null }

export default function OrbitGame({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<"lobby" | "play">("lobby");
  const [name, setName] = useState(() => store.get("name", `Pilot-${Math.floor(Math.random() * 9000 + 1000)}`));
  const [color, setColor] = useState(() => store.get("color", COLORS[0]));
  const [hull, setHull] = useState<HullId>(() => { const h = store.get("hull", "dart"); return isHull(h) ? h : "dart"; });
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [busy, setBusy] = useState(false);
  const [lobbyError, setLobbyError] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpTarget, setJumpTarget] = useState("");
  const [warping, setWarping] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [rooms, setRooms] = useState<{ room: string; count: number }[]>([]);
  const [status, setStatus] = useState<NetStatus>("connecting");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [log, setLog] = useState<{ planet: Planet; commit: GitCommit }[]>([]);
  const [hud, setHud] = useState<Hud | null>(null);
  const [muted, setMuted] = useState(() => store.get("muted", false));
  const [flash, setFlash] = useState<"" | "hurt" | "nova">("");
  const [touch] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches);
  const ctl = useRef<Control | null>(null);
  const [control, setControl] = useState<Control | null>(null);
  const adoptControl = (c: Control) => {
    ctl.current = c; setControl(c);
    if (import.meta.env.DEV) Object.assign(window, { __orbit: c }); // dev-only handle for debugging
  };
  const net = useRef<ReturnType<typeof connectNet> | null>(null);
  const radar = useRef<HTMLCanvasElement>(null);
  const toastId = useRef(0);
  const jumpAbort = useRef<AbortController | null>(null);
  const warpTween = useRef(0);
  const [lessons, setLessons] = useState<LessonId[]>(() => store.get<LessonId[]>("tutorial", []).filter(id => LESSONS.some(l => l.id === id)));
  const lessonsRef = useRef(lessons);
  const [sheet, setSheet] = useState(false);

  const toast = useCallback((text: string, kind: Toast["kind"] = "") => {
    const id = ++toastId.current;
    setToasts(t => [{ id, text, kind }, ...t].slice(0, 4));
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);
  const saveLessons = useCallback((next: LessonId[]) => { lessonsRef.current = next; store.set("tutorial", next); setLessons(next); }, []);
  const learn = useCallback((id: LessonId) => {
    if (lessonsRef.current.includes(id)) return;
    saveLessons([...lessonsRef.current, id]);
    toast(`✓ ${LESSONS.find(l => l.id === id)!.title}`, "good");
  }, [saveLessons, toast]);
  const pulse = useCallback((kind: "hurt" | "nova") => { setFlash(kind); setTimeout(() => setFlash(""), kind === "nova" ? 500 : 180); }, []);

  /* ---- simulation events → UI, sound and network ---- */
  const handleEvents = useCallback((sim: Sim, events: SimEvent[]) => {
    for (const e of events) {
      if (e.type === "shot" || e.type === "fling" || e.type === "commit" || e.type === "nova" || e.type === "portal") learn(e.type);
      if (e.type === "shot") { sfx.shot(); net.current?.send({ t: "shot", x: e.x, z: e.z, a: e.a }); }
      else if (e.type === "kill") { sfx.kill(); if (e.kind === "mothership") toast(`Mothership destroyed! +${e.points}`, "good"); }
      else if (e.type === "hurt") { sfx.hurt(); pulse("hurt"); }
      else if (e.type === "dead") { toast("Ship destroyed. Respawning at the portal.", "bad"); net.current?.send({ t: "boom", x: sim.ship.x, z: sim.ship.z }); }
      else if (e.type === "wave") { sfx.wave(); toast(e.boss ? `Wave ${e.n}: a MOTHERSHIP is coming` : `Wave ${e.n}: alien ships inbound`, "bad"); }
      else if (e.type === "grab") sfx.grab();
      else if (e.type === "fling") sfx.fling();
      else if (e.type === "gate") toast("The hyperjump gate moved. Follow the violet arrow.");
      else if (e.type === "comet") { sfx.commit(); setTimeout(sfx.commit, 140); toast(`☄ You caught ${CREATOR.login}'s comet! +250 and nova charge`, "good"); }
      else if (e.type === "boom") net.current?.send({ t: "boom", x: e.x, z: e.z });
      else if (e.type === "nova") { sfx.nova(); pulse("nova"); net.current?.send({ t: "nova", x: e.x, z: e.z }); }
      else if (e.type === "portal") { setJumpTarget(""); setJumpOpen(true); net.current?.send({ t: "rooms" }); }
      else if (e.type === "commit") {
        sfx.commit();
        toast(`${e.commit.sha.slice(0, 7)} · ${clip(firstLine(e.commit.commit.message), 70)}`, "good");
        setLog(l => [{ planet: e.planet, commit: e.commit }, ...l].slice(0, 30));
      } else if (e.type === "load") {
        const p = e.planet;
        fetchCommits(p.repo).then(commits => {
          p.commits = commits.slice(0, 14);
          p.sats = p.commits.map((c, i) => ({ c, a: i / p.commits!.length * Math.PI * 2, r: p.R + 4 + (i % 3) * 1.6, done: false }));
        }).catch(err => { p.commits = []; toast(errorMessage(err), "bad"); });
      }
    }
  }, [learn, pulse, toast]);

  const makeControl = useCallback((u: Universe, carry?: Sim): Control => {
    const sim = createSim(u);
    sim.ship.hull = hull; sim.ship.hp = HULLS[hull].hp;
    if (carry) Object.assign(sim, { score: carry.score, kills: carry.kills, charge: carry.charge, commits: carry.commits, deaths: carry.deaths });
    const events: SimEvent[] = [];
    const c: Control = {
      sim, input: emptyInput(), zoom: ctl.current?.zoom ?? 1, warp: 0, color, reduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      pointer: { x: 0, y: 0, mouse: false },
      onStep: dt => {
        if (c.attract) { c.sim.waveTimer = 5; c.input.fire = c.input.grab = false; } // lobby: no aliens, no shooting
        events.length = 0;
        step(c.sim, c.input, dt, events);
        if (events.length) handleEvents(c.sim, events);
        c.input.nova = false;
      },
    };
    if (touch) c.input.autoAim = true;
    return c;
  }, [color, hull, handleEvents, touch]);

  /* ---- network ---- */
  useEffect(() => {
    const n = connectNet((m: NetMessage) => {
      if (m.t === "rooms") { setRooms(m.rooms as { room: string; count: number }[]); return; }
      const sim = ctl.current?.sim; if (!sim) return;
      const id = Number(m.id);
      if (m.t === "welcome") {
        sim.remotes.clear();
        const list = (m.peers as (Peer & { state?: { x: number; z: number; a: number } | null })[]);
        for (const p of list) sim.remotes.set(p.id, { ...p, x: p.state?.x ?? SPAWN.x, z: p.state?.z ?? SPAWN.z, a: p.state?.a ?? 0, vx: 0, vz: 0, hp: 100, tx: p.state?.x ?? SPAWN.x, tz: p.state?.z ?? SPAWN.z, seen: sim.t });
        setPeers(list.map(({ id, name, color, hull }) => ({ id, name, color, hull: isHull(hull) ? hull : "dart" })));
      } else if (m.t === "joined") {
        const p = { id, name: String(m.name), color: String(m.color), hull: isHull(m.hull) ? m.hull : "dart" as HullId };
        sim.remotes.set(id, { ...p, x: SPAWN.x, z: SPAWN.z, a: 0, vx: 0, vz: 0, hp: 100, tx: SPAWN.x, tz: SPAWN.z, seen: sim.t });
        setPeers(ps => [...ps.filter(x => x.id !== id), p]);
        toast(`${p.name} jumped into this universe`);
      } else if (m.t === "left") {
        const r = sim.remotes.get(id); sim.remotes.delete(id);
        setPeers(ps => ps.filter(x => x.id !== id));
        if (r) toast(`${r.name} left`);
      } else if (m.t === "state") {
        const r = sim.remotes.get(id); if (!r) return;
        Object.assign(r, { tx: m.x, tz: m.z, vx: m.vx, vz: m.vz, a: m.a, hp: m.hp, seen: sim.t });
      } else if (m.t === "shot") {
        const a = Number(m.a);
        sim.bullets.push({ x: Number(m.x), z: Number(m.z), vx: Math.cos(a) * 115, vz: Math.sin(a) * 115, life: .85, from: "ally" });
      } else if (m.t === "grab") remoteGrab(sim, m as unknown as { planet: number; x: number; z: number; vx: number; vz: number });
      else if (m.t === "nova") {
        sim.novas.push({ x: Number(m.x), z: Number(m.z), t: 0, mine: false, hit: new Set() });
        toast(`${sim.remotes.get(id)?.name ?? "Someone"} triggered a supernova`, "good");
      } else if (m.t === "boom") explode(sim, Number(m.x), Number(m.z), "#ffb547", 50, 12);
      else if (m.t === "error") toast(String(m.message), "bad");
    }, setStatus);
    net.current = n;
    const tick = setInterval(() => {
      const c = ctl.current; if (!c || c.attract) return;
      const s = c.sim.ship;
      n.send({ t: "state", x: s.x, z: s.z, a: s.a, vx: s.vx, vz: s.vz, hp: s.dead > 0 ? 0 : s.hp });
      for (const p of c.sim.planets) if (p.mode === "held" || p.mode === "flung") n.send({ t: "grab", planet: p.i, x: p.x, z: p.z, vx: p.vx, vz: p.vz, held: p.mode === "held" });
    }, 100);
    return () => { clearInterval(tick); n.close(); net.current = null; };
  }, [toast]);
  // Lobby "live now" feed.
  useEffect(() => {
    if (phase !== "lobby" || status !== "online") return;
    const ask = () => net.current?.send({ t: "rooms" });
    ask(); const id = setInterval(ask, 4000);
    return () => clearInterval(id);
  }, [phase, status]);
  // Lobby backdrop: the trending universe, loaded once and kept for launch.
  useEffect(() => {
    const abort = new AbortController();
    loadUniverse("trending", abort.signal).then(u => {
      const c = makeControl(u); c.attract = true; adoptControl(c); setUniverse(u);
    }).catch(e => { if (!abort.signal.aborted) setLobbyError(errorMessage(e)); });
    return () => abort.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (universe && phase === "play") net.current?.send({ t: "join", room: universe.room, name, color, hull }); }, [universe, phase, name, color, hull, status]);

  /* ---- HUD + radar at 10 Hz ---- */
  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(() => {
      const c = ctl.current; if (!c) return;
      const s = c.sim;
      if (Math.hypot(s.ship.vx, s.ship.vz) > 14) learn("move");
      const boss = s.aliens.find(a => a.kind === "mothership" && a.hp > 0);
      setHud({ boss: boss ? { hp: boss.hp, max: boss.max } : null, score: s.score, hp: s.ship.hp / HULLS[s.ship.hull].hp * 100, charge: s.charge, wave: s.wave, aliens: s.aliens.length, kills: s.kills, dead: s.ship.dead > 0, near: s.near, grabbing: !!s.grab, comet: s.nearComet, gate: { a: Math.atan2(s.portal.z - s.ship.z, s.portal.x - s.ship.x), d: Math.hypot(s.portal.x - s.ship.x, s.portal.z - s.ship.z) } });
      drawRadar(radar.current, s);
    }, 100);
    return () => clearInterval(id);
  }, [phase, learn]);

  /* ---- keyboard + mouse (one held-key set feeds the sim input) ---- */
  const held = useRef(new Set<string>());
  const syncInput = useCallback(() => {
    const c = ctl.current, keys = held.current; if (!c || touch) return;
    const k = (a: string, b: string) => keys.has(a) || keys.has(b);
    c.input.move = { x: (k("d", "arrowright") ? 1 : 0) - (k("a", "arrowleft") ? 1 : 0), z: (k("s", "arrowdown") ? 1 : 0) - (k("w", "arrowup") ? 1 : 0) };
    c.input.relative = true;
    c.input.boost = keys.has("shift");
    c.input.grab = k("e", "mouse2");
    c.input.fire = k(" ", "mouse0");
  }, [touch]);
  useEffect(() => {
    if (phase !== "play") return;
    const keys = held.current;
    const down = (e: KeyboardEvent) => {
      if (!ac) try { ac = new AudioContext(); } catch { /* no audio */ }
      if (e.target instanceof HTMLInputElement || jumpOpen) return;
      const k = e.key.toLowerCase();
      if (k === "q" && ctl.current) ctl.current.input.nova = true;
      if (k === "h" && !e.repeat) setSheet(v => !v);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      keys.add(k); syncInput();
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); syncInput(); };
    const blur = () => { keys.clear(); syncInput(); };
    if (jumpOpen) blur();
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, [phase, jumpOpen, syncInput]);
  const mouseButton = (button: number, on: boolean) => { if (on) held.current.add("mouse" + button); else held.current.delete("mouse" + button); syncInput(); };

  /* ---- universes ---- */
  async function launch() {
    if (!ac) try { ac = new AudioContext(); } catch { /* no audio */ }
    const callsign = name.replace(/[^\w .-]/g, "").trim().slice(0, 18) || "Pilot";
    setName(callsign); store.set("name", callsign); store.set("color", color); store.set("hull", hull);
    const c = ctl.current;
    if (c) { c.attract = false; Object.assign(c.sim.ship, { inv: 2.5, hull, hp: HULLS[hull].hp }); setPhase("play"); return; }
    setBusy(true); setLobbyError("");
    try {
      const u = await loadUniverse("trending");
      adoptControl(makeControl(u)); setUniverse(u); setPhase("play");
    } catch (e) { setLobbyError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function jump(target: string) {
    const t = target.trim(); if (!t) return;
    const room = t.toLowerCase() === "trending" ? "trending" : t;
    setJumpOpen(false); setWarping(true); sfx.warp();
    jumpAbort.current?.abort(); const abort = jumpAbort.current = new AbortController();
    const c = ctl.current!;
    // One warp tween at a time: starting a new one stops the old. (A failed load used to start the
    // wind-down while the wind-up still ran; the wind-up finished last and left the view stretched.)
    const ramp = (to: number, ms: number, target: Control = c) => new Promise<void>(res => {
      const id = ++warpTween.current, from = target.warp, start = performance.now();
      const f = (now: number) => {
        if (id !== warpTween.current) return res();
        const k = Math.min(1, (now - start) / ms); target.warp = from + (to - from) * (to > from ? k * k : k * (2 - k));
        if (k < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    try {
      const [u] = await Promise.all([loadUniverse(room, abort.signal), ramp(1, 1100)]);
      const next = makeControl(u, c.sim); next.warp = 1; next.zoom = c.zoom;
      adoptControl(next); setPeers([]); setLog([]); setUniverse(u);
      const recent = [u.room, ...store.get<string[]>("recent", []).filter(r => r !== u.room)].slice(0, 6);
      store.set("recent", recent);
      void ramp(0, 900, next);
      toast(`Arrived in ${u.title}`, "good");
    } catch (e) {
      if (abort.signal.aborted) return;
      leavePortal(c.sim); toast(errorMessage(e), "bad");
      await ramp(0, 400);
    } finally { setWarping(false); }
  }
  function closeJump() { setJumpOpen(false); if (ctl.current) leavePortal(ctl.current.sim); }

  const pilots = rooms.reduce((n, r) => n + r.count, 0);
  const lobby = <main className="orbit-lobby">
    <div className="orbit-lobby-inner">
      <p className="orbit-tagline">A multiplayer flight through GitHub</p>
      <h1 className="orbit-title" aria-label="Orbit">{"ORBIT".split("").map((ch, i) => <span key={i} aria-hidden="true" style={{ "--i": i } as React.CSSProperties}>{ch}</span>)}</h1>
      <form className="orbit-launch" onSubmit={e => { e.preventDefault(); void launch(); }}>
        <label className="orbit-hello">
          <span>Hello,</span>
          <input value={name} maxLength={18} size={Math.max(5, name.length)} onChange={e => setName(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Callsign" />
          <span className="orbit-pencil" aria-hidden="true">✎</span>
        </label>
        <div className="orbit-hangar">
          <ShipPreview color={color} hull={hull} />
          <div className="orbit-hulls" role="radiogroup" aria-label="Ship">
            {(Object.keys(HULLS) as HullId[]).map(id => { const h = HULLS[id]; return <button type="button" key={id} role="radio" aria-checked={id === hull} className="orbit-hull" onClick={() => setHull(id)}>
              <strong>{h.name}</strong><span>{h.blurb}</span>
              <dl>
                <div><dt>Speed</dt><dd><i style={{ width: `${h.max / 58 * 100}%` }} /></dd></div>
                <div><dt>Armour</dt><dd><i style={{ width: `${h.hp / 160 * 100}%` }} /></dd></div>
                <div><dt>Firepower</dt><dd><i style={{ width: `${Math.min(1, h.guns === 3 ? 3 * h.dmg / h.fire / 20 : h.dmg / h.fire / 12) * 100}%` }} /></dd></div>
              </dl>
            </button>; })}
          </div>
        </div>
        <div className="orbit-glass orbit-launch-bar">
          <div className="orbit-swatches" role="radiogroup" aria-label="Ship colour">
            {COLORS.map(c => <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={`Colour ${c}`} className="orbit-swatch" style={{ "--sw": c } as React.CSSProperties} onClick={() => setColor(c)} />)}
          </div>
          <button className="orbit-go" type="submit" disabled={busy}>{busy ? "Loading…" : "Launch"}</button>
        </div>
        {lobbyError && <p className="orbit-error" role="alert">{lobbyError}</p>}
      </form>
      <section className="orbit-live" aria-live="polite">
        {status === "online" ? pilots > 0 ? <>
          <span className="orbit-live-dot">{pilots} pilot{pilots === 1 ? "" : "s"} flying now</span>
          <span className="orbit-live-rooms">{rooms.slice(0, 4).map(r => <span key={r.room}>{roomLabel(r.room)} <b>{r.count}</b></span>)}</span>
        </> : <span className="orbit-live-dot idle">Nobody is flying yet. Launch, then send a friend this page.</span>
          : status === "waking" ? <span className="orbit-live-dot waking">Waking the multiplayer server. It sleeps when nobody is playing and takes up to a minute. You can launch now; other pilots appear once it is up.</span>
          : status === "connecting" ? <span>Looking for other pilots…</span> : <span>Multiplayer server offline. You will fly solo.</span>}
      </section>
      <p className="orbit-foot">{lessons.length < LESSONS.length ? "New here? A short first flight shows you the controls." : "Press H in flight for the controls."}</p>
      <p className="orbit-foot"><a href="/explorer/">Prefer to browse quietly? Open the explorer →</a></p>
    </div>
  </main>;

  const c = control;
  const near = hud?.near;
  const nearOwner = near ? ownerOf(near.repo) : "";
  const showOwnerJump = near && nearOwner.toLowerCase() !== (universe?.owner ?? "").toLowerCase();
  const occupied = rooms.filter(r => r.room !== universe?.room);
  const recent = store.get<string[]>("recent", []).filter(r => r !== universe?.room && !occupied.some(o => o.room === r));

  return <div className={`orbit-game ${phase} ${flash ? "flash-" + flash : ""}`}>
    {c && <div className="orbit-canvas" onContextMenu={e => e.preventDefault()}
      onPointerMove={e => { if (e.pointerType === "mouse") { c.pointer.x = e.nativeEvent.offsetX; c.pointer.y = e.nativeEvent.offsetY; c.pointer.mouse = true; } }}
      onPointerDown={e => { if (e.pointerType === "mouse") { if (!ac) try { ac = new AudioContext(); } catch { /* no audio */ } mouseButton(e.button, true); } }}
      onPointerUp={e => { if (e.pointerType === "mouse") mouseButton(e.button, false); }}
      onPointerLeave={() => { held.current.delete("mouse0"); held.current.delete("mouse2"); syncInput(); }}
      onWheel={e => { c.zoom = Math.max(.55, Math.min(1.9, c.zoom * (1 + Math.sign(e.deltaY) * .08))); }}>
      <Canvas key={universe?.room} camera={{ fov: 50, near: .5, far: 5000, position: [0, 70, 70] }} gl={{ antialias: true }} dpr={[1, 2]}>
        <GameScene ctl={c} peers={peers} color={color} hull={hull} />
      </Canvas>
    </div>}
    {phase === "lobby" ? lobby : <>

    <header className="orbit-top">
      <div className="orbit-where">
        <span className="orbit-eyebrow">{universe?.room === "trending" ? "TRENDING HUB" : "UNIVERSE"}</span>
        <strong>{universe?.title}</strong>
        <span className="orbit-sub">{universe?.subtitle}</span>
        <span className={`orbit-net ${status}`}>{status === "online" ? `${peers.length + 1} pilot${peers.length ? "s" : ""} here` : status === "waking" ? "Waking multiplayer server (up to a minute)…" : status === "connecting" ? "Connecting…" : "Solo: multiplayer server offline"}</span>
      </div>
      <div className="orbit-actions">
        <button className="orbit-ghost" onClick={() => { const m = !muted; setMuted(m); store.set("muted", m); }} aria-pressed={!muted}>{muted ? "Sound off" : "Sound on"}</button>
        <button className="orbit-ghost" onClick={() => setSheet(v => !v)} aria-pressed={sheet}>Controls</button>
        <button className="orbit-ghost" onClick={onExit}>Leave</button>
      </div>
    </header>

    {hud && <section className="orbit-hud" aria-label="Ship status">
      <div className="orbit-score">{hud.score.toLocaleString()}</div>
      <div className="orbit-bar" aria-label={`Hull ${Math.round(hud.hp)} percent`}><span>HULL</span><i style={{ width: `${hud.hp}%`, background: hud.hp < 30 ? "var(--o-bad)" : "var(--o-cyan)" }} /></div>
      <div className={`orbit-bar ${hud.charge >= 100 ? "ready" : ""}`} aria-label={`Supernova charge ${Math.round(hud.charge)} percent`}><span>{hud.charge >= 100 ? "NOVA READY · Q" : "NOVA"}</span><i style={{ width: `${hud.charge}%`, background: "var(--o-amber)" }} /></div>
      <div className="orbit-meta">Wave {hud.wave} · {hud.aliens} alien{hud.aliens === 1 ? "" : "s"} · {hud.kills} down</div>
      {hud.grabbing && <div className="orbit-meta beam">Gravity beam locked. Release to fling.</div>}
    </section>}

    <canvas ref={radar} className="orbit-radar" width={160} height={160} aria-hidden="true" />

    {hud?.boss && <div className="orbit-boss" role="status" aria-label={`Mothership ${Math.round(hud.boss.hp / hud.boss.max * 100)} percent`}>
      <span>MOTHERSHIP</span><div><i style={{ width: `${hud.boss.hp / hud.boss.max * 100}%` }} /></div>
    </div>}
    <div className={`orbit-toasts ${hud?.boss ? "below-boss" : ""}`} aria-live="polite">{toasts.map(t => <div key={t.id} className={`orbit-toast ${t.kind}`}>{t.text}</div>)}</div>

    {log.length > 0 && <aside className="orbit-log" aria-label="Collected commits">
      <span className="orbit-eyebrow">COMMITS COLLECTED</span>
      {log.slice(0, 5).map(({ planet, commit }) => <a key={planet.repo.full_name + commit.sha} href={commitUrl(planet.repo, commit.sha)} target="_blank" rel="noreferrer">
        <b>{planet.repo.name}</b> <code>{commit.sha.slice(0, 7)}</code> {clip(firstLine(commit.commit.message), 54)}
      </a>)}
    </aside>}

    {hud?.comet && !jumpOpen && <section className="orbit-card comet" aria-label={`${CREATOR.name}'s comet`}>
      <div className="orbit-card-head"><strong>☄ {CREATOR.name}'s comet</strong><span>@{CREATOR.login}</span></div>
      <p>Made by {CREATOR.name}. This comet crosses every universe on a new random path every two minutes. Fly through it for a bonus.</p>
      <div className="orbit-card-actions">
        <a className="orbit-primary small" href={CREATOR.url} target="_blank" rel="noreferrer">Visit @{CREATOR.login} on GitHub</a>
      </div>
    </section>}
    {near && !hud?.comet && !jumpOpen && <section className="orbit-card" aria-label="Nearby planet">
      <div className="orbit-card-head"><strong>{near.repo.name}</strong><span>{near.repo.language ?? "Mixed"}</span></div>
      {near.repo.description && <p>{clip(near.repo.description, 150)}</p>}
      <div className="orbit-facts"><span>★ {compact(near.repo.stargazers_count)}</span><span>forks {compact(near.repo.forks_count)}</span>
        <span>{near.commits === null ? "scanning commits…" : `${near.sats.filter(s => !s.done).length}/${near.commits.length} commits left`}</span></div>
      <div className="orbit-card-actions">
        <a className="orbit-ghost" href={repoUrl(near.repo)} target="_blank" rel="noreferrer">Open on GitHub</a>
        {showOwnerJump && <button className="orbit-primary small" disabled={warping} onClick={() => void jump(nearOwner)}>Hyperjump to {nearOwner}</button>}
      </div>
    </section>}

    {hud && hud.gate.d > 55 && !jumpOpen && <div className="orbit-gate-arrow" aria-hidden="true"
      style={{ left: `${50 + Math.cos(hud.gate.a) * 42}%`, top: `${50 + Math.sin(hud.gate.a) * 38}%` }}>
      <i style={{ transform: `rotate(${hud.gate.a}rad)` }}>➤</i><span>HYPERJUMP · {Math.round(hud.gate.d)}</span>
    </div>}
    {hud?.dead && <div className="orbit-dead">Ship destroyed. Rebuilding at the portal…</div>}

    {jumpOpen && <div className="orbit-modal" role="dialog" aria-modal="true" aria-labelledby="jump-title">
      <form className="orbit-modal-card" onSubmit={e => { e.preventDefault(); void jump(jumpTarget); }}>
        <span className="orbit-eyebrow">HYPERJUMP PORTAL</span>
        <h2 id="jump-title">Whose universe next?</h2>
        <label htmlFor="jump-input">GitHub username or organization</label>
        <div className="orbit-jump-row">
          <span aria-hidden="true">@</span>
          <input id="jump-input" autoFocus value={jumpTarget} onChange={e => setJumpTarget(e.target.value)} placeholder="torvalds" maxLength={100} autoComplete="off" />
          <button className="orbit-primary small" type="submit" disabled={!jumpTarget.trim()}>Jump</button>
        </div>
        {occupied.length > 0 && <><span className="orbit-label-text">Where other pilots are</span>
          <div className="orbit-chips">{occupied.map(r => <button type="button" key={r.room} onClick={() => void jump(r.room === "trending" ? "trending" : r.room.slice(2))}>{roomLabel(r.room)} · {r.count}</button>)}</div></>}
        <span className="orbit-label-text">Quick jumps</span>
        <div className="orbit-chips">
          {universe?.room !== "trending" && <button type="button" onClick={() => void jump("trending")}>Trending hub</button>}
          {recent.map(r => <button type="button" key={r} onClick={() => void jump(r === "trending" ? "trending" : r.slice(2))}>{roomLabel(r)}</button>)}
          {["torvalds", "vercel", "facebook", "sindresorhus"].filter(h => `u:${h}` !== universe?.room && !recent.includes(`u:${h}`) && !occupied.some(o => o.room === `u:${h}`)).map(h => <button type="button" key={h} onClick={() => void jump(h)}>{h}</button>)}
        </div>
        <button type="button" className="orbit-ghost" onClick={closeJump}>Stay here</button>
      </form>
    </div>}

    {warping && <div className="orbit-warp" aria-hidden="true" />}

    {touch && c && <TouchControls ctl={c} />}

    {sheet ? <KeySheet touch={touch} onClose={() => setSheet(false)} onReplay={() => { saveLessons([]); setSheet(false); }} />
      : <Tutorial done={lessons} touch={touch} onSkip={() => saveLessons(LESSONS.map(l => l.id))} />}
    </>}
  </div>;
}

function TouchControls({ ctl }: { ctl: Control }) {
  const knob = useRef<HTMLSpanElement>(null), origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const move = (x: number, y: number) => {
    const o = origin.current; if (!o) return;
    let dx = x - o.x, dy = y - o.y; const l = Math.hypot(dx, dy), max = 46;
    if (l > max) { dx *= max / l; dy *= max / l; }
    ctl.input.move = { x: dx / max, z: dy / max };
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const end = () => { origin.current = null; ctl.input.move = { x: 0, z: 0 }; if (knob.current) knob.current.style.transform = ""; };
  const hold = (key: "fire" | "grab") => ({
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); ctl.input[key] = true; },
    onPointerUp: () => { ctl.input[key] = false; }, onPointerCancel: () => { ctl.input[key] = false; },
  });
  return <>
    <div className="orbit-stick" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId }; move(e.clientX, e.clientY); }}
      onPointerMove={e => move(e.clientX, e.clientY)} onPointerUp={end} onPointerCancel={end} aria-label="Movement stick">
      <span ref={knob} />
    </div>
    <div className="orbit-buttons">
      <button className="nova" onPointerDown={() => { ctl.input.nova = true; }}>NOVA</button>
      <button className="grab" {...hold("grab")}>GRAB</button>
      <button className="fire" {...hold("fire")}>FIRE</button>
    </div>
  </>;
}

function drawRadar(cv: HTMLCanvasElement | null, sim: Sim) {
  const g = cv?.getContext("2d"); if (!cv || !g) return;
  const W = cv.width, R = W / 2, range = 170, k = R / range, s = sim.ship;
  g.clearRect(0, 0, W, W);
  g.fillStyle = "rgba(6,10,28,.72)"; g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(116,226,255,.25)"; g.lineWidth = 1;
  for (const r of [.33, .66, 1]) { g.beginPath(); g.arc(R, R, (R - 2) * r, 0, Math.PI * 2); g.stroke(); }
  const dot = (x: number, z: number, color: string, size: number) => {
    const dx = (x - s.x) * k, dz = (z - s.z) * k; if (Math.hypot(dx, dz) > R - 3) return;
    g.fillStyle = color; g.beginPath(); g.arc(R + dx, R + dz, size, 0, Math.PI * 2); g.fill();
  };
  dot(0, 0, "#ffcf6e", 5);
  dot(sim.comet.x, sim.comet.z, "#e8fbff", 3.5);
  for (const p of sim.planets) dot(p.x, p.z, p.glow, Math.max(2, p.R * k * 1.4));
  // Gate: drawn on the rim when out of range so it always shows the way.
  { const gate = sim.portal, dx = (gate.x - s.x) * k, dz = (gate.z - s.z) * k, l = Math.hypot(dx, dz), m = Math.min(1, (R - 6) / (l || 1));
    g.fillStyle = "#b18cff"; g.beginPath(); g.arc(R + dx * m, R + dz * m, l * m < R - 7 ? 5 : 4, 0, Math.PI * 2); g.fill(); }
  for (const a of sim.aliens) dot(a.x, a.z, ALIENS[a.kind].color, a.kind === "mothership" ? 6 : a.kind === "swarmer" ? 1.5 : 2.2);
  for (const r of sim.remotes.values()) dot(r.x, r.z, r.color, 3);
  g.save(); g.translate(R, R); g.rotate(s.a); g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.fill(); g.restore();
}
