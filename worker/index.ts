import { Liveblocks } from "@liveblocks/node";

/**
 * Leaf collaboration authorizer — the only server-side piece of Leaf.
 *
 * Issues Liveblocks room tokens strictly according to Google Drive's own
 * access control: the client sends its Google access token, and this worker
 * asks Drive (as that user) whether the file behind the room is readable
 * *right now*. Drive editors get full room access, viewers get read-only.
 * The worker is stateless and stores nothing; its only secret is the
 * Liveblocks secret key.
 */

interface Env {
  LIVEBLOCKS_SECRET_KEY?: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://leaf-dlm.pages.dev",
  "http://localhost:3000",
]);

/** Rooms are named `leaf:<driveFileId>`. */
function fileIdFromRoom(room: unknown): string | null {
  if (typeof room !== "string") return null;
  const match = /^leaf:([A-Za-z0-9_-]{10,})$/.exec(room);
  return match === null ? null : match[1];
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":
      origin !== null && ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req.headers.get("Origin"));
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }
    if (!env.LIVEBLOCKS_SECRET_KEY) {
      return json({ error: "server_not_configured" }, 500, cors);
    }

    let room: unknown;
    let googleToken: unknown;
    try {
      ({ room, googleToken } = (await req.json()) as {
        room?: unknown;
        googleToken?: unknown;
      });
    } catch {
      return json({ error: "invalid_body" }, 400, cors);
    }
    const fileId = fileIdFromRoom(room);
    if (fileId === null || typeof googleToken !== "string") {
      return json({ error: "invalid_body" }, 400, cors);
    }
    const googleAuth = { Authorization: `Bearer ${googleToken}` };

    // Identity (for Liveblocks bookkeeping) and Drive access check run with
    // the *user's* token — Google evaluates the file's ACL for us.
    const [userRes, fileRes] = await Promise.all([
      fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: googleAuth,
      }),
      fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          fileId
        )}?fields=id,capabilities(canEdit)`,
        { headers: googleAuth }
      ),
    ]);
    if (!userRes.ok) {
      return json({ error: "invalid_google_token" }, 403, cors);
    }
    if (!fileRes.ok) {
      return json({ error: "no_drive_access" }, 403, cors);
    }
    const user = (await userRes.json()) as {
      sub: string;
      name?: string;
      email?: string;
    };
    const file = (await fileRes.json()) as {
      capabilities?: { canEdit?: boolean };
    };

    const liveblocks = new Liveblocks({ secret: env.LIVEBLOCKS_SECRET_KEY });
    const session = liveblocks.prepareSession(user.sub, {
      userInfo: { name: user.name ?? user.email ?? "Anonymous" },
    });
    session.allow(
      room as string,
      file.capabilities?.canEdit === true
        ? session.FULL_ACCESS
        : session.READ_ACCESS
    );
    const { status, body } = await session.authorize();
    return new Response(body, {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};

export default worker;
