"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { AppHeader } from "./app-header";
import { UploadPanel } from "./upload-panel";
import { AnalysisProgress } from "./analysis-progress";
import { SummaryMetrics } from "./summary-metrics";
import { DailyBriefing } from "./daily-briefing";
import { ExecutiveItemCard } from "./executive-item-card";
import { FlagsPanel } from "./flags-panel";
import { ThreadCard } from "./thread-card";
import { MessageAuditList } from "./message-audit-list";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { normalizeMessages } from "@/lib/messages/normalize";
import { deriveMetrics, splitExecutiveItems } from "@/lib/utils/ranking";
import { demoCompanyContext } from "@/lib/demo/company-context";
import type { AnalysisResponseMetadata, AnalysisResult, DailyBriefing as DailyBriefingType } from "@/lib/ai/schemas";

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

export function Dashboard({ initialMessages }: DashboardProps) {
  const [dataset, setDataset] = useState<unknown>(initialMessages);
  const [filename, setFilename] = useState("Messages JSON (1) (1).json");
  const [result, setResult] = useState<ApiSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const validation = useMemo(() => normalizeMessages(dataset), [dataset]);
  const splitItems = result ? splitExecutiveItems(result.analysis.executiveItems) : null;
  const metrics =
    result && validation.ok ? deriveMetrics(result.analysis, validation.messages.length) : null;

  useEffect(() => {
    if (!isAnalyzing) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isAnalyzing]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setDataset(parsed);
      setFilename(file.name);
    } catch {
      setDataset([]);
      setFilename(file.name);
      setError("The selected file is not valid JSON.");
    }
  }

  function resetSample() {
    setDataset(initialMessages);
    setFilename("Messages JSON (1) (1).json");
    setResult(null);
    setError(null);
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

      setResult(payload as ApiSuccess);
    } catch {
      setError("The analysis request failed before the server returned a response.");
    } finally {
      setIsAnalyzing(false);
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

        {result && metrics && validation.ok ? (
          <>
            <SummaryMetrics metrics={metrics} />
            <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-stone-600">
              Model {result.metadata.model} · Prompt {result.metadata.promptVersion} · {result.metadata.processingMs} ms
              {result.metadata.usedBriefingFallback ? " · deterministic briefing fallback used" : ""}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-6">
                <DailyBriefing briefing={result.briefing} />

                {splitItems && splitItems.urgent.length > 0 ? (
                  <section className="panel rounded-lg p-5">
                    <h2 className="text-lg font-semibold text-ink">Current urgent decisions</h2>
                    <div className="mt-4 space-y-3">
                      {splitItems.urgent.map((item) => (
                        <ExecutiveItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ) : null}

                {splitItems && splitItems.decisions.length > 0 ? (
                  <section className="panel rounded-lg p-5">
                    <h2 className="text-lg font-semibold text-ink">Other decisions</h2>
                    <div className="mt-4 space-y-3">
                      {splitItems.decisions.map((item) => (
                        <ExecutiveItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ) : null}

                {splitItems && splitItems.delegated.length > 0 ? (
                  <section className="panel rounded-lg p-5">
                    <h2 className="text-lg font-semibold text-ink">Delegated actions</h2>
                    <div className="mt-4 space-y-3">
                      {splitItems.delegated.map((item) => (
                        <ExecutiveItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ) : null}

                <details className="panel rounded-lg p-5">
                  <summary className="cursor-pointer text-lg font-semibold text-ink">Handled and superseded history</summary>
                  <div className="mt-4 space-y-4">
                    {splitItems && splitItems.handled.length > 0 ? (
                      splitItems.handled.map((item) => <ExecutiveItemCard key={item.id} item={item} />)
                    ) : (
                      <p className="text-sm text-stone-600">No handled executive items were returned.</p>
                    )}
                    <div className="space-y-3">
                      {result.analysis.threads
                        .filter((thread) => thread.lifecycleStatus !== "active")
                        .map((thread) => (
                          <ThreadCard key={thread.id} thread={thread} />
                        ))}
                    </div>
                  </div>
                </details>
              </div>

              <aside className="space-y-6">
                <FlagsPanel flags={result.analysis.flags.filter((flag) => flag.status === "active")} />
                {splitItems && splitItems.personal.length > 0 ? (
                  <section className="panel rounded-lg p-5">
                    <h2 className="text-lg font-semibold text-ink">Personal</h2>
                    <div className="mt-4 space-y-3">
                      {splitItems.personal.map((item) => (
                        <ExecutiveItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ) : null}
                <section className="panel rounded-lg p-5">
                  <h2 className="text-lg font-semibold text-ink">Current threads</h2>
                  <div className="mt-4 space-y-3">
                    {result.analysis.threads
                      .filter((thread) => thread.lifecycleStatus === "active")
                      .map((thread) => (
                        <ThreadCard key={thread.id} thread={thread} />
                      ))}
                  </div>
                </section>
              </aside>
            </div>

            <MessageAuditList messages={validation.messages} analyses={result.analysis.messageAnalyses} />
          </>
        ) : null}

        {!result && !isAnalyzing ? <EmptyState /> : null}
      </main>
    </div>
  );
}
