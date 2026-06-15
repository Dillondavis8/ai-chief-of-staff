import type { AnalysisResult, ExecutiveItem, Priority } from "@/lib/ai/schemas";

const priorityWeight: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

export function sortByPriority<T extends { priority: Priority; deadlineAt?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => {
    const priorityDelta = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (a.deadlineAt && b.deadlineAt) {
      return Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt);
    }

    if (a.deadlineAt) {
      return -1;
    }

    if (b.deadlineAt) {
      return 1;
    }

    return 0;
  });
}

export function splitExecutiveItems(items: ExecutiveItem[]) {
  const active = items.filter((item) => item.section !== "handled");
  return {
    urgent: sortByPriority(active.filter((item) => item.section === "urgent")),
    decisions: sortByPriority(active.filter((item) => item.section === "decisions")),
    delegated: sortByPriority(active.filter((item) => item.section === "delegated")),
    personal: sortByPriority(active.filter((item) => item.section === "personal")),
    handled: sortByPriority(items.filter((item) => item.section === "handled"))
  };
}

export function deriveMetrics(analysis: AnalysisResult, messageCount: number) {
  const activeItems = analysis.executiveItems.filter((item) => item.section !== "handled");
  return {
    messagesProcessed: messageCount,
    activeDecisions: activeItems.filter((item) => item.kind === "decide").length,
    delegatedActions: activeItems.filter((item) => item.kind === "delegate").length,
    activeFlags: analysis.flags.filter((flag) => flag.status === "active").length,
    ignoredMessages: analysis.messageAnalyses.filter((message) => message.primaryCategory === "ignore").length
  };
}
