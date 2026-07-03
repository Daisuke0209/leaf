"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import type { CollabSession } from "@/lib/collab";

interface Other {
  id: number;
  name: string;
  color: string;
}

/** Other collaborators currently in the room (self excluded). */
function useOthers(session: CollabSession): Other[] {
  const othersRef = useRef<Other[]>([]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const awareness = session.provider.awareness;
      const handler = () => {
        const next: Other[] = [];
        for (const [id, state] of awareness.getStates()) {
          if (id === session.doc.clientID) continue;
          const user = (state as { user?: { name?: string; color?: string } })
            .user;
          next.push({
            id,
            name: user?.name ?? "?",
            color: user?.color ?? "#8a867c",
          });
        }
        othersRef.current = next;
        onChange();
      };
      awareness.on("change", handler);
      return () => awareness.off("change", handler);
    },
    [session]
  );

  return useSyncExternalStore(
    subscribe,
    () => othersRef.current,
    () => []
  );
}

const MAX_AVATARS = 4;

/** Overlapping colored initials for everyone else in the room. */
export default function PresenceAvatars({
  session,
}: {
  session: CollabSession;
}) {
  const others = useOthers(session);
  if (others.length === 0) {
    return null;
  }
  const shown = others.slice(0, MAX_AVATARS);
  const overflow = others.length - shown.length;
  return (
    <span className="flex items-center" aria-label={`${others.length} people here`}>
      {shown.map((other) => (
        <span
          key={other.id}
          title={other.name}
          style={{ backgroundColor: other.color }}
          className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background first:ml-0"
        >
          {(other.name[0] ?? "?").toUpperCase()}
        </span>
      ))}
      {overflow > 0 && (
        <span className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-white ring-2 ring-background">
          +{overflow}
        </span>
      )}
    </span>
  );
}
