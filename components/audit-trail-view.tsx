"use client";

import { useEffect } from "react";
import type { AnalysisResult } from "@/lib/ai/schemas";
import { messageElementId } from "@/lib/messages/source-links";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import type { ActionWithWorkflow, AuditFilters } from "@/lib/workflow/types";
import { filterAuditMessages, filterAuditThreads } from "@/lib/workflow/selectors";
import { CategoryBadge, LifecycleBadge } from "./status-badge";
import { ChannelBadge } from "./channel-badge";
import { SourceBadges } from "./source-badges";

export function AuditTrailView({
  messages,
  analysis,
  actions,
  filters,
  targetMessageId,
  onFiltersChange,
  onOpenAction
}: {
  messages: NormalizedMessage[];
  analysis: AnalysisResult;
  actions: ActionWithWorkflow[];
  filters: AuditFilters;
  targetMessageId?: string | null;
  onFiltersChange: (patch: Partial<AuditFilters>) => void;
  onOpenAction: (key: string) => void;
}) {
  const analysisById = new Map(analysis.messageAnalyses.map((item) => [item.messageId, item]));
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const baseFilteredMessages = filterAuditMessages({ messages, analyses: analysis.messageAnalyses, filters });
  const targetMessage = targetMessageId ? messages.find((message) => message.id === targetMessageId) : undefined;
  const filteredMessages =
    targetMessage && !baseFilteredMessages.some((message) => message.id === targetMessage.id)
      ? [targetMessage, ...baseFilteredMessages]
      : baseFilteredMessages;
  const filteredThreads = filterAuditThreads(analysis.threads, filters);

  useEffect(() => {
    if (!targetMessageId || filters.view !== "messages") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(messageElementId(targetMessageId));
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "start" });
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [filters.view, targetMessageId]);

  return (
    <section className="space-y-5">
      <div className="panel rounded-lg p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">Traceability</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Audit Trail</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Immutable AI analysis and original source messages. Workflow updates do not change lifecycle, rationale, or message content.
            </p>
          </div>
          <div className="flex rounded-md border border-line bg-paper p-1">
            {(["messages", "threads"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => onFiltersChange({ view })}
                className={`min-h-9 rounded px-3 py-1.5 text-sm font-semibold capitalize ${filters.view === view ? "bg-ink text-white" : "text-stone-700 hover:bg-white"}`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <input
            value={filters.q}
            onChange={(event) => onFiltersChange({ q: event.target.value })}
            placeholder="Search audit"
            className="min-h-10 rounded-md border border-line bg-white px-3 py-2 text-sm lg:col-span-2"
          />
          <select value={filters.category} onChange={(event) => onFiltersChange({ category: event.target.value as AuditFilters["category"] })} className="min-h-10 rounded-md border border-line bg-white px-3 py-2 text-sm">
            <option value="all">All categories</option>
            <option value="decide">Decide</option>
            <option value="delegate">Delegate</option>
            <option value="ignore">Ignore</option>
          </select>
          <select value={filters.channel} onChange={(event) => onFiltersChange({ channel: event.target.value as AuditFilters["channel"] })} className="min-h-10 rounded-md border border-line bg-white px-3 py-2 text-sm">
            <option value="all">All channels</option>
            <option value="email">Email</option>
            <option value="slack">Slack</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="other">Other</option>
          </select>
          <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={filters.flagged} onChange={(event) => onFiltersChange({ flagged: event.target.checked })} />
            Flagged only
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["active", "superseded", "resolved", "informational"] as const).map((status) => {
            const checked = filters.lifecycle.includes(status);
            return (
              <label key={status} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-sm capitalize text-stone-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...filters.lifecycle, status]
                      : filters.lifecycle.filter((item) => item !== status);
                    onFiltersChange({ lifecycle: next });
                  }}
                />
                {status}
              </label>
            );
          })}
        </div>
      </div>

      {filters.view === "messages" ? (
        <div className="space-y-3">
          {filteredMessages.map((message) => {
            const item = analysisById.get(message.id);
            const isTargetedMessage = message.id === targetMessageId;
            return (
              <article
                key={message.id}
                id={messageElementId(message.id)}
                tabIndex={isTargetedMessage ? -1 : undefined}
                className={`scroll-mt-6 rounded-lg border bg-white p-4 outline-none ${
                  isTargetedMessage ? "border-mint ring-2 ring-mint/40" : "border-line"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">#{message.id}</span>
                      <ChannelBadge channel={message.channel} />
                      {item ? <CategoryBadge value={item.primaryCategory} /> : null}
                      {item ? <LifecycleBadge value={item.lifecycleStatus} /> : null}
                    </div>
                    <h3 className="mt-2 font-semibold text-ink">{message.subject ?? message.channelName ?? message.sender}</h3>
                    <p className="mt-1 text-sm text-stone-600">
                      {message.sender} · {new Date(message.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {item ? <span className="text-sm font-semibold text-stone-500">{Math.round(item.confidence * 100)}% confidence</span> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-md bg-paper/70 p-3 text-sm leading-6 text-stone-700">{message.body}</p>
                {item ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-md border border-line p-3 text-sm">
                      <p className="font-semibold text-ink">Rationale</p>
                      <p className="mt-1 text-stone-700">{item.rationale}</p>
                      <div className="mt-3">
                        <SourceBadges ids={item.relatedMessageIds} />
                      </div>
                    </div>
                    <div className="rounded-md border border-line p-3 text-sm">
                      <p className="font-semibold text-ink">Draft</p>
                      <p className="mt-1 capitalize text-stone-600">{item.draftedResponse.type.replaceAll("_", " ")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-stone-700">{item.draftedResponse.body}</p>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredThreads.map((thread) => {
            const linkedActions = actions.filter((action) => action.thread?.id === thread.id);
            return (
              <article key={thread.id} className="rounded-lg border border-line bg-white p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <LifecycleBadge value={thread.lifecycleStatus} />
                      <span className="text-xs font-semibold text-stone-500">{thread.messageIds.length} messages</span>
                      <span className="text-xs font-semibold text-stone-500">Latest #{thread.latestMessageId}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-ink">{thread.title}</h3>
                  </div>
                  <SourceBadges ids={thread.messageIds} />
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-700">{thread.currentState}</p>
                {linkedActions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {linkedActions.map((action) => (
                      <button key={action.key} type="button" onClick={() => onOpenAction(action.key)} className="min-h-9 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                        Open {action.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                <ol className="mt-4 space-y-2">
                  {thread.messageIds.map((id) => {
                    const message = messagesById.get(id);
                    const messageAnalysis = analysisById.get(id);
                    if (!message) {
                      return null;
                    }
                    return (
                      <li key={id} className="rounded-md bg-paper p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">{new Date(message.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                          <ChannelBadge channel={message.channel} />
                          {messageAnalysis ? <LifecycleBadge value={messageAnalysis.lifecycleStatus} /> : null}
                          <span>#{id}</span>
                        </div>
                        <p className="mt-1 text-stone-700">{message.body.length > 180 ? `${message.body.slice(0, 180)}...` : message.body}</p>
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
