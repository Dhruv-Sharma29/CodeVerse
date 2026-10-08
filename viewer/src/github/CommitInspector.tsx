import { useEffect, useMemo, useRef, useState } from "react";
import { commitUrl } from "./api";
import type { CommitDetail, Repository } from "./api";
import { parsePatch } from "./diff";
import { Oracle } from "./Oracle";
import "./inspector.css";

export function CommitInspector({repo,commit,onClose}: {repo:Repository;commit:CommitDetail;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [tab,setTab]=useState<"changes" | "oracle">("changes");
  const [fileName,setFileName]=useState(commit.files[0]?.filename ?? "");
  const [filter,setFilter]=useState("");
  const file=commit.files.find(f=>f.filename===fileName);
  const diff=useMemo(()=>parsePatch(file?.patch ?? ""),[file]);
  const visibleFiles=commit.files.filter(f=>f.filename.toLowerCase().includes(filter.toLowerCase()));
  const message=commit.commit.message;
  const [subject,...body]=message.split("\n");
  useEffect(()=>{const element=dialog.current!;element.showModal();return ()=>element.close();},[]);
  return <dialog ref={dialog} className="commit-inspector" aria-labelledby="inspector-title" onCancel={onClose}>
    <header className="inspector-header"><div><span>{repo.full_name} / {commit.sha.slice(0,10)}</span><h2 id="inspector-title">Commit details</h2></div><button className="inspector-close" onClick={onClose} aria-label="Close commit inspector" autoFocus>✕</button></header>
    <div className="inspector-message"><h3>{subject}</h3><p className="inspector-author">{commit.commit.author?.name ?? "Unknown author"}{commit.commit.author?.date && ` · ${new Date(commit.commit.author.date).toLocaleString()}`}</p>
      {body.join("\n").trim() && <pre>{body.join("\n").trim()}</pre>}
      <div className="inspector-summary"><span className="diff-added">+{commit.stats.additions.toLocaleString()}</span><span className="diff-removed">−{commit.stats.deletions.toLocaleString()}</span><span>{commit.files.length} files{commit.files.length===100 ? " shown (first page)" : ""}</span><a href={commitUrl(repo,commit.sha)} target="_blank" rel="noreferrer">Full commit on GitHub ↗</a></div>
    </div>
    <nav className="inspector-tabs" aria-label="Commit views"><button aria-pressed={tab==="changes"} onClick={()=>setTab("changes")}>Code changes</button><button aria-pressed={tab==="oracle"} onClick={()=>setTab("oracle")}>✳ AI explanation</button></nav>
    {tab==="oracle" ? <Oracle key={commit.sha} repo={repo} commit={commit} /> : <div className="inspector-workspace">
      <aside className="inspector-files"><input aria-label="Filter changed files" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Find a changed file" />
        <div>{visibleFiles.map(f=><button key={f.filename} className={fileName===f.filename ? "active" : ""} onClick={()=>setFileName(f.filename)} title={f.filename}><strong>{f.filename}</strong><span>{f.status} <small>+{f.additions} −{f.deletions}</small></span></button>)}</div>
        {!visibleFiles.length && <p>No matching files.</p>}
      </aside>
      <section className="inspector-code" aria-label="Selected file diff">
        {file ? <><div className="diff-file-heading"><strong>{file.filename}</strong><span>{file.status}</span>{file.previous_filename && <small>Renamed from {file.previous_filename}</small>}</div>
          {file.patch ? <>{diff.truncated && <p className="diff-notice">This preview is shortened. Open the full commit on GitHub for the rest.</p>}
            <div className="diff-scroll" tabIndex={0} aria-label={`Code diff for ${file.filename}`}><table><thead><tr><th scope="col">Old</th><th scope="col">New</th><th scope="col">Code</th></tr></thead><tbody>{diff.lines.map((line,i)=><tr key={i} className={`diff-${line.kind}`}><td>{line.oldLine ?? ""}</td><td>{line.newLine ?? ""}</td><td><code>{line.text}</code></td></tr>)}</tbody></table></div>
          </> : <p className="diff-notice">GitHub did not include a text diff for this file. It may be binary, too large, or unchanged apart from its name. <a href={commitUrl(repo,commit.sha)} target="_blank" rel="noreferrer">Inspect it on GitHub ↗</a></p>}
        </> : <p className="diff-notice">This commit has no changed files to display.</p>}
      </section>
    </div>}
  </dialog>;
}
