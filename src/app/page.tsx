"use client";

import Image from "next/image";
import Link from "next/link";
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
      <main className="mx-auto w-full max-w-xl px-6 py-20">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/icon.png" alt="" width={40} height={40} className="rounded-[10px]" />
          <h1 className="text-3xl font-bold tracking-tight">Leaf</h1>
        </div>
        <p className="mb-8 text-sm leading-relaxed text-muted">
          A Markdown editor for Google Drive, with a Notion-style writing
          experience. Connect Leaf to your Drive to get started.
        </p>
        <ConnectButton />
        <Footer />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-20">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/icon.png" alt="" width={40} height={40} className="rounded-[10px]" />
          <h1 className="text-3xl font-bold tracking-tight">Leaf</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {profile.name ?? profile.email ?? ""}
          </span>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="rounded-md border border-border-soft px-3 py-2 text-sm hover:bg-accent-soft"
          >
            Disconnect
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted">
        You’re connected. Leaf works from Google Drive:
      </p>
      <ul className="mb-10 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
        <li>
          <strong className="text-foreground">New page</strong>: in Drive,
          choose New → More → Leaf to create a Markdown file where you are.
        </li>
        <li>
          <strong className="text-foreground">Edit</strong>: right-click a
          Markdown file → Open with → Leaf.
        </li>
      </ul>
      <a href="https://drive.google.com" className={`inline-block ${primaryClasses}`}>
        Open Google Drive
      </a>
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="mt-16 flex gap-4 border-t border-border-soft pt-6 text-xs text-muted">
      <Link href="/privacy/" className="hover:underline">
        Privacy Policy
      </Link>
      <Link href="/terms/" className="hover:underline">
        Terms of Service
      </Link>
    </footer>
  );
}
