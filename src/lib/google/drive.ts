import {
  MARKDOWN_EXTENSION,
  MARKDOWN_MIME_TYPE,
  type PageDocument,
} from "../document";
import { evictToken, getAccessToken } from "./gis";

/**
 * Google Drive REST helpers, called directly from the browser (the Drive
 * API supports CORS). Leaf doesn't manage its own folder or file listing —
 * files are created where the user invoked Drive's "New" menu and opened
 * wherever they live. With the `drive.file` scope the app only sees files
 * it created itself or that the user explicitly opened with it.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export class DriveNotFoundError extends Error {
  constructor(fileId: string) {
    super(`Drive file not found: ${fileId}`);
    this.name = "DriveNotFoundError";
  }
}

export function fileNameForTitle(title: string): string {
  const trimmed = title.trim();
  return `${trimmed === "" ? "Untitled" : trimmed}${MARKDOWN_EXTENSION}`;
}

export function titleFromFileName(name: string): string {
  return name.endsWith(MARKDOWN_EXTENSION)
    ? name.slice(0, -MARKDOWN_EXTENSION.length)
    : name;
}

/**
 * Performs a Drive request with an access token. On 401 it evicts the
 * cached token and retries once with a freshly requested token; if silent
 * re-auth isn't possible the `AuthNeededError` from `getAccessToken`
 * propagates to the caller.
 */
async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await getAccessToken();
  let res = await doFetch(url, init, token);
  if (res.status === 401) {
    evictToken();
    token = await getAccessToken();
    res = await doFetch(url, init, token);
  }
  return res;
}

function doFetch(
  url: string,
  init: RequestInit,
  token: string
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

/** Throws `DriveNotFoundError` on 404 and a generic error on other failures. */
async function ensureOk(
  res: Response,
  context: string,
  fileId?: string
): Promise<void> {
  if (res.ok) {
    return;
  }
  if (res.status === 404 && fileId !== undefined) {
    throw new DriveNotFoundError(fileId);
  }
  const body = await res.text();
  throw new Error(`${context} failed (${res.status}): ${body}`);
}

/** Builds a `multipart/related` body (metadata JSON + Markdown text). */
function buildMultipartBody(
  metadata: Record<string, unknown>,
  markdown: string
): { body: string; contentType: string } {
  const boundary = `leaf_${crypto.randomUUID()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${MARKDOWN_MIME_TYPE}; charset=UTF-8`,
    "",
    markdown,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

/**
 * Key under which the collaboration room key is stored in the file's
 * `appProperties` — app-private Drive metadata that only users who can
 * access the file (and only this app) can read. Knowing the room key is
 * therefore equivalent to having Drive access to the file.
 */
const ROOM_KEY_PROP = "leafRoomKey";

function newRoomKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/**
 * Creates a new `.md` file and returns its ID. `folderId` is where Drive's
 * "New" menu was invoked; when absent the file lands in My Drive root.
 * A collaboration room key is set at creation time.
 */
export async function createMarkdownFile(
  doc: PageDocument,
  folderId?: string
): Promise<string> {
  const { body, contentType } = buildMultipartBody(
    {
      name: fileNameForTitle(doc.title),
      mimeType: MARKDOWN_MIME_TYPE,
      appProperties: { [ROOM_KEY_PROP]: newRoomKey() },
      ...(folderId !== undefined ? { parents: [folderId] } : {}),
    },
    doc.markdown
  );
  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    }
  );
  await ensureOk(res, "File creation");
  const created = (await res.json()) as { id: string };
  return created.id;
}

export interface MarkdownFilePage extends PageDocument {
  /** Collaboration room key, when one has been assigned to the file. */
  roomKey: string | null;
}

/**
 * Fetches a page as `{ title, markdown, roomKey }`. Title and room key live
 * in the file metadata, so this needs a metadata request in addition to the
 * content download; the two are independent and run in parallel.
 */
export async function getMarkdownFile(
  fileId: string
): Promise<MarkdownFilePage> {
  const encodedId = encodeURIComponent(fileId);

  const [metaRes, contentRes] = await Promise.all([
    driveFetch(`${DRIVE_API}/files/${encodedId}?fields=name,appProperties`),
    driveFetch(`${DRIVE_API}/files/${encodedId}?alt=media`),
  ]);
  await ensureOk(metaRes, "File metadata", fileId);
  await ensureOk(contentRes, "File download", fileId);

  const meta = (await metaRes.json()) as {
    name: string;
    appProperties?: Record<string, string>;
  };
  const markdown = await contentRes.text();

  return {
    title: titleFromFileName(meta.name),
    markdown,
    roomKey: meta.appProperties?.[ROOM_KEY_PROP] ?? null,
  };
}

/**
 * Assigns a room key to a file that doesn't have one yet (files created
 * before collaboration existed, or by older versions). Re-reads after
 * writing so concurrent assigners converge on the same key. Returns null
 * when the key can't be written (e.g. read-only access) — the caller should
 * fall back to solo editing.
 */
export async function ensureRoomKey(fileId: string): Promise<string | null> {
  const encodedId = encodeURIComponent(fileId);
  try {
    const patchRes = await driveFetch(`${DRIVE_API}/files/${encodedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appProperties: { [ROOM_KEY_PROP]: newRoomKey() } }),
    });
    if (!patchRes.ok) {
      return null;
    }
    const readRes = await driveFetch(
      `${DRIVE_API}/files/${encodedId}?fields=appProperties`
    );
    if (!readRes.ok) {
      return null;
    }
    const meta = (await readRes.json()) as {
      appProperties?: Record<string, string>;
    };
    return meta.appProperties?.[ROOM_KEY_PROP] ?? null;
  } catch {
    return null;
  }
}

/**
 * Updates a `.md` file's name and content in one multipart request.
 * The name is always derived from the document title, so renames are
 * handled implicitly.
 */
export async function updateMarkdownFile(
  fileId: string,
  doc: PageDocument
): Promise<void> {
  const { body, contentType } = buildMultipartBody(
    { name: fileNameForTitle(doc.title) },
    doc.markdown
  );
  const res = await driveFetch(
    `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=multipart`,
    {
      method: "PATCH",
      headers: { "Content-Type": contentType },
      body,
    }
  );
  await ensureOk(res, "File update", fileId);
}
