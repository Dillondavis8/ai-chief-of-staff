import type {
  ActionItem,
  AnalysisResult,
  DraftedResponse,
  ExecutiveFlag,
  ExecutiveItem,
  LifecycleStatus,
  MessageAnalysis,
  MessageCategory,
  Priority
} from "./schemas";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import type { PlannedThread } from "./thread-planning";

type Classification = {
  category: MessageCategory;
  priority: Priority;
  ownerRole: string | null;
  flagCategory: ExecutiveFlag["category"] | null;
  flagSeverity: ExecutiveFlag["severity"] | null;
};

const decisionTerms = [
  "approve",
  "approval",
  "decide",
  "decision",
  "sign off",
  "greenlight",
  "confirm",
  "choose",
  "option",
  "should we",
  "are you ok",
  "can you approve"
];

const delegationTerms = [
  "delegate",
  "follow up",
  "handle",
  "investigate",
  "review",
  "draft",
  "schedule",
  "coordinate",
  "send",
  "prepare",
  "update",
  "escalate"
];

const ignoreTerms = [
  "fyi",
  "for your information",
  "thanks",
  "thank you",
  "resolved",
  "handled",
  "done",
  "no action",
  "newsletter",
  "receipt"
];

const urgentTerms = ["urgent", "asap", "immediately", "today", "now", "before noon", "within the hour", "incident", "outage"];
const highTerms = ["deadline", "tomorrow", "contract", "legal", "customer", "board", "security", "payment", "wire"];

function lowerText(message: NormalizedMessage) {
  return [message.subject, message.channelName, message.sender, message.body].filter(Boolean).join(" ").toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "message";
}

function compactText(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function titleForMessage(message: NormalizedMessage) {
  return compactText(message.subject ?? message.channelName ?? `Message from ${message.sender}`, 90);
}

function priorityForText(text: string): Priority {
  if (includesAny(text, urgentTerms)) {
    return "urgent";
  }
  if (includesAny(text, highTerms)) {
    return "high";
  }
  if (includesAny(text, delegationTerms) || includesAny(text, decisionTerms)) {
    return "medium";
  }
  return "low";
}

function ownerForText(text: string) {
  if (/(security|phish|password|mfa|verify|suspicious|breach|login)/i.test(text)) return "Security";
  if (/(contract|legal|terms|nda|compliance|lawsuit)/i.test(text)) return "Legal";
  if (/(invoice|payment|wire|budget|arr|mrr|revenue|finance|forecast)/i.test(text)) return "Finance";
  if (/(candidate|interview|hiring|employee|people|hr|recruit)/i.test(text)) return "People";
  if (/(customer|prospect|deal|renewal|sales|account)/i.test(text)) return "Sales";
  if (/(bug|incident|api|engineering|deploy|outage|checkout|migration)/i.test(text)) return "Engineering";
  if (/(product|launch|roadmap|feature)/i.test(text)) return "Product";
  if (/(calendar|schedule|meeting|travel)/i.test(text)) return "Executive Assistant";
  return "Operations";
}

function flagForText(text: string): Pick<Classification, "flagCategory" | "flagSeverity"> {
  if (/(security|phish|password|mfa|verify|suspicious|breach|login)/i.test(text)) {
    return { flagCategory: "security", flagSeverity: "critical" };
  }
  if (/(lawsuit|legal|contract|compliance|terms)/i.test(text)) {
    return { flagCategory: "legal", flagSeverity: "high" };
  }
  if (/(wire|payment|invoice|budget|arr|mrr|revenue|forecast)/i.test(text)) {
    return { flagCategory: "financial", flagSeverity: "high" };
  }
  if (/(customer|renewal|churn|escalation|sla)/i.test(text)) {
    return { flagCategory: "customer", flagSeverity: "high" };
  }
  if (/(candidate|employee|hiring|people|hr|resign)/i.test(text)) {
    return { flagCategory: "people", flagSeverity: "medium" };
  }
  if (/(outage|incident|blocked|at risk|delay)/i.test(text)) {
    return { flagCategory: "operational", flagSeverity: "high" };
  }
  if (/(press|media|reputation|public)/i.test(text)) {
    return { flagCategory: "reputational", flagSeverity: "high" };
  }
  return { flagCategory: null, flagSeverity: null };
}

function classifyMessage(message: NormalizedMessage): Classification {
  const text = lowerText(message);
  const flag = flagForText(text);
  const priority = priorityForText(text);

  if (flag.flagCategory === "security") {
    return { category: "delegate", priority, ownerRole: "Security", ...flag };
  }

  if (includesAny(text, decisionTerms)) {
    return { category: "decide", priority, ownerRole: null, ...flag };
  }

  if (includesAny(text, delegationTerms) || flag.flagCategory) {
    return { category: "delegate", priority, ownerRole: ownerForText(text), ...flag };
  }

  if (includesAny(text, ignoreTerms)) {
    return { category: "ignore", priority: "low", ownerRole: null, ...flag };
  }

  return { category: "ignore", priority, ownerRole: null, ...flag };
}

function draftForMessage(message: NormalizedMessage, classification: Classification): DraftedResponse {
  if (classification.category === "ignore") {
    return { type: "no_response", to: null, subject: null, body: "" };
  }

  if (classification.category === "delegate") {
    const owner = classification.ownerRole ?? "Operations";
    return {
      type: "internal_handoff",
      to: owner,
      subject: message.subject ?? null,
      body: `Please review this ${message.channel} message from ${message.sender} and recommend the next step.`
    };
  }

  return {
    type: "reply_to_sender",
    to: message.sender,
    subject: message.subject ?? null,
    body: "Thanks. I am reviewing this and will come back with a decision."
  };
}

function actionItemForMessage(message: NormalizedMessage, classification: Classification, index: number): ActionItem[] {
  if (classification.category === "ignore") {
    return [];
  }

  return [
    {
      id: `action-${index + 1}-${slug(message.id)}`,
      category: classification.category,
      title: titleForMessage(message),
      description: compactText(message.body),
      ownerRole: classification.category === "delegate" ? classification.ownerRole ?? "Operations" : null,
      decisionRequired: classification.category === "decide" ? `Decide how to respond to ${titleForMessage(message)}.` : null,
      deadlineText: includesAny(lowerText(message), urgentTerms) ? "Today" : null,
      deadlineAt: null,
      recommendedNextStep:
        classification.category === "delegate"
          ? `Route to ${classification.ownerRole ?? "Operations"} for handling.`
          : "Review the source message and record the CEO decision.",
      missingContext: []
    }
  ];
}

function executiveItemForMessage(
  message: NormalizedMessage,
  classification: Classification,
  threadId: string,
  index: number
): ExecutiveItem | null {
  if (classification.category === "ignore") {
    return null;
  }

  const title = titleForMessage(message);
  const isDelegate = classification.category === "delegate";
  const itemId = `${classification.category}-${index + 1}-${slug(message.id)}`;

  return {
    id: itemId,
    threadId,
    kind: classification.category,
    section: classification.priority === "urgent" ? "urgent" : isDelegate ? "delegated" : "decisions",
    title,
    summary: compactText(message.body),
    priority: classification.priority,
    sourceMessageIds: [message.id],
    ownerRole: isDelegate ? classification.ownerRole ?? "Operations" : null,
    deadlineText: classification.priority === "urgent" ? "Today" : null,
    deadlineAt: null,
    decisionQuestion: isDelegate ? null : `What decision should be made for "${title}"?`,
    options: isDelegate
      ? null
      : [
          { label: "Approve", tradeoff: "Moves the request forward." },
          { label: "Hold", tradeoff: "Avoids committing without more context." }
        ],
    recommendedNextStep: isDelegate
      ? `Delegate to ${classification.ownerRole ?? "Operations"} for handling.`
      : "Record the CEO decision before any response is sent.",
    missingContext: [],
    draftedResponse: draftForMessage(message, classification)
  };
}

export function buildFallbackAnalysis(messages: NormalizedMessage[], sourceDate: string): AnalysisResult {
  const classifications = messages.map(classifyMessage);
  const flags: ExecutiveFlag[] = [];
  const executiveItems: ExecutiveItem[] = [];

  const messageAnalyses: MessageAnalysis[] = messages.map((message, index) => {
    const classification = classifications[index];
    const flagId =
      classification.flagCategory && classification.flagSeverity
        ? `flag-${classification.flagCategory}-${index + 1}-${slug(message.id)}`
        : null;

    if (flagId && classification.flagCategory && classification.flagSeverity) {
      flags.push({
        id: flagId,
        severity: classification.flagSeverity,
        category: classification.flagCategory,
        title: `${classification.flagCategory[0].toUpperCase()}${classification.flagCategory.slice(1)} flag: ${titleForMessage(message)}`,
        description: compactText(message.body),
        sourceMessageIds: [message.id],
        status: "active",
        recommendedAction:
          classification.flagCategory === "security"
            ? "Verify through official systems and do not reply to suspicious senders."
            : `Review with ${classification.ownerRole ?? ownerForText(lowerText(message))}.`
      });
    }

    return {
      messageId: message.id,
      primaryCategory: classification.category,
      lifecycleStatus: classification.category === "ignore" ? "informational" : "active",
      relatedMessageIds: [],
      supersededBy: [],
      resolvedBy: [],
      rationale:
        classification.category === "ignore"
          ? "No clear CEO action was detected in the deterministic fallback pass."
          : `Deterministic fallback classified this as ${classification.category} based on action and risk keywords.`,
      actionItems: actionItemForMessage(message, classification, index),
      flagIds: flagId ? [flagId] : [],
      draftedResponse: draftForMessage(message, classification),
      confidence: classification.category === "ignore" ? 0.55 : 0.65,
      missingContext: []
    };
  });

  messages.forEach((message, index) => {
    const threadId = `thread-${index + 1}-${slug(message.id)}`;
    const item = executiveItemForMessage(message, classifications[index], threadId, index);
    if (item) {
      executiveItems.push(item);
    }
  });

  const threads = messages.map((message, index) => {
    const classification = classifications[index];
    const matchingItem = executiveItems.find((item) => item.sourceMessageIds.includes(message.id));
    const lifecycleStatus: LifecycleStatus = classification.category === "ignore" ? "informational" : "active";
    return {
      id: `thread-${index + 1}-${slug(message.id)}`,
      title: titleForMessage(message),
      messageIds: [message.id],
      latestMessageId: message.id,
      lifecycleStatus,
      currentState:
        classification.category === "ignore"
          ? "No CEO action required from the deterministic fallback pass."
          : compactText(message.body),
      activeExecutiveItemIds: matchingItem ? [matchingItem.id] : []
    };
  });

  return {
    sourceDate,
    messageAnalyses,
    threads,
    executiveItems,
    flags
  };
}

function threadLooksResolved(messages: NormalizedMessage[], latestMessageId: string) {
  const latest = messages.find((message) => message.id === latestMessageId);
  if (!latest) {
    return false;
  }

  return /\b(resolved|withdrawn|cancelled|canceled|closed|handled|no action needed|no transfer was made|blocked the domain)\b/i.test(
    lowerText(latest)
  );
}

export function buildFallbackAnalysisForThread(
  messages: NormalizedMessage[],
  sourceDate: string,
  plannedThread: PlannedThread
): AnalysisResult {
  const base = buildFallbackAnalysis(messages, sourceDate);
  const validIds = new Set(messages.map((message) => message.id));
  const messageIds = plannedThread.messageIds.filter((id) => validIds.has(id));
  const latestMessageId = messageIds.includes(plannedThread.latestMessageId)
    ? plannedThread.latestMessageId
    : messages.at(-1)?.id ?? messageIds.at(-1) ?? "";
  const resolved = threadLooksResolved(messages, latestMessageId);
  const latestItemIds = new Set<string>();

  const messageAnalyses = base.messageAnalyses.map((analysis) => {
    if (resolved) {
      return {
        ...analysis,
        lifecycleStatus: "resolved" as const,
        supersededBy: [],
        resolvedBy: analysis.messageId === latestMessageId ? [] : [latestMessageId],
        actionItems: []
      };
    }

    if (analysis.messageId !== latestMessageId && analysis.lifecycleStatus === "active") {
      return {
        ...analysis,
        lifecycleStatus: "superseded" as const,
        supersededBy: [latestMessageId],
        resolvedBy: [],
        actionItems: []
      };
    }

    return {
      ...analysis,
      relatedMessageIds: messageIds.filter((id) => id !== analysis.messageId)
    };
  });

  const executiveItems = resolved
    ? []
    : base.executiveItems
        .filter((item) => item.sourceMessageIds.includes(latestMessageId))
        .map((item) => {
          latestItemIds.add(item.id);
          return {
            ...item,
            threadId: plannedThread.id,
            sourceMessageIds: [...new Set([...messageIds.filter((id) => id !== latestMessageId), ...item.sourceMessageIds])]
          };
        });

  const flags = base.flags.map((flag) => ({
    ...flag,
    status: resolved ? ("resolved" as const) : flag.sourceMessageIds.includes(latestMessageId) ? flag.status : ("resolved" as const)
  }));

  const latestMessage = messages.find((message) => message.id === latestMessageId);
  const lifecycleStatus: LifecycleStatus = resolved
    ? "resolved"
    : executiveItems.length > 0
      ? "active"
      : messageAnalyses.some((analysis) => analysis.lifecycleStatus === "active")
        ? "active"
        : "informational";

  return {
    sourceDate,
    messageAnalyses,
    threads: [
      {
        id: plannedThread.id,
        title: plannedThread.title || (latestMessage ? titleForMessage(latestMessage) : "Thread"),
        messageIds,
        latestMessageId,
        lifecycleStatus,
        currentState: latestMessage ? compactText(latestMessage.body) : plannedThread.rationale,
        activeExecutiveItemIds: [...latestItemIds]
      }
    ],
    executiveItems,
    flags
  };
}
