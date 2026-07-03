import { createClient, type Client } from "@liveblocks/client";
import { LiveblocksYjsProvider } from "@liveblocks/yjs";
import * as Y from "yjs";

import { getAccessToken } from "./google/gis";

/**
 * Real-time collaboration via Liveblocks + Yjs.
 *
 * One Liveblocks room per Drive file (`leaf:<fileId>`). The Yjs doc holds
 * the page body (BlockNote's fragment) and a small `meta` map for the title.
 * Google Drive stays the persisted artifact: the awareness "leader" (lowest
 * client id in the room) is the only client that autosaves to Drive, so a
 * room full of editors produces one writer.
 *
 * Access control follows Google Drive's own ACL: joining a room requires a
 * token from the auth worker (see worker/index.ts), which verifies with the
 * user's Google token that the file is accessible *right now*. Drive
 * editors get full access, viewers get read-only.
 */

export interface CollabSession {
  doc: Y.Doc;
  provider: LiveblocksYjsProvider;
  /** BlockNote's collaboration fragment. */
  fragment: Y.XmlFragment;
  /** Shared page metadata (currently just `title`). */
  meta: Y.Map<string>;
  leave: () => void;
}

export function collabEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_LIVEBLOCKS_AUTH_URL);
}

let client: Client | null = null;

function getClient(): Client {
  if (client === null) {
    const authUrl = process.env.NEXT_PUBLIC_LIVEBLOCKS_AUTH_URL;
    if (!authUrl) throw new Error("NEXT_PUBLIC_LIVEBLOCKS_AUTH_URL is not set");
    client = createClient({
      authEndpoint: async (room) => {
        // Throws AuthNeededError without a Google token — Liveblocks treats
        // it as a failed (re-)authorization and the room stays inaccessible.
        const googleToken = await getAccessToken();
        const res = await fetch(authUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, googleToken }),
        });
        if (!res.ok) {
          throw new Error(`Collab authorization failed (${res.status})`);
        }
        return (await res.json()) as { token: string };
      },
    });
  }
  return client;
}

export function joinCollabRoom(fileId: string): CollabSession {
  const { room, leave } = getClient().enterRoom(`leaf:${fileId}`);
  const doc = new Y.Doc();
  const provider = new LiveblocksYjsProvider(room, doc);
  return {
    doc,
    provider,
    fragment: doc.getXmlFragment("document-store"),
    meta: doc.getMap<string>("meta"),
    leave: () => {
      provider.destroy();
      leave();
    },
  };
}

/**
 * Runs `callback` once the provider has synced the room state (immediately
 * if already synced). Returns an unsubscribe function.
 */
export function onceSynced(
  provider: LiveblocksYjsProvider,
  callback: () => void
): () => void {
  if (provider.synced) {
    callback();
    return () => {};
  }
  let done = false;
  const handler = () => {
    if (done || !provider.synced) return;
    done = true;
    provider.off("sync", handler);
    provider.off("synced", handler);
    callback();
  };
  provider.on("sync", handler);
  provider.on("synced", handler);
  return () => {
    provider.off("sync", handler);
    provider.off("synced", handler);
  };
}

/** True when this client should be the one writing to Drive. */
export function isLeader(session: CollabSession): boolean {
  const ids = [...session.provider.awareness.getStates().keys()];
  if (ids.length === 0) return true;
  // The awareness client id is the Y.Doc's clientID.
  return Math.min(...ids) === session.doc.clientID;
}

/** True when no other collaborator is in the room yet. */
export function isAlone(provider: LiveblocksYjsProvider): boolean {
  return provider.awareness.getStates().size <= 1;
}

const CURSOR_COLORS = [
  "#e06c75",
  "#d19a66",
  "#98c379",
  "#56b6c2",
  "#61afef",
  "#c678dd",
  "#be5046",
  "#2f9e69",
];

/** Stable cursor color derived from a user identifier. */
export function userColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}
