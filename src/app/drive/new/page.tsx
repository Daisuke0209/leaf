"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import ConnectButton from "@/components/ConnectButton";
import { createEmptyDocument } from "@/lib/document";
import { createMarkdownFile } from "@/lib/google/drive";
import { editorPath, folderIdFromNewState } from "@/lib/google/drive-state";
import { AuthNeededError } from "@/lib/google/gis";

/**
 * Drive UI "New" entry point. Creates an empty Markdown file in the folder
 * from the `state` param and opens the editor. First tries silently; if
 * Google needs interaction, shows a ConnectButton so the consent popup
 * comes from a user gesture.
 */

type State = "working" | "need-auth" | "error";

export default function DriveNew() {
  const [state, setState] = useState<State>("working");
  const startedRef = useRef(false);

  const create = async () => {
    setState("working");
    try {
      const fileId = await createMarkdownFile(
        createEmptyDocument(),
        folderIdFromNewState(window.location.search)
      );
      window.location.replace(editorPath(fileId));
    } catch (err) {
      setState(err instanceof AuthNeededError ? "need-auth" : "error");
    }
  };

  useEffect(() => {
    // Guard against double-create (e.g. fast refresh re-running the effect).
    if (startedRef.current) return;
    startedRef.current = true;
    void create();
  }, []);

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      {state === "working" && (
        <p className="text-sm text-gray-500">Creating a new page…</p>
      )}
      {state === "need-auth" && (
        <>
          <p className="mb-4 text-sm text-gray-500">
            Leaf needs access to Google Drive to create the page.
          </p>
          <ConnectButton onConnected={() => void create()} />
        </>
      )}
      {state === "error" && (
        <>
          <p className="mb-4 text-sm text-gray-500">Failed to create the page.</p>
          <Link href="/" className="text-sm hover:underline">
            ← Leaf
          </Link>
        </>
      )}
    </main>
  );
}
