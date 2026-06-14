import type { ThreadAnalysis } from "@/lib/ai/schemas";
import { LifecycleBadge } from "./status-badge";
import { SourceBadges } from "./source-badges";

export function ThreadCard({ thread }: { thread: ThreadAnalysis }) {
  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <LifecycleBadge value={thread.lifecycleStatus} />
            <span className="text-xs font-semibold text-stone-500">Latest #{thread.latestMessageId}</span>
          </div>
          <h3 className="mt-2 font-semibold text-ink">{thread.title}</h3>
        </div>
        <SourceBadges ids={thread.messageIds} />
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-700">{thread.currentState}</p>
    </article>
  );
}
