"use client";

import { ClipboardCopy } from "lucide-react";
import type { BriefingItem, DailyBriefing } from "@/lib/ai/schemas";
import { briefingDisplayText, splitBriefingBody } from "@/lib/ai/briefing-display";
import type { ActionWithWorkflow } from "@/lib/workflow/types";
import { briefingWordCount } from "@/lib/ai/briefing";
import { findActionForSourceIds, isHandledWorkflowStatus } from "@/lib/workflow/selectors";
import { PriorityBadge } from "./status-badge";
import { SourceBadges } from "./source-badges";
import { MorningProgressCard } from "./morning-progress";
import { WorkflowBadge } from "./workflow-badge";

type Progress = Parameters<typeof MorningProgressCard>[0]["progress"];

const briefingSections: Array<{
  key: keyof Pick<DailyBriefing, "urgent" | "decisions" | "flags" | "handled" | "personal">;
  label: string;
}> = [
  { key: "urgent", label: "Urgent" },
  { key: "decisions", label: "Decisions needed" },
  { key: "flags", label: "Flags" },
  { key: "handled", label: "Handled" },
  { key: "personal", label: "Personal" }
];

function actionLabel(action: ActionWithWorkflow | undefined, handledSection: boolean) {
  if (!action) {
    return handledSection ? "View handled thread" : "View sources";
  }
  if (action.kind === "decide") {
    return "Review decision";
  }
  if (action.kind === "delegate") {
    return "Review handoff";
  }
  if (action.flags.length > 0 || action.kind === "flag") {
    return "Review flag";
  }
  return "View details";
}

function itemCopyLine(item: BriefingItem, actions: ActionWithWorkflow[]) {
  const action = findActionForSourceIds(actions, item.sourceMessageIds);
  const title = briefingDisplayText(item.title);
  const { body } = splitBriefingBody(item.body, action?.missingContext ?? []);
  const sourceText = item.sourceMessageIds.map((id) => `#${id}`).join(", ");
  const mainText = body ? `${title}: ${body}` : title;

  return `- ${mainText} (${sourceText})`;
}

function BriefingRow({
  item,
  actions,
  handledSection,
  onOpenAction,
  onAudit
}: {
  item: BriefingItem;
  actions: ActionWithWorkflow[];
  handledSection: boolean;
  onOpenAction: (key: string) => void;
  onAudit: () => void;
}) {
  const action = findActionForSourceIds(actions, item.sourceMessageIds);
  const title = briefingDisplayText(item.title);
  const { body } = splitBriefingBody(item.body, action?.missingContext ?? []);

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge value={item.priority} />
        {action ? <WorkflowBadge status={action.workflow.status} /> : null}
        <h4 className="font-semibold text-ink">{title}</h4>
      </div>
      {body ? <p className="mt-2 text-sm leading-6 text-stone-700">{body}</p> : null}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SourceBadges ids={item.sourceMessageIds} />
        <button
          type="button"
          onClick={() => (action ? onOpenAction(action.key) : onAudit())}
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400"
        >
          {actionLabel(action, handledSection)}
        </button>
      </div>
    </li>
  );
}

export function BriefingWorkspace({
  briefing,
  actions,
  progress,
  deadlines,
  criticalFlags,
  onOpenAction,
  onAudit
}: {
  briefing: DailyBriefing;
  actions: ActionWithWorkflow[];
  progress: Progress;
  deadlines: ActionWithWorkflow[];
  criticalFlags: ActionWithWorkflow[];
  onOpenAction: (key: string) => void;
  onAudit: () => void;
}) {
  const wordCount = briefingWordCount(briefing);
  const title = briefingDisplayText(briefing.title);
  const overview = briefingDisplayText(briefing.overview);
  const copyText = [
    title,
    overview,
    ...briefingSections.flatMap((section) =>
      briefing[section.key].length > 0
        ? [
            section.label,
            ...briefing[section.key].map((item) => itemCopyLine(item, actions))
          ]
        : []
    )
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="panel rounded-lg p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">Daily briefing</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">{title}</h2>
            {overview ? <p className="mt-2 text-sm leading-6 text-stone-600">{overview}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-stone-700">{wordCount} words</span>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(copyText)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400"
            >
              <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
              Copy
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {briefingSections.map((section) => {
            const items = briefing[section.key];
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={section.key}>
                <h3 className="mb-2 text-sm font-bold uppercase text-stone-500">{section.label}</h3>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <BriefingRow
                      key={`${section.key}-${item.title}-${item.sourceMessageIds.join("-")}`}
                      item={item}
                      actions={actions}
                      handledSection={section.key === "handled"}
                      onOpenAction={onOpenAction}
                      onAudit={onAudit}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <aside className="space-y-5">
        <MorningProgressCard progress={progress} />
        <section className="panel rounded-lg p-5">
          <h2 className="font-semibold text-ink">Upcoming deadlines</h2>
          {deadlines.length === 0 ? (
            <p className="mt-3 text-sm text-stone-600">No active deadlines returned by the analysis.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {deadlines.map((action) => (
                <li key={action.key} className="rounded-md border border-line bg-white p-3">
                  <p className="text-sm font-semibold text-ink">{action.deadlineText ?? action.deadlineAt}</p>
                  <button type="button" onClick={() => onOpenAction(action.key)} className="mt-1 text-left text-sm text-stone-700 hover:text-mint">
                    {action.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel rounded-lg p-5">
          <h2 className="font-semibold text-ink">Critical flags</h2>
          {criticalFlags.length === 0 ? (
            <p className="mt-3 text-sm text-stone-600">No unresolved high or critical flags.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {criticalFlags.map((action) => (
                <li key={action.key} className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-900">{action.flags[0]?.title ?? action.title}</p>
                  <p className="mt-1 text-sm text-red-950">{action.flags[0]?.description ?? action.summary}</p>
                  <button
                    type="button"
                    onClick={() => onOpenAction(action.key)}
                    className="mt-2 text-sm font-semibold text-red-900 underline-offset-4 hover:underline"
                  >
                    View linked action
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-line bg-paper p-4 text-sm text-stone-700">
          Workflow updates are stored locally in this browser. No messages or tasks are sent.
          {actions.some((action) => isHandledWorkflowStatus(action.workflow.status)) ? (
            <p className="mt-2 font-semibold text-ink">Handled items remain auditable in the Audit Trail.</p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
