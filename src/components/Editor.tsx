"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

export interface EditorHandle {
  /** Serializes the current document to Markdown (lossy). */
  getMarkdown(): string;
}

interface EditorProps {
  initialMarkdown: string;
  /** Fired on every user edit. Serialization is deferred to `getMarkdown`. */
  onDirty: () => void;
  ref?: Ref<EditorHandle>;
}

/**
 * Notion-style block editor over a plain Markdown document. Markdown is
 * parsed into blocks on mount; serialization back to Markdown only happens
 * when the owner asks for it (at save time), not on every keystroke. The
 * conversion is lossy for features Markdown can't express.
 */
export default function Editor({ initialMarkdown, onDirty, ref }: EditorProps) {
  const editor = useCreateBlockNote();
  // Suppresses the onChange fired by loading the initial content.
  const loadingRef = useRef(true);

  useEffect(() => {
    if (initialMarkdown.trim() !== "") {
      const blocks = editor.tryParseMarkdownToBlocks(initialMarkdown);
      editor.replaceBlocks(editor.document, blocks);
    }
    loadingRef.current = false;
  }, [editor, initialMarkdown]);

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
      onChange={() => {
        if (!loadingRef.current) {
          onDirty();
        }
      }}
    />
  );
}
