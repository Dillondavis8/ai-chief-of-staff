"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WORKFLOW_STORAGE_KEY,
  parseWorkflowMap,
  serializeWorkflowMap
} from "./storage";
import type { WorkflowMap } from "./types";

export function useWorkflowState(actionKeys: string[]) {
  const keySignature = useMemo(() => [...actionKeys].sort().join("|"), [actionKeys]);
  const stableActionKeys = useMemo(() => (keySignature ? keySignature.split("|") : []), [keySignature]);
  const [workflowMap, setWorkflowMap] = useState<WorkflowMap>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    return parseWorkflowMap(window.localStorage.getItem(WORKFLOW_STORAGE_KEY));
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (stableActionKeys.length === 0) {
      return;
    }

    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, serializeWorkflowMap(workflowMap));
  }, [workflowMap, stableActionKeys]);

  const updateMap = useCallback((updater: (current: WorkflowMap) => WorkflowMap) => {
    setWorkflowMap((current) => updater(current));
  }, []);

  const resetWorkflow = useCallback(() => {
    window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
    setWorkflowMap({});
  }, []);

  return {
    workflowMap,
    setWorkflowMap,
    updateMap,
    resetWorkflow,
    isLoaded: true
  };
}
