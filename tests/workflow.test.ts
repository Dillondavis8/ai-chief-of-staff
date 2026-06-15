import { describe, expect, it } from "vitest";
import type { AnalysisResult, ExecutiveItem } from "@/lib/ai/schemas";
import { createActionKey } from "@/lib/workflow/action-keys";
import {
  createDefaultWorkflowState,
  parseWorkflowMap,
  retainWorkflowMapForKeys,
  serializeWorkflowMap
} from "@/lib/workflow/storage";
import {
  filterActions,
  getActionsWithWorkflow,
  getBriefingActionGroups,
  getCanonicalActions,
  getCriticalFlagHighlights,
  getMetricCounts,
  getMorningProgress
} from "@/lib/workflow/selectors";
import { parseActionFilters } from "@/lib/workflow/filters";
import { markDelegated, markStatus, recordDecision, resetDraft, editDraft } from "@/lib/workflow/transitions";

function item(overrides: Partial<ExecutiveItem>): ExecutiveItem {
  return {
    id: "item",
    threadId: null,
    kind: "decide",
    section: "decisions",
    title: "API incident decision",
    summary: "Engineering needs a rollback or hotfix decision.",
    priority: "urgent",
    sourceMessageIds: ["16", "2", "9"],
    ownerRole: null,
    deadlineText: "Within next hour",
    deadlineAt: null,
    decisionQuestion: "Rollback or hotfix?",
    options: [
      { label: "Rollback", tradeoff: "Safer but delays migration." },
      { label: "Hotfix", tradeoff: "Faster but riskier." }
    ],
    recommendedNextStep: "Ask Engineering for a recommendation, then record a decision.",
    missingContext: [],
    draftedResponse: {
      type: "reply_to_sender",
      to: "tom.bradley",
      subject: null,
      body: "Please share your recommendation."
    },
    ...overrides
  };
}

function analysis(): AnalysisResult {
  const decision = item({});
  const security = item({
    id: "security",
    kind: "delegate",
    section: "delegated",
    title: "Suspicious security email",
    summary: "Likely phishing message should be escalated internally.",
    priority: "urgent",
    sourceMessageIds: ["4"],
    ownerRole: "Security",
    decisionQuestion: null,
    options: null,
    draftedResponse: {
      type: "internal_handoff",
      to: "Security",
      subject: null,
      body: "Please verify this suspicious email through official systems."
    }
  });
  const handled = item({
    id: "handled",
    section: "handled",
    title: "Resolved Horizon timeline",
    priority: "low",
    sourceMessageIds: ["5", "6", "17"]
  });

  return {
    sourceDate: "2026-03-18",
    messageAnalyses: ["2", "4", "5", "6", "9", "16", "17"].map((messageId) => ({
      messageId,
      primaryCategory: messageId === "4" ? "delegate" : "decide",
      lifecycleStatus: messageId === "5" || messageId === "6" ? "resolved" : "active",
      relatedMessageIds: [],
      supersededBy: [],
      resolvedBy: [],
      rationale: "Synthetic analysis.",
      actionItems: [],
      flagIds: messageId === "4" ? ["security-flag"] : [],
      draftedResponse: { type: "no_response", to: null, subject: null, body: "" },
      confidence: 0.9,
      missingContext: []
    })),
    threads: [
      {
        id: "api",
        title: "API migration",
        messageIds: ["2", "9", "16"],
        latestMessageId: "16",
        lifecycleStatus: "active",
        currentState: "Checkout failures require a decision.",
        activeExecutiveItemIds: ["item"]
      },
      {
        id: "horizon",
        title: "Horizon",
        messageIds: ["5", "6", "17"],
        latestMessageId: "17",
        lifecycleStatus: "resolved",
        currentState: "Handled.",
        activeExecutiveItemIds: []
      }
    ],
    executiveItems: [decision, security, handled],
    flags: [
      {
        id: "security-flag",
        severity: "critical",
        category: "security",
        title: "Suspicious verification email",
        description: "Likely phishing.",
        sourceMessageIds: ["4"],
        status: "active",
        recommendedAction: "Verify through official systems."
      }
    ]
  };
}

describe("action keys", () => {
  it("are stable across rerenders and source ID ordering", () => {
    const first = item({ sourceMessageIds: ["16", "2", "9"] });
    const second = item({ sourceMessageIds: ["9", "16", "2"] });

    expect(createActionKey(first)).toBe(createActionKey(second));
    expect(createActionKey(first)).toBe(createActionKey({ ...first }));
  });

  it("differ for different actions", () => {
    expect(createActionKey(item({ title: "API incident decision" }))).not.toBe(
      createActionKey(item({ title: "Northwind terms decision", sourceMessageIds: ["19"] }))
    );
  });
});

describe("workflow persistence helpers", () => {
  it("loads stored state and ignores malformed JSON safely", () => {
    const state = createDefaultWorkflowState("action-a");
    state.status = "waiting";
    const stored = serializeWorkflowMap({ "action-a": state });

    expect(parseWorkflowMap(stored)["action-a"].status).toBe("waiting");
    expect(parseWorkflowMap("{bad json")).toEqual({});
  });

  it("drops unmatched old action keys for a new dataset", () => {
    const state = createDefaultWorkflowState("old-action");
    const retained = retainWorkflowMapForKeys({ "old-action": state }, ["new-action"]);

    expect(retained).toEqual({});
  });
});

describe("canonical selectors and filters", () => {
  it("attaches flags to canonical actions instead of duplicating them", () => {
    const actions = getCanonicalActions(analysis());
    const securityActions = actions.filter((action) => action.sourceMessageIds.includes("4"));

    expect(securityActions).toHaveLength(1);
    expect(securityActions[0].flags).toHaveLength(1);
  });

  it("collapses duplicate canonical actions for the same current issue", () => {
    const source = analysis();
    source.executiveItems.push(
      item({
        id: "payment-delegate-copy",
        kind: "delegate",
        section: "delegated",
        title: "Coordinate rollback or hotfix response with Engineering",
        summary: "Engineering should coordinate the rollback or hotfix path after the CEO decision.",
        priority: "high",
        sourceMessageIds: ["16"],
        threadId: "api",
        ownerRole: "Engineering",
        deadlineText: "Within next hour",
        decisionQuestion: null,
        options: null,
        draftedResponse: {
          type: "internal_handoff",
          to: "Engineering",
          subject: null,
          body: "Prepare the selected rollback or hotfix path."
        }
      }),
      item({
        id: "payment-decision-copy",
        title: "Choose rollback or hotfix for live checkout failures",
        summary: "Engineering needs the same rollback-or-hotfix decision.",
        priority: "high",
        sourceMessageIds: ["16"],
        threadId: "api",
        decisionQuestion: "Should Engineering roll back the partial migration or push a hotfix?"
      })
    );

    const actions = getCanonicalActions(source);
    const paymentActions = actions.filter((action) => action.sourceMessageIds.includes("16"));

    expect(paymentActions).toHaveLength(1);
    expect(paymentActions[0]).toMatchObject({
      kind: "decide",
      priority: "urgent"
    });
  });

  it("deduplicates critical flag highlights by underlying issue", () => {
    const source = analysis();
    source.executiveItems.push(
      item({
        id: "security-followup",
        kind: "delegate",
        section: "urgent",
        title: "Secure CEO account",
        summary: "Security should verify the account through official systems.",
        priority: "urgent",
        sourceMessageIds: ["4"],
        ownerRole: "Security",
        decisionQuestion: null,
        options: null
      })
    );
    source.flags.push({
      id: "security-flag-copy",
      severity: "critical",
      category: "security",
      title: "Suspicious login email may be phishing",
      description: "The message urges clicking a verification link and uses a suspicious sender domain.",
      sourceMessageIds: ["4"],
      status: "active",
      recommendedAction: "Verify through official systems."
    });

    const highlights = getCriticalFlagHighlights(getActionsWithWorkflow(getCanonicalActions(source), {}));

    expect(highlights).toHaveLength(1);
    expect(highlights[0].flag.sourceMessageIds).toEqual(["4"]);
    expect(highlights[0].flag.category).toBe("security");
  });

  it("excludes handled executive items from the active action queue", () => {
    const actions = getCanonicalActions(analysis());

    expect(actions.some((action) => action.title.includes("Horizon"))).toBe(false);
  });

  it("updates morning progress and keeps waiting unresolved", () => {
    const actions = getCanonicalActions(analysis());
    const decisionKey = actions.find((action) => action.kind === "decide")?.key;
    if (!decisionKey) {
      throw new Error("decision action missing");
    }
    let workflow = recordDecision({}, decisionKey, {
      selectedOption: "Rollback",
      customDecision: null,
      resolutionNote: null,
      privateNote: null,
      status: "waiting"
    });
    let withWorkflow = getActionsWithWorkflow(actions, workflow);
    expect(getMorningProgress(withWorkflow).handled).toBe(0);
    expect(getMorningProgress(withWorkflow).waiting).toBe(1);

    workflow = markStatus(workflow, decisionKey, "completed");
    withWorkflow = getActionsWithWorkflow(actions, workflow);
    expect(getMorningProgress(withWorkflow).handled).toBe(1);

    workflow = markStatus(workflow, decisionKey, "open");
    withWorkflow = getActionsWithWorkflow(actions, workflow);
    expect(getMorningProgress(withWorkflow).remaining).toBe(actions.length);
  });

  it("groups briefing actions by CEO attention, waiting, and handled state", () => {
    const actions = getCanonicalActions(analysis());
    const decisionKey = actions.find((action) => action.kind === "decide")?.key;
    const securityKey = actions.find((action) => action.kind === "delegate")?.key;
    if (!decisionKey || !securityKey) {
      throw new Error("expected decision and security actions");
    }

    const workflow = markStatus(markStatus({}, decisionKey, "completed"), securityKey, "waiting");
    const groups = getBriefingActionGroups(getActionsWithWorkflow(actions, workflow));

    expect(groups.attention).toHaveLength(0);
    expect(groups.waiting.map((action) => action.key)).toEqual([securityKey]);
    expect(groups.handled.map((action) => action.key)).toEqual([decisionKey]);
  });

  it("derives active counts from workflow state", () => {
    const actions = getCanonicalActions(analysis());
    const decisionKey = actions.find((action) => action.kind === "decide")?.key;
    if (!decisionKey) {
      throw new Error("decision action missing");
    }
    const workflow = markStatus({}, decisionKey, "completed");
    const withWorkflow = getActionsWithWorkflow(actions, workflow);

    expect(getMetricCounts({ analysis: analysis(), actions: withWorkflow, messageCount: 7 }).activeDecisions).toBe(0);
    expect(getMetricCounts({ analysis: analysis(), actions: withWorkflow, messageCount: 7 }).delegatedActions).toBe(1);
  });

  it("applies decision, completed, flagged, and search filters", () => {
    const actions = getActionsWithWorkflow(getCanonicalActions(analysis()), {});

    expect(filterActions(actions, parseActionFilters(new URLSearchParams("type=decide&status=active")))).toHaveLength(1);
    expect(filterActions(actions, parseActionFilters(new URLSearchParams("flagged=true&status=active")))).toHaveLength(1);
    expect(filterActions(actions, parseActionFilters(new URLSearchParams("q=security&status=active")))).toHaveLength(1);
    expect(filterActions(actions, parseActionFilters(new URLSearchParams("type=nope&status=nope")))).toHaveLength(2);
  });
});

describe("workflow transitions and drafts", () => {
  it("supports delegation, completion, reopening, draft editing, and reset", () => {
    let workflow = markDelegated({}, "security", {
      assignedTo: "Security",
      resolutionNote: "Investigate internally.",
      privateNote: "Do not reply."
    });
    expect(workflow.security.status).toBe("waiting");
    expect(workflow.security.assignedTo).toBe("Security");

    workflow = markStatus(workflow, "security", "completed");
    expect(workflow.security.status).toBe("completed");

    workflow = markStatus(workflow, "security", "open");
    expect(workflow.security.status).toBe("open");

    workflow = editDraft(workflow, "security", "Edited draft", null);
    expect(workflow.security.editedDraft?.body).toBe("Edited draft");

    workflow = resetDraft(workflow, "security");
    expect(workflow.security.editedDraft).toBeNull();
  });
});
