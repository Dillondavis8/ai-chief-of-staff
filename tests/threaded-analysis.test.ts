import { describe, expect, it } from "vitest";
import sample from "@/data/messages.json";
import { compactFromAnalysis, expandCompactAnalysis, namespaceCompactAnalysis, type CompactAnalysis } from "@/lib/ai/compact-analysis";
import { buildFallbackAnalysisForThread } from "@/lib/ai/fallback-analysis";
import { shouldUseThreadedAnalysis } from "@/lib/ai/threaded-analysis";
import { completeThreadPlan, validateThreadPlan, type ThreadPlan } from "@/lib/ai/thread-planning";
import { validateAnalysisResult } from "@/lib/ai/validation";
import { normalizeMessages } from "@/lib/messages/normalize";

function normalizedSample() {
  const result = normalizeMessages(sample);
  if (!result.ok) {
    throw new Error("sample fixture should normalize");
  }
  return result;
}

describe("thread planning", () => {
  it("completes missing, duplicate, and stale-latest IDs into a valid primary thread plan", () => {
    const normalized = normalizedSample();
    const messages = normalized.messages.slice(0, 3);
    const [first, second, third] = messages;
    const invalidPlan: ThreadPlan = {
      sourceDate: normalized.sourceDate,
      threads: [
        {
          id: "redwood",
          title: "Redwood renewal",
          messageIds: [first.id, second.id, first.id],
          latestMessageId: first.id,
          rationale: "Potentially related commercial messages."
        },
        {
          id: "redwood",
          title: "Duplicate thread",
          messageIds: [second.id],
          latestMessageId: second.id,
          rationale: "Duplicate assignment."
        }
      ]
    };

    expect(validateThreadPlan(invalidPlan, messages, normalized.sourceDate).valid).toBe(false);

    const completed = completeThreadPlan(invalidPlan, messages, normalized.sourceDate);

    expect(validateThreadPlan(completed, messages, normalized.sourceDate).valid).toBe(true);
    expect(completed.threads.flatMap((thread) => thread.messageIds).sort()).toEqual(
      messages.map((message) => message.id).sort()
    );
    expect(completed.threads[0].latestMessageId).toBe(second.id);
    expect(completed.threads.some((thread) => thread.messageIds.includes(third.id))).toBe(true);
  });

  it("uses threaded analysis once the configured batch threshold is reached", () => {
    const normalized = normalizedSample();
    const previous = process.env.AOS_THREADED_ANALYSIS_MIN_MESSAGES;
    process.env.AOS_THREADED_ANALYSIS_MIN_MESSAGES = "3";

    expect(shouldUseThreadedAnalysis(normalized.messages.slice(0, 3))).toBe(true);
    expect(shouldUseThreadedAnalysis(normalized.messages.slice(0, 2))).toBe(false);

    if (previous === undefined) {
      delete process.env.AOS_THREADED_ANALYSIS_MIN_MESSAGES;
    } else {
      process.env.AOS_THREADED_ANALYSIS_MIN_MESSAGES = previous;
    }
  });
});

describe("thread-scoped deterministic fallback", () => {
  it("preserves a planned active thread instead of creating one thread per message", () => {
    const raw = [
      {
        id: "1",
        channel: "email",
        from: "Sales",
        timestamp: "2026-03-18T09:00:00Z",
        subject: "Customer terms",
        body: "Please approve the customer renewal terms before the end of day."
      },
      {
        id: "2",
        channel: "slack",
        from: "Sales",
        timestamp: "2026-03-18T11:00:00Z",
        channel_name: "#sales",
        body: "Updated terms are ready. Please approve the final renewal today."
      }
    ];
    const normalized = normalizeMessages(raw);
    if (!normalized.ok) {
      throw new Error("synthetic thread should normalize");
    }
    const thread = {
      id: "customer-renewal",
      title: "Customer renewal terms",
      messageIds: ["1", "2"],
      latestMessageId: "2",
      rationale: "Both messages update the same renewal approval."
    };

    const analysis = buildFallbackAnalysisForThread(normalized.messages, normalized.sourceDate, thread);

    expect(validateAnalysisResult(analysis, normalized.messages, normalized.sourceDate).valid).toBe(true);
    expect(analysis.threads).toHaveLength(1);
    expect(analysis.threads[0]).toMatchObject({
      id: "customer-renewal",
      latestMessageId: "2",
      lifecycleStatus: "active"
    });
    expect(analysis.messageAnalyses.find((item) => item.messageId === "1")?.lifecycleStatus).toBe("superseded");
    expect(analysis.executiveItems).toHaveLength(1);
    expect(analysis.executiveItems[0].sourceMessageIds).toEqual(["1", "2"]);
  });

  it("marks a resolved planned thread without leaking active fallback actions", () => {
    const raw = [
      {
        id: "10",
        channel: "email",
        from: "Finance",
        timestamp: "2026-03-18T09:00:00Z",
        subject: "Invoice approval",
        body: "Please approve this invoice today."
      },
      {
        id: "11",
        channel: "email",
        from: "Finance",
        timestamp: "2026-03-18T10:00:00Z",
        subject: "Invoice approval resolved",
        body: "This is resolved. No action needed from the CEO."
      }
    ];
    const normalized = normalizeMessages(raw);
    if (!normalized.ok) {
      throw new Error("synthetic resolved thread should normalize");
    }

    const analysis = buildFallbackAnalysisForThread(normalized.messages, normalized.sourceDate, {
      id: "invoice-approval",
      title: "Invoice approval",
      messageIds: ["10", "11"],
      latestMessageId: "11",
      rationale: "The second message resolves the invoice request."
    });

    expect(validateAnalysisResult(analysis, normalized.messages, normalized.sourceDate).valid).toBe(true);
    expect(analysis.threads[0].lifecycleStatus).toBe("resolved");
    expect(analysis.executiveItems).toEqual([]);
    expect(analysis.messageAnalyses.every((message) => message.lifecycleStatus === "resolved")).toBe(true);
  });
});

describe("compact threaded merge helpers", () => {
  it("namespaces thread and executive IDs while preserving source message IDs", () => {
    const normalized = normalizedSample();
    const messages = normalized.messages.slice(0, 1);
    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: messages[0].id,
          primaryCategory: "delegate",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "Operations should handle this.",
          actionItems: [],
          confidence: 0.9,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread",
          title: "Operations follow-up",
          messageIds: [messages[0].id],
          latestMessageId: messages[0].id,
          lifecycleStatus: "active",
          currentState: "Operations should handle this.",
          activeExecutiveItemIds: ["delegate"]
        }
      ],
      executiveItems: [
        {
          id: "delegate",
          kind: "delegate",
          section: "delegated",
          title: "Coordinate follow-up",
          summary: "Operations should coordinate the next step.",
          priority: "medium",
          sourceMessageIds: [messages[0].id],
          threadId: "thread",
          ownerRole: "Operations",
          deadlineText: null,
          deadlineAt: null,
          decisionQuestion: null,
          options: null,
          recommendedNextStep: "Ask Operations to coordinate.",
          missingContext: []
        }
      ],
      flags: []
    };

    const namespaced = namespaceCompactAnalysis(compact, "planned-thread");
    const analysis = expandCompactAnalysis(namespaced, messages, normalized.sourceDate);

    expect(validateAnalysisResult(analysis, messages, normalized.sourceDate).valid).toBe(true);
    expect(analysis.threads[0].id).toBe("planned-thread-thread");
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual(["planned-thread-delegate"]);
    expect(analysis.executiveItems[0].sourceMessageIds).toEqual([messages[0].id]);
    expect(compactFromAnalysis(analysis).messageAnalyses[0]).not.toHaveProperty("draftedResponse");
  });
});
