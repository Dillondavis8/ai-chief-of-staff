import type {
  AnalysisResult,
  ExecutiveFlag,
  ExecutiveItem,
  MessageAnalysis,
  Priority,
  ThreadAnalysis
} from "@/lib/ai/schemas";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import { compareMessageTime } from "@/lib/messages/dates";
import { createActionKey, createFlagActionKey } from "./action-keys";
import { createDefaultWorkflowState } from "./storage";
import type {
  ActionFilters,
  ActionWithWorkflow,
  AuditFilters,
  CanonicalAction,
  WorkflowMap,
  WorkflowStatus
} from "./types";

const priorityWeight: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

const workflowWeight: Record<WorkflowStatus, number> = {
  open: 6,
  in_progress: 5,
  waiting: 3,
  completed: 1,
  dismissed: 0
};

export function isHandledWorkflowStatus(status: WorkflowStatus) {
  return status === "completed" || status === "dismissed";
}

export function isUnresolvedWorkflowStatus(status: WorkflowStatus) {
  return !isHandledWorkflowStatus(status);
}

function sharesSourceIds(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.some((id) => rightSet.has(id));
}

export function getThreadForItem(item: ExecutiveItem, threads: ThreadAnalysis[]) {
  if (item.threadId) {
    const exact = threads.find((thread) => thread.id === item.threadId);
    if (exact) {
      return exact;
    }
  }

  return threads.find((thread) => sharesSourceIds(thread.messageIds, item.sourceMessageIds)) ?? null;
}

export function getThreadForAction(action: CanonicalAction, threads: ThreadAnalysis[]) {
  if (action.thread) {
    return action.thread;
  }

  return threads.find((thread) => sharesSourceIds(thread.messageIds, action.sourceMessageIds)) ?? null;
}

export function getLinkedFlags(item: ExecutiveItem, flags: ExecutiveFlag[]) {
  return flags.filter((flag) => flag.status === "active" && sharesSourceIds(flag.sourceMessageIds, item.sourceMessageIds));
}

export function getCanonicalActions(analysis: AnalysisResult): CanonicalAction[] {
  const activeItems = analysis.executiveItems.filter((item) => item.section !== "handled");
  const actions: CanonicalAction[] = activeItems.map((item) => {
    const thread = getThreadForItem(item, analysis.threads);
    const flags = getLinkedFlags(item, analysis.flags);
    return {
      key: createActionKey(item),
      kind: item.kind,
      item,
      title: item.title,
      summary: item.summary,
      priority: item.priority,
      sourceMessageIds: item.sourceMessageIds,
      thread,
      flags,
      decisionQuestion: item.decisionQuestion,
      ownerRole: item.ownerRole,
      deadlineText: item.deadlineText,
      deadlineAt: item.deadlineAt,
      recommendedNextStep: item.recommendedNextStep,
      missingContext: item.missingContext,
      draftedResponse: item.draftedResponse,
      aiLifecycleStatus: thread?.lifecycleStatus ?? "active",
      section: item.section
    };
  });

  const attachedFlagIds = new Set(actions.flatMap((action) => action.flags.map((flag) => flag.id)));
  const standaloneFlags = analysis.flags.filter((flag) => flag.status === "active" && !attachedFlagIds.has(flag.id));

  standaloneFlags.forEach((flag) => {
    const thread = analysis.threads.find((candidate) => sharesSourceIds(candidate.messageIds, flag.sourceMessageIds)) ?? null;
    actions.push({
      key: createFlagActionKey(flag),
      kind: "flag",
      item: null,
      title: flag.title,
      summary: flag.description,
      priority: flag.severity === "critical" ? "urgent" : flag.severity,
      sourceMessageIds: flag.sourceMessageIds,
      thread,
      flags: [flag],
      decisionQuestion: null,
      ownerRole: flag.category === "security" ? "Security" : null,
      deadlineText: null,
      deadlineAt: null,
      recommendedNextStep: flag.recommendedAction,
      missingContext: [],
      draftedResponse: null,
      aiLifecycleStatus: thread?.lifecycleStatus ?? "active",
      section: "delegated"
    });
  });

  const byKey = new Map<string, CanonicalAction>();
  actions.forEach((action) => {
    const existing = byKey.get(action.key);
    if (!existing) {
      byKey.set(action.key, action);
      return;
    }

    byKey.set(action.key, {
      ...existing,
      flags: [...existing.flags, ...action.flags.filter((flag) => !existing.flags.some((item) => item.id === flag.id))],
      sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...action.sourceMessageIds])]
    });
  });

  return sortCanonicalActions([...byKey.values()].map((action) => ({ ...action, workflow: createDefaultWorkflowState(action.key) }))).map(
    (actionWithWorkflow) => {
      const { workflow, ...action } = actionWithWorkflow;
      void workflow;
      return action;
    }
  );
}

export function getActionWithWorkflow(action: CanonicalAction, workflowMap: WorkflowMap): ActionWithWorkflow {
  return {
    ...action,
    workflow: workflowMap[action.key] ?? createDefaultWorkflowState(action.key)
  };
}

export function getActionsWithWorkflow(actions: CanonicalAction[], workflowMap: WorkflowMap) {
  return actions.map((action) => getActionWithWorkflow(action, workflowMap));
}

export function sortCanonicalActions<T extends ActionWithWorkflow>(actions: T[], sort: ActionFilters["sort"] = "urgency") {
  return [...actions].sort((left, right) => {
    if (sort === "updated") {
      return Date.parse(right.workflow.updatedAt) - Date.parse(left.workflow.updatedAt);
    }

    if (sort === "deadline") {
      const leftTime = left.deadlineAt ? Date.parse(left.deadlineAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.deadlineAt ? Date.parse(right.deadlineAt) : Number.POSITIVE_INFINITY;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
    }

    const urgentOpenLeft = left.priority === "urgent" && left.workflow.status === "open";
    const urgentOpenRight = right.priority === "urgent" && right.workflow.status === "open";
    if (urgentOpenLeft !== urgentOpenRight) {
      return urgentOpenLeft ? -1 : 1;
    }

    const priorityDelta = priorityWeight[right.priority] - priorityWeight[left.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const statusDelta = workflowWeight[right.workflow.status] - workflowWeight[left.workflow.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    if (left.deadlineAt && right.deadlineAt) {
      return Date.parse(left.deadlineAt) - Date.parse(right.deadlineAt);
    }

    if (left.deadlineAt) {
      return -1;
    }

    if (right.deadlineAt) {
      return 1;
    }

    return left.title.localeCompare(right.title);
  });
}

export function filterActions(actions: ActionWithWorkflow[], filters: ActionFilters) {
  const q = filters.q.trim().toLowerCase();

  return sortCanonicalActions(
    actions.filter((action) => {
      if (filters.type !== "all") {
        if (filters.type === "flag" && action.flags.length === 0 && action.kind !== "flag") {
          return false;
        }
        if (filters.type !== "flag" && action.kind !== filters.type) {
          return false;
        }
      }

      if (filters.status === "active" && !isUnresolvedWorkflowStatus(action.workflow.status)) {
        return false;
      }
      if (filters.status !== "all" && filters.status !== "active" && action.workflow.status !== filters.status) {
        return false;
      }
      if (filters.priority !== "all" && action.priority !== filters.priority) {
        return false;
      }
      if (filters.flagged && action.flags.length === 0) {
        return false;
      }
      if (q) {
        const haystack = [
          action.title,
          action.summary,
          action.ownerRole,
          action.decisionQuestion,
          action.sourceMessageIds.join(" "),
          action.flags.map((flag) => flag.title).join(" ")
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      return true;
    }),
    filters.sort
  );
}

export function getMorningProgress(actions: ActionWithWorkflow[]) {
  const total = actions.length;
  const completed = actions.filter((action) => action.workflow.status === "completed").length;
  const dismissed = actions.filter((action) => action.workflow.status === "dismissed").length;
  const handled = completed + dismissed;
  const waiting = actions.filter((action) => action.workflow.status === "waiting").length;
  const inProgress = actions.filter((action) => action.workflow.status === "in_progress").length;
  const open = actions.filter((action) => action.workflow.status === "open").length;

  return {
    total,
    handled,
    remaining: total - handled,
    open,
    inProgress,
    waiting,
    completed,
    dismissed,
    percent: total === 0 ? 0 : Math.round((handled / total) * 100)
  };
}

export function getMetricCounts(args: {
  analysis: AnalysisResult;
  actions: ActionWithWorkflow[];
  messageCount: number;
}) {
  const unresolved = args.actions.filter((action) => isUnresolvedWorkflowStatus(action.workflow.status));
  return {
    messagesProcessed: args.messageCount,
    activeDecisions: unresolved.filter((action) => action.kind === "decide").length,
    delegatedActions: unresolved.filter((action) => action.kind === "delegate").length,
    activeFlags: unresolved.filter((action) => action.flags.length > 0 || action.kind === "flag").length,
    inactiveMessages: args.analysis.messageAnalyses.filter((message) =>
      ["superseded", "resolved"].includes(message.lifecycleStatus)
    ).length
  };
}

export function getUpcomingDeadlines(actions: ActionWithWorkflow[], limit = 4) {
  return actions
    .filter((action) => isUnresolvedWorkflowStatus(action.workflow.status) && (action.deadlineText || action.deadlineAt))
    .sort((left, right) => {
      if (left.deadlineAt && right.deadlineAt) {
        return Date.parse(left.deadlineAt) - Date.parse(right.deadlineAt);
      }
      if (left.deadlineAt) {
        return -1;
      }
      if (right.deadlineAt) {
        return 1;
      }
      return (left.deadlineText ?? "").localeCompare(right.deadlineText ?? "");
    })
    .slice(0, limit);
}

export function getMessagesForAction(action: CanonicalAction, messages: NormalizedMessage[]) {
  const ids = new Set(action.thread?.messageIds ?? action.sourceMessageIds);
  return messages.filter((message) => ids.has(message.id)).sort(compareMessageTime);
}

export function getMessageAnalysesForAction(action: CanonicalAction, analyses: MessageAnalysis[]) {
  const ids = new Set(action.thread?.messageIds ?? action.sourceMessageIds);
  return analyses.filter((message) => ids.has(message.messageId));
}

export function findActionForSourceIds(actions: ActionWithWorkflow[], sourceMessageIds: string[]) {
  return actions.find((action) => sharesSourceIds(action.sourceMessageIds, sourceMessageIds));
}

export function filterAuditMessages(args: {
  messages: NormalizedMessage[];
  analyses: MessageAnalysis[];
  filters: AuditFilters;
}) {
  const analysisById = new Map(args.analyses.map((analysis) => [analysis.messageId, analysis]));
  const q = args.filters.q.trim().toLowerCase();

  return args.messages.filter((message) => {
    const analysis = analysisById.get(message.id);
    if (args.filters.category !== "all" && analysis?.primaryCategory !== args.filters.category) {
      return false;
    }
    if (args.filters.lifecycle.length > 0 && analysis && !args.filters.lifecycle.includes(analysis.lifecycleStatus)) {
      return false;
    }
    if (args.filters.channel !== "all" && message.channel !== args.filters.channel) {
      return false;
    }
    if (args.filters.flagged && (!analysis || analysis.flagIds.length === 0)) {
      return false;
    }
    if (q) {
      const haystack = [message.id, message.sender, message.subject, message.channelName, message.body, analysis?.rationale]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

export function filterAuditThreads(threads: ThreadAnalysis[], filters: AuditFilters) {
  const q = filters.q.trim().toLowerCase();
  return threads.filter((thread) => {
    if (filters.thread && thread.id !== filters.thread) {
      return false;
    }
    if (filters.lifecycle.length > 0 && !filters.lifecycle.includes(thread.lifecycleStatus)) {
      return false;
    }
    if (q && !`${thread.title} ${thread.currentState} ${thread.messageIds.join(" ")}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}
