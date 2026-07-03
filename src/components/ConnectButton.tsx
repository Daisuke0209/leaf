"use client";

import { useState, type ReactNode } from "react";

import { connectInteractive } from "@/lib/google/gis";

export const primaryClasses =
  "rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";

interface ConnectButtonProps {
  /** Retry hook run after a successful connect (profile subscribers are notified regardless). */
  onConnected?: () => void;
  className?: string;
  children?: ReactNode;
}

/**
 * Runs the interactive Google consent from a click (popups must come from a
 * user gesture) and calls `onConnected` on success. On failure (popup closed
 * or blocked) the button simply stays available.
 */
export default function ConnectButton({
  onConnected,
  className = primaryClasses,
  children = "Connect Google Drive",
}: ConnectButtonProps) {
  const [connecting, setConnecting] = useState(false);

  const handleClick = async () => {
    setConnecting(true);
    try {
      await connectInteractive();
    } catch {
      return;
    } finally {
      setConnecting(false);
    }
    onConnected?.();
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={connecting}
      className={className}
    >
      {connecting ? "Connecting…" : children}
    </button>
  );
}
