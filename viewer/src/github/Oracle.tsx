import { useEffect, useRef, useState } from "react";
import type { Repository, CommitDetail } from "./api";

interface Claim { text: string; evidence: string[] }
interface Explanation {
  summary: Claim; changes: Claim[]; intent: Claim; limitations: string[];
  sources: {id: string; label: string; url: string; truncated: boolean}[];
  coverage: { filesIncluded: number; filesReturned: number; missingPatches: number; truncated: boolean };
  model: string; generatedAt: string; cached: boolean;
}
export function Oracle({repo, commit}: {repo: Repository; commit: CommitDetail}) {
  const [available,setAvailable]=useState<boolean | null>(null);
  const [answer,setAnswer]=useState<Explanation | null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const task=useRef<AbortController | null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/oracle/status',{signal:controller.signal}).then(r=>r.ok ? r.json() : {available:false})
      .then(data=>setAvailable(data.available === true)).catch(()=>{if(!controller.signal.aborted) setAvailable(false);});
    return ()=>{controller.abort();task.current?.abort();};
  },[]);
  async function explain() {
    task.current?.abort();const controller=new AbortController();task.current=controller;
    setLoading(true);setError("");
    try {
      const response=await fetch('/api/oracle',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({repo:repo.full_name,sha:commit.sha}),signal:controller.signal});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || "The explanation failed. Please retry.");
      if(!controller.signal.aborted) setAnswer(data);
    } catch(e) {if(!controller.signal.aborted) setError(e instanceof Error ? e.message : "Couldn’t reach the Oracle.");}
    finally {if(!controller.signal.aborted) setLoading(false);}
  }
  const claim=(item: Claim) => <p>{item.text}<span className="oracle-citations">{item.evidence.map(id=>{
    const source=answer?.sources.find(s=>s.id===id);
    return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer" title={source.label}>[{id}]</a> : null;
  })}</span></p>;
  return <section className="oracle-panel" aria-label="AI commit explanation">
    <div className="oracle-heading"><div><span className="section-eyebrow">THE ORACLE · OPTIONAL AI</span><h3>Understand this change.</h3></div><span className="oracle-symbol" aria-hidden="true">✳</span></div>
    <p className="oracle-intro">An explanation of what changed, with the commit message and code as evidence. Intent is labeled as inference when the author hasn’t stated it.</p>
    {!answer && <>
      <button className="oracle-button" onClick={()=>void explain()} disabled={!available || loading}>{loading ? "Reading the evidence…" : available === null ? "Checking AI availability…" : "Explain this commit"}</button>
      {available === false ? <p className="oracle-notice">AI isn’t configured on this server. The full message and code changes are still available in the Changes tab.</p> : <p className="oracle-notice">Clicking sends this public commit’s message and selected code diffs to the configured AI provider. Nothing is sent while browsing.</p>}
    </>}
    {error && <div role="alert" className="explorer-error">{error}</div>}
    {answer && <div className="oracle-answer" aria-live="polite">
      <h4>What changed</h4>{claim(answer.summary)}
      {answer.changes.map((item,i)=><div key={i}>{claim(item)}</div>)}
      <h4>Why it may have changed</h4>{claim(answer.intent)}
      {answer.limitations.length > 0 && <><h4>What this doesn’t establish</h4><ul>{answer.limitations.map((item,i)=><li key={i}>{item}</li>)}</ul></>}
      <div className="oracle-coverage">Based on the commit message and {answer.coverage.filesIncluded} file patches.
        {answer.coverage.missingPatches > 0 && ` ${answer.coverage.missingPatches} files had no text patch.`}
        {answer.coverage.truncated && " Some evidence was omitted or shortened to fit the context limit."}
      </div>
      <h4>Source evidence</h4><ul className="oracle-sources">{answer.sources.map(source=><li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">[{source.id}] {source.label} ↗</a>{source.truncated && <small> excerpt</small>}</li>)}</ul>
      <p className="oracle-notice">AI-generated interpretation · verify against the diff.<br />{answer.model}{answer.cached ? " · cached explanation" : ""}</p>
    </div>}
  </section>;
}
