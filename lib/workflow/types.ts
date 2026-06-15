import type {
  AnalysisResult,
  DraftedResponse,
  ExecutiveFlag,
  ExecutiveItem,
  MessageAnalysis,
  Priority,
  ThreadAnalysis
} from "@/lib/ai/schemas";
import type { NormalizedMessage } from "@/lib/messages/schemas";

export type WorkflowStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "completed"
  | "dismissed";

export type WorkflowActionType =
  | "decision_recorded"
  | "delegation_recorded"
  | "flag_acknowledged"
  | "marked_reviewed"
  | "dismissed";

export type EditedDraft = {
  body: string;
  subject: string | null;
  updatedAt: string;
};

export type ActionWorkflowState = {
  actionKey: string;
  status: WorkflowStatus;
  assignedTo: string | null;
  selectedOption: string | null;
  customDecision: string | null;
  resolutionNote: string | null;
  privateNote: string | null;
  editedDraft: EditedDraft | null;
  actionType: WorkflowActionType | null;
  reviewedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  updatedAt: string;
};

export type WorkflowMap = Record<string, ActionWorkflowState>;

export type CanonicalActionKind = "decide" | "delegate" | "flag" | "inform";

export type CanonicalAction = {
  key: string;
  kind: CanonicalActionKind;
  item: ExecutiveItem | null;
  title: string;
  summary: string;
  priority: Priority;
  sourceMessageIds: string[];
  thread: ThreadAnalysis | null;
  flags: ExecutiveFlag[];
  decisionQuestion: string | null;
  ownerRole: string | null;
  deadlineText: string | null;
  deadlineAt: string | null;
  recommendedNextStep: string | null;
  missingContext: string[];
  draftedResponse: DraftedResponse | null;
  aiLifecycleStatus: ThreadAnalysis["lifecycleStatus"] | "active";
  section: ExecutiveItem["section"] | "delegated";
};

export type ActionWithWorkflow = CanonicalAction & {
  workflow: ActionWorkflowState;
};

export type ActionFilters = {
  type: "all" | "decide" | "delegate" | "flag";
  status: "all" | "active" | WorkflowStatus;
  priority: "all" | Priority;
  flagged: boolean;
  q: string;
  sort: "urgency" | "deadline" | "updated";
};

export type AuditFilters = {
  view: "messages" | "threads";
  category: "all" | MessageAnalysis["primaryCategory"];
  lifecycle: string[];
  channel: "all" | NormalizedMessage["channel"];
  thread: string | null;
  flagged: boolean;
  q: string;
};

export type WorkflowContext = {
  analysis: AnalysisResult;
  messages: NormalizedMessage[];
  workflowMap: WorkflowMap;
};
