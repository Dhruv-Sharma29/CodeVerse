# The Oracle: commit explanations

The first Oracle feature explains a **selected public GitHub commit**. It does not
reconstruct a file’s origin story, answer repository-wide questions, or use a
retrieval index. Those remain future work in [PLAN.md](PLAN.md).

## Using it

1. Open a repository planet and choose a commit (pause playback if needed).
2. Choose **Read message, code & AI explanation**.
3. The **Code changes** tab shows the full commit message, a searchable file list,
   and line-numbered additions/deletions. Rename paths are preserved. Missing text
   patches (for example binary or large files) link to the complete GitHub commit.
4. The **AI explanation** tab describes the data that will be sent. Choose
   **Explain this commit** to request an explanation. Merely browsing makes no
   model call.

Explanations contain a summary, concrete changes, qualified intent, limitations,
and evidence references. Every explanatory claim must reference supplied evidence
IDs: C1 for the commit message, F1…F8 for file-patch excerpts. The server rejects
missing or invented IDs. This validates the reference, not whether the model’s
claim logically follows from it; the UI labels the answer as AI interpretation
and links back to the original commit for verification.

## Configuration

The Node server reuses the analyzer’s root `.env` settings:

```dotenv
NVIDIA_API_KEY=your-key
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_MODEL=your-model
```

For another compatible provider, set `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`
(the NVIDIA-specific key takes precedence if both are set). The adapter sends a
Chat Completions request and expects the requested JSON in the response content.
No SDK or browser-side API key is required. Restart the dev server after changing
these variables.

Local development and the Node production server enable the Oracle when a key
and model are configured. `CODEVERSE_ORACLE_ENABLED=false` disables it. Vercel
requires explicit `CODEVERSE_ORACLE_ENABLED=true` **in addition to** the provider
settings; leaving it unset keeps the hosted AI endpoint disabled. The Vercel
handlers are included in `api/oracle.mjs` and `api/oracle/status.mjs`. This change
does not deploy the site or set hosting secrets.

`GET /api/oracle/status` returns only availability. `POST /api/oracle` accepts
`{ "repo": "owner/repository", "sha": "full-40-character-SHA" }`. It fetches the
commit directly from GitHub without a GitHub token, so only public commit evidence
is available. The client cannot supply arbitrary source URLs or model prompts.
Provider errors are sanitized; API keys and raw provider responses are not sent
to the browser. The existing Python LLM client remains available to notebooks;
the viewer’s Node adapter uses the same configuration independently.

## Limits

- GitHub commit detail: first 100 changed files. The inspector lists every returned
  file; each patch preview is capped at 1,200 lines and 2,000 characters per line.
  Shortening and missing patches are disclosed.
- Model context: at most 12,000 source-text characters, a 3,000-character commit
  message, eight patches, and 4,000 characters per patch. The response reports
  omitted/shortened evidence and files lacking patches.
- Model output: 1,800 tokens; 60-second provider timeout. GitHub has a 15-second
  timeout. Malformed JSON/citations yield a retryable error, never a fabricated
  replacement explanation.
- Cache: up to 100 explanations for 24 hours, keyed by provider, model, repo, SHA.
- Per server instance: two concurrent generations, ten uncached requests per
  visitor/hour, thirty total/hour. Failed attempts count too. On Vercel, visitor
  identity uses `x-real-ip`, falling back to the first `x-forwarded-for` entry.
  Outside Vercel, forwarding headers are ignored and only the socket address is
  trusted. If Vercel supplies neither header, the socket is the fallback.
- No local bundle content is sent to a model. No code is executed. Repository
  messages and patches are treated as untrusted data in the model instructions.

## Known limits

Budgets and cache are in-memory and therefore **per serverless instance**. The
30-request global hourly cap is not enforced across instances; cold starts also
reset counters and cached results. Forwarded visitor identity fixes the shared
proxy bucket on Vercel, but does not create a durable or deployment-wide quota.
Other reverse-proxy hosts still share socket-based buckets. Hosted AI remains
opt-in; no shared storage or additional service is introduced here.

## Verification

`npm test` includes hunk numbering, evidence-size bounds, invented citation
rejection, provider error handling, missing configuration, caching, origin checks,
and request budgets. A live NVIDIA NIM smoke test also explained the public
`octocat/Hello-World` README-newline commit successfully. Automated tests use a
fake provider and never consume model quota.
