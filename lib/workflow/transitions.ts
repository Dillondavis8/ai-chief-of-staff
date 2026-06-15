import { updateWorkflowState } from "./storage";
import type { ActionWorkflowState, WorkflowMap, WorkflowStatus } from "./types";

function now() {
  return new Date().toISOString();
}

export function recordDecision(
  map: WorkflowMap,
  actionKey: string,
  values: {
    selectedOption: string | null;
    customDecision: string | null;
    resolutionNote: string | null;
    privateNote: string | null;
    status?: Extract<WorkflowStatus, "in_progress" | "waiting">;
  }
) {
  const timestamp = now();
  return updateWorkflowState(
    map,
    actionKey,
    {
      status: values.status ?? "in_progress",
      selectedOption: values.selectedOption,
      customDecision: values.customDecision,
      resolutionNote: values.resolutionNote,
      privateNote: values.privateNote,
      actionType: "decision_recorded",
      startedAt: map[actionKey]?.startedAt ?? timestamp,
      reviewedAt: map[actionKey]?.reviewedAt ?? timestamp
    },
    timestamp
  );
}

export function markDelegated(
  map: WorkflowMap,
  actionKey: string,
  values: {
    assignedTo: string | null;
    resolutionNote: string | null;
    privateNote: string | null;
  }
) {
  const timestamp = now();
  return updateWorkflowState(
    map,
    actionKey,
    {
      status: "waiting",
      assignedTo: values.assignedTo,
      resolutionNote: values.resolutionNote,
      privateNote: values.privateNote,
      actionType: "delegation_recorded",
      startedAt: map[actionKey]?.startedAt ?? timestamp,
      reviewedAt: map[actionKey]?.reviewedAt ?? timestamp
    },
    timestamp
  );
}

export function acknowledgeFlag(map: WorkflowMap, actionKey: string) {
  const timestamp = now();
  return updateWorkflowState(
    map,
    actionKey,
    {
      status: "completed",
      actionType: "flag_acknowledged",
      reviewedAt: map[actionKey]?.reviewedAt ?? timestamp,
      completedAt: timestamp,
      dismissedAt: null
    },
    timestamp
  );
}

export function markStatus(map: WorkflowMap, actionKey: string, status: WorkflowStatus) {
  const timestamp = now();
  const patch: Partial<Omit<ActionWorkflowState, "actionKey">> = {
    status,
    reviewedAt: map[actionKey]?.reviewedAt ?? timestamp
  };

  if (status === "completed") {
    patch.completedAt = timestamp;
    patch.dismissedAt = null;
    patch.actionType = map[actionKey]?.actionType ?? "marked_reviewed";
  }
  if (status === "dismissed") {
    patch.dismissedAt = timestamp;
    patch.completedAt = null;
    patch.actionType = "dismissed";
  }
  if (status === "open") {
    patch.completedAt = null;
    patch.dismissedAt = null;
  }

  return updateWorkflowState(map, actionKey, patch, timestamp);
}

export function editDraft(map: WorkflowMap, actionKey: string, body: string, subject: string | null) {
  const timestamp = now();
  return updateWorkflowState(
    map,
    actionKey,
    {
      editedDraft: {
        body,
        subject,
        updatedAt: timestamp
      }
    },
    timestamp
  );
}

export function resetDraft(map: WorkflowMap, actionKey: string) {
  return updateWorkflowState(map, actionKey, { editedDraft: null }, now());
}
