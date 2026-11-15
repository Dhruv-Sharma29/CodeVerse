"""Refresh the GitHub snapshot embedded in codeverse-orbit.html.

Usage: python3 game/snapshot.py HANDLE [HANDLE ...]   (needs an authenticated `gh` CLI)
Artifacts can't call api.github.com, so the game ships with a dated snapshot.
"""
import datetime, json, pathlib, re, subprocess, sys
def api(p):
    r = subprocess.run(["gh","api",p], capture_output=True, text=True)
    if r.returncode: print("ERR", p, r.stderr[:120], file=sys.stderr); return None
    return json.loads(r.stdout)
out = {"snapshot": datetime.date.today().isoformat(), "systems": []}
for h in sys.argv[1:]:
    u = api(f"/users/{h}")
    kind = "orgs" if u["type"] == "Organization" else "users"
    repos = api(f"/{kind}/{h}/repos?sort=pushed&per_page=100&type={'public' if kind=='orgs' else 'owner'}") or []
    repos = [r for r in repos if not r["fork"]]
    repos.sort(key=lambda r: (-r["stargazers_count"], r["name"]))
    sysd = {"login": u["login"], "name": u["name"], "type": u["type"], "followers": u["followers"], "public_repos": u["public_repos"], "repos": []}
    for r in repos[:8]:
        cs = api(f"/repos/{r['full_name']}/commits?per_page=12") or []
        commits = []
        for i, c in enumerate(cs):
            d = {"sha": c["sha"][:7], "msg": c["commit"]["message"][:400], "author": (c["commit"]["author"] or {}).get("name", "?"), "date": (c["commit"]["author"] or {}).get("date", "")}
            if i < 4:
                det = api(f"/repos/{r['full_name']}/commits/{c['sha']}")
                if det:
                    d["add"] = det["stats"]["additions"]; d["del"] = det["stats"]["deletions"]
                    d["files"] = [f["filename"] for f in det["files"][:6]]; d["nfiles"] = len(det["files"])
            commits.append(d)
        sysd["repos"].append({k: r.get(k) for k in ["id","name","description","language","stargazers_count","forks_count","size","created_at","pushed_at","archived","default_branch"]} | {"commits": commits})
        print(h, r["name"], len(commits), file=sys.stderr)
    out["systems"].append(sysd)
page = pathlib.Path(__file__).with_name("codeverse-orbit.html")
blob = json.dumps(out, separators=(",", ":")).replace("</", "<\\/")
html, n = re.subn(r'(<script id="data" type="application/json">).*?(</script>)',
                  lambda m: m[1] + blob + m[2], page.read_text(), count=1, flags=re.S)
assert n == 1, "data <script> marker not found"
page.write_text(html)
