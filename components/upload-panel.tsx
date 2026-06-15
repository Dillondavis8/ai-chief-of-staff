"use client";

import { FileJson, RefreshCw, Upload, Wand2 } from "lucide-react";
import type { FieldValidationError, MessageValidationResult } from "@/lib/messages/schemas";
import { createRunLabel, formatRunFilename } from "@/lib/runs/storage";
import type { StoredAnalysisRun } from "@/lib/runs/storage";

type UploadPanelProps = {
  filename: string;
  validation: MessageValidationResult;
  isAnalyzing: boolean;
  savedRuns: StoredAnalysisRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onAnalyze: () => void;
  onReset: () => void;
  onFile: (file: File) => void;
};

function ValidationErrors({ errors }: { errors: FieldValidationError[] }) {
  return (
    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-semibold">JSON validation failed</p>
      <ul className="mt-2 space-y-1">
        {errors.slice(0, 6).map((error, index) => (
          <li key={`${error.field}-${index}`}>
            {error.index !== undefined ? `Message ${error.index + 1}: ` : ""}
            {error.field ? `${error.field}: ` : ""}
            {error.message}
          </li>
        ))}
      </ul>
      {errors.length > 6 ? <p className="mt-2">Plus {errors.length - 6} more issues.</p> : null}
    </div>
  );
}

export function UploadPanel({
  filename,
  validation,
  isAnalyzing,
  savedRuns,
  selectedRunId,
  onSelectRun,
  onAnalyze,
  onReset,
  onFile
}: UploadPanelProps) {
  const displayFilename = formatRunFilename(filename);

  return (
    <section className="panel rounded-lg p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <FileJson className="h-5 w-5 text-mint" aria-hidden="true" />
            Dataset
          </h2>
          <p className="mt-1 truncate text-sm text-stone-600" title={`${filename} · ${validation.ok ? validation.messages.length : 0} valid messages`}>
            {displayFilename} · {validation.ok ? validation.messages.length : 0} valid messages
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
          {savedRuns.length > 0 ? (
            <label className="inline-flex min-h-10 min-w-0 max-w-full items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink sm:w-[320px]">
              <span className="shrink-0 text-stone-600">Saved run</span>
              <select
                value={selectedRunId ?? ""}
                onChange={(event) => onSelectRun(event.target.value)}
                className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-ink outline-none"
                aria-label="Select saved analysis run"
              >
                {savedRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {createRunLabel(run.filename, run.createdAt, run.messageCount)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reset sample
          </button>
          <label className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Select JSON
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onFile(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!validation.ok || isAnalyzing}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Analyze
          </button>
        </div>
      </div>
      <div
        className="mt-4 rounded-lg border border-dashed border-line bg-paper/80 p-5 text-center text-sm text-stone-600"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) {
            onFile(file);
          }
        }}
      >
        Drag and drop a JSON array here
      </div>
      {!validation.ok ? <ValidationErrors errors={validation.errors} /> : null}
    </section>
  );
}
