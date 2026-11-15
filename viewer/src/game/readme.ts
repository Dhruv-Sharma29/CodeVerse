// Turn a README's markdown into a short plain-text excerpt for the docking panel.

/** First meaningful paragraph(s) of a README, without markdown, HTML, badges or code. */
export function readmeExcerpt(markdown: string, max = 420): string {
  const text = markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")                 // fenced code
    .replace(/<[^>]+>/g, " ")                        // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")           // images and badges
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")         // links → their text
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")        // reference links
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, " ")      // link definitions
    .replace(/`([^`]*)`/g, "$1");
  const paragraphs = text.split(/\n\s*\n/)
    // Skip bullet and numbered lists: the excerpt should read as prose, not a table of contents.
    .filter(p => { const lines = p.split("\n").filter(l => l.trim()); return lines.length > 0 && lines.filter(l => /^\s*([-*+]|\d+[.)])\s/.test(l)).length * 2 < lines.length; })
    .map(p => p.split("\n").filter(l => !/^\s*(#{1,6}\s|[-=]{3,}\s*$|\|)/.test(l)).join(" "))
    .map(p => p.replace(/^[\s>*\-+]+/, "").replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1").replace(/\s+/g, " ").trim())
    .filter(p => p.length > 30 && /[a-z]/i.test(p));
  let out = "";
  // One solid opening paragraph is enough; keep adding only while the excerpt is still very short.
  for (const p of paragraphs) { out = out ? `${out} ${p}` : p; if (out.length >= 80) break; }
  return out.length > max ? out.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : out;
}
