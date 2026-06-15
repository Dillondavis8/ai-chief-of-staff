import type { AnalysisResult, DailyBriefing, ExecutiveItem } from "./schemas";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import { countWords } from "@/lib/utils/word-count";

export type AnalysisValidationResult = {
  valid: boolean;
  issues: string[];
};

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
      return;
    }

    seen.add(value);
  });

  return [...duplicates];
}

function pushUnknownIds(
  issues: string[],
  label: string,
  ids: string[],
  validIds: Set<string>,
  allowSelf?: string
) {
  ids.forEach((id) => {
    if (!validIds.has(id)) {
      issues.push(`${label} references unknown message ID "${id}".`);
    }

    if (allowSelf && id === allowSelf) {
      issues.push(`${label} references itself for message "${id}".`);
    }
  });
}

function itemText(item: ExecutiveItem) {
  return [
    item.title,
    item.summary,
    item.ownerRole,
    item.deadlineText,
    item.decisionQuestion,
    item.recommendedNextStep,
    item.options?.map((option) => `${option.label} ${option.tradeoff}`).join(" "),
    item.missingContext.join(" "),
    item.draftedResponse?.body
  ]
    .filter(Boolean)
    .join(" ");
}

function collectFinancialTerms(text: string) {
  const terms = text.match(/(?:\$|USD\s*)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|b))?|\b\d[\d,]*(?:\.\d+)?\s?(?:ARR|MRR|revenue|dollars?)\b/gi);
  return terms ?? [];
}

function numericFootprint(term: string) {
  const number = term.match(/\d[\d,]*(?:\.\d+)?/);
  if (!number) {
    return "";
  }

  return number[0].replace(/[,.]/g, "");
}

function hasUnsupportedFinancialTerm(
  generatedText: string,
  sourceText: string
) {
  const sourceTerms = collectFinancialTerms(sourceText).map(numericFootprint).filter(Boolean);
  const generatedTerms = collectFinancialTerms(generatedText);

  return generatedTerms.some((term) => {
    const footprint = numericFootprint(term);
    return footprint && !sourceTerms.includes(footprint);
  });
}

function hasInventedCandidateDetail(generatedText: string, sourceText: string) {
  if (!/attached|attachment|packet/i.test(sourceText) || !/candidate/i.test(sourceText)) {
    return false;
  }

  const riskyTerms = ["years", "previously", "worked at", "background", "experience", "founded", "scaled"];
  return riskyTerms.some((term) => generatedText.toLowerCase().includes(term) && !sourceText.toLowerCase().includes(term));
}

export function validateAnalysisResult(
  analysis: AnalysisResult,
  messages: NormalizedMessage[],
  expectedSourceDate: string
): AnalysisValidationResult {
  const issues: string[] = [];
  const messageIds = messages.map((message) => message.id);
  const validMessageIds = new Set(messageIds);
  const messageById = new Map(messages.map((message) => [message.id, message]));

  if (analysis.sourceDate !== expectedSourceDate) {
    issues.push(`sourceDate must be "${expectedSourceDate}".`);
  }

  const analyzedIds = analysis.messageAnalyses.map((message) => message.messageId);
  duplicateValues(analyzedIds).forEach((id) => issues.push(`messageAnalyses includes duplicate message ID "${id}".`));
  messageIds.forEach((id) => {
    if (!analyzedIds.includes(id)) {
      issues.push(`messageAnalyses is missing input message ID "${id}".`);
    }
  });
  analyzedIds.forEach((id) => {
    if (!validMessageIds.has(id)) {
      issues.push(`messageAnalyses includes unknown message ID "${id}".`);
    }
  });

  const flagIds = new Set(analysis.flags.map((flag) => flag.id));
  const duplicateFlagIds = duplicateValues(analysis.flags.map((flag) => flag.id));
  duplicateFlagIds.forEach((id) => issues.push(`flags includes duplicate ID "${id}".`));

  analysis.messageAnalyses.forEach((message) => {
    if (!message.rationale.trim()) {
      issues.push(`message ${message.messageId} needs a rationale.`);
    }

    if (!message.draftedResponse.body.trim() && message.draftedResponse.type !== "no_response") {
      issues.push(`message ${message.messageId} needs a drafted response body.`);
    }

    pushUnknownIds(issues, `message ${message.messageId} relatedMessageIds`, message.relatedMessageIds, validMessageIds);
    pushUnknownIds(issues, `message ${message.messageId} supersededBy`, message.supersededBy, validMessageIds, message.messageId);
    pushUnknownIds(issues, `message ${message.messageId} resolvedBy`, message.resolvedBy, validMessageIds, message.messageId);

    message.flagIds.forEach((flagId) => {
      if (!flagIds.has(flagId)) {
        issues.push(`message ${message.messageId} references unknown flag ID "${flagId}".`);
      }
    });
  });

  const threadIds = analysis.threads.map((thread) => thread.id);
  duplicateValues(threadIds).forEach((id) => issues.push(`threads includes duplicate ID "${id}".`));
  const validThreadIds = new Set(threadIds);

  const executiveItemIds = analysis.executiveItems.map((item) => item.id);
  duplicateValues(executiveItemIds).forEach((id) => issues.push(`executiveItems includes duplicate ID "${id}".`));
  const validExecutiveItemIds = new Set(executiveItemIds);

  analysis.threads.forEach((thread) => {
    pushUnknownIds(issues, `thread ${thread.id}`, thread.messageIds, validMessageIds);
    if (!validMessageIds.has(thread.latestMessageId)) {
      issues.push(`thread ${thread.id} latestMessageId is unknown.`);
    }
    if (!thread.messageIds.includes(thread.latestMessageId)) {
      issues.push(`thread ${thread.id} latestMessageId must be included in messageIds.`);
    }
    thread.activeExecutiveItemIds.forEach((id) => {
      if (!validExecutiveItemIds.has(id)) {
        issues.push(`thread ${thread.id} references unknown executive item ID "${id}".`);
      }
    });
  });

  analysis.executiveItems.forEach((item) => {
    pushUnknownIds(issues, `executive item ${item.id}`, item.sourceMessageIds, validMessageIds);
    if (item.threadId && !validThreadIds.has(item.threadId)) {
      issues.push(`executive item ${item.id} references unknown thread ID "${item.threadId}".`);
    }

    const isActive = item.section !== "handled";
    if (isActive && item.kind === "delegate" && !item.ownerRole?.trim()) {
      issues.push(`active delegate executive item ${item.id} needs an ownerRole.`);
    }
    if (isActive && item.kind === "decide" && !item.decisionQuestion?.trim()) {
      issues.push(`active decide executive item ${item.id} needs a decisionQuestion.`);
    }
    if (isActive && (item.kind === "decide" || item.kind === "delegate") && !item.draftedResponse?.body.trim()) {
      issues.push(`active ${item.kind} executive item ${item.id} needs a drafted response body.`);
    }

    const sourceText = item.sourceMessageIds
      .map((id) => {
        const message = messageById.get(id);
        return [message?.subject, message?.body].filter(Boolean).join(" ");
      })
      .join(" ");
    const generatedText = itemText(item);

    if (hasUnsupportedFinancialTerm(generatedText, sourceText)) {
      issues.push(`executive item ${item.id} appears to contain a financial value not present in its source messages.`);
    }

    if (hasInventedCandidateDetail(generatedText, sourceText)) {
      issues.push(`executive item ${item.id} appears to infer candidate details from a missing attachment.`);
    }
  });

  analysis.flags.forEach((flag) => {
    pushUnknownIds(issues, `flag ${flag.id}`, flag.sourceMessageIds, validMessageIds);
  });

  const securityFlagSourceIds = new Set(
    analysis.flags
      .filter((flag) => flag.category === "security" && ["critical", "high"].includes(flag.severity))
      .flatMap((flag) => flag.sourceMessageIds)
  );

  analysis.messageAnalyses.forEach((message) => {
    if (!securityFlagSourceIds.has(message.messageId)) {
      return;
    }

    const source = messageById.get(message.messageId);
    const to = message.draftedResponse.to?.toLowerCase() ?? "";
    if (message.draftedResponse.type === "reply_to_sender" || (source && to.includes(source.sender.toLowerCase()))) {
      issues.push(`security-risk message ${message.messageId} must not draft a reply to the suspicious sender.`);
    }
  });

  return {
    valid: issues.length === 0,
    issues
  };
}

export function validateBriefing(briefing: DailyBriefing, analysis: AnalysisResult) {
  const issues: string[] = [];
  const validMessageIds = new Set(analysis.messageAnalyses.map((message) => message.messageId));
  const renderedText = [
    briefing.title,
    briefing.overview,
    ...briefing.urgent.flatMap((item) => [item.title, item.body]),
    ...briefing.decisions.flatMap((item) => [item.title, item.body]),
    ...briefing.flags.flatMap((item) => [item.title, item.body]),
    ...briefing.handled.flatMap((item) => [item.title, item.body]),
    ...briefing.personal.flatMap((item) => [item.title, item.body])
  ]
    .filter(Boolean)
    .join(" ");

  const wordCount = countWords(renderedText);
  if (wordCount > 300) {
    issues.push(`briefing is ${wordCount} words; target is approximately 250 and must stay under 300.`);
  }

  const sections = [
    ...briefing.urgent,
    ...briefing.decisions,
    ...briefing.flags,
    ...briefing.handled,
    ...briefing.personal
  ];

  sections.forEach((item) => {
    if (item.sourceMessageIds.length === 0) {
      issues.push(`briefing item "${item.title}" needs sourceMessageIds.`);
    }
    item.sourceMessageIds.forEach((id) => {
      if (!validMessageIds.has(id)) {
        issues.push(`briefing item "${item.title}" references unknown message ID "${id}".`);
      }
    });
  });

  return { valid: issues.length === 0, issues, wordCount };
}
