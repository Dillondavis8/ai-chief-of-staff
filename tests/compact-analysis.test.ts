import { describe, expect, it } from "vitest";
import sample from "@/data/messages.json";
import { buildFallbackBriefing, briefingWordCount } from "@/lib/ai/briefing";
import { buildCompactAnalysisSchema, expandCompactAnalysis, type CompactAnalysis } from "@/lib/ai/compact-analysis";
import { normalizeMessages } from "@/lib/messages/normalize";
import { validateAnalysisResult } from "@/lib/ai/validation";

function normalizedSample() {
  const result = normalizeMessages(sample);
  if (!result.ok) {
    throw new Error("sample fixture should normalize");
  }
  return result;
}

describe("compact analysis expansion", () => {
  it("constrains source IDs and expands compact model output into the full app schema", () => {
    const normalized = normalizedSample();
    const messages = normalized.messages.slice(0, 2);
    const [first, second] = messages;
    const schema = buildCompactAnalysisSchema(messages.map((message) => message.id));

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: first.id,
          primaryCategory: "ignore",
          lifecycleStatus: "informational",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "No CEO action required.",
          actionItems: [],
          confidence: 0.82,
          missingContext: []
        },
        {
          messageId: second.id,
          primaryCategory: "delegate",
          lifecycleStatus: "active",
          relatedMessageIds: [first.id],
          supersededBy: [],
          resolvedBy: [second.id],
          rationale: "Security should verify the suspicious request.",
          actionItems: [
            {
              id: "security-review",
              category: "delegate",
              title: "Verify suspicious request",
              description: "Security should validate through official systems.",
              ownerRole: "Security",
              decisionRequired: null,
              deadlineText: "Today",
              deadlineAt: null,
              recommendedNextStep: "Route to Security.",
              missingContext: []
            }
          ],
          confidence: 0.9,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-security",
          title: "Suspicious request",
          messageIds: [first.id, second.id],
          latestMessageId: second.id,
          lifecycleStatus: "active",
          currentState: "Security needs to verify the request.",
          activeExecutiveItemIds: ["delegate-security", "action-item-id"]
        }
      ],
      executiveItems: [
        {
          id: "delegate-security",
          kind: "delegate",
          section: "urgent",
          title: "Verify suspicious request",
          summary: "Security needs to validate the request before any reply.",
          priority: "urgent",
          sourceMessageIds: [second.id],
          threadId: "thread-security",
          ownerRole: "Security",
          deadlineText: "Today",
          deadlineAt: null,
          decisionQuestion: null,
          options: null,
          recommendedNextStep: "Route to Security.",
          missingContext: []
        }
      ],
      flags: [
        {
          id: "flag-security",
          severity: "critical",
          category: "security",
          title: "Suspicious request",
          description: "The sender should not receive a direct reply until verified.",
          sourceMessageIds: [second.id],
          status: "active",
          recommendedAction: "Verify through official systems."
        }
      ]
    };

    expect(schema.safeParse(compact).success).toBe(true);
    expect(
      schema.safeParse({
        ...compact,
        flags: [{ ...compact.flags[0], sourceMessageIds: ["not-a-source-id"] }]
      }).success
    ).toBe(false);

    const analysis = expandCompactAnalysis(compact, messages, normalized.sourceDate);
    expect(validateAnalysisResult(analysis, messages, normalized.sourceDate).valid).toBe(true);
    expect(analysis.messageAnalyses).toHaveLength(2);
    expect(analysis.messageAnalyses[0].lifecycleStatus).toBe("superseded");
    expect(analysis.messageAnalyses[0].supersededBy).toEqual([second.id]);
    expect(analysis.messageAnalyses[1].resolvedBy).toEqual([]);
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual(["delegate-security"]);
    expect(analysis.messageAnalyses[1].draftedResponse.type).toBe("internal_handoff");
    expect(analysis.executiveItems[0].draftedResponse?.to).toBe("Security");
    expect(analysis.executiveItems[0].draftedResponse?.body).toContain("official security systems");
    expect(briefingWordCount(buildFallbackBriefing(analysis))).toBeLessThanOrEqual(250);
  });

  it("promotes active delegate action items into owner handoffs when the model omits them", () => {
    const normalized = normalizedSample();
    const message = normalized.messages[0];
    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "delegate",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "Operations should handle this.",
          actionItems: [
            {
              id: "ops-follow-up",
              category: "delegate",
              title: "Coordinate follow-up",
              description: "Operations should coordinate the next step.",
              ownerRole: "Operations",
              decisionRequired: null,
              deadlineText: null,
              deadlineAt: null,
              recommendedNextStep: "Ask Operations to coordinate the next step.",
              missingContext: []
            }
          ],
          confidence: 0.88,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-ops",
          title: "Operations follow-up",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "Operations should coordinate the next step.",
          activeExecutiveItemIds: []
        }
      ],
      executiveItems: [],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(analysis.executiveItems).toHaveLength(1);
    expect(analysis.executiveItems[0]).toMatchObject({
      kind: "delegate",
      title: "Coordinate follow-up",
      ownerRole: "Operations"
    });
    expect(analysis.executiveItems[0].draftedResponse?.body).toBe("Ask Operations to coordinate the next step.");
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual([analysis.executiveItems[0].id]);
  });

  it("promotes active decide action items into CEO decisions when the model omits them", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "19");
    if (!message) {
      throw new Error("sample message 19 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "decide",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The CEO needs to decide whether to accept revised Northwind terms.",
          actionItems: [
            {
              id: "northwind-terms",
              category: "decide",
              title: "Decide Northwind terms",
              description: "Choose whether to accept the 1-year term or push back.",
              ownerRole: null,
              decisionRequired: "Accept the revised 1-year term or push back?",
              deadlineText: "end of day",
              deadlineAt: null,
              recommendedNextStep: "Record the CEO decision before replying to Sales.",
              missingContext: []
            }
          ],
          confidence: 0.93,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-northwind",
          title: "Northwind deal terms",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "The CEO needs to decide revised deal terms.",
          activeExecutiveItemIds: []
        }
      ],
      executiveItems: [],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(analysis.executiveItems).toHaveLength(1);
    expect(analysis.executiveItems[0]).toMatchObject({
      kind: "decide",
      section: "urgent",
      title: "Decide Northwind terms"
    });
    expect(analysis.executiveItems[0].draftedResponse?.body).toContain("Accept the revised 1-year term or push back");
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual([analysis.executiveItems[0].id]);
  });

  it("derives grounded radio options for rollback versus hotfix decisions", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "16");
    if (!message) {
      throw new Error("sample message 16 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "decide",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The CEO needs to choose rollback or hotfix.",
          actionItems: [],
          confidence: 0.94,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-payment",
          title: "Payment incident",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "The CEO needs to choose rollback or hotfix.",
          activeExecutiveItemIds: ["decision-payment"]
        }
      ],
      executiveItems: [
        {
          id: "decision-payment",
          kind: "decide",
          section: "urgent",
          title: "Decide rollback or hotfix for payment service issue",
          summary: "Checkout failures require a decision between rollback and hotfix.",
          priority: "urgent",
          sourceMessageIds: [message.id],
          threadId: "thread-payment",
          ownerRole: null,
          deadlineText: "next hour",
          deadlineAt: null,
          decisionQuestion: "Should we roll back the partial migration or push through a hotfix?",
          options: null,
          recommendedNextStep: "Record the CEO decision.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(analysis.executiveItems[0].options?.map((option) => option.label)).toEqual([
      "Roll back partial migration",
      "Push a hotfix"
    ]);
  });

  it("derives grounded radio options for Northwind revised terms", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "19");
    if (!message) {
      throw new Error("sample message 19 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "decide",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The CEO needs to decide revised Northwind terms.",
          actionItems: [],
          confidence: 0.92,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-northwind",
          title: "Northwind revised terms",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "The CEO needs to accept the revised terms or push back.",
          activeExecutiveItemIds: ["decision-northwind"]
        }
      ],
      executiveItems: [
        {
          id: "decision-northwind",
          kind: "decide",
          section: "decisions",
          title: "Decide on Northwind deal contract term and ARR acceptance",
          summary: "Northwind changed from a 2-year 120k ARR deal to a 1-year 60k ARR request.",
          priority: "high",
          sourceMessageIds: [message.id],
          threadId: "thread-northwind",
          ownerRole: null,
          deadlineText: "end of day",
          deadlineAt: null,
          decisionQuestion: "Accept 1-year contract at 60k ARR or push for 2-year at 120k ARR?",
          options: null,
          recommendedNextStep: "Record the CEO decision.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(analysis.executiveItems[0].options?.map((option) => option.label)).toEqual([
      "Accept one-year, $60k ARR",
      "Push back for two-year, $120k ARR"
    ]);
  });

  it("does not duplicate a promoted handoff when a model handoff already covers the same source", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "4");
    if (!message) {
      throw new Error("sample message 4 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "delegate",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "Security should verify the suspicious login alert.",
          actionItems: [
            {
              id: "security-action",
              category: "delegate",
              title: "Verify suspicious login alert",
              description: "Security should validate the login alert through official systems.",
              ownerRole: "Security",
              decisionRequired: null,
              deadlineText: "Today",
              deadlineAt: null,
              recommendedNextStep: "Ask Security to verify the alert and secure the account.",
              missingContext: []
            }
          ],
          confidence: 0.94,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-security",
          title: "Suspicious login alert",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "Security needs to verify the alert.",
          activeExecutiveItemIds: ["delegate-security"]
        }
      ],
      executiveItems: [
        {
          id: "delegate-security",
          kind: "delegate",
          section: "urgent",
          title: "Secure CEO account",
          summary: "Security needs to validate the suspicious login alert.",
          priority: "urgent",
          sourceMessageIds: [message.id],
          threadId: "thread-security",
          ownerRole: "Security",
          deadlineText: "Today",
          deadlineAt: null,
          decisionQuestion: null,
          options: null,
          recommendedNextStep: "Ask Security to verify the alert and secure the account.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(analysis.executiveItems).toHaveLength(1);
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual(["delegate-security"]);
  });

  it("forces active security-risk messages into delegate triage", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "4");
    if (!message) {
      throw new Error("sample message 4 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "ignore",
          lifecycleStatus: "informational",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The CEO should not respond to this suspicious message.",
          actionItems: [],
          confidence: 0.95,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-security",
          title: "Suspicious login alert",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "Security needs to verify the alert.",
          activeExecutiveItemIds: []
        }
      ],
      executiveItems: [],
      flags: [
        {
          id: "flag-security",
          severity: "critical",
          category: "security",
          title: "Suspicious login alert",
          description: "The message contains a suspicious verification link.",
          sourceMessageIds: [message.id],
          status: "active",
          recommendedAction: "Verify through official security systems."
        }
      ]
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(analysis.messageAnalyses[0]).toMatchObject({
      primaryCategory: "delegate",
      lifecycleStatus: "active"
    });
    expect(analysis.executiveItems[0]).toMatchObject({
      kind: "delegate",
      ownerRole: "Security"
    });
    expect(analysis.messageAnalyses[0].draftedResponse.type).toBe("internal_handoff");
  });

  it("derives a nonblank delegate draft when optional model text is blank", () => {
    const normalized = normalizedSample();
    const message = normalized.messages[0];

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "delegate",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "Finance should provide revenue projections.",
          actionItems: [],
          confidence: 0.9,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-finance",
          title: "Revenue projections",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "Finance should prepare projections.",
          activeExecutiveItemIds: ["delegate-finance"]
        }
      ],
      executiveItems: [
        {
          id: "delegate-finance",
          kind: "delegate",
          section: "delegated",
          title: "Provide updated revenue projections",
          summary: "Finance should prepare updated projections for the investor process.",
          priority: "high",
          sourceMessageIds: [message.id],
          threadId: "thread-finance",
          ownerRole: "Finance",
          deadlineText: "Wednesday",
          deadlineAt: null,
          decisionQuestion: null,
          options: null,
          recommendedNextStep: "",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);
    const draft = analysis.executiveItems[0].draftedResponse?.body ?? "";

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(draft).toContain("Provide updated revenue projections");
  });

  it("replaces placeholder decision drafts with source-specific draft text", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "16");
    if (!message) {
      throw new Error("sample message 16 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "decide",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The CEO must choose between rollback and hotfix.",
          actionItems: [
            {
              id: "payment-decision",
              category: "decide",
              title: "Decide rollback or hotfix",
              description: "Choose whether to roll back the partial migration or push a hotfix.",
              ownerRole: null,
              decisionRequired: "Rollback or hotfix?",
              deadlineText: "next hour",
              deadlineAt: null,
              recommendedNextStep: "Record the rollback or hotfix decision.",
              missingContext: []
            }
          ],
          confidence: 0.95,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-payment",
          title: "Payment service incident",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "The CEO needs to decide rollback or hotfix.",
          activeExecutiveItemIds: ["decision-payment"]
        }
      ],
      executiveItems: [
        {
          id: "decision-payment",
          kind: "decide",
          section: "urgent",
          title: "Decide rollback or hotfix",
          summary: "Checkout failures require a rollback-or-hotfix decision.",
          priority: "urgent",
          sourceMessageIds: [message.id],
          threadId: "thread-payment",
          ownerRole: null,
          deadlineText: "next hour",
          deadlineAt: null,
          decisionQuestion: "Should we roll back the partial migration or push through a hotfix?",
          options: null,
          recommendedNextStep: "Record the rollback or hotfix decision.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);
    const draft = analysis.executiveItems[0].draftedResponse?.body ?? "";

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(draft).not.toBe("Thanks. I am reviewing this and will come back with a decision.");
    expect(draft).toContain("roll back the partial migration or push through a hotfix");
    expect(draft).toContain("next hour");
  });

  it("keeps a broader active decision over narrower duplicate decisions", () => {
    const normalized = normalizedSample();
    const messages = ["1", "10", "18"].map((id) => {
      const message = normalized.messages.find((item) => item.id === id);
      if (!message) {
        throw new Error(`sample message ${id} should exist`);
      }
      return message;
    });

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: messages.map((message) => ({
        messageId: message.id,
        primaryCategory: "decide",
        lifecycleStatus: "active",
        relatedMessageIds: messages.filter((item) => item.id !== message.id).map((item) => item.id),
        supersededBy: [],
        resolvedBy: [],
        rationale: "The CEO needs to confirm the investor meeting thread.",
        actionItems: [],
        confidence: 0.9,
        missingContext: []
      })),
      threads: [
        {
          id: "thread-meridian",
          title: "Meridian investor meeting",
          messageIds: messages.map((message) => message.id),
          latestMessageId: "18",
          lifecycleStatus: "active",
          currentState: "The CEO needs to confirm the investor meeting time.",
          activeExecutiveItemIds: ["decision-meridian", "decision-meridian-coo", "decision-meridian-reschedule"]
        }
      ],
      executiveItems: [
        {
          id: "decision-meridian",
          kind: "decide",
          section: "decisions",
          title: "Confirm investor meeting time with Meridian Ventures",
          summary: "Confirm the current meeting time across the latest Meridian thread.",
          priority: "high",
          sourceMessageIds: ["1", "10", "18"],
          threadId: "thread-meridian",
          ownerRole: null,
          deadlineText: "before Thursday's call",
          deadlineAt: null,
          decisionQuestion: "What meeting time should be confirmed with Meridian Ventures?",
          options: null,
          recommendedNextStep: "Confirm the meeting time.",
          missingContext: []
        },
        {
          id: "decision-meridian-coo",
          kind: "decide",
          section: "decisions",
          title: "Confirm investor meeting time with Meridian Ventures (COO update)",
          summary: "Confirm the time mentioned by the COO.",
          priority: "medium",
          sourceMessageIds: ["10"],
          threadId: "thread-meridian",
          ownerRole: null,
          deadlineText: null,
          deadlineAt: null,
          decisionQuestion: "Should the investor meeting remain at 2pm?",
          options: null,
          recommendedNextStep: "Confirm the meeting time.",
          missingContext: []
        },
        {
          id: "decision-meridian-reschedule",
          kind: "decide",
          section: "decisions",
          title: "Confirm or reschedule investor meeting",
          summary: "Confirm whether 2pm or 10am works.",
          priority: "medium",
          sourceMessageIds: ["18"],
          threadId: "thread-meridian",
          ownerRole: null,
          deadlineText: null,
          deadlineAt: null,
          decisionQuestion: "Should the investor meeting stay at 2pm or move to 10am?",
          options: null,
          recommendedNextStep: "Confirm the meeting time.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, messages, normalized.sourceDate);

    expect(validateAnalysisResult(analysis, messages, normalized.sourceDate).valid).toBe(true);
    expect(analysis.executiveItems.map((item) => item.id)).toEqual(["decision-meridian"]);
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual(["decision-meridian"]);
    expect(analysis.executiveItems[0].draftedResponse?.body).toContain("Meridian Ventures");
  });

  it("collapses same-source duplicate decisions into the highest-priority current item", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "19");
    if (!message) {
      throw new Error("sample message 19 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "decide",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The CEO needs to decide revised Northwind terms.",
          actionItems: [],
          confidence: 0.93,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-northwind",
          title: "Northwind revised terms",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "Northwind needs an end-of-day decision on revised terms.",
          activeExecutiveItemIds: ["decision-northwind-high", "decision-northwind-urgent"]
        }
      ],
      executiveItems: [
        {
          id: "decision-northwind-high",
          kind: "decide",
          section: "decisions",
          title: "Decide on Northwind revised contract terms",
          summary: "Choose whether to accept the revised 1-year term or push back.",
          priority: "high",
          sourceMessageIds: [message.id],
          threadId: "thread-northwind",
          ownerRole: null,
          deadlineText: "end of day",
          deadlineAt: null,
          decisionQuestion: "Accept the revised commercial terms or reject them?",
          options: null,
          recommendedNextStep: "Record the CEO decision.",
          missingContext: []
        },
        {
          id: "decision-northwind-urgent",
          kind: "decide",
          section: "urgent",
          title: "Choose Northwind revised contract terms",
          summary: "Choose whether to accept the 1-year term with renewal option or push back.",
          priority: "urgent",
          sourceMessageIds: [message.id],
          threadId: "thread-northwind",
          ownerRole: null,
          deadlineText: "end of day",
          deadlineAt: null,
          decisionQuestion: "Accept the revised 1-year term or push back?",
          options: null,
          recommendedNextStep: "Record the CEO decision.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(analysis.executiveItems.map((item) => item.id)).toEqual(["decision-northwind-urgent"]);
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual(["decision-northwind-urgent"]);
  });

  it("does not keep a handoff that duplicates the CEO rollback-or-hotfix decision", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "16");
    if (!message) {
      throw new Error("sample message 16 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "decide",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The CEO needs to choose rollback or hotfix.",
          actionItems: [],
          confidence: 0.94,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-payment",
          title: "Payment service incident",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "Checkout failures require a rollback-or-hotfix decision.",
          activeExecutiveItemIds: ["decision-payment", "delegate-payment"]
        }
      ],
      executiveItems: [
        {
          id: "delegate-payment",
          kind: "delegate",
          section: "delegated",
          title: "Coordinate rollback or hotfix response with Engineering",
          summary: "Engineering should own the rollback or hotfix path after the CEO decision.",
          priority: "high",
          sourceMessageIds: [message.id],
          threadId: "thread-payment",
          ownerRole: "Engineering",
          deadlineText: "next hour",
          deadlineAt: null,
          decisionQuestion: null,
          options: null,
          recommendedNextStep: "Ask Engineering to prepare the selected path.",
          missingContext: []
        },
        {
          id: "decision-payment",
          kind: "decide",
          section: "urgent",
          title: "Choose rollback or hotfix for live checkout failures",
          summary: "Checkout failures require a decision between rollback and hotfix.",
          priority: "urgent",
          sourceMessageIds: [message.id],
          threadId: "thread-payment",
          ownerRole: null,
          deadlineText: "next hour",
          deadlineAt: null,
          decisionQuestion: "Should Engineering roll back the partial migration or push a hotfix?",
          options: null,
          recommendedNextStep: "Record the CEO decision.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(analysis.executiveItems.map((item) => item.id)).toEqual(["decision-payment"]);
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual(["decision-payment"]);
  });

  it("drops active executive items sourced only from superseded thread messages", () => {
    const normalized = normalizedSample();
    const messages = ["2", "9", "16"].map((id) => {
      const message = normalized.messages.find((item) => item.id === id);
      if (!message) {
        throw new Error(`sample message ${id} should exist`);
      }
      return message;
    });

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: messages.map((message) => ({
        messageId: message.id,
        primaryCategory: message.id === "16" ? "decide" : "delegate",
        lifecycleStatus: "active",
        relatedMessageIds: messages.filter((item) => item.id !== message.id).map((item) => item.id),
        supersededBy: [],
        resolvedBy: [],
        rationale: "The API/payment thread has an evolving current state.",
        actionItems: [],
        confidence: 0.9,
        missingContext: []
      })),
      threads: [
        {
          id: "thread-payment",
          title: "Payment service dependency",
          messageIds: ["2", "9", "16"],
          latestMessageId: "16",
          lifecycleStatus: "active",
          currentState: "The current state is a rollback-or-hotfix CEO decision.",
          activeExecutiveItemIds: ["delegate-payment-dependency", "decision-payment"]
        }
      ],
      executiveItems: [
        {
          id: "delegate-payment-dependency",
          kind: "delegate",
          section: "delegated",
          title: "Investigate payment service dependency blocker",
          summary: "Engineering must diagnose the dependency issue affecting the API migration.",
          priority: "high",
          sourceMessageIds: ["2", "9"],
          threadId: "thread-payment",
          ownerRole: "Engineering",
          deadlineText: "By Friday / next Wednesday risk",
          deadlineAt: null,
          decisionQuestion: null,
          options: null,
          recommendedNextStep: "Ask Engineering to diagnose the dependency blocker.",
          missingContext: []
        },
        {
          id: "decision-payment",
          kind: "decide",
          section: "urgent",
          title: "Choose rollback or hotfix for checkout failures",
          summary: "Decide whether to roll back the partial migration or push a hotfix.",
          priority: "urgent",
          sourceMessageIds: ["16"],
          threadId: "thread-payment",
          ownerRole: null,
          deadlineText: "Within the next hour",
          deadlineAt: null,
          decisionQuestion: "Should Engineering roll back or hotfix the live checkout issue?",
          options: null,
          recommendedNextStep: "Record the CEO decision.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, messages, normalized.sourceDate);

    expect(validateAnalysisResult(analysis, messages, normalized.sourceDate).valid).toBe(true);
    expect(analysis.messageAnalyses.find((item) => item.messageId === "2")?.lifecycleStatus).toBe("superseded");
    expect(analysis.messageAnalyses.find((item) => item.messageId === "9")?.lifecycleStatus).toBe("superseded");
    expect(analysis.executiveItems.map((item) => item.id)).toEqual(["decision-payment"]);
    expect(analysis.threads[0].activeExecutiveItemIds).toEqual(["decision-payment"]);
  });

  it("keeps distinct same-source decisions when one message has separate asks", () => {
    const normalized = normalizedSample();
    const message = normalized.messages.find((item) => item.id === "13");
    if (!message) {
      throw new Error("sample message 13 should exist");
    }

    const compact: CompactAnalysis = {
      sourceDate: normalized.sourceDate,
      messageAnalyses: [
        {
          messageId: message.id,
          primaryCategory: "decide",
          lifecycleStatus: "active",
          relatedMessageIds: [],
          supersededBy: [],
          resolvedBy: [],
          rationale: "The message contains separate People decisions.",
          actionItems: [],
          confidence: 0.9,
          missingContext: []
        }
      ],
      threads: [
        {
          id: "thread-people",
          title: "People policy and benefits",
          messageIds: [message.id],
          latestMessageId: message.id,
          lifecycleStatus: "active",
          currentState: "The CEO needs to address hybrid policy concerns and benefits approval.",
          activeExecutiveItemIds: ["decision-hybrid", "decision-benefits"]
        }
      ],
      executiveItems: [
        {
          id: "decision-hybrid",
          kind: "decide",
          section: "decisions",
          title: "Address hybrid policy concerns",
          summary: "Engineering concerns about the hybrid policy may need CEO follow-up.",
          priority: "medium",
          sourceMessageIds: [message.id],
          threadId: "thread-people",
          ownerRole: null,
          deadlineText: null,
          deadlineAt: null,
          decisionQuestion: "How should the CEO address engineering concerns about the hybrid policy?",
          options: null,
          recommendedNextStep: "Decide how to respond to the hybrid policy concern.",
          missingContext: []
        },
        {
          id: "decision-benefits",
          kind: "decide",
          section: "decisions",
          title: "Approve new benefits package",
          summary: "People needs CEO sign-off before the provider deadline.",
          priority: "high",
          sourceMessageIds: [message.id],
          threadId: "thread-people",
          ownerRole: null,
          deadlineText: "end of day Friday",
          deadlineAt: null,
          decisionQuestion: "Approve the new benefits package?",
          options: null,
          recommendedNextStep: "Record the benefits decision.",
          missingContext: []
        }
      ],
      flags: []
    };

    const analysis = expandCompactAnalysis(compact, [message], normalized.sourceDate);

    expect(validateAnalysisResult(analysis, [message], normalized.sourceDate).valid).toBe(true);
    expect(analysis.executiveItems.map((item) => item.id)).toEqual(["decision-benefits", "decision-hybrid"]);
  });
});
