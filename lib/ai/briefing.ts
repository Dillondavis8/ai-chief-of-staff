import type { AnalysisResult, BriefingItem, DailyBriefing, ExecutiveFlag, ExecutiveItem } from "./schemas";
import { stripInlineSourceMarkers } from "@/lib/messages/source-markers";
import { sortByPriority } from "@/lib/utils/ranking";
import { countWords } from "@/lib/utils/word-count";

function sourceIdsFromFlag(flag: ExecutiveFlag) {
  return flag.sourceMessageIds;
}

function sharesSourceIds(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.some((id) => rightSet.has(id));
}

function sourceKey(ids: string[]) {
  return [...ids].sort().join(",");
}

function titleTokens(title: string) {
  const stopWords = new Set(["and", "or", "the", "a", "an", "to", "for", "with", "on", "of", "in", "update"]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
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

function alreadyBriefed(item: BriefingItem, existing: BriefingItem[]) {
  return existing.some(
    (candidate) =>
      sourceKey(candidate.sourceMessageIds) === sourceKey(item.sourceMessageIds) ||
      (sharesSourceIds(candidate.sourceMessageIds, item.sourceMessageIds) && titleOverlap(candidate.title, item.title) >= 0.5)
  );
}

function uniqueBriefingItems(items: BriefingItem[]) {
  return items.reduce<BriefingItem[]>((acc, item) => {
    if (!alreadyBriefed(item, acc)) {
      acc.push(item);
    }

    return acc;
  }, []);
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

export function buildDailyBriefing(analysis: AnalysisResult): DailyBriefing {
  const activeItems = analysis.executiveItems.filter((item) => item.section !== "handled");
  const urgent = uniqueBriefingItems(sortByPriority(
    activeItems.filter((item) => item.section === "urgent" || item.priority === "urgent")
  )
    .slice(0, 3)
    .map(itemToBriefingItem));

  const decisions = uniqueBriefingItems(sortByPriority(
    activeItems.filter((item) => item.kind === "decide" && item.section !== "personal")
  )
    .map(itemToBriefingItem)
    .filter((item) => !alreadyBriefed(item, urgent)))
    .slice(0, 4);

  const includedActionIds = [...urgent, ...decisions].flatMap((item) => item.sourceMessageIds);

  const flags = analysis.flags
    .filter((flag) => flag.status === "active")
    .filter((flag) => !sharesSourceIds(flag.sourceMessageIds, includedActionIds))
    .sort((a, b) => {
      const weights = { critical: 4, high: 3, medium: 2, low: 1 };
      return weights[b.severity] - weights[a.severity];
    })
    .map(flagToBriefingItem)
    .filter((item, index, items) => !items.slice(0, index).some((candidate) => alreadyBriefed(item, [candidate])))
    .slice(0, 2);

  const includedIds = [...includedActionIds, ...flags.flatMap((item) => item.sourceMessageIds)];

  const handled = sortByPriority(analysis.executiveItems.filter((item) => item.section === "handled"))
    .map(itemToBriefingItem)
    .filter((item) => !sharesSourceIds(item.sourceMessageIds, includedIds))
    .slice(0, 1);

  const personal = sortByPriority(activeItems.filter((item) => item.section === "personal"))
    .map(itemToBriefingItem)
    .filter((item) => !sharesSourceIds(item.sourceMessageIds, includedIds))
    .slice(0, 1);

  const briefing: DailyBriefing = {
    title: `Daily Briefing - ${analysis.sourceDate}`,
    overview: "Current actionable state only. Human approval is required before any response or handoff.",
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

export const buildFallbackBriefing = buildDailyBriefing;
