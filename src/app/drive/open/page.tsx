"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { editorPath, fileIdFromOpenState } from "@/lib/google/drive-state";

/**
 * Drive UI "Open with" entry point. Purely client-side (static export):
 * parse the `state` param and hand off to the editor.
 */
function OpenInner() {
  const search = useSearchParams();
  const fileId = fileIdFromOpenState(`?${search.toString()}`);

  useEffect(() => {
    if (fileId !== null) {
      window.location.replace(editorPath(fileId));
    }
  }, [fileId]);

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16 text-sm text-gray-500">
      {fileId === null ? (
        <>
          <p className="mb-4">Couldn’t read the file reference from Google Drive.</p>
          <Link href="/" className="hover:underline">
            ← Leaf
          </Link>
        </>
      ) : (
        <p>Opening…</p>
      )}
    </main>
  );
}

export default function DriveOpen() {
  return (
    <Suspense fallback={null}>
      <OpenInner />
    </Suspense>
  );
}
