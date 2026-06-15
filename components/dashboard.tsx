"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "./app-header";
import { UploadPanel } from "./upload-panel";
import { AnalysisProgress } from "./analysis-progress";
import { SummaryMetrics } from "./summary-metrics";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { VIEW_NAV_ID, ViewNav } from "./view-nav";
import { BriefingWorkspace } from "./briefing-workspace";
import { ActionCenter } from "./action-center";
import { AuditTrailView } from "./audit-trail-view";
import { ActionDrawer } from "./action-drawer";
import { normalizeMessages } from "@/lib/messages/normalize";
import { demoCompanyContext } from "@/lib/demo/company-context";
import type { AnalysisResponseMetadata, AnalysisResult, DailyBriefing as DailyBriefingType } from "@/lib/ai/schemas";
import { useWorkflowState } from "@/lib/workflow/use-workflow-state";
import {
  getActionsWithWorkflow,
  getCanonicalActions,
  getMetricCounts,
  getMorningProgress,
  getUpcomingDeadlines,
  isHandledWorkflowStatus
} from "@/lib/workflow/selectors";
import { parseActionFilters, parseAuditFilters } from "@/lib/workflow/filters";
import type { ActionFilters, AuditFilters } from "@/lib/workflow/types";
import {
  RUN_HISTORY_STORAGE_KEY,
  SELECTED_RUN_STORAGE_KEY,
  createStoredRun,
  parseRunHistory,
  selectRun,
  serializeRunHistory,
  upsertRun,
  type StoredAnalysisRun
} from "@/lib/runs/storage";

type ApiSuccess = {
  analysis: AnalysisResult;
  briefing: DailyBriefingType;
  metadata: AnalysisResponseMetadata;
};

type ApiError = {
  error?: {
    message?: string;
    details?: unknown;
  };
};

type DashboardProps = {
  initialMessages: unknown[];
};

type ViewName = "briefing" | "actions" | "audit";

function loadSavedRuns() {
  if (typeof window === "undefined") {
    return [];
  }

  return parseRunHistory(window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY));
}

function loadSelectedRun(runs: StoredAnalysisRun[]) {
  if (typeof window === "undefined") {
    return null;
  }

  return selectRun(runs, window.localStorage.getItem(SELECTED_RUN_STORAGE_KEY));
}

function runToResult(run: StoredAnalysisRun): ApiSuccess {
  return {
    analysis: run.analysis,
    briefing: run.briefing,
    metadata: run.metadata
  };
}

function friendlyDetails(details: unknown) {
  if (!Array.isArray(details)) {
    return "";
  }

  return details
    .slice(0, 3)
    .map((detail) => {
      if (detail && typeof detail === "object" && "message" in detail) {
        return String((detail as { message: unknown }).message);
      }
      return String(detail);
    })
    .join(" ");
}

function parseView(value: string | null): ViewName {
  if (value === "actions" || value === "audit") {
    return value;
  }
  return "briefing";
}

function replaceParams(params: URLSearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  });
  const query = next.toString();
  return query ? `?${query}` : "?";
}

export function Dashboard({ initialMessages }: DashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savedRuns, setSavedRuns] = useState<StoredAnalysisRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<unknown>(initialMessages);
  const [filename, setFilename] = useState("Messages JSON (1) (1).json");
  const [result, setResult] = useState<ApiSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pendingViewNavScroll, setPendingViewNavScroll] = useState(false);

  const validation = useMemo(() => normalizeMessages(dataset), [dataset]);
  const currentView = parseView(searchParams.get("view"));
  const targetMessageId = searchParams.get("message");
  const actionFilters = useMemo(() => parseActionFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const auditFilters = useMemo(() => parseAuditFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const canonicalActions = useMemo(() => (result ? getCanonicalActions(result.analysis) : []), [result]);
  const actionKeys = useMemo(() => canonicalActions.map((action) => action.key), [canonicalActions]);
  const { workflowMap, updateMap, resetWorkflow } = useWorkflowState(actionKeys);
  const actions = useMemo(() => getActionsWithWorkflow(canonicalActions, workflowMap), [canonicalActions, workflowMap]);
  const unresolvedActionCount = actions.filter((action) => !isHandledWorkflowStatus(action.workflow.status)).length;
  const progress = getMorningProgress(actions);
  const metrics =
    result && validation.ok
      ? getMetricCounts({ analysis: result.analysis, actions, messageCount: validation.messages.length })
      : null;
  const selectedAction = actions.find((action) => action.key === searchParams.get("action")) ?? null;
  const deadlines = getUpcomingDeadlines(actions);
  const criticalFlags = actions.filter(
    (action) =>
      !isHandledWorkflowStatus(action.workflow.status) &&
      action.flags.some((flag) => flag.severity === "critical" || flag.severity === "high")
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const runs = loadSavedRuns();
    const selected = loadSelectedRun(runs);
    setSavedRuns(runs);
    if (selected) {
      setSelectedRunId(selected.id);
      setDataset(selected.dataset);
      setFilename(selected.filename);
      setResult(runToResult(selected));
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (savedRuns.length > 0) {
      window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, serializeRunHistory(savedRuns));
    }
  }, [savedRuns]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedRunId) {
      window.localStorage.setItem(SELECTED_RUN_STORAGE_KEY, selectedRunId);
    } else {
      window.localStorage.removeItem(SELECTED_RUN_STORAGE_KEY);
    }
  }, [selectedRunId]);

  useEffect(() => {
    if (!isAnalyzing) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isAnalyzing]);

  useEffect(() => {
    if (!pendingViewNavScroll || !result) {
      return;
    }

    let timeout: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      timeout = window.setTimeout(() => {
        document.getElementById(VIEW_NAV_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingViewNavScroll(false);
      }, 0);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [pendingViewNavScroll, result, searchParams]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setDataset(parsed);
      setFilename(file.name);
      setSelectedRunId(null);
    } catch {
      setDataset([]);
      setFilename(file.name);
      setSelectedRunId(null);
      setError("The selected file is not valid JSON.");
    }
  }

  function resetSample() {
    setDataset(initialMessages);
    setFilename("Messages JSON (1) (1).json");
    setResult(null);
    setSelectedRunId(null);
    setError(null);
  }

  function selectSavedRun(runId: string) {
    const run = savedRuns.find((candidate) => candidate.id === runId);
    if (!run) {
      return;
    }

    setDataset(run.dataset);
    setFilename(run.filename);
    setResult(runToResult(run));
    setSelectedRunId(run.id);
    setError(null);
    router.push("?view=briefing");
  }

  async function analyze() {
    if (!validation.ok || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setElapsedSeconds(0);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ messages: dataset })
      });

      const payload = (await response.json()) as ApiSuccess | ApiError;
      if (!response.ok) {
        const apiError = payload as ApiError;
        const detailText = friendlyDetails(apiError.error?.details);
        setError(`${apiError.error?.message ?? "Analysis failed."}${detailText ? ` ${detailText}` : ""}`);
        return;
      }

      const successPayload = payload as ApiSuccess;
      const run = createStoredRun({
        filename,
        dataset,
        analysis: successPayload.analysis,
        briefing: successPayload.briefing,
        metadata: successPayload.metadata
      });

      setSavedRuns((current) => upsertRun(current, run));
      setSelectedRunId(run.id);
      setResult(successPayload);
      router.push("?view=briefing");
    } catch {
      setError("The analysis request failed before the server returned a response.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function navigate(target: string) {
    setPendingViewNavScroll(true);
    router.push(target, { scroll: false });
  }

  function navigateView(view: ViewName) {
    setPendingViewNavScroll(true);
    router.push(`?view=${view}`, { scroll: false });
  }

  function setActionFilters(patch: Partial<ActionFilters>) {
    router.push(
      replaceParams(new URLSearchParams(searchParams.toString()), {
        view: "actions",
        type: patch.type ?? actionFilters.type,
        status: patch.status ?? actionFilters.status,
        priority: patch.priority ?? actionFilters.priority,
        flagged: String(patch.flagged ?? actionFilters.flagged),
        q: patch.q ?? actionFilters.q,
        sort: patch.sort ?? actionFilters.sort
      }),
      { scroll: false }
    );
  }

  function setAuditFilters(patch: Partial<AuditFilters>) {
    router.push(
      replaceParams(new URLSearchParams(searchParams.toString()), {
        view: "audit",
        auditView: patch.view ?? auditFilters.view,
        category: patch.category ?? auditFilters.category,
        channel: patch.channel ?? auditFilters.channel,
        lifecycle: (patch.lifecycle ?? auditFilters.lifecycle).join(","),
        flagged: String(patch.flagged ?? auditFilters.flagged),
        q: patch.q ?? auditFilters.q,
        thread: patch.thread ?? auditFilters.thread,
        message: null
      }),
      { scroll: false }
    );
  }

  function openAction(actionKey: string) {
    router.push(replaceParams(new URLSearchParams(searchParams.toString()), { action: actionKey }), { scroll: false });
  }

  function closeAction() {
    router.push(replaceParams(new URLSearchParams(searchParams.toString()), { action: null }), { scroll: false });
  }

  function resetWorkflowWithConfirmation() {
    if (window.confirm("Reset all local workflow updates for this browser? The AI analysis and original messages will remain unchanged.")) {
      resetWorkflow();
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <UploadPanel
          filename={filename}
          validation={validation}
          isAnalyzing={isAnalyzing}
          savedRuns={savedRuns}
          selectedRunId={selectedRunId}
          onSelectRun={selectSavedRun}
          onAnalyze={analyze}
          onReset={resetSample}
          onFile={handleFile}
        />

        <details className="rounded-lg border border-line bg-white px-5 py-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <Settings2 className="h-4 w-4 text-mint" aria-hidden="true" />
            Demo assumptions
          </summary>
          <div className="mt-3 grid gap-4 text-sm text-stone-700 lg:grid-cols-3">
            <div>
              <p className="font-semibold text-ink">Executive preferences</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {demoCompanyContext.executivePreferences.map((preference) => (
                  <li key={preference}>{preference}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ink">Decision policy</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {demoCompanyContext.decisionPolicy.map((policy) => (
                  <li key={policy}>{policy}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ink">Functional owners</p>
              <p className="mt-2">{demoCompanyContext.availableFunctionalOwners.join(", ")}</p>
            </div>
          </div>
        </details>

        {error ? <ErrorState title="Analysis unavailable" message={error} /> : null}
        {isAnalyzing ? <AnalysisProgress elapsedSeconds={elapsedSeconds} /> : null}

        {result && validation.ok && metrics ? (
          <>
            <ViewNav
              currentView={currentView}
              actionCount={unresolvedActionCount}
              auditCount={validation.messages.length}
              onNavigate={navigateView}
            />
            <SummaryMetrics metrics={metrics} onNavigate={navigate} />
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm text-stone-600 lg:flex-row lg:items-center lg:justify-between">
              <span>
                Model {result.metadata.model} · Prompt {result.metadata.promptVersion} · {result.metadata.processingMs} ms
                {result.metadata.usedBriefingFallback ? " · deterministic briefing fallback used" : ""}
              </span>
              <button
                type="button"
                onClick={resetWorkflowWithConfirmation}
                className="inline-flex min-h-9 items-center gap-2 self-start rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400 lg:self-auto"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Reset workflow
              </button>
            </div>

            {currentView === "briefing" ? (
              <BriefingWorkspace
                briefing={result.briefing}
                actions={actions}
                progress={progress}
                deadlines={deadlines}
                criticalFlags={criticalFlags}
                onOpenAction={openAction}
                onAudit={() => navigateView("audit")}
              />
            ) : null}

            {currentView === "actions" ? (
              <ActionCenter
                actions={actions}
                filters={actionFilters}
                onFiltersChange={setActionFilters}
                onOpenAction={openAction}
                onWorkflowMapChange={updateMap}
              />
            ) : null}

            {currentView === "audit" ? (
              <AuditTrailView
                messages={validation.messages}
                analysis={result.analysis}
                actions={actions}
                filters={auditFilters}
                targetMessageId={targetMessageId}
                onFiltersChange={setAuditFilters}
                onOpenAction={openAction}
              />
            ) : null}
          </>
        ) : null}

        {!result && !isAnalyzing ? <EmptyState /> : null}
      </main>
      <ActionDrawer
        action={selectedAction}
        messages={validation.ok ? validation.messages : []}
        analysis={result?.analysis ?? null}
        onClose={closeAction}
        onWorkflowMapChange={updateMap}
      />
    </div>
  );
}
