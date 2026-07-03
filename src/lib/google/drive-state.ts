/**
 * Parsing for the `state` query param Google attaches when launching the app
 * from the Drive UI ("Open with" / "New"). This is Google's wire contract:
 * https://developers.google.com/workspace/drive/api/guides/enable-sdk
 */

function parseState(search: string): Record<string, unknown> | null {
  const raw = new URLSearchParams(search).get("state");
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** "Open with" state: `{"ids":["<fileId>"],"action":"open",...}`. */
export function fileIdFromOpenState(search: string): string | null {
  const ids = parseState(search)?.ids;
  return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : null;
}

/** "New" state: `{"folderId":"<id>","action":"create",...}`. */
export function folderIdFromNewState(search: string): string | undefined {
  const folderId = parseState(search)?.folderId;
  return typeof folderId === "string" && folderId !== "" ? folderId : undefined;
}

/** In-app editor URL for a Drive file. */
export function editorPath(fileId: string): string {
  return `/edit/?file=${encodeURIComponent(fileId)}`;
}
