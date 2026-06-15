"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { messageAuditHref } from "@/lib/messages/source-links";

type SourceBadgesProps = {
  ids: string[];
};

const staleSourceNavigationParams = [
  "action",
  "auditView",
  "category",
  "channel",
  "flagged",
  "lifecycle",
  "message",
  "priority",
  "q",
  "sort",
  "status",
  "thread",
  "type"
];

export function SourceBadges({ ids }: SourceBadgesProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uniqueIds = [...new Set(ids.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return null;
  }

  function openSourceMessage(id: string, event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    const params = new URLSearchParams(searchParams.toString());
    staleSourceNavigationParams.forEach((key) => params.delete(key));
    params.set("view", "audit");
    params.set("auditView", "messages");
    params.set("message", id);

    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Source messages">
      {uniqueIds.map((id) => (
        <a
          key={id}
          className="source-badge"
          href={messageAuditHref(id)}
          onClick={(event) => openSourceMessage(id, event)}
          aria-label={`Open source message ${id}`}
        >
          #{id}
        </a>
      ))}
    </div>
  );
}
