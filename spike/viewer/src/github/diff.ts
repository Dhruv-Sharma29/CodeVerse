export interface DiffLine {
  kind: "hunk" | "addition" | "deletion" | "context" | "meta";
  text: string; oldLine: number | null; newLine: number | null;
}
export function parsePatch(patch: string, maxLines = 1200): { lines: DiffLine[]; truncated: boolean } {
  const raw = patch.split("\n");
  if (raw.at(-1) === "") raw.pop();
  let oldLine = 0, newLine = 0;
  let inHunk = false;
  let truncated = raw.length > maxLines;
  const lines = raw.slice(0, maxLines).map((original): DiffLine => {
    const hunk = original.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]); newLine = Number(hunk[2]); inHunk = true;
      return { kind: "hunk", text: original, oldLine: null, newLine: null };
    }
    if (original.length > 2000) truncated = true;
    const text = original.length > 2000 ? original.slice(0,2000) + " … [line shortened]" : original;
    if (!inHunk || original.startsWith("\\")) return { kind: "meta", text, oldLine: null, newLine: null };
    if (original.startsWith("+")) return { kind: "addition", text, oldLine: null, newLine: newLine++ };
    if (original.startsWith("-")) return { kind: "deletion", text, oldLine: oldLine++, newLine: null };
    if (original.startsWith(" ")) return { kind: "context", text, oldLine: oldLine++, newLine: newLine++ };
    return { kind: "meta", text, oldLine: null, newLine: null };
  });
  return { lines, truncated };
}
