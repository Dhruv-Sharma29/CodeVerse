/* eslint-disable react/set-state-in-effect -- These effects synchronize cancellable GitHub requests, clearing stale repository data before the next response. */
import { useEffect, useMemo, useRef, useState } from "react";
import { RepositorySystem } from "../scene/RepositorySystem";
import { planetStyle } from "./planetStyle";
import { fetchProfile, fetchRepositories, fetchCommits, fetchCommit, normalizeHandle, errorMessage, repoUrl, commitUrl } from "./api";
import type { Repository, GitHubProfile, GitCommit, CommitDetail } from "./api";
import { profileHandleFromUrl, profilePath } from "./profileRoute";
import "./explorer.css";
import { CommitInspector } from "./CommitInspector";
import { UniverseCard } from "./UniverseCard";

type TrendingRepo = Repository & { monthlyStars?: number };
const compact = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const date = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Unknown date";
const SECTOR_SIZE = 8;

export default function Explorer({ onImport, onDemo }: { onImport: () => void; onDemo: () => void }) {
  const [handle, setHandle] = useState(() => profileHandleFromUrl(location.pathname, location.search) ?? "");
  const [profile, setProfile] = useState<GitHubProfile | null>(null);
  const [repos, setRepos] = useState<TrendingRepo[]>([]);
  const [mode, setMode] = useState<"trending" | "profile">("trending");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inspecting, setInspecting] = useState<{repo: Repository; commit: CommitDetail} | null>(null);
  const [selected, setSelected] = useState<TrendingRepo | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [commitIndex, setCommitIndex] = useState(0);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [motion, setMotion] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [updated, setUpdated] = useState("");
  const attemptedHandle = useRef<string | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const [detailRetry, setDetailRetry] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const filtered = useMemo(() => repos.filter(r => `${r.full_name} ${r.language ?? ""}`.toLowerCase().includes(query.toLowerCase())), [repos, query]);
  const sectorCount = Math.max(1, Math.ceil(filtered.length / SECTOR_SIZE));
  const visible = filtered.slice(sector * SECTOR_SIZE, (sector + 1) * SECTOR_SIZE);
  const commit = commits[commitIndex];

  async function openUniverse(input?: string) {
    attemptedHandle.current = input;
    controller.current?.abort();
    const task = new AbortController(); controller.current = task;
    setBusy(true); setError(""); setSelected(null); setPlaying(false);setLoadingMore(false);
    try {
      if (input) {
        const user = await fetchProfile(normalizeHandle(input), task.signal);
        const result = await fetchRepositories(user, 1, task.signal);
        if (task.signal.aborted) return;
        setProfile(user); setRepos(result.repositories); setHasMore(result.hasMore); setMode("profile");
        setHandle(user.login); setUpdated("");
        history.replaceState(null, "", profilePath(user.login));
      } else {
        const response = await fetch("/api/trending", { signal: task.signal });
        if (!response.ok) throw new Error("Monthly trending is temporarily unavailable. Retry, or enter a GitHub handle to explore a profile.");
        const data = await response.json() as { repositories: TrendingRepo[]; fetchedAt: string };
        if (!Array.isArray(data.repositories) || !data.repositories.length) throw new Error("The trending feed returned no repositories. Try a GitHub handle instead.");
        if (task.signal.aborted) return;
        setRepos(data.repositories);setUpdated(data.fetchedAt);setProfile(null);setMode("trending");setHasMore(false);
        history.replaceState(null, "", "/");
      }
      setQuery("");setSector(0);setPage(1);
    } catch (e) { if (!task.signal.aborted) setError(errorMessage(e)); }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    void openUniverse(profileHandleFromUrl(location.pathname, location.search));
    return () => controller.current?.abort();
  }, []);

  async function moreRepositories() {
    if (!profile || loadingMore) return;
    const task = controller.current;
    setLoadingMore(true);setError("");
    try {
      const result = await fetchRepositories(profile, page + 1, task?.signal);
      if (task?.signal.aborted) return;
      setRepos(old => [...new Map([...old, ...result.repositories].map(r => [r.id, r])).values()]);
      setPage(p => p + 1);setHasMore(result.hasMore);
    } catch(e) { if (!task?.signal.aborted) setError(errorMessage(e)); }
    finally { if (!task?.signal.aborted) setLoadingMore(false); }
  }

  useEffect(() => {
    setCommits([]);setDetail(null);setCommitError("");setDetailError("");setPlaying(false);
    if (!selected) return;
    const task = new AbortController();setCommitBusy(true);
    fetchCommits(selected, task.signal).then(result => {
      if (task.signal.aborted) return;
      setCommits([...result].reverse());setCommitIndex(Math.max(0, result.length - 1));
    }).catch(e => { if(!task.signal.aborted) setCommitError(errorMessage(e)); })
      .finally(() => { if(!task.signal.aborted) setCommitBusy(false); });
    return () => task.abort();
  }, [selected, retry]);

  useEffect(() => {
    setDetail(null);setDetailError("");
    if (!selected || !commit || playing) return;
    const task = new AbortController();
    // Debounce scrubbing so dragging across the orbit doesn't burn API requests.
    const timeout = setTimeout(() => {
      fetchCommit(selected, commit.sha, task.signal).then(value => { if(!task.signal.aborted) setDetail(value); })
        .catch(e => { if(!task.signal.aborted) setDetailError(errorMessage(e)); });
    }, 350);
    return () => { clearTimeout(timeout); task.abort(); };
  }, [selected, commit, playing, detailRetry]);

  useEffect(() => {
    if (!playing || commits.length < 2) return;
    const timer = setInterval(() => setCommitIndex(index => {
      if (index >= commits.length - 1) { setPlaying(false); return index; }
      return index + 1;
    }), 1100);
    return () => clearInterval(timer);
  }, [playing, commits.length]);

  const selectCommit = (index: number) => { setPlaying(false);setCommitIndex(index); };
  const showRepo = (repo: Repository) => { setSelected(repo);setPlaying(false);setRetry(0);setDetailRetry(0); };
  return <div className={`explorer ${selected ? "is-focused" : ""}`}>
    <header className="explorer-header">
      <button className="brand" onClick={() => void openUniverse()} aria-label="Codeverse monthly trending"><span className="brand-orbit">✳</span> CODEVERSE <span className="brand-tag">EXPLORER</span></button>
      <form className="handle-search" onSubmit={e => {e.preventDefault();if(handle.trim()) void openUniverse(handle);}}>
        <span aria-hidden="true">@</span><input aria-label="GitHub username" placeholder="Enter a GitHub handle" value={handle} onChange={e => setHandle(e.target.value)} maxLength={100} />
        <button type="submit" disabled={busy || !handle.trim()}>Explore <span aria-hidden="true">↗</span></button>
      </form>
      <button className="quiet-button import-button" onClick={onImport}>Import bundle <span aria-hidden="true">↥</span></button>
    </header>
    <div className="explorer-body">
      <aside className="repository-sidebar">
        <div className="section-eyebrow"><span className="status-dot" /> {mode === "trending" ? "GITHUB DISCOVERY" : "PERSONAL UNIVERSE"}</div>
        <h1>{profile ? `@${profile.login}` : <>A month of <br />new gravity.</>}</h1>
        <p className="sidebar-description">{profile ? (profile.bio || `Explore ${profile.name ?? profile.login}’s public repositories, one world at a time.`) : "The repositories pulling the open-source world into their orbit."}</p>
        <div className="source-summary">
          <span>{mode === "trending" ? "↗ Trending this month" : `${compact(profile?.public_repos ?? 0)} public repositories`}</span>
          {mode === "trending" ? <a href="https://github.com/trending?since=monthly" target="_blank" rel="noreferrer" aria-label="Source: GitHub monthly trending">GitHub ↗</a> : <button className="text-button" onClick={() => void openUniverse()}>Trending ↗</button>}
        </div>
        <label className="repo-filter"><span aria-hidden="true">⌕</span><input aria-label="Filter repositories" placeholder="Find a repository or language" value={query} onChange={e => {setQuery(e.target.value);setSector(0);}} /></label>
        <div className="repository-list" aria-label="Repositories" aria-busy={busy}>
          {busy ? <div className="list-state"><span className="loader" /> Mapping the universe…</div> : visible.map((repo, i) => <button key={repo.id}
            className={`repository-row ${selected?.id === repo.id ? "selected" : ""}`} onClick={() => showRepo(repo)}>
            <span className="repo-number">{String(sector * SECTOR_SIZE + i + 1).padStart(2,"0")}</span>
            <span className="repo-row-copy"><strong>{repo.name}</strong><span>{repo.full_name.split("/")[0]} <i>·</i> {repo.language ?? "Mixed"}</span></span>
            <span className="repo-row-stars">{repo.monthlyStars !== undefined ? `+${compact(repo.monthlyStars)}` : `☆ ${compact(repo.stargazers_count)}`}</span>
          </button>)}
          {!busy && !visible.length && <p className="list-state">{query ? "No repositories match your search." : "No public repositories in this universe yet."}</p>}
        </div>
        {error && <div className="explorer-error" role="alert">{error}<button onClick={() => void openUniverse(attemptedHandle.current)}>Retry</button></div>}
        <div className="sector-controls"><button aria-label="Previous repository sector" disabled={sector === 0 || busy} onClick={() => setSector(p => p - 1)}>←</button><span>SECTOR {String(sector + 1).padStart(2,"0")} / {String(sectorCount).padStart(2,"0")}</span><button aria-label="Next repository sector" disabled={sector >= sectorCount - 1 || busy} onClick={() => setSector(p => p + 1)}>→</button></div>
        {hasMore && <button className="load-more" disabled={loadingMore || busy} onClick={() => void moreRepositories()}>{loadingMore ? "Loading…" : `Load more repositories (${repos.length} loaded)`}</button>}
        <div className="sidebar-bottom"><span className="tiny-orbit">◌</span><p>Every repository, a world.<br /><span>Every commit, a little history.</span></p></div>
      </aside>
      <main className={`universe-stage ${profile && !selected ? "has-universe-card" : ""}`}>
        <div className="stage-caption">
          <div className="section-eyebrow">{selected ? "REPOSITORY ORBIT" : (profile ? "EXPLORE THE CONSTELLATION" : "TRENDING THIS MONTH · GITHUB")}</div>
          <h2>{selected ? selected.name : profile ? `${profile.name ?? profile.login}’s system` : "Open source. Outer space."}</h2>
          <p>{selected ? `${selected.language ?? "Mixed languages"} world · select a satellite to inspect a commit` : "Select a planet to discover what’s happening beneath the surface."}</p>
        </div>
        {profile && !selected && <UniverseCard profile={profile} repositories={repos} />}
        {selected && <button className="back-to-system" onClick={() => {setSelected(null);setPlaying(false);}}>← All planets</button>}
        <div className="system-canvas">
          <RepositorySystem repositories={busy ? [] : visible} selected={selected} commits={commits} commitIndex={commitIndex}
            onRepo={showRepo} onCommit={selectCommit} centerLabel={profile?.login ?? "OPEN SOURCE"} motion={motion} />
        </div>
        {selected && commits.length > 0 && <div className="commit-player">
          <button aria-label={playing ? "Pause commit playback" : "Play recent commits"} onClick={() => {
            if (!playing && commitIndex === commits.length - 1) setCommitIndex(0);
            setPlaying(p => !p);
          }}>{playing ? "Ⅱ" : "▶"}</button>
          <div><span>{commit?.sha.slice(0,7)} <i>·</i> {date(commit?.commit.author?.date)}</span>
            <input aria-label="Recent commit timeline" type="range" min={0} max={Math.max(0,commits.length - 1)} value={commitIndex} onChange={e => selectCommit(Number(e.target.value))} /></div>
          <span>{commitIndex + 1}<small> / {commits.length}</small></span>
        </div>}
        <div className="stage-bottom"><span>DRAG TO ORBIT <i>·</i> SCROLL TO ZOOM</span><button className="text-button" onClick={() => setMotion(m => !m)}>{motion ? "Pause rotation" : "Resume rotation"}</button></div>
      </main>
      {selected && <aside className="repository-detail" aria-label="Repository details">
        <div className="section-eyebrow">PLANET DOSSIER<button className="text-button" aria-label="Close repository details" onClick={() => {setSelected(null);setPlaying(false);}}>✕</button></div>
        <div className="detail-language"><span style={{background:planetStyle(selected).glow}} />{selected.language ?? "Mixed languages"}{selected.archived && " · Archived"}{selected.fork && " · Fork"}</div>
        <h2>{selected.name}</h2><p className="detail-owner">{selected.full_name.split("/")[0]}</p>
        <p className="detail-description">{selected.description || "This repository hasn’t added a description yet."}</p>
        <div className="repo-metrics"><div><strong>{compact(selected.stargazers_count)}</strong><span>STARS</span></div><div><strong>{compact(selected.forks_count)}</strong><span>FORKS</span></div>{selected.monthlyStars !== undefined && <div><strong>+{compact(selected.monthlyStars)}</strong><span>THIS MONTH</span></div>}</div>
        <a className="github-link" href={repoUrl(selected)} target="_blank" rel="noreferrer">View repository on GitHub ↗</a>
        <div className="detail-divider" />
        <div className="commit-heading"><h3>Signals from orbit</h3><span>{commits.length ? `${commits.length} RECENT` : "COMMITS"}</span></div>
        <p className="commit-explanation">{selected.default_branch ? `${selected.default_branch} branch` : "Default branch"} · up to 60 latest commits</p>
        {commitBusy && <p className="list-state"><span className="loader" /> Reading commit history…</p>}
        {commitError && <div className="explorer-error" role="alert">{commitError}<button onClick={() => setRetry(n => n + 1)}>Retry history</button></div>}
        {!commitBusy && !commitError && !commits.length && <p className="list-state">No commits yet. This world is waiting for its first signal.</p>}
        {commit && <div className="active-commit">
          <span className="active-commit-id">◉ {commit.sha.slice(0,7)} <span>{date(commit.commit.author?.date)}</span></span>
          <h4>{commit.commit.message.split("\n")[0]}</h4><p>{commit.commit.author?.name ?? "Unknown author"}</p>
          {playing ? <p className="detail-muted">Pause to inspect this commit’s files.</p> : detailError ? <div className="explorer-error" role="alert">{detailError}<button onClick={() => setDetailRetry(n => n + 1)}>Retry</button></div> : detail ? <>
            <div className="change-count"><span>+{detail.stats.additions.toLocaleString()}</span><span>−{detail.stats.deletions.toLocaleString()}</span><span>{detail.files.length} files{detail.files.length === 100 ? " shown" : ""}</span></div>
            <button className="inspect-code-button" onClick={() => { setPlaying(false); setInspecting({repo:selected,commit:detail}); }}>Read message, code & AI explanation ↗</button>
            <div className="changed-files">{detail.files.slice(0,8).map(file => <div key={file.filename} title={`${file.filename} · ${file.status}`}><span>{file.filename}</span><small>+{file.additions} −{file.deletions}</small></div>)}</div>
            {detail.files.length > 8 && <p className="detail-muted">Showing 8 files. See the complete change on GitHub.</p>}
          </> : <p className="detail-muted">Loading changed files…</p>}
          <a href={commitUrl(selected,commit.sha)} target="_blank" rel="noreferrer">Inspect commit ↗</a>
        </div>}
        <div className="commit-list">{commits.map((c,i) => ({ c,i })).reverse().map(({c,i}) => <button key={c.sha} className={i===commitIndex ? "active" : ""} onClick={() => selectCommit(i)}><span className="commit-node" /><span><strong>{c.commit.message.split("\n")[0]}</strong><small>{c.sha.slice(0,7)} · {c.commit.author?.name ?? "Unknown author"}</small></span></button>)}</div>
      </aside>}
    </div>
    {inspecting && <CommitInspector key={inspecting.commit.sha} repo={inspecting.repo} commit={inspecting.commit} onClose={() => setInspecting(null)} />}
    <footer className="explorer-footer"><span><span className="status-dot" /> {mode === "trending" ? "LIVE MONTHLY TRENDING" : "PUBLIC GITHUB DATA"}{updated && ` · retrieved ${date(updated)}`}</span><span>Surface = primary language; archived = collapsed dark <i>·</i> {mode === "trending" ? "Size = total stars" : "Size = repository KB"} <i>·</i> Atmosphere by last push: ≤30d bright / 31–90d medium / 91–365d faint / &gt;365d minimal / unknown neutral <i>·</i> Orbit rings = decorative</span><button onClick={onDemo}>Local history viewer ↗</button></footer>
  </div>;
}
