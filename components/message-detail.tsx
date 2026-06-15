import type { MessageAnalysis } from "@/lib/ai/schemas";
import { messageElementId } from "@/lib/messages/source-links";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import { ChannelBadge } from "./channel-badge";
import { CategoryBadge, LifecycleBadge } from "./status-badge";
import { SourceBadges } from "./source-badges";

export function MessageDetail({
  message,
  analysis
}: {
  message: NormalizedMessage;
  analysis?: MessageAnalysis;
}) {
  return (
    <article id={messageElementId(message.id)} className="scroll-mt-6 rounded-lg border border-line bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink">#{message.id}</span>
            <ChannelBadge channel={message.channel} />
            {analysis ? <CategoryBadge value={analysis.primaryCategory} /> : null}
            {analysis ? <LifecycleBadge value={analysis.lifecycleStatus} /> : null}
          </div>
          <h3 className="mt-2 font-semibold text-ink">{message.subject ?? message.channelName ?? message.sender}</h3>
          <p className="mt-1 text-sm text-stone-600">
            {message.sender} · {new Date(message.timestamp).toLocaleString()}
          </p>
        </div>
        {analysis ? <span className="text-sm font-semibold text-stone-500">{Math.round(analysis.confidence * 100)}% confidence</span> : null}
      </div>

      <p className="mt-3 whitespace-pre-wrap rounded-md bg-paper/70 p-3 text-sm leading-6 text-stone-700">{message.body}</p>

      {analysis ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-line p-3 text-sm">
            <p className="font-semibold text-ink">Rationale</p>
            <p className="mt-1 text-stone-700">{analysis.rationale}</p>
            {analysis.relatedMessageIds.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1 font-semibold text-ink">Related</p>
                <SourceBadges ids={analysis.relatedMessageIds} />
              </div>
            ) : null}
          </div>
          <div className="rounded-md border border-line p-3 text-sm">
            <p className="font-semibold text-ink">Drafted response or handoff</p>
            <p className="mt-1 font-medium capitalize text-stone-600">{analysis.draftedResponse.type.replaceAll("_", " ")}</p>
            {analysis.draftedResponse.to ? <p className="mt-1 text-stone-600">To: {analysis.draftedResponse.to}</p> : null}
            {analysis.draftedResponse.subject ? <p className="text-stone-600">Subject: {analysis.draftedResponse.subject}</p> : null}
            <p className="mt-2 whitespace-pre-wrap text-stone-700">{analysis.draftedResponse.body}</p>
          </div>
        </div>
      ) : null}

      {analysis && analysis.actionItems.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Extracted actions</p>
          <ul className="mt-2 grid gap-2 lg:grid-cols-2">
            {analysis.actionItems.map((item) => (
              <li key={item.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge value={item.category} />
                  <span className="font-semibold text-ink">{item.title}</span>
                </div>
                <p className="mt-2 text-stone-700">{item.description}</p>
                {item.ownerRole ? <p className="mt-1 text-stone-600">Owner: {item.ownerRole}</p> : null}
                {item.decisionRequired ? <p className="mt-1 text-stone-600">Decision: {item.decisionRequired}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
