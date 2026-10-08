import { useMemo, useRef, useState } from "react";
import type { GitHubProfile, Repository } from "./api";
import { profilePath } from "./profileRoute";
import { loadedCoverage, summarizeProfile } from "./profileSummary";

const compact = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function UniverseCard({ profile, repositories, onEvolve }: { profile: GitHubProfile; repositories: Repository[]; onEvolve?: () => void }) {
  const summary = useMemo(() => summarizeProfile(profile, repositories), [profile, repositories]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">("idle");
  const fallback = useRef<HTMLInputElement>(null);
  const shareUrl = `${location.origin}${profilePath(profile.login)}`;
  const coverage = loadedCoverage(summary);

  async function copyLink() {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopyState("copied");
        return;
      } catch { /* Show the manual fallback below. */ }
    }
    setCopyState("fallback");
    requestAnimationFrame(() => fallback.current?.select());
  }

  async function share() {
    try {
      await navigator.share({ title: `${profile.name ?? profile.login} · Codeverse`, text: `Explore @${profile.login}'s GitHub universe.`, url: shareUrl });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setCopyState("fallback");
    }
  }

  return <section className="universe-card" aria-labelledby="universe-card-title">
    <div className="universe-card-heading">
      <div><span>DEVELOPER UNIVERSE</span><h3 id="universe-card-title">{profile.name ?? profile.login}</h3><p>@{profile.login}</p></div>
      <div className="universe-card-actions">
        {onEvolve && <button type="button" className="evolve-button" onClick={onEvolve}>✨ Evolve Universe</button>}
        <button type="button" onClick={() => void copyLink()}>Copy link</button>
        {typeof navigator.share === "function" && <button type="button" onClick={() => void share()}>Share</button>}
      </div>
    </div>
    {profile.bio && <p className="universe-card-bio">{profile.bio}</p>}
    <dl className="universe-card-stats">
      <div><dt>PUBLIC REPOS</dt><dd>{summary.publicRepositories.toLocaleString()}</dd></div>
      <div><dt>STARS</dt><dd>{compact(summary.stars)}</dd></div>
      <div><dt>PUSHED ≤90D</dt><dd>{summary.recentlyPushed.toLocaleString()}</dd></div>
      <div className="universe-card-languages"><dt>TOP LANGUAGES</dt><dd>{summary.languages.length ? summary.languages.map(language => language.name).join(" · ") : "None reported"}</dd></div>
    </dl>
    <p className="universe-card-coverage">Stars, recent activity, and languages measured {coverage}.</p>
    <div className="copy-feedback" aria-live="polite">
      {copyState === "copied" && <span>Link copied.</span>}
      {copyState === "fallback" && <label>Copy this link manually<input ref={fallback} readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /></label>}
    </div>
  </section>;
}
