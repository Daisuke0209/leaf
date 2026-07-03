"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Awareness } from "y-protocols/awareness";

import { isAlone, onceSynced, type CollabSession } from "@/lib/collab";

export interface EditorHandle {
  /** Serializes the current document to Markdown (lossy). */
  getMarkdown(): string;
}

interface EditorProps {
  initialMarkdown: string;
  /** Fired on every edit (local or remote). Serialization is deferred to `getMarkdown`. */
  onDirty: () => void;
  /** When set, the editor collaborates over this session's Yjs doc. */
  collab?: CollabSession;
  user?: { name: string; color: string };
  /** False for Drive viewers: the editor renders read-only. */
  editable?: boolean;
  ref?: Ref<EditorHandle>;
}

/**
 * Notion-style block editor over a plain Markdown document. Markdown is
 * parsed into blocks on mount and serialized back only when the owner asks
 * for it (at save time). In collaboration mode the document lives in the
 * shared Yjs fragment; the Drive markdown only seeds a brand-new room.
 */
export default function Editor({
  initialMarkdown,
  onDirty,
  collab,
  user,
  editable = true,
  ref,
}: EditorProps) {
  const editor = useCreateBlockNote(
    collab !== undefined
      ? {
          collaboration: {
            fragment: collab.fragment,
            // Liveblocks' Awareness is a runtime-compatible subset of the
            // y-protocols type BlockNote declares.
            provider: collab.provider as unknown as { awareness: Awareness },
            user: user ?? { name: "Anonymous", color: "#61afef" },
          },
        }
      : {}
  );
  // Suppresses onChange during initial content load / room sync.
  const loadingRef = useRef(true);

  useEffect(() => {
    if (collab === undefined) {
      if (initialMarkdown.trim() !== "") {
        const blocks = editor.tryParseMarkdownToBlocks(initialMarkdown);
        editor.replaceBlocks(editor.document, blocks);
      }
      loadingRef.current = false;
      return;
    }
    // Collaboration: wait for the room state, then seed the Drive markdown
    // only if the room is brand new (empty fragment, nobody else in it).
    // Viewers never seed — their updates would be rejected server-side.
    return onceSynced(collab.provider, () => {
      if (
        editable &&
        collab.fragment.length === 0 &&
        initialMarkdown.trim() !== "" &&
        isAlone(collab.provider)
      ) {
        const blocks = editor.tryParseMarkdownToBlocks(initialMarkdown);
        editor.replaceBlocks(editor.document, blocks);
      }
      loadingRef.current = false;
    });
  }, [editor, initialMarkdown, collab, editable]);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => editor.blocksToMarkdownLossy(editor.document),
    }),
    [editor]
  );

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      onChange={() => {
        if (!loadingRef.current) {
          onDirty();
        }
      }}
    />
  );
}
