"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import ConnectButton from "@/components/ConnectButton";
import Editor, { type EditorHandle } from "@/components/Editor";
import {
  collabEnabled,
  isLeader,
  joinCollabRoom,
  onceSynced,
  userColor,
  type CollabSession,
} from "@/lib/collab";
import {
  DriveNotFoundError,
  getMarkdownFile,
  updateMarkdownFile,
} from "@/lib/google/drive";
import { AuthNeededError, getStoredProfile } from "@/lib/google/gis";

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "auth";

const AUTOSAVE_DELAY_MS = 2500;

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  unsaved: "Unsaved",
  saving: "Saving…",
  error: "Save failed",
  auth: "Reconnect needed",
};

type LoadState = "loading" | "loaded" | "not-found" | "error" | "auth";

interface PageEditorProps {
  fileId: string;
}

/**
 * NOTE: must be rendered with `key={fileId}` — the collaboration session is
 * created once per mount and doesn't follow fileId changes.
 */
export default function PageEditor({ fileId }: PageEditorProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialMarkdown, setInitialMarkdown] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<SaveStatus>("saved");

  // Created once per mount (client-only component, StrictMode off).
  const [collab] = useState<CollabSession | null>(() =>
    collabEnabled() ? joinCollabRoom(fileId) : null
  );

  const editorRef = useRef<EditorHandle>(null);
  // Latest title, readable from the debounced save callback.
  const titleRef = useRef("");
  // Last content written to Drive, to skip no-op saves.
  const lastSavedRef = useRef({ title: "", markdown: "" });
  const saveTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (collab === null) return;
    return () => collab.leave();
  }, [collab]);

  // Note: doesn't reset loadState to "loading" itself — the initial state
  // already is, and retry callers set it before invoking. All state updates
  // happen in promise callbacks, keeping the effect free of sync setState.
  const load = useCallback(() => {
    getMarkdownFile(fileId)
      .then((doc) => {
        if (cancelledRef.current) return;
        titleRef.current = doc.title;
        lastSavedRef.current = doc;
        setTitle(doc.title);
        setInitialMarkdown(doc.markdown);
        setLoadState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        if (err instanceof DriveNotFoundError) {
          setLoadState("not-found");
        } else if (err instanceof AuthNeededError) {
          setLoadState("auth");
        } else {
          setLoadState("error");
        }
      });
  }, [fileId]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [load]);

  const doSave = useCallback(async () => {
    // In a shared room only the leader writes to Drive; everyone converges
    // to the same content via Yjs, so one writer is enough.
    if (collab !== null && !isLeader(collab)) {
      setStatus("saved");
      return;
    }
    const doc = {
      title: titleRef.current,
      markdown: editorRef.current?.getMarkdown() ?? lastSavedRef.current.markdown,
    };
    if (
      doc.title === lastSavedRef.current.title &&
      doc.markdown === lastSavedRef.current.markdown
    ) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    try {
      await updateMarkdownFile(fileId, doc);
      lastSavedRef.current = doc;
      setStatus("saved");
    } catch (err) {
      // Content stays in the editor; the next edit (or reconnect) retries.
      setStatus(err instanceof AuthNeededError ? "auth" : "error");
    }
  }, [fileId, collab]);

  const scheduleSave = useCallback(() => {
    setStatus("unsaved");
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void doSave();
    }, AUTOSAVE_DELAY_MS);
  }, [doSave]);

  // Shared title: adopt the room's title (it may be ahead of Drive), seed it
  // for a brand-new room, and follow remote changes.
  useEffect(() => {
    if (collab === null || loadState !== "loaded") return;
    const { meta, provider } = collab;

    const adoptRemoteTitle = () => {
      const remote = meta.get("title");
      if (typeof remote === "string" && remote !== titleRef.current) {
        titleRef.current = remote;
        setTitle(remote);
      }
    };

    const unsubscribe = onceSynced(provider, () => {
      if (meta.get("title") === undefined) {
        meta.set("title", titleRef.current);
      } else {
        adoptRemoteTitle();
      }
    });
    meta.observe(adoptRemoteTitle);
    return () => {
      unsubscribe();
      meta.unobserve(adoptRemoteTitle);
    };
  }, [collab, loadState]);

  const handleTitleChange = (value: string) => {
    titleRef.current = value;
    setTitle(value);
    collab?.meta.set("title", value);
    scheduleSave();
  };

  if (loadState === "loading") {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16 text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  if (loadState === "auth") {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <p className="mb-4 text-sm text-gray-500">
          Leaf needs access to Google Drive to open this page.
        </p>
        <ConnectButton
          onConnected={() => {
            setLoadState("loading");
            load();
          }}
        />
      </div>
    );
  }

  if (loadState === "not-found" || loadState === "error") {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <p className="mb-4 text-sm text-gray-500">
          {loadState === "not-found"
            ? "Page not found."
            : "Failed to load this page."}
        </p>
        <Link href="/" className="text-sm hover:underline">
          ← Leaf
        </Link>
      </div>
    );
  }

  if (initialMarkdown === null) {
    return null;
  }

  const profile = getStoredProfile();
  const userName = profile?.name ?? profile?.email ?? "Anonymous";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between text-sm text-gray-500">
        <Link href="/" className="hover:underline">
          Leaf
        </Link>
        <span className="flex items-center gap-3">
          {status === "auth" && (
            <ConnectButton
              onConnected={() => void doSave()}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Reconnect
            </ConnectButton>
          )}
          <span
            className={
              status === "error" || status === "auth" ? "text-red-600" : undefined
            }
          >
            {STATUS_LABEL[status]}
          </span>
        </span>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Untitled"
        aria-label="Page title"
        className="mb-4 w-full bg-transparent text-4xl font-bold outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
      />
      <Editor
        ref={editorRef}
        initialMarkdown={initialMarkdown}
        onDirty={scheduleSave}
        collab={collab ?? undefined}
        user={{ name: userName, color: userColor(userName) }}
      />
    </div>
  );
}
