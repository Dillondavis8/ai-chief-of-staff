import type { ActionWorkflowState, WorkflowActionType, WorkflowMap, WorkflowStatus } from "./types";

export const WORKFLOW_STORAGE_KEY = "ai-chief-of-staff:workflow:v1";

const workflowStatuses = new Set<WorkflowStatus>([
  "open",
  "in_progress",
  "waiting",
  "completed",
  "dismissed"
]);

const workflowActionTypes = new Set<WorkflowActionType>([
  "decision_recorded",
  "delegation_recorded",
  "flag_acknowledged",
  "marked_reviewed",
  "dismissed"
]);

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return typeof value === "string" && workflowStatuses.has(value as WorkflowStatus);
}

function isWorkflowActionType(value: unknown): value is WorkflowActionType {
  return typeof value === "string" && workflowActionTypes.has(value as WorkflowActionType);
}

export function createDefaultWorkflowState(actionKey: string, now = new Date().toISOString()): ActionWorkflowState {
  return {
    actionKey,
    status: "open",
    assignedTo: null,
    selectedOption: null,
    customDecision: null,
    resolutionNote: null,
    privateNote: null,
    editedDraft: null,
    actionType: null,
    reviewedAt: null,
    startedAt: null,
    completedAt: null,
    dismissedAt: null,
    updatedAt: now
  };
}

export function normalizeStoredWorkflowState(value: unknown): ActionWorkflowState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.actionKey !== "string" || !isWorkflowStatus(record.status)) {
    return null;
  }

  const editedDraft =
    record.editedDraft && typeof record.editedDraft === "object"
      ? (record.editedDraft as Record<string, unknown>)
      : null;

  return {
    actionKey: record.actionKey,
    status: record.status,
    assignedTo: stringOrNull(record.assignedTo),
    selectedOption: stringOrNull(record.selectedOption),
    customDecision: stringOrNull(record.customDecision),
    resolutionNote: stringOrNull(record.resolutionNote),
    privateNote: stringOrNull(record.privateNote),
    editedDraft:
      editedDraft && typeof editedDraft.body === "string"
        ? {
            body: editedDraft.body,
            subject: stringOrNull(editedDraft.subject),
            updatedAt: stringOrNull(editedDraft.updatedAt) ?? new Date().toISOString()
          }
        : null,
    actionType: isWorkflowActionType(record.actionType) ? record.actionType : null,
    reviewedAt: stringOrNull(record.reviewedAt),
    startedAt: stringOrNull(record.startedAt),
    completedAt: stringOrNull(record.completedAt),
    dismissedAt: stringOrNull(record.dismissedAt),
    updatedAt: stringOrNull(record.updatedAt) ?? new Date().toISOString()
  };
}

export function parseWorkflowMap(raw: string | null, allowedKeys?: Set<string>): WorkflowMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const map: WorkflowMap = {};
    Object.values(parsed as Record<string, unknown>).forEach((value) => {
      const state = normalizeStoredWorkflowState(value);
      if (!state) {
        return;
      }
      if (allowedKeys && !allowedKeys.has(state.actionKey)) {
        return;
      }
      map[state.actionKey] = state;
    });

    return map;
  } catch {
    return {};
  }
}

export function retainWorkflowMapForKeys(map: WorkflowMap, keys: string[]) {
  const allowed = new Set(keys);
  const retained: WorkflowMap = {};

  Object.entries(map).forEach(([key, value]) => {
    if (allowed.has(key)) {
      retained[key] = value;
    }
  });

  return retained;
}

export function serializeWorkflowMap(map: WorkflowMap) {
  return JSON.stringify(map);
}

export function updateWorkflowState(
  map: WorkflowMap,
  actionKey: string,
  patch: Partial<Omit<ActionWorkflowState, "actionKey">>,
  now = new Date().toISOString()
): WorkflowMap {
  const previous = map[actionKey] ?? createDefaultWorkflowState(actionKey, now);
  const next: ActionWorkflowState = {
    ...previous,
    ...patch,
    actionKey,
    updatedAt: now
  };

  return {
    ...map,
    [actionKey]: next
  };
}
