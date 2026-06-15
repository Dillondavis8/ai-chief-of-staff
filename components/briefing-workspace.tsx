"use client";

import { CheckCircle2, ClipboardCopy } from "lucide-react";
import type { BriefingItem, DailyBriefing } from "@/lib/ai/schemas";
import { briefingDisplayText, splitBriefingBody } from "@/lib/ai/briefing-display";
import type { ActionWithWorkflow, CriticalFlagHighlight } from "@/lib/workflow/types";
import { findActionForSourceIds, getBriefingActionGroups } from "@/lib/workflow/selectors";
import { PriorityBadge } from "./status-badge";
import { SourceBadges } from "./source-badges";
import { MorningProgressCard } from "./morning-progress";
import { WorkflowBadge } from "./workflow-badge";

type Progress = Parameters<typeof MorningProgressCard>[0]["progress"];

const activeBriefingSections: Array<{
  key: keyof Pick<DailyBriefing, "urgent" | "decisions" | "flags" | "handled" | "personal">;
  label: string;
}> = [
  { key: "urgent", label: "Urgent" },
  { key: "decisions", label: "Decisions needed" },
  { key: "flags", label: "Flags" },
  { key: "personal", label: "Personal" }
];

const prioritySections: Array<{
  key: ActionWithWorkflow["priority"];
  label: string;
}> = [
  { key: "urgent", label: "Urgent" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" }
];

const priorityHeadingClasses: Record<ActionWithWorkflow["priority"], string> = {
  urgent: "border-red-500 text-red-800",
  high: "border-orange-500 text-orange-800",
  medium: "border-amber-500 text-amber-800",
  low: "border-stone-500 text-stone-700"
};

type BriefingEntry = {
  key: string;
  action: ActionWithWorkflow;
  item: BriefingItem | null;
};

type StaticBriefingEntry = {
  key: string;
  item: BriefingItem;
};

type DisplayBriefingEntry = BriefingEntry | StaticBriefingEntry;

function sourceKey(ids: string[]) {
  return [...ids].sort().join(",");
}

function titleTokens(title: string) {
  const stopWords = new Set(["and", "or", "the", "a", "an", "to", "for", "with", "on", "of", "in", "update"]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => (token.length > 3 ? token.replace(/s$/, "") : token))
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function titleOverlap(left: string, right: string) {
  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  if (smaller === 0) {
    return 0;
  }

  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  });

  return shared / smaller;
}

function sharesSourceIds(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.some((id) => rightSet.has(id));
}

function workflowStatusLabel(status: ActionWithWorkflow["workflow"]["status"]) {
  const labels: Record<ActionWithWorkflow["workflow"]["status"], string> = {
    open: "Open",
    in_progress: "In progress",
    waiting: "Waiting",
    completed: "Completed",
    dismissed: "Dismissed"
  };
  return labels[status];
}

function waitingLine(action: ActionWithWorkflow) {
  const owner = action.workflow.assignedTo ?? action.ownerRole;
  if (owner) {
    return `Waiting on ${owner}`;
  }
  if (action.kind === "decide") {
    return "Waiting on more information";
  }
  return "Waiting on follow-up";
}

function handledLine(action: ActionWithWorkflow) {
  const title = briefingDisplayText(action.title);
  const lowerTitle = title.toLowerCase();
  if (action.workflow.status === "dismissed") {
    return `${title} reviewed`;
  }
  if (action.kind === "decide") {
    return lowerTitle.includes("decision") ? `${title} recorded` : `${title} decision recorded`;
  }
  if (action.kind === "delegate") {
    return lowerTitle.includes("handoff") ? `${title} completed` : `${title} handoff completed`;
  }
  if (action.kind === "flag" || action.flags.length > 0) {
    return `${title} acknowledged`;
  }
  return `${title} completed`;
}

function itemKey(item: BriefingItem, prefix: string) {
  return `${prefix}-${item.title}-${sourceKey(item.sourceMessageIds)}`;
}

function briefingItemActionScore(item: BriefingItem, action: ActionWithWorkflow) {
  if (!sharesSourceIds(item.sourceMessageIds, action.sourceMessageIds)) {
    return 0;
  }

  const sourceScore = sourceKey(item.sourceMessageIds) === sourceKey(action.sourceMessageIds) ? 4 : 2;
  return sourceScore + titleOverlap(item.title, action.title);
}

function findActionForBriefingItem(actions: ActionWithWorkflow[], item: BriefingItem): ActionWithWorkflow | null {
  let bestAction: ActionWithWorkflow | null = null;
  let bestScore = 0;

  for (const action of actions) {
    const score = briefingItemActionScore(item, action);
    if (score === 0) {
      continue;
    }

    if (!bestAction || score > bestScore) {
      bestAction = action;
      bestScore = score;
    }
  }

  return bestAction;
}

function isActionEntry(entry: DisplayBriefingEntry): entry is BriefingEntry {
  return "action" in entry;
}

function entryPriority(entry: DisplayBriefingEntry) {
  return isActionEntry(entry) ? entry.action.priority : entry.item.priority;
}

function groupEntriesByPriority(entries: DisplayBriefingEntry[]) {
  return prioritySections
    .map((section) => ({
      ...section,
      entries: entries.filter((entry) => entryPriority(entry) === section.key)
    }))
    .filter((section) => section.entries.length > 0);
}

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

function ActionBriefingRow({
  entry,
  meta,
  onOpenAction
}: {
  entry: BriefingEntry;
  meta: string;
  onOpenAction: (key: string) => void;
}) {
  const title = briefingDisplayText(entry.item?.title ?? entry.action.title);
  const { body } = splitBriefingBody(entry.item?.body ?? entry.action.summary, entry.action.missingContext);

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge value={entry.action.priority} />
            <h4 className="font-semibold text-ink">{title}</h4>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase text-stone-500">{meta}</p>
          {body ? <p className="mt-2 text-sm leading-6 text-stone-700">{body}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onOpenAction(entry.action.key)}
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400"
        >
          {actionLabel(entry.action, false)}
        </button>
      </div>
      <div className="mt-3">
        <SourceBadges ids={entry.action.sourceMessageIds} />
      </div>
    </li>
  );
}

function handledEntryLabel(entry: BriefingEntry | StaticBriefingEntry) {
  if ("action" in entry) {
    return handledLine(entry.action);
  }
  return briefingDisplayText(entry.item.title);
}

function handledEntrySourceIds(entry: BriefingEntry | StaticBriefingEntry) {
  return "action" in entry ? entry.action.sourceMessageIds : entry.item.sourceMessageIds;
}

function entryCopyLine(entry: BriefingEntry) {
  const title = briefingDisplayText(entry.item?.title ?? entry.action.title);
  const { body } = splitBriefingBody(entry.item?.body ?? entry.action.summary, entry.action.missingContext);
  const sourceText = entry.action.sourceMessageIds.map((id) => `#${id}`).join(", ");
  const mainText = body ? `${title}: ${body}` : title;
  return `- ${mainText} (${sourceText})`;
}

function staticEntryCopyLine(entry: StaticBriefingEntry) {
  const title = briefingDisplayText(entry.item.title);
  const { body } = splitBriefingBody(entry.item.body);
  const sourceText = entry.item.sourceMessageIds.map((id) => `#${id}`).join(", ");
  const mainText = body ? `${title}: ${body}` : title;
  return `- ${mainText} (${sourceText})`;
}

function displayEntryCopyLine(entry: DisplayBriefingEntry) {
  return isActionEntry(entry) ? entryCopyLine(entry) : staticEntryCopyLine(entry);
}

function priorityGroupCopyLines(groups: ReturnType<typeof groupEntriesByPriority>) {
  return groups.flatMap((group) => [group.label.toUpperCase(), ...group.entries.map(displayEntryCopyLine)]);
}

function displayEntryKey(entry: DisplayBriefingEntry) {
  if (isActionEntry(entry)) {
    return entry.action.key;
  }

  return itemKey(entry.item, "static");
}

function uniqueDisplayEntries(entries: DisplayBriefingEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = displayEntryKey(entry);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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
  criticalFlags: CriticalFlagHighlight[];
  onOpenAction: (key: string) => void;
  onAudit: () => void;
}) {
  const title = briefingDisplayText(briefing.title);
  const overview = briefingDisplayText(briefing.overview);
  const actionGroups = getBriefingActionGroups(actions);
  const attentionActionKeys = new Set(actionGroups.attention.map((action) => action.key));
  const waitingActionKeys = new Set(actionGroups.waiting.map((action) => action.key));
  const handledActionKeys = new Set(actionGroups.handled.map((action) => action.key));
  const activeBriefingItems = activeBriefingSections.flatMap((section) =>
    briefing[section.key].map((item) => ({
      key: itemKey(item, section.key),
      item
    }))
  );
  const activeDisplayEntries = uniqueDisplayEntries(
    activeBriefingItems.map((entry): DisplayBriefingEntry => {
      const action = findActionForBriefingItem(actions, entry.item);
      return action
        ? {
            key: action.key,
            action,
            item: entry.item
          }
        : entry;
    })
  );
  const attentionDisplayEntries = activeDisplayEntries.filter(
    (entry) => (isActionEntry(entry) ? attentionActionKeys.has(entry.action.key) : actions.length === 0)
  );
  const waitingEntries = activeDisplayEntries.filter(
    (entry): entry is BriefingEntry => isActionEntry(entry) && waitingActionKeys.has(entry.action.key)
  );
  const handledActionEntries = activeDisplayEntries.filter(
    (entry): entry is BriefingEntry => isActionEntry(entry) && handledActionKeys.has(entry.action.key)
  );
  const handledStaticEntries = briefing.handled
    .filter((item) => !actions.some((action) => sharesSourceIds(action.sourceMessageIds, item.sourceMessageIds)))
    .map((item) => ({
      key: itemKey(item, "handled"),
      item
    }));
  const attentionPriorityGroups = groupEntriesByPriority(attentionDisplayEntries);
  const waitingPriorityGroups = groupEntriesByPriority(waitingEntries);
  const handledEntries = [...handledActionEntries, ...handledStaticEntries];
  const copyText = [
    title,
    overview,
    attentionDisplayEntries.length > 0
      ? ["NEEDS YOUR ATTENTION", ...priorityGroupCopyLines(attentionPriorityGroups)].join("\n")
      : null,
    waitingEntries.length > 0 ? ["WAITING ON OTHERS", ...priorityGroupCopyLines(waitingPriorityGroups)].join("\n") : null,
    handledEntries.length > 0
      ? [
          `HANDLED TODAY · ${handledEntries.length}`,
          ...handledEntries.map((entry) => `- ${handledEntryLabel(entry)} (${handledEntrySourceIds(entry).map((id) => `#${id}`).join(", ")})`)
        ].join("\n")
      : null
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
          {attentionPriorityGroups.length > 0 ? (
            <section>
              <h3 className="mb-3 inline-block border-b border-ink pb-0.5 text-sm font-bold uppercase text-ink">
                Needs your attention
              </h3>
              <div className="space-y-4">
                {attentionPriorityGroups.map((group) => (
                  <div key={`attention-${group.key}`}>
                    <h4 className={`mb-2 inline-block text-xs font-bold uppercase ${priorityHeadingClasses[group.key]}`}>
                      {group.label}
                    </h4>
                    <ul className="space-y-2">
                      {group.entries.map((entry) =>
                        isActionEntry(entry) ? (
                          <ActionBriefingRow
                            key={entry.key}
                            entry={entry}
                            meta={workflowStatusLabel(entry.action.workflow.status)}
                            onOpenAction={onOpenAction}
                          />
                        ) : (
                          <BriefingRow
                            key={entry.key}
                            item={entry.item}
                            actions={actions}
                            handledSection={false}
                            onOpenAction={onOpenAction}
                            onAudit={onAudit}
                          />
                        )
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {waitingPriorityGroups.length > 0 ? (
            <section>
              <h3 className="mb-3 inline-block border-b border-ink pb-0.5 text-sm font-bold uppercase text-ink">
                Waiting on others
              </h3>
              <div className="space-y-4">
                {waitingPriorityGroups.map((group) => (
                  <div key={`waiting-${group.key}`}>
                    <h4 className={`mb-2 inline-block text-xs font-bold uppercase ${priorityHeadingClasses[group.key]}`}>
                      {group.label}
                    </h4>
                    <ul className="space-y-2">
                      {group.entries.map((entry) =>
                        isActionEntry(entry) ? (
                          <ActionBriefingRow key={entry.key} entry={entry} meta={waitingLine(entry.action)} onOpenAction={onOpenAction} />
                        ) : null
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {handledEntries.length > 0 ? (
            <section className="rounded-md border border-emerald-200 bg-emerald-50/70 p-4">
              <h3 className="inline-block border-b border-ink pb-0.5 text-sm font-bold uppercase text-ink">
                Handled today · {handledEntries.length}
              </h3>
              <ul className="mt-3 divide-y divide-emerald-200/80">
                {handledEntries.map((entry) => (
                  <li key={entry.key} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => ("action" in entry ? onOpenAction(entry.action.key) : onAudit())}
                      className="text-left text-sm font-semibold text-emerald-950 hover:underline"
                    >
                      {handledEntryLabel(entry)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {attentionDisplayEntries.length === 0 && waitingEntries.length === 0 && handledEntries.length === 0 ? (
            <p className="rounded-md border border-line bg-white p-4 text-sm text-stone-600">No briefing items require CEO attention right now.</p>
          ) : null}
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
              {criticalFlags.map((highlight) => (
                <li key={highlight.key} className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-900">{highlight.flag.title}</p>
                  <p className="mt-1 text-sm text-red-950">{highlight.flag.description}</p>
                  <button
                    type="button"
                    onClick={() => onOpenAction(highlight.actionKey)}
                    className="mt-2 text-sm font-semibold text-red-900 underline-offset-4 hover:underline"
                  >
                    View linked action
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
