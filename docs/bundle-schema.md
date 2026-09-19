# Viewer JSON bundle, version 1

`codeverse analyze LOCAL_REPO -o repo.json` produces a UTF-8 JSON object. The
viewer also accepts legacy notebook exports without `schemaVersion`. The original
notebook omitted empty commits while retaining their event indices. When a legacy
bundle has exactly one event-bearing group per exported commit and indices run
past the commit array, the viewer compacts those indices to match the exported
commit order. Versioned bundles must contain correct indices and are never repaired.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` (optional only for legacy bundles) |
| `repo` | Nonempty repository display name |
| `nodes` | Unique file paths; array index is the node ID |
| `authors` | Contributor display names; array index is the author ID |
| `commits` | `[sha, unixSeconds, authorId]`, oldest to newest on the first-parent chain |
| `events` | `[commitIndex, nodeId, op, locAfter, oldNodeId]`, ordered by commit index |

Operations: `0` add (including copies), `1` modify (including type changes),
`2` delete, `3` rename. Only renames have an `oldNodeId`; all other operations
use `-1`. A rename makes the old node inactive and the new node active. A delete
makes its node inactive. Recreated paths reuse their node ID. Binary and empty
files are active even when their line count is zero.

Commit indices include empty commits. Dates are author timestamps and can move
backward; replay order follows Git, not a timestamp sort. The CLI exports full
commit hashes; the viewer also accepts legacy abbreviated hashes. Author names
are grouped by display name, so contributors sharing a name are combined.

Line counts are approximate cumulative added-minus-deleted text lines, clamped
to zero. This is not a nonblank source-LOC metric. The bundle contains no source
contents or contributor emails. It does expose paths and contributor names.

The viewer rejects malformed indices, unsupported schema versions, unordered
events, duplicate paths, empty commit lists, bundles over 50 MB, and more than
50,000 paths. A committed repository with no files is allowed. The exporter can
produce larger bundles for other consumers; these limits apply to this viewer.
