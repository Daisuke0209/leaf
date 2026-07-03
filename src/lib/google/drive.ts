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
 * Creates a new `.md` file and returns its ID. `folderId` is where Drive's
 * "New" menu was invoked; when absent the file lands in My Drive root.
 */
export async function createMarkdownFile(
  doc: PageDocument,
  folderId?: string
): Promise<string> {
  const { body, contentType } = buildMultipartBody(
    {
      name: fileNameForTitle(doc.title),
      mimeType: MARKDOWN_MIME_TYPE,
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

/**
 * Fetches a page as `{ title, markdown }`. The title lives in the file name,
 * so this needs a metadata request in addition to the content download; the
 * two are independent and run in parallel.
 */
export async function getMarkdownFile(fileId: string): Promise<PageDocument> {
  const encodedId = encodeURIComponent(fileId);

  const [metaRes, contentRes] = await Promise.all([
    driveFetch(`${DRIVE_API}/files/${encodedId}?fields=name`),
    driveFetch(`${DRIVE_API}/files/${encodedId}?alt=media`),
  ]);
  await ensureOk(metaRes, "File metadata", fileId);
  await ensureOk(contentRes, "File download", fileId);

  const meta = (await metaRes.json()) as { name: string };
  const markdown = await contentRes.text();

  return { title: titleFromFileName(meta.name), markdown };
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
