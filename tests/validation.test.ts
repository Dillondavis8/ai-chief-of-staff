import { describe, expect, it } from "vitest";
import sample from "@/data/messages.json";
import { normalizeMessages } from "@/lib/messages/normalize";
import type { AnalysisResult } from "@/lib/ai/schemas";
import { validateAnalysisResult } from "@/lib/ai/validation";

function normalizedSample() {
  const result = normalizeMessages(sample);
  if (!result.ok) {
    throw new Error("sample fixture should normalize");
  }
  return result;
}

function makeBaseAnalysis(): AnalysisResult {
  const normalized = normalizedSample();

  return {
    sourceDate: normalized.sourceDate,
    messageAnalyses: normalized.messages.map((message) => ({
      messageId: message.id,
      primaryCategory: "ignore",
      lifecycleStatus: "informational",
      relatedMessageIds: [],
      supersededBy: [],
      resolvedBy: [],
      rationale: "No current CEO action required.",
      actionItems: [],
      flagIds: [],
      draftedResponse: {
        type: "no_response",
        to: null,
        subject: null,
        body: ""
      },
      confidence: 0.9,
      missingContext: []
    })),
    threads: [
      {
        id: "thread-info",
        title: "Informational messages",
        messageIds: normalized.messages.map((message) => message.id),
        latestMessageId: normalized.messages.at(-1)?.id ?? "1",
        lifecycleStatus: "informational",
        currentState: "No active item in this synthetic test analysis.",
        activeExecutiveItemIds: []
      }
    ],
    executiveItems: [],
    flags: []
  };
}

describe("validateAnalysisResult", () => {
  it("accepts structurally complete analysis", () => {
    const normalized = normalizedSample();
    const analysis = makeBaseAnalysis();

    expect(validateAnalysisResult(analysis, normalized.messages, normalized.sourceDate)).toEqual({
      valid: true,
      issues: []
    });
  });

  it("rejects missing owner and decision question for active executive items", () => {
    const normalized = normalizedSample();
    const analysis = makeBaseAnalysis();
    analysis.executiveItems.push(
      {
        id: "delegate-1",
        kind: "delegate",
        section: "delegated",
        title: "Investigate",
        summary: "Needs owner.",
        priority: "medium",
        sourceMessageIds: ["13"],
        threadId: null,
        ownerRole: null,
        deadlineText: null,
        deadlineAt: null,
        decisionQuestion: null,
        options: null,
        recommendedNextStep: null,
        draftedResponse: null,
        missingContext: []
      },
      {
        id: "decide-1",
        kind: "decide",
        section: "decisions",
        title: "Approve",
        summary: "Needs question.",
        priority: "high",
        sourceMessageIds: ["19"],
        threadId: null,
        ownerRole: null,
        deadlineText: null,
        deadlineAt: null,
        decisionQuestion: null,
        options: null,
        recommendedNextStep: null,
        draftedResponse: null,
        missingContext: []
      }
    );

    const result = validateAnalysisResult(analysis, normalized.messages, normalized.sourceDate);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes("ownerRole"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("decisionQuestion"))).toBe(true);
  });

  it("blocks replies to suspicious security senders", () => {
    const normalized = normalizedSample();
    const analysis = makeBaseAnalysis();
    analysis.flags.push({
      id: "flag-security",
      severity: "critical",
      category: "security",
      title: "Suspicious verification email",
      description: "Potential phishing.",
      sourceMessageIds: ["4"],
      status: "active",
      recommendedAction: null
    });
    const message = analysis.messageAnalyses.find((item) => item.messageId === "4");
    if (!message) {
      throw new Error("message 4 missing");
    }
    message.flagIds = ["flag-security"];
    message.draftedResponse = {
      type: "reply_to_sender",
      to: "noreply@seczure-verify.com",
      subject: null,
      body: "Please verify."
    };

    const result = validateAnalysisResult(analysis, normalized.messages, normalized.sourceDate);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes("must not draft a reply"))).toBe(true);
  });
});
