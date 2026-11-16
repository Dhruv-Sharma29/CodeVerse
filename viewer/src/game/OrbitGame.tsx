import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { commitUrl, errorMessage, fetchCommits, fetchContributors, fetchReadme, repoUrl, type Contributor, type GitCommit } from "../github/api";
import { readmeExcerpt } from "./readme";
import { readPad, type PadState } from "./gamepad";
import { startMusic } from "./music";
import { BOUNTY, DAILY_REWARD, STORM, bountyHolder, dailyChallenge } from "./events";
import { GameScene, ShipPreview, type Control, type Peer } from "./GameScene";
import { boardUrl, connectNet, type Leader, type NetMessage, type NetStatus } from "./net";
import { EMOTES, HULLS, PING, PVP, SPAWN, addPing, createSim, isHull, type HullId, emptyInput, explode, leavePortal, remoteGrab, step, type Planet, type Sim, type SimEvent, type Universe } from "./sim";
import { loadUniverse, ownerOf } from "./universe";
import { invitePath, inviteTarget } from "./invite";
import { screenTilt, tiltToMove, type Tilt } from "./tilt";
import { KeySheet, LESSONS, SettingsPanel, Tutorial, type LessonId } from "./Tutorial";
import { PALETTES, QUALITY, actionFor, loadKeys, resolveQuality, type KeyMap, type Palette, type PaletteId, type QualitySetting } from "./settings";
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
/** Time in the hyperjump tunnel, from choosing a destination to landing. */
const HYPERJUMP_MS = 2000;
const roomLabel = (room: string) => room === "trending" ? "Trending hub" : room.slice(2);

/* ---- sound: tiny synth, starts after the first interaction ---- */
let ac: AudioContext | null = null, master: AudioNode | null = null;
/** Create the audio context (needs a user gesture) with a master compressor so effects stay full and never clip. */
function ensureAudio() {
  if (ac) return;
  try {
    ac = new AudioContext();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
    comp.connect(ac.destination); master = comp;
  } catch { /* no audio */ }
}
function tone(freq: number, dur = .08, type: OscillatorType = "sine", vol = .05, slide = 1) {
  if (!ac || store.get("muted", false)) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(master ?? ac.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  ping: () => { tone(1320, .09, "sine", .045); setTimeout(() => tone(1760, .12, "sine", .035), 90); },
  shot: () => tone(1400, .05, "square", .012, .5), kill: () => tone(160, .35, "sawtooth", .05, .3),
  hurt: () => tone(110, .2, "square", .04, .6), commit: () => { tone(880, .08, "triangle"); setTimeout(() => tone(1320, .1, "triangle"), 70); },
  grab: () => tone(220, .4, "sine", .05, 2.5), fling: () => tone(600, .3, "sawtooth", .04, .25),
  nova: () => { tone(60, 1.2, "sawtooth", .09, .5); tone(900, .8, "sine", .05, .2); }, warp: () => tone(120, 1.4, "sawtooth", .05, 8),
  wave: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, .18, "square", .03), i * 140)),
};

interface Toast { id: number; text: string; kind: "" | "good" | "bad" }
interface Hud { score: number; hp: number; charge: number; wave: number; aliens: number; kills: number; dead: boolean; near: Planet | null; grabbing: boolean; comet: boolean; gate: { a: number; d: number }; boss: { hp: number; max: number } | null; board: BoardRow[]; holding: null | "holding" | "contested"; bounty: number | null; storm: string; meteors: number; daily: { done: number; n: number; text: string; complete: boolean } | null }
interface BoardRow { id: number; name: string; color: string; hull: HullId; score: number; kills: number; me: boolean }

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
  const [music, setMusic] = useState(() => store.get("music", true));
  const [flash, setFlash] = useState<"" | "hurt" | "nova">("");
  const [touch] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches);
  const [qualitySetting, setQualitySetting] = useState<QualitySetting>(() => { const q = store.get<string>("quality", "auto"); return q === "high" || q === "low" ? q : "auto"; });
  const [paletteId, setPaletteId] = useState<PaletteId>(() => store.get<string>("palette", "standard") === "colorblind" ? "colorblind" : "standard");
  const [keys, setKeys] = useState<KeyMap>(() => loadKeys(store.get("keys", null)));
  const [settings, setSettings] = useState(false);
  const quality = resolveQuality(qualitySetting, { touch, cores: navigator.hardwareConcurrency, memory: (navigator as { deviceMemory?: number }).deviceMemory });
  const palette = PALETTES[paletteId];
  const keysRef = useRef(keys); keysRef.current = keys;
  const paletteRef = useRef(palette); paletteRef.current = palette;
  useEffect(() => { store.set("quality", qualitySetting); store.set("palette", paletteId); store.set("keys", keys); }, [qualitySetting, paletteId, keys]);
  const paletteVars = { "--o-good": palette.good, "--o-bad": palette.bad } as React.CSSProperties;
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
  const [board, setBoard] = useState(false);
  const myId = useRef(-1);
  const today = useMemo(() => dailyChallenge(new Date()), []);
  const dailyBase = useRef<{ room: string; commits: number; kills: number } | null>(null);
  const [leaders, setLeaders] = useState<{ all: Leader[]; daily: Leader[] } | null>(null);
  const [dock, setDock] = useState<{ planet: Planet; readme: string | null; contributors: Contributor[] | null; error: string } | null>(null);

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
      if (e.type === "shot") { sfx.shot(); net.current?.send({ t: "shot", x: e.x, z: e.z, a: e.a, d: HULLS[sim.ship.hull].dmg }); }
      else if (e.type === "pvpHit") { tone(1900, .05, "square", .03, .6); tone(2600, .03, "sine", .02); }
      else if (e.type === "kill") { sfx.kill(); if (e.kind === "mothership") toast(`Mothership destroyed! +${e.points}`, "good"); }
      else if (e.type === "storm") {
        if (e.phase === "warning") { sfx.wave(); toast("Meteor storm in 10 seconds. Shoot or dodge the meteors!", "bad"); }
        else if (e.phase === "active") toast(`Meteor storm! +${STORM.points} per meteor shot, ${STORM.damage} hull per hit`, "bad");
        else toast("The meteor storm has passed.", "good");
      } else if (e.type === "meteor") tone(520, .12, "triangle", .04, .5);
      else if (e.type === "issue") { tone(990, .07, "triangle", .035); toast(`Closed an issue on ${e.planet.repo.name} +30`, "good"); }
      else if (e.type === "star") { sfx.commit(); toast(`Star shield from ${e.planet.repo.name}: shielded and repaired`, "good"); }
      else if (e.type === "hurt") { sfx.hurt(); pulse("hurt"); }
      else if (e.type === "dead") {
        net.current?.send({ t: "boom", x: sim.ship.x, z: sim.ship.z });
        if (e.by != null) net.current?.send({ t: "killed", by: e.by }); // the kill feed comes back from the relay
        else toast("Ship destroyed. Respawning near the sun.", "bad");
      }
      else if (e.type === "wave") { sfx.wave(); toast(e.boss ? `Wave ${e.n}: a MOTHERSHIP is coming` : `Wave ${e.n}: alien ships inbound`, "bad"); }
      else if (e.type === "grab") sfx.grab();
      else if (e.type === "fling") sfx.fling();
      else if (e.type === "gate") toast("The hyperjump gate moved. Follow the violet arrow.");
      else if (e.type === "comet") { sfx.commit(); setTimeout(sfx.commit, 140); toast(`You caught ${CREATOR.login}'s comet! +250 and nova charge`, "good"); }
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
        if (c.jumping) { c.input.nova = false; return; } // frozen while riding the hyperjump tunnel
        if (c.docked) { c.input.fire = c.input.grab = c.input.boost = c.input.nova = false; c.input.move = { x: 0, z: 0 }; } // docked: no bullets, no nova
        events.length = 0;
        step(c.sim, c.input, dt, events);
        if (c.docked) {
          // Glide in over 0.9 s (ease-out), then circle the planet slowly (3 units/s, about 20-40 s a lap), nose along the orbit.
          const p = c.docked, s = c.sim.ship, from = c.dockFrom ?? { x: s.x, z: s.z, a: s.a };
          c.dockT = Math.min(1, (c.dockT ?? 0) + dt / .9);
          const e = 1 - (1 - c.dockT) ** 3, r = p.R + 6;
          c.dockSpin = (c.dockSpin ?? 0) + dt * 3 / r * e; // speeds up as the glide ends
          const a = (Math.atan2(from.z - p.z, from.x - p.x) || 0) + c.dockSpin, head = a + Math.PI / 2;
          const turn = Math.atan2(Math.sin(head - from.a), Math.cos(head - from.a)); // shortest way round
          Object.assign(s, { x: from.x + (p.x + Math.cos(a) * r - from.x) * e, z: from.z + (p.z + Math.sin(a) * r - from.z) * e, vx: 0, vz: 0, inv: Math.max(s.inv, .4), a: from.a + turn * e });
        }
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
        sim.remotes.clear(); myId.current = Number(m.id); sim.myId = myId.current;
        const list = (m.peers as (Peer & { state?: { x: number; z: number; a: number; s?: number; k?: number } | null })[]);
        for (const p of list) sim.remotes.set(p.id, { ...p, hull: isHull(p.hull) ? p.hull : "dart", x: p.state?.x ?? SPAWN.x, z: p.state?.z ?? SPAWN.z, a: p.state?.a ?? 0, vx: 0, vz: 0, hp: 100, tx: p.state?.x ?? SPAWN.x, tz: p.state?.z ?? SPAWN.z, seen: sim.t, score: p.state?.s ?? 0, kills: p.state?.k ?? 0 });
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
        Object.assign(r, { tx: m.x, tz: m.z, vx: m.vx, vz: m.vz, a: m.a, hp: m.hp, seen: sim.t, score: Number(m.s) || 0, kills: Number(m.k) || 0 });
      } else if (m.t === "shot") {
        const a = Number(m.a);
        const d = Number(m.d) === 2 ? 2 : 1;
        sim.bullets.push({ x: Number(m.x), z: Number(m.z), vx: Math.cos(a) * 115, vz: Math.sin(a) * 115, life: .85, from: "ally", owner: id, dmg: d, big: d > 1 });
      } else if (m.t === "grab") remoteGrab(sim, m as unknown as { planet: number; x: number; z: number; vx: number; vz: number });
      else if (m.t === "nova") {
        sim.novas.push({ x: Number(m.x), z: Number(m.z), t: 0, mine: false, hit: new Set(), owner: id });
        toast(`${sim.remotes.get(id)?.name ?? "Someone"} triggered a supernova`, "good");
      } else if (m.t === "boom") explode(sim, Number(m.x), Number(m.z), "#ffb547", 50, 12);
      else if (m.t === "killed") {
        // Kill feed for everyone; the winner's client credits itself.
        const by = Number(m.by), who = (pid: number) => sim.remotes.get(pid)?.name ?? "A pilot";
        const bounty = sim.bountyId === id, extra = bounty ? " and claimed the bounty" : "";
        if (by === myId.current) {
          const pts = PVP.killScore + (bounty ? BOUNTY.bonus : 0);
          sim.pvpKills++; sim.score += pts; sfx.kill(); toast(`You shot down ${who(id)}${extra}! +${pts}`, "good");
        } else if (id === myId.current) toast(`${who(by)} shot you down${bounty ? " and took your bounty" : ""}`, "bad");
        else toast(`${who(by)} shot down ${who(id)}${extra}`);
      } else if (m.t === "ping") {
        const r = sim.remotes.get(id);
        addPing(sim, Number(m.x), Number(m.z), { owner: id, name: r?.name ?? "A pilot", color: r?.color ?? "#ffffff" }); sfx.ping();
      } else if (m.t === "emote") {
        const r = sim.remotes.get(id), e = EMOTES[Number(m.e)];
        if (r && e) { r.emote = e; r.emoteUntil = performance.now() + 3500; }
      }
      else if (m.t === "error") toast(String(m.message), "bad");
    }, setStatus);
    net.current = n;
    const tick = setInterval(() => {
      const c = ctl.current; if (!c || c.attract) return;
      const s = c.sim.ship;
      n.send({ t: "state", x: s.x, z: s.z, a: s.a, vx: s.vx, vz: s.vz, hp: s.dead > 0 ? 0 : s.hp, s: c.sim.score, k: c.sim.pvpKills });
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
  // Lobby backdrop: the universe from the invite link (?u=login), else trending; kept for launch.
  useEffect(() => {
    const abort = new AbortController(), target = inviteTarget(location.search);
    const show = (u: Universe) => { const c = makeControl(u); c.attract = true; adoptControl(c); setUniverse(u); };
    loadUniverse(target, abort.signal).then(show).catch(e => {
      if (abort.signal.aborted) return;
      if (target === "trending") { setLobbyError(errorMessage(e)); return; }
      // A bad or rate-limited invite still gets you flying: fall back to the hub and say why.
      setLobbyError(`Couldn't open ${target}'s universe (${errorMessage(e)}). Showing the trending hub instead.`);
      history.replaceState(null, "", "/");
      loadUniverse("trending", abort.signal).then(show).catch(err => { if (!abort.signal.aborted) setLobbyError(errorMessage(err)); });
    });
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
      const rows: BoardRow[] = [{ id: myId.current, name, color, hull: s.ship.hull, score: s.score, kills: s.pvpKills, me: true },
        ...[...s.remotes.values()].map(r => ({ id: r.id, name: r.name, color: r.color, hull: r.hull ?? "dart", score: r.score ?? 0, kills: r.kills ?? 0, me: false }))];
      rows.sort((a, b) => b.score - a.score);
      s.bountyId = bountyHolder(rows.filter(r => r.id >= 0 || r.me));
      // Daily challenge progress, counted from when you arrived in today's universe.
      let daily: Hud["daily"] = null;
      if (s.universe.room === today.room) {
        if (!dailyBase.current || dailyBase.current.room !== s.universe.room) dailyBase.current = { room: s.universe.room, commits: s.commits, kills: s.kills };
        const doneToday = store.get(`daily:${today.day}`, false);
        const got = today.goal.kind === "commits" ? s.commits - dailyBase.current.commits : s.kills - dailyBase.current.kills;
        if (!doneToday && got >= today.goal.n) { store.set(`daily:${today.day}`, true); s.score += DAILY_REWARD; sfx.wave(); toast(`Daily challenge complete! +${DAILY_REWARD}`, "good"); }
        daily = { done: Math.min(today.goal.n, got), n: today.goal.n, text: today.goal.text, complete: doneToday || got >= today.goal.n };
      }
      setHud({ board: rows, holding: s.holding, bounty: s.bountyId, storm: s.stormPhase, meteors: s.meteors.length, daily, boss: boss ? { hp: boss.hp, max: boss.max } : null, score: s.score, hp: s.ship.hp / HULLS[s.ship.hull].hp * 100, charge: s.charge, wave: s.wave, aliens: s.aliens.length, kills: s.kills, dead: s.ship.dead > 0, near: s.near, grabbing: !!s.grab, comet: s.nearComet, gate: { a: Math.atan2(s.portal.z - s.ship.z, s.portal.x - s.ship.x), d: Math.hypot(s.portal.x - s.ship.x, s.portal.z - s.ship.z) } });
      drawRadar(radar.current, s, paletteRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [phase, learn, name, color]);

  /* ---- keyboard + mouse (one held-key set feeds the sim input) ---- */
  const held = useRef(new Set<string>());
  const syncInput = useCallback(() => {
    const c = ctl.current, keys = held.current; if (!c || touch) return;
    const b = keysRef.current, k = (a: string, alt: string) => keys.has(a) || keys.has(alt);
    c.input.move = { x: (k(b.right, "arrowright") ? 1 : 0) - (k(b.left, "arrowleft") ? 1 : 0), z: (k(b.down, "arrowdown") ? 1 : 0) - (k(b.up, "arrowup") ? 1 : 0) };
    c.input.relative = true;
    c.input.boost = keys.has(b.boost);
    c.input.grab = k(b.grab, "mouse2");
    c.input.fire = k(b.fire, "mouse0");
  }, [touch]);
  useEffect(() => {
    if (phase !== "play") return;
    const keys = held.current;
    const down = (e: KeyboardEvent) => {
      ensureAudio();
      if (e.target instanceof HTMLInputElement || jumpOpen) return;
      const k = e.key.toLowerCase(), b = keysRef.current, act = actionFor(b, k);
      if (act === "nova" && ctl.current) ctl.current.input.nova = true;
      if (act === "ping" && !e.repeat) { ping(); return; }
      if (act === "fullscreen" && !e.repeat && canFullscreen) { void toggleFullscreen(); return; }
      if (act === "music" && !e.repeat) { setMusic(v => !v); return; }
      if (act === "dock" && !e.repeat) { if (ctl.current?.docked) undock(); else if (ctl.current?.sim.near) dockAt(ctl.current.sim.near); return; }
      if (k === "escape" && ctl.current?.docked) { undock(); return; }
      if (ctl.current?.docked && (["up", "down", "left", "right"].includes(act ?? "") || k.startsWith("arrow"))) undock(); // flying off undocks
      if (act === "controls" && !e.repeat) setSheet(v => !v);
      if (act === "board") { e.preventDefault(); if (!e.repeat) setBoard(v => !v); return; }
      if (/^[1-6]$/.test(k) && !e.repeat) { sendEmote(Number(k) - 1); return; }
      if (act === "fire" || act === "dock" || k.startsWith("arrow") || k === " ") e.preventDefault();
      keys.add(k); syncInput();
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); syncInput(); };
    const blur = () => { keys.clear(); syncInput(); };
    if (jumpOpen) blur();
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, [phase, jumpOpen, syncInput]);
  const mouseButton = (button: number, on: boolean) => { if (on) held.current.add("mouse" + button); else held.current.delete("mouse" + button); syncInput(); };

  /* ---- multiplayer extras ---- */
  function sendEmote(i: number) {
    const sim = ctl.current?.sim, e = EMOTES[i]; if (!sim || !e) return;
    sim.emote = e; sim.emoteUntil = performance.now() + 3500;
    net.current?.send({ t: "emote", e: i });
  }

  /* ---- music: generated in the browser, only while flying, respects Sound off ---- */
  useEffect(() => {
    if (phase !== "play" || !music || muted || !ac || !master) return;
    if (ac.state === "suspended") void ac.resume();
    return startMusic(ac, master);
  }, [phase, music, muted]);
  useEffect(() => { store.set("music", music); }, [music]);

  /* ---- gamepad (standard mapping) ---- */
  useEffect(() => {
    if (phase !== "play" || !("getGamepads" in navigator)) return;
    let raf = 0, prev: PadState | null = null, inUse = false;
    const onConnect = (e: GamepadEvent) => toast(`${e.gamepad.id.split("(")[0].trim() || "Gamepad"} connected: left stick flies, right stick aims, RT fires`, "good");
    addEventListener("gamepadconnected", onConnect);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const pad = [...navigator.getGamepads()].find(p => p && p.mapping === "standard") ?? [...navigator.getGamepads()].find(Boolean);
      const c = ctl.current; if (!pad || !c || c.attract) return;
      const st = readPad(pad);
      if (st.active) inUse = true;
      if (!inUse) return;
      const s = c.sim.ship, edge = (k: "nova" | "ping" | "dock" | "board") => st[k] && !prev?.[k];
      c.input.move = st.move; c.input.relative = false; c.input.boost = st.boost; c.input.fire = st.fire; c.input.grab = st.grab;
      if (st.aim) { c.pointer.mouse = false; c.input.autoAim = false; c.input.aim = { x: s.x + st.aim.x * 30, z: s.z + st.aim.z * 30 }; }
      else { c.input.aim = null; c.input.autoAim = true; } // centred right stick: aim assist picks targets
      if (edge("nova")) c.input.nova = true;
      if (edge("ping")) ping();
      if (edge("dock")) { if (c.docked) undock(); else if (c.sim.near) dockAt(c.sim.near); }
      if (edge("board")) setBoard(v => !v);
      if (!st.active && prev?.active) { c.input.fire = c.input.grab = c.input.boost = false; c.input.move = { x: 0, z: 0 }; }
      prev = st;
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener("gamepadconnected", onConnect); };
  }, [phase, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- docking: read a repository and jump along its contributors ---- */
  const dockAbort = useRef<AbortController | null>(null);
  function dockAt(planet: Planet) {
    const c = ctl.current; if (!c || c.attract) return;
    dockAbort.current?.abort(); const abort = dockAbort.current = new AbortController();
    const s = c.sim.ship;
    c.docked = planet; c.dockT = c.dockSpin = 0; c.dockFrom = { x: s.x, z: s.z, a: s.a }; sfx.grab();
    setDock({ planet, readme: null, contributors: null, error: "" });
    Promise.allSettled([fetchReadme(planet.repo, abort.signal), fetchContributors(planet.repo, abort.signal)]).then(([readme, people]) => {
      if (abort.signal.aborted) return;
      setDock(d => d && d.planet === planet ? {
        ...d, readme: readme.status === "fulfilled" ? readmeExcerpt(readme.value) : "",
        contributors: people.status === "fulfilled" ? people.value.filter(p => p.login && !p.login.endsWith("[bot]")).slice(0, 8) : [],
        error: readme.status === "rejected" ? errorMessage(readme.reason) : people.status === "rejected" ? errorMessage(people.reason) : "",
      } : d);
    });
  }
  function undock() {
    dockAbort.current?.abort();
    const c = ctl.current, p = c?.docked;
    if (c && p) { // push off, nose out
      const s = c.sim.ship, a = Math.atan2(s.z - p.z, s.x - p.x);
      Object.assign(s, { vx: Math.cos(a) * 24, vz: Math.sin(a) * 24, a });
      c.docked = null;
    }
    setDock(null);
  }

  /* ---- pings ---- */
  const lastPing = useRef(-9);
  function ping() {
    const c = ctl.current; if (!c || c.attract || c.sim.t - lastPing.current < PING.cooldown) return;
    lastPing.current = c.sim.t;
    const s = c.sim.ship, at = c.input.aim ?? { x: s.x + Math.cos(s.a) * 24, z: s.z + Math.sin(s.a) * 24 };
    addPing(c.sim, at.x, at.z, { owner: myId.current, name, color }); sfx.ping();
    net.current?.send({ t: "ping", x: at.x, z: at.z });
  }

  /* ---- full screen ---- */
  type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
  type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const root = document.documentElement as FsEl, doc = document as FsDoc;
  const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  const [fullscreen, setFullscreen] = useState(() => !!(doc.fullscreenElement ?? doc.webkitFullscreenElement));
  useEffect(() => {
    const sync = () => setFullscreen(!!(doc.fullscreenElement ?? doc.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", sync); document.addEventListener("webkitfullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("webkitfullscreenchange", sync); };
  }, [doc]);
  async function toggleFullscreen(on = !fullscreen) {
    try {
      if (on) await (root.requestFullscreen?.({ navigationUI: "hide" }) ?? root.webkitRequestFullscreen?.());
      else await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } catch { /* refused (no user gesture, or not allowed): stay windowed */ }
  }
  // iPhone Safari has no full-screen API for pages; a home-screen install opens full screen instead.
  const iosBrowser = /iPhone|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone;

  /* ---- universes ---- */
  async function launch() {
    ensureAudio();
    const callsign = name.replace(/[^\w .-]/g, "").trim().slice(0, 18) || "Pilot";
    setName(callsign); store.set("name", callsign); store.set("color", color); store.set("hull", hull);
    const c = ctl.current;
    if (touch && canFullscreen && !fullscreen) void toggleFullscreen(true); // phones: full screen on launch
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
    undock(); setJumpOpen(false); setWarping(true); sfx.warp();
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
    c.jumping = true; c.input.fire = c.input.grab = c.input.boost = false;
    const started = performance.now();
    try {
      // Into the tunnel quickly, ride it for HYPERJUMP_MS (longer only if the universe is slow to load), then land.
      const [u] = await Promise.all([loadUniverse(room, abort.signal), ramp(1, 450)]);
      const left = HYPERJUMP_MS - (performance.now() - started);
      if (left > 0) await new Promise(r => setTimeout(r, left));
      if (abort.signal.aborted) return;
      const next = makeControl(u, c.sim); next.warp = 1; next.zoom = c.zoom;
      const ship = next.sim.ship; Object.assign(ship, { vx: Math.cos(ship.a) * 60, vz: Math.sin(ship.a) * 60 }); // glide out of the tunnel
      adoptControl(next); setPeers([]); setLog([]); setUniverse(u);
      const recent = [u.room, ...store.get<string[]>("recent", []).filter(r => r !== u.room)].slice(0, 6);
      store.set("recent", recent);
      history.replaceState(null, "", invitePath(u.room)); // the address bar is always a working invite
      void ramp(0, 850, next);
      toast(`Arrived in ${u.title}`, "good");
    } catch (e) {
      if (abort.signal.aborted) return;
      c.jumping = false; leavePortal(c.sim); toast(errorMessage(e), "bad");
      await ramp(0, 400);
    } finally { setWarping(false); }
  }
  function closeJump() { setJumpOpen(false); if (ctl.current) leavePortal(ctl.current.sim); }

  // Leaderboards: fetched each time the lobby shows, once the relay is up.
  useEffect(() => {
    if (phase !== "lobby" || status !== "online") return;
    const abort = new AbortController();
    fetch(boardUrl(today.room), { signal: abort.signal }).then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setLeaders({ all: d.all ?? [], daily: d.daily ?? [] }); }).catch(() => {});
    return () => abort.abort();
  }, [phase, status, today.room]);
  const leaderList = (rows: Leader[], empty: string) => rows.length
    ? <ol>{rows.slice(0, 5).map(r => <li key={r.name} className={r.name === name ? "me" : ""}><span>{r.name}</span><b>{r.score.toLocaleString()}</b></li>)}</ol>
    : <p>{empty}</p>;

  const pilots = rooms.reduce((n, r) => n + r.count, 0);
  const lobby = <main className="orbit-lobby" style={paletteVars}>
    <div className="orbit-lobby-inner">
      <p className="orbit-tagline">A multiplayer flight through GitHub</p>
      <h1 className="orbit-title" aria-label="Orbit">{"ORBIT".split("").map((ch, i) => <span key={i} aria-hidden="true" style={{ "--i": i } as React.CSSProperties}>{ch}</span>)}</h1>
      {universe && universe.room !== "trending" && <p className="orbit-invited">You're heading into <b>{universe.title}</b>'s universe{universe.subtitle ? ` · ${universe.subtitle}` : ""}</p>}
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
        <div className="orbit-daily">
          <span>Today's challenge</span>
          <b>{today.goal.text} in {today.login}'s universe</b>
          {store.get(`daily:${today.day}`, false) ? <i>Done today ✓</i>
            : <button type="button" className="orbit-ghost" disabled={busy} onClick={() => { void launch().then(() => { if (universe?.room !== today.room) void jump(today.login); }); }}>Fly it →</button>}
        </div>
        <div className="orbit-glass orbit-launch-bar">
          <div className="orbit-swatches" role="radiogroup" aria-label="Ship colour">
            {COLORS.map(c => <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={`Colour ${c}`} className="orbit-swatch" style={{ "--sw": c } as React.CSSProperties} onClick={() => setColor(c)} />)}
          </div>
          <button className="orbit-go" type="submit" disabled={busy}>{busy ? "Loading…" : universe && universe.room !== "trending" ? `Launch into ${universe.title}` : "Launch"}</button>
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
      {leaders && <section className="orbit-leaders" aria-label="Leaderboards">
        <div><h2>All-time best</h2>{leaderList(leaders.all, "No scores yet. Fly a run to set the first.")}</div>
        <div><h2>Today in {today.login}'s universe</h2>{leaderList(leaders.daily, "Nobody has flown today's challenge yet.")}</div>
      </section>}
      {iosBrowser && <p className="orbit-foot">For full screen on iPhone: Share → <b>Add to Home Screen</b>, then open Orbit from there.</p>}
      <p className="orbit-foot">{lessons.length < LESSONS.length ? "New here? A short first flight shows you the controls." : "Press H in flight for the controls."}</p>
      <p className="orbit-foot"><button type="button" className="orbit-link" onClick={() => setSettings(true)}>Settings: graphics, colours, keys</button></p>
      <p className="orbit-foot"><a href="/explorer/">Prefer to browse quietly? Open the explorer →</a></p>
    </div>
  </main>;

  const c = control;
  const near = hud?.near;
  const killerName = hud?.dead && c?.sim.killedBy != null ? c.sim.remotes.get(c.sim.killedBy)?.name : undefined;
  const nearOwner = near ? ownerOf(near.repo) : "";
  const showOwnerJump = near && nearOwner.toLowerCase() !== (universe?.owner ?? "").toLowerCase();
  const occupied = rooms.filter(r => r.room !== universe?.room);
  const recent = store.get<string[]>("recent", []).filter(r => r !== universe?.room && !occupied.some(o => o.room === r));

  return <div className={`orbit-game ${phase} ${flash ? "flash-" + flash : ""} ${warping ? "warping" : ""}`} style={paletteVars}>
    {c && <div className="orbit-canvas" onContextMenu={e => e.preventDefault()}
      onPointerMove={e => { if (e.pointerType === "mouse") { c.pointer.x = e.nativeEvent.offsetX; c.pointer.y = e.nativeEvent.offsetY; c.pointer.mouse = true; } }}
      onPointerDown={e => { if (e.pointerType === "mouse") { ensureAudio(); mouseButton(e.button, true); } }}
      onPointerUp={e => { if (e.pointerType === "mouse") mouseButton(e.button, false); }}
      onPointerLeave={() => { held.current.delete("mouse0"); held.current.delete("mouse2"); syncInput(); }}
      onWheel={e => { c.zoom = Math.max(.55, Math.min(1.9, c.zoom * (1 + Math.sign(e.deltaY) * .08))); }}>
      <Canvas key={`${universe?.room}:${quality}`} camera={{ fov: 50, near: .5, far: 5000, position: [0, 70, 70] }} gl={{ antialias: QUALITY[quality].antialias }} dpr={QUALITY[quality].dpr}>
        <GameScene ctl={c} peers={peers} color={color} hull={hull} palette={palette} quality={quality} />
      </Canvas>
    </div>}
    {settings && <SettingsPanel touch={touch} quality={qualitySetting} resolved={quality} onQuality={setQualitySetting} palette={paletteId} onPalette={setPaletteId} keys={keys} onKeys={setKeys} onClose={() => setSettings(false)} />}
    {phase === "lobby" ? lobby : <>

    <header className="orbit-top">
      <div className="orbit-where">
        <span className="orbit-eyebrow">{universe?.room === "trending" ? "TRENDING HUB" : "UNIVERSE"}</span>
        <strong>{universe?.title}</strong>
        <span className="orbit-sub">{universe?.subtitle}</span>
        <span className={`orbit-net ${status}`}>{status === "online" ? `${peers.length + 1} pilot${peers.length ? "s" : ""} here` : status === "waking" ? "Waking multiplayer server (up to a minute)…" : status === "connecting" ? "Connecting…" : "Solo: multiplayer server offline"}</span>
      </div>
      <div className="orbit-actions">
        {canFullscreen && <button className="orbit-ghost" onClick={() => void toggleFullscreen()} aria-pressed={fullscreen} title="Full screen (F)">{fullscreen ? "⤡ Exit full screen" : "⛶ Full screen"}</button>}
        <button className="orbit-ghost" onClick={() => { const m = !muted; setMuted(m); store.set("muted", m); }} aria-pressed={!muted}>{muted ? "Sound off" : "Sound on"}</button>
        {/* Keyboards open the pilots board with Tab; touch has no Tab key. */}
        {touch && <button className="orbit-ghost" onClick={() => setBoard(v => !v)} aria-pressed={board}>Pilots</button>}
        <button className="orbit-ghost" onClick={() => setSheet(v => !v)} aria-pressed={sheet}>Controls</button>
        <button className="orbit-ghost" onClick={() => setSettings(v => !v)} aria-pressed={settings}>Settings</button>
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

    {hud && (hud.holding || hud.bounty != null || hud.storm !== "calm" || hud.daily) && <div className="orbit-status" role="status">
      {hud.storm === "warning" && <span className="warn">Meteor storm incoming</span>}
      {hud.storm === "active" && <span className="warn">Meteor storm · {hud.meteors} in flight</span>}
      {hud.holding === "holding" && <span className="good">Holding the gate · +15/s</span>}
      {hud.holding === "contested" && <span className="warn">Gate contested</span>}
      {hud.bounty != null && <span>{hud.bounty === myId.current ? "You carry the bounty" : `Bounty: ${hud.board.find(r => r.id === hud.bounty)?.name ?? "a pilot"}`}</span>}
      {hud.daily && <span className={hud.daily.complete ? "good" : ""}>{hud.daily.text}: {hud.daily.done}/{hud.daily.n}{hud.daily.complete ? " ✓" : ""}</span>}
    </div>}
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
      <div className="orbit-card-head"><strong>{CREATOR.name}'s comet</strong><span>@{CREATOR.login}</span></div>
      <p>Made by {CREATOR.name}. This comet crosses every universe on a new random path every two minutes. Fly through it for a bonus.</p>
      <div className="orbit-card-actions">
        <a className="orbit-primary small" href={CREATOR.url} target="_blank" rel="noreferrer">Visit @{CREATOR.login} on GitHub</a>
      </div>
    </section>}
    {dock && !jumpOpen && <aside className="orbit-dock" aria-label={`Docked at ${dock.planet.repo.full_name}`}>
      <div className="orbit-tut-head"><span className="orbit-eyebrow">DOCKED · {dock.planet.repo.language ?? "MIXED"}</span><button type="button" className="orbit-link" onClick={undock}>Undock{touch ? "" : " · Esc"}</button></div>
      <strong>{dock.planet.repo.full_name}</strong>
      <div className="orbit-facts"><span>★ {compact(dock.planet.repo.stargazers_count)}</span><span>forks {compact(dock.planet.repo.forks_count)}</span>{dock.planet.commits && <span>{dock.planet.commits.length} recent commits</span>}</div>
      {dock.planet.repo.description && <p className="orbit-dock-desc">{dock.planet.repo.description}</p>}
      <p className="orbit-dock-readme">{dock.readme === null ? "Reading the README…" : dock.readme || "No README excerpt to show."}</p>
      <span className="orbit-label-text">Top contributors · jump into their universe</span>
      {dock.contributors === null ? <p className="orbit-dock-readme">Loading contributors…</p>
        : dock.contributors.length === 0 ? <p className="orbit-dock-readme">{dock.error || "No contributors listed."}</p>
        : <div className="orbit-crew">{dock.contributors.map(p => <button type="button" key={p.login} disabled={warping} onClick={() => void jump(p.login)} title={`${p.contributions.toLocaleString()} contributions`}>
            <img src={`${p.avatar_url}${p.avatar_url.includes("?") ? "&" : "?"}s=64`} alt="" width={28} height={28} loading="lazy" /><span>{p.login}</span><i>→</i>
          </button>)}</div>}
      <div className="orbit-card-actions"><a className="orbit-ghost" href={repoUrl(dock.planet.repo)} target="_blank" rel="noreferrer">Open on GitHub</a></div>
    </aside>}
    {near && !dock && !hud?.comet && !jumpOpen && <section className="orbit-card" aria-label="Nearby planet">
      <div className="orbit-card-head"><strong>{near.repo.name}</strong><span>{near.repo.language ?? "Mixed"}</span></div>
      {near.repo.description && <p>{clip(near.repo.description, 150)}</p>}
      <div className="orbit-facts"><span>{near.trait.label}</span>{near.rocks.length > 0 && <span>{near.rocks.filter(r => r.alive).length}/{near.rocks.length} issue rocks</span>}{near.star && <span>{near.star.cool > 0 ? `★ shield in ${Math.ceil(near.star.cool)}s` : "★ shield ready"}</span>}{near.fresh && <span>Active</span>}</div>
      <div className="orbit-facts"><span>★ {compact(near.repo.stargazers_count)}</span><span>forks {compact(near.repo.forks_count)}</span>
        <span>{near.commits === null ? "scanning commits…" : `${near.sats.filter(s => !s.done).length}/${near.commits.length} commits left`}</span></div>
      <div className="orbit-card-actions">
        <button className="orbit-primary small" onClick={() => dockAt(near)}>Dock{touch ? "" : " · Enter"}</button>
        <a className="orbit-ghost" href={repoUrl(near.repo)} target="_blank" rel="noreferrer">Open on GitHub</a>
        {showOwnerJump && <button className="orbit-primary small" disabled={warping} onClick={() => void jump(nearOwner)}>Hyperjump to {nearOwner}</button>}
      </div>
    </section>}

    {hud && hud.gate.d > 55 && !jumpOpen && <div className="orbit-gate-arrow" aria-hidden="true"
      style={{ left: `${50 + Math.cos(hud.gate.a) * 42}%`, top: `${50 + Math.sin(hud.gate.a) * 38}%` }}>
      <i style={{ transform: `rotate(${hud.gate.a}rad)` }}>➤</i><span>HYPERJUMP · {Math.round(hud.gate.d)}</span>
    </div>}
    {hud?.dead && <div className="orbit-dead">{killerName ? <>Shot down by {killerName}<small>Watching them until you respawn…</small></> : "Ship destroyed. Rebuilding near the sun…"}</div>}

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

    {touch && c && <TouchControls ctl={c} onPing={ping} toast={toast} />}

    {board && hud && <aside className="orbit-board" aria-label="Pilots in this universe">
      <div className="orbit-tut-head"><span className="orbit-eyebrow">PILOTS · {hud.board.length}</span><button type="button" className="orbit-link" onClick={() => setBoard(false)}>Close</button></div>
      <table>
        <thead><tr><th>Pilot</th><th>Ship</th><th>Score</th><th title="Dogfight wins">Wins</th></tr></thead>
        <tbody>{hud.board.map(r => <tr key={r.id} className={r.me ? "me" : ""}>
          <td><i style={{ background: r.color }} />{r.name}{r.me ? " (you)" : ""}{hud.bounty === r.id ? " · bounty" : ""}</td><td>{HULLS[r.hull].name}</td><td>{r.score.toLocaleString()}</td><td>{r.kills}</td>
        </tr>)}</tbody>
      </table>
      {hud.board.length === 1 && <p>Nobody else is here yet. Share this page, or check the hyperjump gate for busier universes.</p>}
      <div className="orbit-emotes" role="group" aria-label="Emotes">{EMOTES.map((e, i) => <button type="button" key={e} onClick={() => sendEmote(i)} title={`Key ${i + 1}`}>{e}</button>)}</div>
    </aside>}
    {sheet ? <KeySheet touch={touch} keys={keys} music={music} onMusic={() => setMusic(v => !v)} onClose={() => setSheet(false)} onReplay={() => { saveLessons([]); setSheet(false); }} />
      : <Tutorial done={lessons} touch={touch} keys={keys} onSkip={() => saveLessons(LESSONS.map(l => l.id))} />}
    </>}
  </div>;
}

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

function TouchControls({ ctl, onPing, toast }: { ctl: Control; onPing: () => void; toast: (t: string, k?: Toast["kind"]) => void }) {
  const knob = useRef<HTMLSpanElement>(null), origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const [tilt, setTilt] = useState(() => store.get("tilt", false));
  const rest = useRef<Tilt | null>(null);
  const move = (x: number, y: number) => {
    const o = origin.current; if (!o) return;
    let dx = x - o.x, dy = y - o.y; const l = Math.hypot(dx, dy), max = 46;
    if (l > max) { dx *= max / l; dy *= max / l; }
    ctl.input.move = { x: dx / max, z: dy / max };
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const end = () => { origin.current = null; ctl.input.move = { x: 0, z: 0 }; if (knob.current) knob.current.style.transform = ""; };
  const hold = (key: "fire" | "grab" | "boost") => ({
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); ctl.input[key] = true; },
    onPointerUp: () => { ctl.input[key] = false; }, onPointerCancel: () => { ctl.input[key] = false; },
  });

  // Tilt-to-steer. The stick still works and wins while you are touching it.
  useEffect(() => {
    if (!tilt) return;
    rest.current = null; // recalibrate to however the phone is held right now
    const angle = () => screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation ?? 0);
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const t = screenTilt(e.beta, e.gamma, angle());
      if (!rest.current) rest.current = t;
      if (!origin.current) ctl.input.move = tiltToMove(t, rest.current);
    };
    const recalibrate = () => { rest.current = null; };
    addEventListener("deviceorientation", onTilt); addEventListener("orientationchange", recalibrate);
    screen.orientation?.addEventListener?.("change", recalibrate);
    return () => {
      removeEventListener("deviceorientation", onTilt); removeEventListener("orientationchange", recalibrate);
      screen.orientation?.removeEventListener?.("change", recalibrate);
      if (!origin.current) ctl.input.move = { x: 0, z: 0 };
    };
  }, [tilt, ctl]);
  useEffect(() => { store.set("tilt", tilt); }, [tilt]);

  async function toggleTilt() {
    if (tilt) { setTilt(false); return; }
    const DOE = window.DeviceOrientationEvent as OrientationCtor | undefined;
    if (!DOE) { toast("This device has no motion sensor. Use the stick.", "bad"); return; }
    try {
      // iPhone and iPad ask for permission, and only from a tap.
      if (DOE.requestPermission && (await DOE.requestPermission()) !== "granted") { toast("Motion access was declined. Use the stick, or allow it in Safari settings.", "bad"); return; }
    } catch { toast("Motion access isn't available here. Use the stick.", "bad"); return; }
    setTilt(true); toast("Tilt to steer: hold the phone the way you like and tilt from there. Tap TILT again to stop.", "good");
  }

  return <>
    <div className={`orbit-stick ${tilt ? "dim" : ""}`} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId }; move(e.clientX, e.clientY); }}
      onPointerMove={e => move(e.clientX, e.clientY)} onPointerUp={end} onPointerCancel={end} aria-label="Movement stick">
      <span ref={knob} />
    </div>
    <button className={`orbit-tilt ${tilt ? "on" : ""}`} onClick={() => void toggleTilt()} aria-pressed={tilt}>{tilt ? "TILT ON" : "TILT"}</button>
    <div className="orbit-buttons">
      <button className="ping" onPointerDown={onPing}>PING</button>
      <button className="nova" onPointerDown={() => { ctl.input.nova = true; }}>NOVA</button>
      <button className="boost" {...hold("boost")}>BOOST</button>
      <button className="grab" {...hold("grab")}>GRAB</button>
      <button className="fire" {...hold("fire")}>FIRE</button>
    </div>
  </>;
}

function drawRadar(cv: HTMLCanvasElement | null, sim: Sim, pal: Palette) {
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
  for (const m of sim.meteors) dot(m.x, m.z, "#ff9a3c", 1.6);
  // Pings: a ring on the radar (pinned to its edge when out of range) so they are findable.
  for (const p of sim.pings) {
    const dx = (p.x - s.x) * k, dz = (p.z - s.z) * k, l = Math.hypot(dx, dz), m = Math.min(1, (R - 7) / (l || 1));
    g.strokeStyle = p.color; g.lineWidth = 2; g.beginPath(); g.arc(R + dx * m, R + dz * m, 4.5, 0, Math.PI * 2); g.stroke();
  }
  for (const p of sim.planets) dot(p.x, p.z, p.glow, Math.max(2, p.R * k * 1.4));
  // Gate: drawn on the rim when out of range so it always shows the way.
  { const gate = sim.portal, dx = (gate.x - s.x) * k, dz = (gate.z - s.z) * k, l = Math.hypot(dx, dz), m = Math.min(1, (R - 6) / (l || 1));
    g.fillStyle = "#b18cff"; g.beginPath(); g.arc(R + dx * m, R + dz * m, l * m < R - 7 ? 5 : 4, 0, Math.PI * 2); g.fill(); }
  for (const a of sim.aliens) dot(a.x, a.z, pal[a.kind], a.kind === "mothership" ? 6 : a.kind === "swarmer" ? 1.5 : 2.2);
  for (const r of sim.remotes.values()) dot(r.x, r.z, r.color, 3);
  g.save(); g.translate(R, R); g.rotate(s.a); g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.fill(); g.restore();
}
