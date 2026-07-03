"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// BlockNote is client-only, so the editor must be loaded without SSR.
const PageEditor = dynamic(() => import("@/components/PageEditor"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-6xl px-6 py-16 text-sm text-gray-500">
      Loading…
    </div>
  ),
});

function EditInner() {
  // Static export has no dynamic route segments, so the Drive file ID
  // travels as a query param: /edit?file=<fileId>.
  const fileId = useSearchParams().get("file");
  if (fileId === null || fileId === "") {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <p className="mb-4 text-sm text-gray-500">No file specified.</p>
        <Link href="/" className="text-sm hover:underline">
          ← Leaf
        </Link>
      </div>
    );
  }
  return <PageEditor fileId={fileId} />;
}

export default function EditPage() {
  return (
    <Suspense fallback={null}>
      <EditInner />
    </Suspense>
  );
}
