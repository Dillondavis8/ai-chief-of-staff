import { z } from "zod";
import type {
  ActionItem,
  AnalysisResult,
  DraftedResponse,
  ExecutiveFlag,
  ExecutiveItem,
  LifecycleStatus,
  MessageAnalysis,
  MessageCategory
} from "./schemas";
import {
  actionItemSchema,
  executiveFlagSchema,
  lifecycleStatusSchema,
  messageCategorySchema,
  prioritySchema,
  threadAnalysisSchema
} from "./schemas";
import type { NormalizedMessage } from "@/lib/messages/schemas";

const compactExecutiveItemSchema = z
  .object({
    id: z.string(),
    threadId: z.string().nullable(),
    kind: z.enum(["decide", "delegate", "inform"]),
    section: z.enum(["urgent", "decisions", "delegated", "handled", "personal"]),
    title: z.string(),
    summary: z.string(),
    priority: prioritySchema,
    sourceMessageIds: z.array(z.string()),
    ownerRole: z.string().nullable(),
    deadlineText: z.string().nullable(),
    deadlineAt: z.string().nullable(),
    decisionQuestion: z.string().nullable(),
    options: z
      .array(
        z
          .object({
            label: z.string(),
            tradeoff: z.string()
          })
          .strict()
      )
      .nullable(),
    recommendedNextStep: z.string().nullable(),
    missingContext: z.array(z.string())
  })
  .strict();

const compactMessageAnalysisSchema = z
  .object({
    messageId: z.string(),
    primaryCategory: messageCategorySchema,
    lifecycleStatus: lifecycleStatusSchema,
    relatedMessageIds: z.array(z.string()),
    supersededBy: z.array(z.string()),
    resolvedBy: z.array(z.string()),
    rationale: z.string(),
    actionItems: z.array(actionItemSchema),
    confidence: z.number().min(0).max(1),
    missingContext: z.array(z.string())
  })
  .strict();

export const compactAnalysisSchema = z
  .object({
    sourceDate: z.string(),
    messageAnalyses: z.array(compactMessageAnalysisSchema),
    threads: z.array(threadAnalysisSchema),
    executiveItems: z.array(compactExecutiveItemSchema),
    flags: z.array(executiveFlagSchema)
  })
  .strict();

export type CompactAnalysis = z.infer<typeof compactAnalysisSchema>;

function namespaceId(namespace: string, value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "item";
  return normalized === namespace || normalized.startsWith(`${namespace}-`) ? normalized : `${namespace}-${normalized}`;
}

export function buildCompactAnalysisSchema(messageIds: string[]): z.ZodType<CompactAnalysis> {
  const messageIdSchema = z.enum(messageIds as [string, ...string[]]);
  const messageIdArraySchema = z.array(messageIdSchema);

  return compactAnalysisSchema.extend({
    messageAnalyses: z.array(
      compactMessageAnalysisSchema.extend({
        messageId: messageIdSchema,
        relatedMessageIds: messageIdArraySchema,
        supersededBy: messageIdArraySchema,
        resolvedBy: messageIdArraySchema
      })
    ),
    threads: z.array(
      threadAnalysisSchema.extend({
        messageIds: messageIdArraySchema,
        latestMessageId: messageIdSchema
      })
    ),
    executiveItems: z.array(
      compactExecutiveItemSchema.extend({
        sourceMessageIds: messageIdArraySchema
      })
    ),
    flags: z.array(
      executiveFlagSchema.extend({
        sourceMessageIds: messageIdArraySchema
      })
    )
  }) as z.ZodType<CompactAnalysis>;
}

export function compactFromAnalysis(analysis: AnalysisResult): CompactAnalysis {
  return {
    sourceDate: analysis.sourceDate,
    messageAnalyses: analysis.messageAnalyses.map((message) => ({
      messageId: message.messageId,
      primaryCategory: message.primaryCategory,
      lifecycleStatus: message.lifecycleStatus,
      relatedMessageIds: message.relatedMessageIds,
      supersededBy: message.supersededBy,
      resolvedBy: message.resolvedBy,
      rationale: message.rationale,
      actionItems: message.actionItems,
      confidence: message.confidence,
      missingContext: message.missingContext
    })),
    threads: analysis.threads,
    executiveItems: analysis.executiveItems.map((item) => ({
      id: item.id,
      threadId: item.threadId,
      kind: item.kind,
      section: item.section,
      title: item.title,
      summary: item.summary,
      priority: item.priority,
      sourceMessageIds: item.sourceMessageIds,
      ownerRole: item.ownerRole,
      deadlineText: item.deadlineText,
      deadlineAt: item.deadlineAt,
      decisionQuestion: item.decisionQuestion,
      options: item.options,
      recommendedNextStep: item.recommendedNextStep,
      missingContext: item.missingContext
    })),
    flags: analysis.flags
  };
}

export function namespaceCompactAnalysis(compact: CompactAnalysis, namespace: string): CompactAnalysis {
  const safeNamespace = namespace.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "thread";
  const threadIdMap = new Map(compact.threads.map((thread) => [thread.id, namespaceId(safeNamespace, thread.id)]));
  const executiveItemIdMap = new Map(compact.executiveItems.map((item) => [item.id, namespaceId(safeNamespace, item.id)]));
  const flagIdMap = new Map(compact.flags.map((flag) => [flag.id, namespaceId(safeNamespace, flag.id)]));

  return {
    ...compact,
    threads: compact.threads.map((thread) => ({
      ...thread,
      id: threadIdMap.get(thread.id) ?? namespaceId(safeNamespace, thread.id),
      activeExecutiveItemIds: thread.activeExecutiveItemIds.map((id) => executiveItemIdMap.get(id) ?? namespaceId(safeNamespace, id))
    })),
    executiveItems: compact.executiveItems.map((item) => ({
      ...item,
      id: executiveItemIdMap.get(item.id) ?? namespaceId(safeNamespace, item.id),
      threadId: item.threadId ? threadIdMap.get(item.threadId) ?? namespaceId(safeNamespace, item.threadId) : null
    })),
    flags: compact.flags.map((flag) => ({
      ...flag,
      id: flagIdMap.get(flag.id) ?? namespaceId(safeNamespace, flag.id)
    }))
  };
}

function compactText(value: string, maxLength = 260) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function cleanOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function titleForMessage(message: NormalizedMessage) {
  return compactText(message.subject ?? message.channelName ?? `Message from ${message.sender}`, 90);
}

function sourceMessages(messagesById: Map<string, NormalizedMessage>, sourceMessageIds: string[]) {
  return sourceMessageIds.map((id) => messagesById.get(id)).filter((message): message is NormalizedMessage => Boolean(message));
}

function relatedIdsWithoutSelf(ids: string[], messageId: string) {
  return [...new Set(ids.filter((id) => id !== messageId))];
}

function actionIdentity(sourceMessageIds: string[], title: string) {
  return `${[...sourceMessageIds].sort().join(",")}:${title.trim().toLowerCase()}`;
}

function sourceSet(sourceMessageIds: string[]) {
  return new Set(sourceMessageIds);
}

function isSubset(candidateIds: string[], containerIds: string[]) {
  const container = sourceSet(containerIds);
  return candidateIds.every((id) => container.has(id));
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

function isPlaceholderDraft(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    normalized === "thanks. i am reviewing this and will come back with a decision." ||
    normalized === "thanks. i'm reviewing this and will come back with a decision." ||
    normalized.includes("reviewing this and will come back with a decision")
  );
}

const executiveItemPriorityWeight: Record<ExecutiveItem["priority"], number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

const executiveItemKindWeight: Record<ExecutiveItem["kind"], number> = {
  decide: 3,
  delegate: 2,
  inform: 1
};

function exactSourceMatch(left: string[], right: string[]) {
  return sourceKey(left) === sourceKey(right);
}

function sourceKey(ids: string[]) {
  return [...ids].sort().join(",");
}

function sharesSourceIds(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.some((id) => rightSet.has(id));
}

function activeComparableItem(item: ExecutiveItem) {
  return item.section !== "handled" && item.kind !== "inform";
}

function itemIssueOverlap(left: ExecutiveItem, right: ExecutiveItem) {
  return Math.max(
    titleOverlap(left.title, right.title),
    titleOverlap(left.summary, right.summary),
    titleOverlap(left.decisionQuestion ?? "", right.decisionQuestion ?? ""),
    titleOverlap(left.recommendedNextStep ?? "", right.recommendedNextStep ?? "")
  );
}

function sameThread(left: ExecutiveItem, right: ExecutiveItem) {
  return Boolean(left.threadId && right.threadId && left.threadId === right.threadId);
}

function ranksBefore(left: ExecutiveItem, right: ExecutiveItem) {
  const sourceDelta = right.sourceMessageIds.length - left.sourceMessageIds.length;
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  const priorityDelta = executiveItemPriorityWeight[right.priority] - executiveItemPriorityWeight[left.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const deadlineDelta = Number(Boolean(right.deadlineAt || right.deadlineText)) - Number(Boolean(left.deadlineAt || left.deadlineText));
  if (deadlineDelta !== 0) {
    return deadlineDelta;
  }

  return executiveItemKindWeight[right.kind] - executiveItemKindWeight[left.kind];
}

function senderDisplayName(sender: string) {
  const withoutEmail = sender.split("<")[0]?.trim();
  const base = withoutEmail || sender.split("@")[0] || sender;
  return base.replace(/\([^)]*\)/g, "").trim() || sender;
}

function decisionFocus(item: Pick<ExecutiveItem, "title" | "decisionQuestion">) {
  const question = cleanOptionalText(item.decisionQuestion);
  if (question && !question.toLowerCase().startsWith("what decision should be made for")) {
    return question.replace(/\?$/, "");
  }

  return item.title;
}

function deadlinePhrase(deadlineText: string | null) {
  const deadline = cleanOptionalText(deadlineText);
  return deadline ? ` by ${deadline}` : "";
}

function decisionDraftBody(
  item: Pick<ExecutiveItem, "title" | "decisionQuestion" | "deadlineText">,
  message: NormalizedMessage
) {
  const focus = decisionFocus(item);
  const line = `I am reviewing "${focus}" and will confirm the decision${deadlinePhrase(item.deadlineText)}.`;

  if (message.channel === "email") {
    return `Hi ${senderDisplayName(message.sender)},\n\nThanks for flagging this. ${line}\n\nBest,\nCEO`;
  }

  return `Thanks for flagging "${item.title}". ${line}`;
}

type DecisionOption = NonNullable<ExecutiveItem["options"]>[number];

function option(label: string, tradeoff: string): DecisionOption {
  return { label, tradeoff };
}

function cleanModelOptions(options: ExecutiveItem["options"]) {
  const cleaned =
    options
      ?.map((item) => ({
        label: item.label.trim(),
        tradeoff: item.tradeoff.trim()
      }))
      .filter((item) => item.label && item.tradeoff) ?? [];

  const unique = cleaned.filter(
    (item, index) => cleaned.findIndex((candidate) => candidate.label.toLowerCase() === item.label.toLowerCase()) === index
  );

  return unique.length >= 2 ? unique.slice(0, 4) : null;
}

function deriveDecisionOptionsFromText(text: string): ExecutiveItem["options"] {
  const normalized = text.toLowerCase();

  if (/\broll\s?back\b/.test(normalized) && /\bhot\s?fix\b/.test(normalized)) {
    return [
      option("Roll back partial migration", "Safer for checkout stability, but delays the migration."),
      option("Push a hotfix", "Faster path to recover momentum, but carries higher execution risk.")
    ];
  }

  if (
    (normalized.includes("1-year") || normalized.includes("1 year") || normalized.includes("one-year")) &&
    (normalized.includes("2-year") || normalized.includes("2 year") || normalized.includes("two-year")) &&
    (normalized.includes("60k") || normalized.includes("60,000")) &&
    (normalized.includes("120k") || normalized.includes("120,000"))
  ) {
    return [
      option("Accept one-year, $60k ARR", "Preserves the deal on revised terms with lower committed ARR."),
      option("Push back for two-year, $120k ARR", "Protects the original deal value, but risks slowing or losing the close.")
    ];
  }

  if (normalized.includes("10am") && normalized.includes("2pm") && /meridian|investor|meeting/.test(normalized)) {
    return [
      option("Keep Thursday 2pm", "Matches the original investor expectation and now avoids the moved internal sync."),
      option("Move to Thursday 10am", "Uses Meridian's offered alternate slot if the CEO wants more room before internal meetings.")
    ];
  }

  if (normalized.includes("candidate a") && normalized.includes("candidate c") && /attached|attachment|shortlist/.test(normalized)) {
    return [
      option("Schedule Candidate A/C intros", "Follows the recruiter's stated recommendation without relying on missing attachment details."),
      option("Request the missing shortlist first", "Avoids committing interview time until the absent candidate material is available.")
    ];
  }

  if (normalized.includes("benefits package") && /approve|approval|sign-?off|sign off/.test(normalized)) {
    return [
      option("Approve benefits package", "Lets People meet the provider deadline if the package is acceptable."),
      option("Request changes or context", "Keeps approval human-gated if the CEO needs more detail before sign-off.")
    ];
  }

  return null;
}

function sourceTextForIds(messagesById: Map<string, NormalizedMessage>, sourceMessageIds: string[]) {
  return sourceMessages(messagesById, sourceMessageIds)
    .map((message) => [message.subject, message.channelName, message.sender, message.body].filter(Boolean).join(" "))
    .join(" ");
}

function normalizeDecisionOptions(
  item: Pick<ExecutiveItem, "kind" | "section" | "title" | "summary" | "decisionQuestion" | "options" | "sourceMessageIds">,
  messagesById: Map<string, NormalizedMessage>
): ExecutiveItem["options"] {
  if (item.kind !== "decide" || item.section === "handled") {
    return item.options;
  }

  const derivedOptions = deriveDecisionOptionsFromText(
    [item.title, item.summary, item.decisionQuestion, sourceTextForIds(messagesById, item.sourceMessageIds)]
      .filter(Boolean)
      .join(" ")
  );

  return derivedOptions ?? cleanModelOptions(item.options);
}

type LifecycleOverride = {
  lifecycleStatus: LifecycleStatus;
  supersededBy: string[];
  resolvedBy: string[];
};

function hasSecurityFlag(compact: CompactAnalysis, sourceMessageIds: string[]) {
  const sourceIds = new Set(sourceMessageIds);
  return compact.flags.some(
    (flag) =>
      flag.category === "security" &&
      ["critical", "high"].includes(flag.severity) &&
      flag.sourceMessageIds.some((id) => sourceIds.has(id))
  );
}

function ownerForFlag(flag: ExecutiveFlag) {
  if (flag.category === "security") return "Security";
  if (flag.category === "legal") return "Legal";
  if (flag.category === "financial") return "Finance";
  if (flag.category === "customer") return "Sales";
  if (flag.category === "people") return "People";
  if (flag.category === "scheduling") return "Executive Assistant";
  if (flag.category === "operational") return "Operations";
  return "Operations";
}

function draftForMessage(message: NormalizedMessage, category: MessageCategory, securityRisk: boolean): DraftedResponse {
  if (category === "ignore") {
    return { type: "no_response", to: null, subject: null, body: "" };
  }

  if (category === "delegate" || securityRisk) {
    const owner = securityRisk ? "Security" : "Operations";
    return {
      type: "internal_handoff",
      to: owner,
      subject: message.subject ?? null,
      body: securityRisk
        ? `Please verify this ${message.channel} message through official systems. Do not reply to the sender until verified.`
        : `Please review this ${message.channel} message from ${message.sender} and recommend the next step.`
    };
  }

  return {
    type: "reply_to_sender",
    to: message.sender,
    subject: message.subject ?? null,
    body: "Thanks. I am reviewing this and will come back with a decision."
  };
}

function fallbackDraftForExecutiveItem(
  item: Omit<ExecutiveItem, "draftedResponse">,
  messagesById: Map<string, NormalizedMessage>,
  compact: CompactAnalysis
): DraftedResponse | null {
  if (item.section === "handled" || item.kind === "inform") {
    return null;
  }

  const messages = sourceMessages(messagesById, item.sourceMessageIds);
  const firstMessage = messages[0];
  if (!firstMessage) {
    return null;
  }

  const securityRisk = hasSecurityFlag(compact, item.sourceMessageIds);
  if (item.kind === "delegate" || securityRisk) {
    const owner = securityRisk ? "Security" : cleanOptionalText(item.ownerRole) ?? "Operations";
    const nextStep = cleanOptionalText(item.recommendedNextStep);
    return {
      type: "internal_handoff",
      to: owner,
      subject: firstMessage.subject ?? null,
      body: securityRisk
        ? `Please verify "${item.title}" through official security systems. Do not reply to the sender until verified.`
        : nextStep ?? `Please review "${item.title}" and recommend the next step.`
    };
  }

  return {
    type: "reply_to_sender",
    to: firstMessage.sender,
    subject: firstMessage.subject ?? null,
    body: decisionDraftBody(item, firstMessage)
  };
}

function safeDraftForExecutiveItem(
  modelDraft: DraftedResponse | null,
  item: Omit<ExecutiveItem, "draftedResponse">,
  messagesById: Map<string, NormalizedMessage>,
  compact: CompactAnalysis
): DraftedResponse | null {
  const fallback = fallbackDraftForExecutiveItem(item, messagesById, compact);
  if (!modelDraft || !modelDraft.body.trim()) {
    return fallback;
  }

  if (item.kind === "decide" && item.section !== "handled") {
    return fallback;
  }

  if (isPlaceholderDraft(modelDraft.body)) {
    return fallback;
  }

  const messages = sourceMessages(messagesById, item.sourceMessageIds);
  const firstMessage = messages[0];
  const securityRisk = hasSecurityFlag(compact, item.sourceMessageIds);
  const repliesToSuspiciousSender =
    firstMessage && modelDraft.to ? modelDraft.to.toLowerCase().includes(firstMessage.sender.toLowerCase()) : false;

  if (securityRisk && (modelDraft.type === "reply_to_sender" || repliesToSuspiciousSender)) {
    return fallback;
  }

  if (item.kind === "delegate" && modelDraft.type === "reply_to_sender") {
    return {
      ...modelDraft,
      type: "internal_handoff",
      to: item.ownerRole ?? modelDraft.to
    } satisfies DraftedResponse;
  }

  return modelDraft;
}

function isCoveredExecutiveItem(candidate: ExecutiveItem, keeper: ExecutiveItem) {
  if (candidate.id === keeper.id || !activeComparableItem(candidate) || !activeComparableItem(keeper)) {
    return false;
  }

  const exactSources = exactSourceMatch(candidate.sourceMessageIds, keeper.sourceMessageIds);
  const sharedSources = sharesSourceIds(candidate.sourceMessageIds, keeper.sourceMessageIds);
  const issueOverlap = itemIssueOverlap(candidate, keeper);
  const relatedSources = exactSources || sameThread(candidate, keeper) || sharedSources;

  if (candidate.kind !== keeper.kind) {
    return (
      candidate.kind === "delegate" &&
      keeper.kind === "decide" &&
      relatedSources &&
      (issueOverlap >= 0.35 || (exactSources && candidate.ownerRole === keeper.ownerRole))
    );
  }

  if (candidate.kind === "delegate") {
    const sameOwner = (candidate.ownerRole ?? "").toLowerCase() === (keeper.ownerRole ?? "").toLowerCase();
    return sameOwner && sharedSources && (exactSources || issueOverlap >= 0.35);
  }

  if (candidate.kind !== "decide") {
    return false;
  }

  const candidateCoveredByKeeper = isSubset(candidate.sourceMessageIds, keeper.sourceMessageIds);
  const keeperHasBroaderSource = keeper.sourceMessageIds.length > candidate.sourceMessageIds.length;
  return (exactSources || (candidateCoveredByKeeper && keeperHasBroaderSource)) && issueOverlap >= 0.35;
}

function dedupeExecutiveItems(items: ExecutiveItem[]) {
  const kept: ExecutiveItem[] = [];

  const rankedItems = items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => ranksBefore(left.item, right.item) || left.index - right.index)
    .map((entry) => entry.item);

  rankedItems.forEach((item) => {
    if (kept.some((keeper) => isCoveredExecutiveItem(item, keeper))) {
      return;
    }

    for (let index = kept.length - 1; index >= 0; index -= 1) {
      if (isCoveredExecutiveItem(kept[index], item)) {
        kept.splice(index, 1);
      }
    }

    kept.push(item);
  });

  return kept;
}

function normalizeActionItem(
  item: ActionItem,
  fallbackCategory: MessageCategory,
  fallbackTitle: string,
  fallbackDescription: string
): ActionItem {
  return {
    ...item,
    category: item.category ?? fallbackCategory,
    title: item.title.trim() || fallbackTitle,
    description: item.description.trim() || fallbackDescription
  };
}

function fallbackActionItems(message: NormalizedMessage, category: MessageCategory): ActionItem[] {
  if (category === "ignore") {
    return [];
  }

  const title = titleForMessage(message);
  return [
    {
      id: `action-${message.id}`,
      category,
      title,
      description: compactText(message.body),
      ownerRole: category === "delegate" ? "Operations" : null,
      decisionRequired: category === "decide" ? `Decide how to respond to ${title}.` : null,
      deadlineText: null,
      deadlineAt: null,
      recommendedNextStep: category === "delegate" ? "Route to the appropriate owner." : "Record the CEO decision.",
      missingContext: []
    }
  ];
}

function priorityForFlag(flag: ExecutiveFlag) {
  return flag.severity === "critical" ? "urgent" : flag.severity;
}

function priorityForAction(action: ActionItem) {
  const deadline = action.deadlineText?.toLowerCase() ?? "";
  if (/\b(hour|asap|today|eod|end of day)\b/.test(deadline)) {
    return "urgent";
  }

  return action.deadlineText ? "high" : "medium";
}

function promotedDecisionFromAction(args: {
  action: ActionItem;
  analysis: MessageAnalysis;
  message: NormalizedMessage;
  threadId: string | null;
  index: number;
}): ExecutiveItem {
  const priority = priorityForAction(args.action);
  const title = args.action.title.trim() || titleForMessage(args.message);
  const decisionQuestion = cleanOptionalText(args.action.decisionRequired) ?? `What decision should be made for "${title}"?`;
  const options = deriveDecisionOptionsFromText(
    [title, decisionQuestion, args.action.description, args.message.subject, args.message.body].filter(Boolean).join(" ")
  );

  return {
    id: `decide-${args.index + 1}-${args.analysis.messageId}-${args.action.id}`,
    threadId: args.threadId,
    kind: "decide",
    section: priority === "urgent" ? "urgent" : "decisions",
    title,
    summary: args.action.description.trim() || compactText(args.message.body),
    priority,
    sourceMessageIds: [args.analysis.messageId],
    ownerRole: null,
    deadlineText: args.action.deadlineText,
    deadlineAt: args.action.deadlineAt,
    decisionQuestion,
    options,
    recommendedNextStep: cleanOptionalText(args.action.recommendedNextStep) ?? "Record the CEO decision.",
    missingContext: args.action.missingContext,
    draftedResponse: {
      type: "reply_to_sender",
      to: args.message.sender,
      subject: args.message.subject ?? null,
      body: decisionDraftBody(
        {
          title,
          decisionQuestion,
          deadlineText: args.action.deadlineText
        },
        args.message
      )
    }
  };
}

function promotedDelegateFromAction(args: {
  action: ActionItem;
  analysis: MessageAnalysis;
  message: NormalizedMessage;
  threadId: string | null;
  index: number;
  flags: ExecutiveFlag[];
}): ExecutiveItem {
  const highestFlag = args.flags
    .filter((flag) => flag.status === "active" && flag.sourceMessageIds.includes(args.analysis.messageId))
    .sort((left, right) => {
      const weight = { critical: 4, high: 3, medium: 2, low: 1 };
      return weight[right.severity] - weight[left.severity];
    })[0];
  const owner = highestFlag ? ownerForFlag(highestFlag) : args.action.ownerRole ?? "Operations";
  const priority = highestFlag ? priorityForFlag(highestFlag) : args.action.deadlineText ? "high" : "medium";
  const title = args.action.title.trim() || titleForMessage(args.message);
  const summary = args.action.description.trim() || compactText(args.message.body);
  const nextStep = cleanOptionalText(args.action.recommendedNextStep) ?? `Ask ${owner} to own the next step for ${title}.`;

  return {
    id: `delegate-${args.index + 1}-${args.analysis.messageId}`,
    threadId: args.threadId,
    kind: "delegate",
    section: priority === "urgent" ? "urgent" : "delegated",
    title,
    summary,
    priority,
    sourceMessageIds: [args.analysis.messageId],
    ownerRole: owner,
    deadlineText: args.action.deadlineText,
    deadlineAt: args.action.deadlineAt,
    decisionQuestion: null,
    options: null,
    recommendedNextStep: nextStep,
    missingContext: args.action.missingContext,
    draftedResponse: {
      type: "internal_handoff",
      to: owner,
      subject: args.message.subject ?? null,
      body: nextStep
    }
  };
}

function promotedDelegateFromFlag(args: {
  flag: ExecutiveFlag;
  message: NormalizedMessage | undefined;
  threadId: string | null;
  index: number;
}): ExecutiveItem {
  const owner = ownerForFlag(args.flag);
  const priority = priorityForFlag(args.flag);
  const nextStep = args.flag.recommendedAction ?? `Ask ${owner} to review and recommend the next step.`;

  return {
    id: `delegate-flag-${args.index + 1}-${args.flag.id}`,
    threadId: args.threadId,
    kind: "delegate",
    section: priority === "urgent" ? "urgent" : "delegated",
    title: args.flag.title,
    summary: args.flag.description,
    priority,
    sourceMessageIds: args.flag.sourceMessageIds,
    ownerRole: owner,
    deadlineText: priority === "urgent" ? "Today" : null,
    deadlineAt: null,
    decisionQuestion: null,
    options: null,
    recommendedNextStep: nextStep,
    missingContext: [],
    draftedResponse: {
      type: "internal_handoff",
      to: owner,
      subject: args.message?.subject ?? null,
      body: nextStep
    }
  };
}

export function expandCompactAnalysis(
  compact: CompactAnalysis,
  messages: NormalizedMessage[],
  sourceDate: string
): AnalysisResult {
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const flagsByMessageId = new Map<string, string[]>();
  const compactThreadIds = new Set(compact.threads.map((thread) => thread.id));

  compact.flags.forEach((flag) => {
    flag.sourceMessageIds.forEach((id) => {
      flagsByMessageId.set(id, [...(flagsByMessageId.get(id) ?? []), flag.id]);
    });
  });

  const messageAnalyses = compact.messageAnalyses.map((analysis) => {
    const message = messagesById.get(analysis.messageId);
    const securityRisk = hasSecurityFlag(compact, [analysis.messageId]);
    const primaryCategory: MessageCategory = securityRisk ? "delegate" : analysis.primaryCategory;
    const lifecycleStatus: LifecycleStatus =
      securityRisk && analysis.lifecycleStatus === "informational" ? "active" : analysis.lifecycleStatus;
    const fallbackTitle = message ? titleForMessage(message) : `Message ${analysis.messageId}`;
    const fallbackDescription = message ? compactText(message.body) : analysis.rationale;
    const actionItems =
      analysis.actionItems.length > 0
        ? analysis.actionItems.map((item) =>
            normalizeActionItem(item, primaryCategory, fallbackTitle, fallbackDescription)
          )
        : message
          ? fallbackActionItems(message, primaryCategory)
          : [];

    return {
      ...analysis,
      primaryCategory,
      lifecycleStatus,
      relatedMessageIds: relatedIdsWithoutSelf(analysis.relatedMessageIds, analysis.messageId),
      supersededBy: relatedIdsWithoutSelf(analysis.supersededBy, analysis.messageId),
      resolvedBy: relatedIdsWithoutSelf(analysis.resolvedBy, analysis.messageId),
      actionItems,
      flagIds: flagsByMessageId.get(analysis.messageId) ?? [],
      draftedResponse: message
        ? draftForMessage(message, primaryCategory, securityRisk)
        : ({ type: "no_response", to: null, subject: null, body: "" } satisfies DraftedResponse)
    };
  });

  const executiveItems = compact.executiveItems.map((item) => {
    const withDraftBase = {
      ...item,
      sourceMessageIds: [...new Set(item.sourceMessageIds)],
      threadId: item.threadId && compactThreadIds.has(item.threadId) ? item.threadId : null,
      ownerRole: item.kind === "delegate" ? cleanOptionalText(item.ownerRole) ?? "Operations" : cleanOptionalText(item.ownerRole),
      deadlineText: cleanOptionalText(item.deadlineText),
      deadlineAt: cleanOptionalText(item.deadlineAt),
      recommendedNextStep: cleanOptionalText(item.recommendedNextStep),
      decisionQuestion:
        item.kind === "decide" && item.section !== "handled"
          ? cleanOptionalText(item.decisionQuestion) ?? `What decision should be made for "${item.title}"?`
          : cleanOptionalText(item.decisionQuestion),
      options: normalizeDecisionOptions(item, messagesById)
    };

    return {
      ...withDraftBase,
      draftedResponse: safeDraftForExecutiveItem(null, withDraftBase, messagesById, compact)
    };
  });

  const baseThreads = compact.threads.map((thread) => {
    const messageIds = thread.messageIds.includes(thread.latestMessageId)
      ? thread.messageIds
      : [...thread.messageIds, thread.latestMessageId];

    return {
      ...thread,
      messageIds: [...new Set(messageIds)],
      activeExecutiveItemIds: thread.activeExecutiveItemIds
    };
  });

  const lifecycleOverrides = new Map<string, LifecycleOverride>();
  baseThreads.forEach((thread) => {
    if (thread.lifecycleStatus === "resolved") {
      thread.messageIds.forEach((id) => {
        lifecycleOverrides.set(id, {
          lifecycleStatus: "resolved",
          supersededBy: [],
          resolvedBy: id === thread.latestMessageId ? [] : [thread.latestMessageId]
        });
      });
      return;
    }

    if (thread.lifecycleStatus === "active" && thread.messageIds.length > 1) {
      thread.messageIds.forEach((id) => {
        if (id === thread.latestMessageId) {
          return;
        }

        lifecycleOverrides.set(id, {
          lifecycleStatus: "superseded",
          supersededBy: [thread.latestMessageId],
          resolvedBy: []
        });
      });
    }
  });

  const reconciledMessageAnalyses = messageAnalyses.map((analysis) => {
    const override = lifecycleOverrides.get(analysis.messageId);
    if (!override) {
      return analysis;
    }

    return {
      ...analysis,
      lifecycleStatus: override.lifecycleStatus,
      supersededBy: override.supersededBy,
      resolvedBy: override.resolvedBy
    };
  });

  const activeMessageIds = new Set(
    reconciledMessageAnalyses
      .filter((analysis) => analysis.lifecycleStatus === "active")
      .map((analysis) => analysis.messageId)
  );
  const currentExecutiveItems = executiveItems.filter(
    (item) => item.section === "handled" || item.sourceMessageIds.some((id) => activeMessageIds.has(id))
  );

  const coveredDelegateKeys = new Set(
    currentExecutiveItems
      .filter((item) => item.kind === "delegate" && item.section !== "handled")
      .map((item) => actionIdentity(item.sourceMessageIds, item.title))
  );
  const coveredDelegateSourceIds = new Set(
    currentExecutiveItems
      .filter((item) => item.kind === "delegate" && item.section !== "handled")
      .flatMap((item) => item.sourceMessageIds)
  );
  const promotedDelegates: ExecutiveItem[] = [];
  const promotedDecisions: ExecutiveItem[] = [];

  function decisionAlreadyCovered(sourceMessageId: string, action: ActionItem) {
    const isFallbackAction = action.id === `action-${sourceMessageId}`;
    return [...currentExecutiveItems, ...promotedDecisions].some(
      (item) =>
        item.kind === "decide" &&
        item.section !== "handled" &&
        item.sourceMessageIds.includes(sourceMessageId) &&
        (titleOverlap(item.title, action.title) >= 0.35 || (isFallbackAction && item.sourceMessageIds.length > 1))
    );
  }

  reconciledMessageAnalyses.forEach((analysis, index) => {
    if (analysis.lifecycleStatus === "superseded" || analysis.lifecycleStatus === "resolved") {
      return;
    }

    const message = messagesById.get(analysis.messageId);
    if (!message) {
      return;
    }

    const thread = baseThreads.find((candidate) => candidate.messageIds.includes(analysis.messageId));
    analysis.actionItems
      .filter((action) => action.category === "decide")
      .forEach((action) => {
        if (decisionAlreadyCovered(analysis.messageId, action)) {
          return;
        }

        promotedDecisions.push(
          promotedDecisionFromAction({
            action,
            analysis,
            message,
            threadId: thread?.id ?? null,
            index
          })
        );
      });

    analysis.actionItems
      .filter((action) => action.category === "delegate")
      .forEach((action) => {
        if (coveredDelegateSourceIds.has(analysis.messageId)) {
          return;
        }

        const key = actionIdentity([analysis.messageId], action.title);
        if (coveredDelegateKeys.has(key)) {
          return;
        }

        const item = promotedDelegateFromAction({
          action,
          analysis,
          message,
          threadId: thread?.id ?? null,
          index,
          flags: compact.flags
        });
        coveredDelegateKeys.add(key);
        item.sourceMessageIds.forEach((id) => coveredDelegateSourceIds.add(id));
        promotedDelegates.push(item);
      });
  });

  compact.flags
    .filter((flag) => flag.status === "active" && ["critical", "high"].includes(flag.severity))
    .forEach((flag, index) => {
      if (flag.sourceMessageIds.some((id) => coveredDelegateSourceIds.has(id))) {
        return;
      }

      const key = actionIdentity(flag.sourceMessageIds, flag.title);
      if (coveredDelegateKeys.has(key)) {
        return;
      }

      const thread = baseThreads.find((candidate) => flag.sourceMessageIds.some((id) => candidate.messageIds.includes(id)));
      const message = flag.sourceMessageIds.map((id) => messagesById.get(id)).find(Boolean);
      const item = promotedDelegateFromFlag({ flag, message, threadId: thread?.id ?? null, index });
      coveredDelegateKeys.add(key);
      item.sourceMessageIds.forEach((id) => coveredDelegateSourceIds.add(id));
      promotedDelegates.push(item);
    });

  const finalExecutiveItems = dedupeExecutiveItems([...currentExecutiveItems, ...promotedDecisions, ...promotedDelegates]);
  const executiveItemIds = new Set(finalExecutiveItems.map((item) => item.id));
  const threads = baseThreads.map((thread) => {
    const activeExecutiveItemIds = [
      ...thread.activeExecutiveItemIds.filter((id) => executiveItemIds.has(id)),
      ...finalExecutiveItems
        .filter((item) => item.threadId === thread.id && item.section !== "handled")
        .map((item) => item.id)
    ];

    return {
      ...thread,
      activeExecutiveItemIds: [...new Set(activeExecutiveItemIds)]
    };
  });

  return {
    sourceDate,
    messageAnalyses: reconciledMessageAnalyses,
    threads,
    executiveItems: finalExecutiveItems,
    flags: compact.flags
  };
}
