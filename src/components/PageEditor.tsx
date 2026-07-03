"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import ConnectButton from "@/components/ConnectButton";
import Editor, { type EditorHandle } from "@/components/Editor";
import PresenceAvatars from "@/components/Presence";
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

const STATUS_META: Record<SaveStatus, { label: string; dot: string }> = {
  saved: { label: "Saved", dot: "bg-accent" },
  unsaved: { label: "Unsaved", dot: "bg-amber-500" },
  saving: { label: "Saving…", dot: "bg-amber-500 animate-pulse" },
  error: { label: "Save failed", dot: "bg-red-500" },
  auth: { label: "Reconnect needed", dot: "bg-red-500" },
};

type LoadState = "loading" | "loaded" | "not-found" | "error" | "auth";

interface PageEditorProps {
  fileId: string;
}

function Shell({
  headerRight,
  children,
}: {
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border-soft bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Image src="/icon.png" alt="" width={20} height={20} className="rounded-[5px]" />
            Leaf
          </Link>
          <div className="flex items-center gap-3">{headerRight}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}

function StatusPill({ status, canEdit }: { status: SaveStatus; canEdit: boolean }) {
  const meta = canEdit
    ? STATUS_META[status]
    : { label: "Read-only", dot: "bg-muted" };
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border-soft px-2.5 py-1 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
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
  const [canEdit, setCanEdit] = useState(true);

  // Joined only after the Drive load succeeds — the auth worker verifies
  // Drive access before issuing a room token, and joining any earlier would
  // ship room data to browsers that can't read the file.
  const [collab, setCollab] = useState<CollabSession | null>(null);

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
        lastSavedRef.current = { title: doc.title, markdown: doc.markdown };
        setTitle(doc.title);
        setInitialMarkdown(doc.markdown);
        setCanEdit(doc.canEdit);
        if (collabEnabled()) {
          setCollab(joinCollabRoom(fileId));
        }
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
        if (canEdit) {
          meta.set("title", titleRef.current);
        }
      } else {
        adoptRemoteTitle();
      }
    });
    meta.observe(adoptRemoteTitle);
    return () => {
      unsubscribe();
      meta.unobserve(adoptRemoteTitle);
    };
  }, [collab, loadState, canEdit]);

  const handleTitleChange = (value: string) => {
    titleRef.current = value;
    setTitle(value);
    collab?.meta.set("title", value);
    scheduleSave();
  };

  if (loadState === "loading") {
    return (
      <Shell>
        <p className="text-sm text-muted">Loading…</p>
      </Shell>
    );
  }

  if (loadState === "auth") {
    return (
      <Shell>
        <p className="mb-4 text-sm text-muted">
          Leaf needs access to Google Drive to open this page.
        </p>
        <ConnectButton
          onConnected={() => {
            setLoadState("loading");
            load();
          }}
        />
      </Shell>
    );
  }

  if (loadState === "not-found" || loadState === "error") {
    return (
      <Shell>
        <p className="mb-4 text-sm text-muted">
          {loadState === "not-found"
            ? "Page not found."
            : "Failed to load this page."}
        </p>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Back to Leaf
        </Link>
      </Shell>
    );
  }

  if (initialMarkdown === null) {
    return null;
  }

  const profile = getStoredProfile();
  const userName = profile?.name ?? profile?.email ?? "Anonymous";

  return (
    <Shell
      headerRight={
        <>
          {collab !== null && <PresenceAvatars session={collab} />}
          {status === "auth" && (
            <ConnectButton
              onConnected={() => void doSave()}
              className="rounded-md border border-border-soft px-2 py-1 text-xs hover:bg-accent-soft disabled:opacity-50"
            >
              Reconnect
            </ConnectButton>
          )}
          <StatusPill status={status} canEdit={canEdit} />
        </>
      }
    >
      <input
        type="text"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Untitled"
        aria-label="Page title"
        readOnly={!canEdit}
        className="mb-5 w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted/40"
      />
      <Editor
        ref={editorRef}
        initialMarkdown={initialMarkdown}
        onDirty={scheduleSave}
        collab={collab ?? undefined}
        user={{ name: userName, color: userColor(userName) }}
        editable={canEdit}
      />
    </Shell>
  );
}
