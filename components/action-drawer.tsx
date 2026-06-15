"use client";

import { ClipboardCopy, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult } from "@/lib/ai/schemas";
import { messageElementId } from "@/lib/messages/source-links";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import type { ActionWithWorkflow, WorkflowMap } from "@/lib/workflow/types";
import {
  acknowledgeFlag,
  editDraft,
  markDelegated,
  markStatus,
  recordDecision,
  resetDraft
} from "@/lib/workflow/transitions";
import { getMessagesForAction } from "@/lib/workflow/selectors";
import { ChannelBadge } from "./channel-badge";
import { LifecycleBadge, PriorityBadge } from "./status-badge";
import { WorkflowBadge } from "./workflow-badge";
import { SourceBadges } from "./source-badges";

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function excerpt(body: string) {
  return body.length > 180 ? `${body.slice(0, 180)}...` : body;
}

export function ActionDrawer({
  action,
  messages,
  analysis,
  onClose,
  onWorkflowMapChange
}: {
  action: ActionWithWorkflow | null;
  messages: NormalizedMessage[];
  analysis: AnalysisResult | null;
  onClose: () => void;
  onWorkflowMapChange: (updater: (current: WorkflowMap) => WorkflowMap) => void;
}) {
  if (!action) {
    return null;
  }

  return (
    <ActionDrawerContent
      key={action.key}
      action={action}
      messages={messages}
      analysis={analysis}
      onClose={onClose}
      onWorkflowMapChange={onWorkflowMapChange}
    />
  );
}

function ActionDrawerContent({
  action,
  messages,
  analysis,
  onClose,
  onWorkflowMapChange
}: {
  action: ActionWithWorkflow;
  messages: NormalizedMessage[];
  analysis: AnalysisResult | null;
  onClose: () => void;
  onWorkflowMapChange: (updater: (current: WorkflowMap) => WorkflowMap) => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const timelineMessages = useMemo(() => getMessagesForAction(action, messages), [action, messages]);
  const analysisById = useMemo(
    () => new Map((analysis?.messageAnalyses ?? []).map((message) => [message.messageId, message])),
    [analysis]
  );
  const aiDraft = action.draftedResponse;
  const [draftBody, setDraftBody] = useState(action.workflow.editedDraft?.body ?? action.draftedResponse?.body ?? "");
  const [decisionChoice, setDecisionChoice] = useState(action.workflow.selectedOption ?? action.item?.options?.[0]?.label ?? "");
  const [customDecision, setCustomDecision] = useState(action.workflow.customDecision ?? "");
  const [owner, setOwner] = useState(action.workflow.assignedTo ?? action.ownerRole ?? "");
  const [note, setNote] = useState(action.workflow.privateNote ?? action.workflow.resolutionNote ?? "");

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          drawerRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((element) => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [action, onClose]);

  const currentAction = action;
  const options = currentAction.item?.options ?? [];

  function updateWorkflow(updater: (current: WorkflowMap) => WorkflowMap) {
    onWorkflowMapChange(updater);
  }

  function saveDraft() {
    updateWorkflow((current) => editDraft(current, currentAction.key, draftBody, currentAction.draftedResponse?.subject ?? null));
  }

  function recordCurrentDecision(status: "in_progress" | "waiting") {
    updateWorkflow((current) =>
      recordDecision(current, currentAction.key, {
        selectedOption: decisionChoice || null,
        customDecision: customDecision.trim() || null,
        resolutionNote: note.trim() || null,
        privateNote: note.trim() || null,
        status
      })
    );
  }

  function markCurrentDelegated() {
    updateWorkflow((current) =>
      markDelegated(current, currentAction.key, {
        assignedTo: owner.trim() || currentAction.ownerRole,
        resolutionNote: note.trim() || null,
        privateNote: note.trim() || null
      })
    );
  }

  function markCurrentComplete() {
    updateWorkflow((current) => markStatus(current, currentAction.key, "completed"));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="action-drawer-title">
      <button type="button" className="absolute inset-0 cursor-default bg-ink/35" aria-label="Close action details" onClick={onClose} />
      <aside ref={drawerRef} className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl lg:border-l lg:border-line">
        <header className="sticky top-0 z-10 border-b border-line bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge value={action.priority} />
                <WorkflowBadge status={action.workflow.status} />
                <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-semibold capitalize text-stone-700">
                  AI action: {action.kind}
                </span>
              </div>
              <h2 id="action-drawer-title" className="mt-3 text-xl font-semibold text-ink">
                {action.title}
              </h2>
              <p className="mt-1 text-sm text-stone-600">{action.sourceMessageIds.length} source messages</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white text-ink hover:border-stone-400"
              aria-label="Close action details"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h3 className="text-sm font-bold uppercase text-stone-500">Current state</h3>
            <p className="mt-2 text-sm leading-6 text-stone-700">{action.summary}</p>
            <div className="mt-3">
              <SourceBadges ids={action.sourceMessageIds} />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-paper p-4">
            <h3 className="font-semibold text-ink">Required action</h3>
            {action.kind === "decide" ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="font-medium text-ink">{action.decisionQuestion ?? "Record the CEO decision for this item."}</p>
                {options.length > 0 ? (
                  <fieldset className="space-y-2">
                    <legend className="font-semibold text-stone-700">Grounded options</legend>
                    {options.map((option) => (
                      <label key={option.label} className="flex gap-2 rounded-md border border-line bg-white p-3">
                        <input
                          type="radio"
                          name={`decision-${action.key}`}
                          checked={decisionChoice === option.label}
                          onChange={() => setDecisionChoice(option.label)}
                        />
                        <span>
                          <span className="font-semibold text-ink">{option.label}</span>
                          <span className="block text-stone-600">{option.tradeoff}</span>
                        </span>
                      </label>
                    ))}
                    <label className="flex gap-2 rounded-md border border-line bg-white p-3">
                      <input
                        type="radio"
                        name={`decision-${action.key}`}
                        checked={decisionChoice === "Request more information"}
                        onChange={() => setDecisionChoice("Request more information")}
                      />
                      <span>Request more information</span>
                    </label>
                  </fieldset>
                ) : null}
                <label className="block">
                  <span className="font-semibold text-stone-700">Different decision</span>
                  <textarea
                    value={customDecision}
                    onChange={(event) => setCustomDecision(event.target.value)}
                    className="mt-1 min-h-20 w-full rounded-md border border-line bg-white p-3 text-sm"
                    placeholder="Record a different decision without sending anything"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-stone-700">Private note</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="mt-1 min-h-16 w-full rounded-md border border-line bg-white p-3 text-sm"
                    placeholder="Optional local note"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => recordCurrentDecision("in_progress")} className="min-h-10 rounded-md bg-ink px-4 py-2 font-semibold text-white">
                    Record decision
                  </button>
                  <button type="button" onClick={() => recordCurrentDecision("waiting")} className="min-h-10 rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink">
                    Record and wait
                  </button>
                </div>
              </div>
            ) : action.kind === "delegate" ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="text-stone-700">Demo only: this records the intended delegation locally. It does not notify the assignee.</p>
                <label className="block">
                  <span className="font-semibold text-stone-700">Owner</span>
                  <input value={owner} onChange={(event) => setOwner(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-line bg-white px-3 py-2" />
                </label>
                <label className="block">
                  <span className="font-semibold text-stone-700">Private note</span>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 min-h-16 w-full rounded-md border border-line bg-white p-3" />
                </label>
                <button type="button" onClick={markCurrentDelegated} className="min-h-10 rounded-md bg-ink px-4 py-2 font-semibold text-white">
                  Mark delegated
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => updateWorkflow((current) => acknowledgeFlag(current, action.key))} className="min-h-10 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
                  Acknowledge
                </button>
                <button type="button" onClick={() => updateWorkflow((current) => markStatus(current, action.key, "dismissed"))} className="min-h-10 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
                  Dismiss as reviewed
                </button>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => updateWorkflow((current) => markStatus(current, action.key, "waiting"))} className="min-h-9 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                Move to waiting
              </button>
              <button type="button" onClick={markCurrentComplete} className="min-h-9 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                Mark complete
              </button>
              <button type="button" onClick={() => updateWorkflow((current) => markStatus(current, action.key, "open"))} className="min-h-9 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                Reopen
              </button>
            </div>
          </section>

          {action.draftedResponse ? (
            <section className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">Draft only — not sent</h3>
                  <p className="text-sm text-stone-600 capitalize">{action.draftedResponse.type.replaceAll("_", " ")}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void navigator.clipboard.writeText(draftBody)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                    <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftBody(aiDraft?.body ?? "");
                      updateWorkflow((current) => resetDraft(current, action.key));
                    }}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Reset
                  </button>
                </div>
              </div>
              <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} className="mt-3 min-h-36 w-full rounded-md border border-line bg-paper p-3 text-sm leading-6" />
              <button type="button" onClick={saveDraft} className="mt-3 min-h-9 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                Save draft edit locally
              </button>
            </section>
          ) : null}

          {action.missingContext.length > 0 ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <h3 className="font-semibold">Missing context</h3>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {action.missingContext.map((context) => (
                  <li key={context}>{context}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {action.flags.length > 0 ? (
            <section>
              <h3 className="text-sm font-bold uppercase text-stone-500">Related flags</h3>
              <div className="mt-2 space-y-2">
                {action.flags.map((flag) => (
                  <article key={flag.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                    <p className="font-semibold">{flag.title}</p>
                    <p className="mt-1">{flag.description}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-sm font-bold uppercase text-stone-500">Thread timeline</h3>
            <ol className="mt-3 space-y-2">
              {timelineMessages.map((message) => {
                const messageAnalysis = analysisById.get(message.id);
                return (
                  <li key={message.id} className="rounded-md border border-line bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-ink">{formatTime(message.timestamp)}</span>
                      <ChannelBadge channel={message.channel} />
                      {messageAnalysis ? <LifecycleBadge value={messageAnalysis.lifecycleStatus} /> : null}
                      <span className="text-stone-600">#{message.id}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink">{message.sender}</p>
                    <p className="mt-1 text-sm leading-6 text-stone-700">{excerpt(message.body)}</p>
                  </li>
                );
              })}
            </ol>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase text-stone-500">Original messages</h3>
            <div className="mt-3 space-y-2">
              {timelineMessages.map((message) => (
                <details key={message.id} id={messageElementId(message.id)} className="rounded-md border border-line bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    #{message.id} · {message.subject ?? message.channelName ?? message.sender}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{message.body}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
