import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/lib/ai/schemas";
import { deriveMetrics, sortByPriority } from "@/lib/utils/ranking";

describe("ranking utilities", () => {
  it("sorts by priority and then deadline", () => {
    const sorted = sortByPriority([
      { priority: "medium" as const, deadlineAt: "2026-03-20T00:00:00Z", id: "c" },
      { priority: "urgent" as const, deadlineAt: "2026-03-19T00:00:00Z", id: "b" },
      { priority: "urgent" as const, deadlineAt: "2026-03-18T00:00:00Z", id: "a" }
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("derives current-state metrics without trusting model totals", () => {
    const analysis: AnalysisResult = {
      sourceDate: "2026-03-18",
      messageAnalyses: [
        {
          messageId: "1",
          primaryCategory: "decide",
          lifecycleStatus: "superseded",
          relatedMessageIds: [],
          supersededBy: ["2"],
          resolvedBy: [],
          rationale: "Old decision.",
          actionItems: [],
          flagIds: [],
          draftedResponse: { type: "no_response", to: null, subject: null, body: "" },
          confidence: 0.9,
          missingContext: []
        },
        {
          messageId: "2",
          primaryCategory: "delegate",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "Current action.",
          actionItems: [],
          flagIds: [],
          draftedResponse: { type: "internal_handoff", to: null, subject: null, body: "Please handle." },
          confidence: 0.9,
          missingContext: []
        }
      ],
      threads: [],
      executiveItems: [
        {
          id: "item-1",
          kind: "decide",
          section: "decisions",
          title: "Current decision",
          summary: "Decision needed now.",
          priority: "high",
          sourceMessageIds: ["2"],
          threadId: null,
          ownerRole: null,
          deadlineText: null,
          deadlineAt: null,
          decisionQuestion: "Approve?",
          options: null,
          recommendedNextStep: null,
          draftedResponse: null,
          missingContext: []
        },
        {
          id: "item-2",
          kind: "delegate",
          section: "delegated",
          title: "Current handoff",
          summary: "Delegate now.",
          priority: "medium",
          sourceMessageIds: ["2"],
          threadId: null,
          ownerRole: "Operations",
          deadlineText: null,
          deadlineAt: null,
          decisionQuestion: null,
          options: null,
          recommendedNextStep: null,
          draftedResponse: null,
          missingContext: []
        },
        {
          id: "item-3",
          kind: "decide",
          section: "handled",
          title: "Old decision",
          summary: "No longer current.",
          priority: "low",
          sourceMessageIds: ["1"],
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
      ],
      flags: [
        {
          id: "flag-1",
          severity: "high",
          category: "operational",
          title: "Active risk",
          description: "Risk.",
          sourceMessageIds: ["2"],
          status: "active",
          recommendedAction: null
        }
      ]
    };

    expect(deriveMetrics(analysis, 2)).toEqual({
      messagesProcessed: 2,
      activeDecisions: 1,
      delegatedActions: 1,
      activeFlags: 1,
      inactiveMessages: 1
    });
  });
});
