import { AlertTriangle, CheckCircle2, Clock, Search } from "lucide-react";
import type { ActionFilters, ActionWithWorkflow, WorkflowMap, WorkflowStatus } from "@/lib/workflow/types";
import { filterActions, isHandledWorkflowStatus } from "@/lib/workflow/selectors";
import { markStatus } from "@/lib/workflow/transitions";
import { CategoryBadge, PriorityBadge } from "./status-badge";
import { WorkflowBadge } from "./workflow-badge";
import { SourceBadges } from "./source-badges";

const filterTabs: Array<{
  label: string;
  filters: Partial<ActionFilters>;
  count: (actions: ActionWithWorkflow[]) => number;
}> = [
  { label: "All", filters: { type: "all", status: "active", flagged: false }, count: (actions) => actions.filter((action) => !isHandledWorkflowStatus(action.workflow.status)).length },
  { label: "Decisions", filters: { type: "decide", status: "active", flagged: false }, count: (actions) => actions.filter((action) => action.kind === "decide" && !isHandledWorkflowStatus(action.workflow.status)).length },
  { label: "Delegations", filters: { type: "delegate", status: "active", flagged: false }, count: (actions) => actions.filter((action) => action.kind === "delegate" && !isHandledWorkflowStatus(action.workflow.status)).length },
  { label: "Flags", filters: { type: "flag", status: "active", flagged: true }, count: (actions) => actions.filter((action) => action.flags.length > 0 && !isHandledWorkflowStatus(action.workflow.status)).length },
  { label: "Waiting", filters: { type: "all", status: "waiting", flagged: false }, count: (actions) => actions.filter((action) => action.workflow.status === "waiting").length },
  { label: "Completed", filters: { type: "all", status: "completed", flagged: false }, count: (actions) => actions.filter((action) => action.workflow.status === "completed").length }
];

function primaryActionLabel(action: ActionWithWorkflow) {
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

function aiCategoryForAction(action: ActionWithWorkflow) {
  if (action.kind === "delegate" || action.kind === "decide") {
    return action.kind;
  }
  return "ignore";
}

export function ActionCenter({
  actions,
  filters,
  onFiltersChange,
  onOpenAction,
  onWorkflowMapChange
}: {
  actions: ActionWithWorkflow[];
  filters: ActionFilters;
  onFiltersChange: (patch: Partial<ActionFilters>) => void;
  onOpenAction: (actionKey: string) => void;
  onWorkflowMapChange: (updater: (current: WorkflowMap) => WorkflowMap) => void;
}) {
  const filteredActions = filterActions(actions, filters);
  const unresolvedCount = actions.filter((action) => !isHandledWorkflowStatus(action.workflow.status)).length;

  function quickStatus(actionKey: string, status: WorkflowStatus) {
    onWorkflowMapChange((current) => markStatus(current, actionKey, status));
  }

  return (
    <section className="space-y-5">
      <div className="panel rounded-lg p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">Operational queue</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Action Center</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Record decisions, intended delegations, acknowledgements, and review state locally. No messages are sent and nobody is notified.
            </p>
          </div>
          <div className="rounded-md border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink">
            {unresolvedCount} unresolved
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Action filters">
          {filterTabs.map((tab) => {
            const isActive =
              filters.type === (tab.filters.type ?? filters.type) &&
              filters.status === (tab.filters.status ?? filters.status) &&
              filters.flagged === (tab.filters.flagged ?? filters.flagged);
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => onFiltersChange(tab.filters)}
                className={`inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold ${
                  isActive ? "border-ink bg-ink text-white" : "border-line bg-white text-stone-700 hover:border-stone-400"
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-white/20" : "bg-paper"}`}>{tab.count(actions)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="relative block">
            <span className="sr-only">Search actions</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              value={filters.q}
              onChange={(event) => onFiltersChange({ q: event.target.value })}
              placeholder="Search title, owner, source ID"
              className="min-h-10 w-full rounded-md border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink"
            />
          </label>
          <label className="block">
            <span className="sr-only">Priority</span>
            <select
              value={filters.priority}
              onChange={(event) => onFiltersChange({ priority: event.target.value as ActionFilters["priority"] })}
              className="min-h-10 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Sort</span>
            <select
              value={filters.sort}
              onChange={(event) => onFiltersChange({ sort: event.target.value as ActionFilters["sort"] })}
              className="min-h-10 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="urgency">Sort by urgency</option>
              <option value="deadline">Sort by deadline</option>
              <option value="updated">Sort by updated</option>
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {filteredActions.length === 0 ? (
          <div className="panel rounded-lg p-8 text-center text-sm text-stone-600">No actions match these filters.</div>
        ) : (
          filteredActions.map((action) => (
            <article key={action.key} className="rounded-lg border border-line bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge value={action.priority} />
                    <WorkflowBadge status={action.workflow.status} />
                    <CategoryBadge value={aiCategoryForAction(action)} />
                    {action.flags.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-800">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        Flagged
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-ink">{action.title}</h3>
                </div>
                <SourceBadges ids={action.sourceMessageIds} />
              </div>

              <p className="mt-3 text-sm leading-6 text-stone-700">{action.summary}</p>

              <div className="mt-4 flex flex-wrap gap-3 text-sm text-stone-600">
                {action.deadlineText ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    Due: {action.deadlineText}
                  </span>
                ) : null}
                {action.ownerRole ? <span>Owner: {action.workflow.assignedTo ?? action.ownerRole}</span> : null}
                <span>{action.sourceMessageIds.length} source messages</span>
                {action.thread ? <span>Latest #{action.thread.latestMessageId}</span> : null}
              </div>

              {action.workflow.status !== "open" ? (
                <div className="mt-4 rounded-md bg-paper p-3 text-sm text-stone-700">
                  {action.workflow.selectedOption || action.workflow.customDecision ? (
                    <p>
                      Decision: <span className="font-semibold text-ink">{action.workflow.customDecision ?? action.workflow.selectedOption}</span>
                    </p>
                  ) : null}
                  {action.workflow.assignedTo ? (
                    <p>
                      Waiting on <span className="font-semibold text-ink">{action.workflow.assignedTo}</span>
                    </p>
                  ) : null}
                  {action.workflow.resolutionNote ? <p className="mt-1">{action.workflow.resolutionNote}</p> : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenAction(action.key)}
                  className="inline-flex min-h-10 items-center rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
                >
                  {primaryActionLabel(action)}
                </button>
                {action.workflow.status === "waiting" || action.workflow.status === "in_progress" ? (
                  <button
                    type="button"
                    onClick={() => quickStatus(action.key, "completed")}
                    className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Mark complete
                  </button>
                ) : null}
                {isHandledWorkflowStatus(action.workflow.status) ? (
                  <button
                    type="button"
                    onClick={() => quickStatus(action.key, "open")}
                    className="inline-flex min-h-10 items-center rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400"
                  >
                    Reopen
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
