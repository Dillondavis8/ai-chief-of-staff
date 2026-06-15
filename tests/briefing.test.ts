import { describe, expect, it } from "vitest";
import type { AnalysisResult, DailyBriefing, ExecutiveItem } from "@/lib/ai/schemas";
import { splitBriefingBody } from "@/lib/ai/briefing-display";
import { buildFallbackBriefing, briefingWordCount, renderBriefingText } from "@/lib/ai/briefing";

function item(overrides: Partial<ExecutiveItem>): ExecutiveItem {
  return {
    id: "item",
    threadId: null,
    kind: "decide",
    section: "decisions",
    title: "Decision item",
    summary: "A concise current-state summary with enough detail to be useful.",
    priority: "high",
    sourceMessageIds: ["1"],
    ownerRole: null,
    deadlineText: "End of day",
    deadlineAt: null,
    decisionQuestion: "Should the CEO approve the proposed path?",
    options: null,
    recommendedNextStep: null,
    missingContext: ["Cost impact", "Implementation owner", "Secondary context that can be omitted in fallback"],
    draftedResponse: null,
    ...overrides
  };
}

function analysis(): AnalysisResult {
  return {
    sourceDate: "2026-03-18",
    messageAnalyses: [],
    threads: [],
    executiveItems: [
      item({ id: "urgent-1", section: "urgent", title: "API incident", priority: "urgent", sourceMessageIds: ["16"] }),
      item({ id: "decision-1", title: "Northwind terms", sourceMessageIds: ["19"] }),
      item({ id: "decision-2", title: "Benefits approval", sourceMessageIds: ["13"] }),
      item({ id: "personal-1", section: "personal", title: "Family dinner", priority: "low", sourceMessageIds: ["7"] })
    ],
    flags: [
      {
        id: "flag-1",
        severity: "critical",
        category: "security",
        title: "Suspicious security email",
        description: "Likely phishing email should be verified through official systems.",
        sourceMessageIds: ["4"],
        status: "active",
        recommendedAction: "Escalate internally to Security."
      }
    ]
  };
}

describe("fallback briefing", () => {
  it("does not truncate item text with ellipses", () => {
    const briefing = buildFallbackBriefing(analysis());
    expect(renderBriefingText(briefing)).not.toContain("...");
  });

  it("keeps the deterministic fallback within the briefing budget", () => {
    const briefing = buildFallbackBriefing(analysis());
    expect(briefingWordCount(briefing)).toBeLessThanOrEqual(250);
  });

  it("does not repeat an active flag already represented by an executive action", () => {
    const source = analysis();
    source.executiveItems.push(
      item({
        id: "security-action",
        kind: "delegate",
        section: "urgent",
        title: "Verify suspicious security email",
        summary: "Security should verify the suspicious email through official systems.",
        priority: "urgent",
        sourceMessageIds: ["4"],
        ownerRole: "Security",
        decisionQuestion: null
      })
    );

    const briefing = buildFallbackBriefing(source);

    expect(briefing.urgent.some((entry) => entry.sourceMessageIds.includes("4"))).toBe(true);
    expect(briefing.flags.some((entry) => entry.sourceMessageIds.includes("4"))).toBe(false);
  });

  it("keeps only the highest-priority same-source item in the brief", () => {
    const source = analysis();
    source.executiveItems = [
      item({
        id: "hybrid-policy",
        title: "Address hybrid policy concerns",
        priority: "medium",
        sourceMessageIds: ["13"],
        decisionQuestion: "How should the CEO address engineering concerns about the hybrid policy?"
      }),
      item({
        id: "benefits-approval",
        title: "Approve benefits package",
        priority: "high",
        sourceMessageIds: ["13"],
        decisionQuestion: "Should the CEO approve the new benefits package?"
      })
    ];
    source.flags = [];

    const briefing = buildFallbackBriefing(source);

    expect(briefing.decisions.map((entry) => entry.title)).toEqual(["Approve benefits package"]);
  });

  it("removes inline message source markers from rendered briefing text", () => {
    const briefing: DailyBriefing = {
      title: "Daily brief [Msg16]",
      overview: "Review the launch risk [Message #16, Msg17].",
      urgent: [
        {
          title: "API incident [Msg 16]",
          body: "Customer escalation needs a decision [#16]; legal follow-up is separate [Msg17, 18].",
          priority: "urgent",
          sourceMessageIds: ["16", "17", "18"]
        }
      ],
      decisions: [],
      flags: [],
      handled: [],
      personal: []
    };

    const text = renderBriefingText(briefing);
    expect(text).not.toContain("[Msg");
    expect(text).not.toContain("[#16]");
    expect(text).toContain("Customer escalation needs a decision; legal follow-up is separate.");
  });

  it("splits inline missing context out of briefing body prose", () => {
    const display = splitBriefingBody("Approve the calendar move before noon. Missing: Current internal meeting schedule conflicts.");

    expect(display.body).toBe("Approve the calendar move before noon.");
    expect(display.missingContext).toEqual(["Current internal meeting schedule conflicts"]);
  });

  it("prefers structured missing context when available", () => {
    const display = splitBriefingBody("Approve the calendar move. Missing: stale model phrasing.", [
      "Current internal meeting schedule conflicts"
    ]);

    expect(display.body).toBe("Approve the calendar move.");
    expect(display.missingContext).toEqual(["Current internal meeting schedule conflicts"]);
  });
});
