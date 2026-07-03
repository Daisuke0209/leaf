"use client";

import { useSyncExternalStore } from "react";

import ConnectButton, { primaryClasses } from "@/components/ConnectButton";
import {
  disconnect,
  getStoredProfile,
  subscribeProfile,
} from "@/lib/google/gis";

/**
 * Minimal landing page. Leaf is entered from the Drive UI ("New" and
 * "Open with"); this page only exists to connect the app to Google Drive
 * (granting access and installing it into the Drive UI) and to explain
 * that flow.
 */
export default function Home() {
  // null during prerender and when not connected.
  const profile = useSyncExternalStore(
    subscribeProfile,
    getStoredProfile,
    () => null
  );

  if (profile === null) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <h1 className="mb-4 text-2xl font-bold">Leaf</h1>
        <p className="mb-6 text-sm text-gray-500">
          A Markdown editor for Google Drive, with a Notion-style writing
          experience. Connect Leaf to your Drive to get started.
        </p>
        <ConnectButton />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leaf</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {profile.name ?? profile.email ?? ""}
          </span>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Disconnect
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        You’re connected. Leaf works from Google Drive:
      </p>
      <ul className="mb-8 list-disc space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-400">
        <li>
          <strong>New page</strong>: in Drive, choose New → More → Leaf to
          create a Markdown file where you are.
        </li>
        <li>
          <strong>Edit</strong>: right-click a Markdown file → Open with →
          Leaf.
        </li>
      </ul>
      <a
        href="https://drive.google.com"
        className={`inline-block ${primaryClasses}`}
      >
        Open Google Drive
      </a>
    </main>
  );
}
