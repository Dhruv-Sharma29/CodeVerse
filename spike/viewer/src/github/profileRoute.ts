/** Returns the profile candidate encoded in a share URL. The caller validates it with
 * normalizeHandle so malformed paths use the explorer's existing friendly error. */
export function profileHandleFromUrl(pathname: string, search: string): string | undefined {
  const pretty = pathname.match(/^\/@([^/]+)\/?$/);
  if (pretty) {
    try { return decodeURIComponent(pretty[1]); }
    catch { return pretty[1]; }
  }
  return new URLSearchParams(search).get("user") ?? undefined;
}

export function profilePath(login: string): string {
  return `/@${encodeURIComponent(login)}`;
}
