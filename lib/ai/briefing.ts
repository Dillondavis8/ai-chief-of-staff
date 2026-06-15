import type { AnalysisResult, BriefingItem, DailyBriefing, ExecutiveFlag, ExecutiveItem } from "./schemas";
import { stripInlineSourceMarkers } from "@/lib/messages/source-markers";
import { sortByPriority } from "@/lib/utils/ranking";
import { countWords } from "@/lib/utils/word-count";

function sourceIdsFromFlag(flag: ExecutiveFlag) {
  return flag.sourceMessageIds;
}

function compactList(values: string[], maxItems: number) {
  return values.slice(0, maxItems).join("; ");
}

function itemToBriefingItem(item: ExecutiveItem): BriefingItem {
  const details = [
    item.summary,
    item.decisionQuestion ? `Decision: ${item.decisionQuestion}` : undefined,
    item.deadlineText ? `Deadline: ${item.deadlineText}` : undefined,
    item.missingContext.length > 0 ? `Missing: ${compactList(item.missingContext, 2)}` : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: item.title,
    body: details,
    priority: item.priority,
    sourceMessageIds: item.sourceMessageIds
  };
}

function flagToBriefingItem(flag: ExecutiveFlag): BriefingItem {
  const body = [flag.description, flag.recommendedAction ? `Action: ${flag.recommendedAction}` : undefined]
    .filter(Boolean)
    .join(" ");

  const priority = flag.severity === "critical" ? "urgent" : flag.severity === "high" ? "high" : flag.severity;

  return {
    title: flag.title,
    body,
    priority,
    sourceMessageIds: sourceIdsFromFlag(flag)
  };
}

export function renderBriefingText(briefing: DailyBriefing) {
  const parts = [
    briefing.title,
    briefing.overview,
    ...briefing.urgent.flatMap((item) => [item.title, item.body]),
    ...briefing.decisions.flatMap((item) => [item.title, item.body]),
    ...briefing.flags.flatMap((item) => [item.title, item.body]),
    ...briefing.handled.flatMap((item) => [item.title, item.body]),
    ...briefing.personal.flatMap((item) => [item.title, item.body])
  ]
    .map((part) => stripInlineSourceMarkers(part))
    .filter(Boolean);

  return parts.join(" ");
}

export function briefingWordCount(briefing: DailyBriefing) {
  return countWords(renderBriefingText(briefing));
}

export function buildFallbackBriefing(analysis: AnalysisResult): DailyBriefing {
  const activeItems = analysis.executiveItems.filter((item) => item.section !== "handled");
  const urgent = sortByPriority(
    activeItems.filter((item) => item.section === "urgent" || item.priority === "urgent")
  )
    .slice(0, 3)
    .map(itemToBriefingItem);

  const urgentIds = new Set(urgent.flatMap((item) => item.sourceMessageIds));

  const decisions = sortByPriority(
    activeItems.filter((item) => item.kind === "decide" && item.section !== "personal")
  )
    .filter((item) => !item.sourceMessageIds.every((id) => urgentIds.has(id)))
    .slice(0, 4)
    .map(itemToBriefingItem);

  const flags = analysis.flags
    .filter((flag) => flag.status === "active")
    .sort((a, b) => {
      const weights = { critical: 4, high: 3, medium: 2, low: 1 };
      return weights[b.severity] - weights[a.severity];
    })
    .slice(0, 3)
    .map(flagToBriefingItem);

  const handled = sortByPriority(analysis.executiveItems.filter((item) => item.section === "handled"))
    .slice(0, 2)
    .map(itemToBriefingItem);

  const personal = sortByPriority(activeItems.filter((item) => item.section === "personal"))
    .slice(0, 2)
    .map(itemToBriefingItem);

  const briefing: DailyBriefing = {
    title: `Daily brief for ${analysis.sourceDate}`,
    overview: "Current-state summary generated from validated communication analysis. Human approval is required before any response or handoff.",
    urgent,
    decisions,
    flags,
    handled,
    personal
  };

  if (briefingWordCount(briefing) <= 250) {
    return briefing;
  }

  const focusedBriefing = {
    ...briefing,
    overview: "Current-state summary. Human approval required.",
    urgent: urgent.slice(0, 2),
    decisions: decisions.slice(0, 3),
    flags: flags.slice(0, 2),
    handled: handled.slice(0, 1),
    personal: personal.slice(0, 1)
  };

  if (briefingWordCount(focusedBriefing) <= 250) {
    return focusedBriefing;
  }

  return {
    ...focusedBriefing,
    decisions: focusedBriefing.decisions.slice(0, 2),
    flags: focusedBriefing.flags.slice(0, 1),
    handled: [],
    personal: focusedBriefing.personal.slice(0, 1)
  };
}
