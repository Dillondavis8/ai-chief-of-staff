import type { AnalysisResponseMetadata, AnalysisResult, DailyBriefing } from "@/lib/ai/schemas";
import { normalizeMessages } from "@/lib/messages/normalize";

export const RUN_HISTORY_STORAGE_KEY = "ai-chief-of-staff:analysis-runs:v1";
export const SELECTED_RUN_STORAGE_KEY = "ai-chief-of-staff:selected-run:v1";
export const MAX_STORED_RUNS = 8;

export type StoredAnalysisRun = {
  id: string;
  label: string;
  filename: string;
  createdAt: string;
  messageCount: number;
  dataset: unknown;
  analysis: AnalysisResult;
  briefing: DailyBriefing;
  metadata: AnalysisResponseMetadata;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numberOrFallback(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createRunId(filename: string, createdAt: string, messageCount: number) {
  const normalized = filename.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}-${messageCount}-${normalized || "dataset"}`;
}

export function createRunLabel(filename: string, createdAt: string, messageCount: number) {
  const date = new Date(createdAt);
  const dateText = Number.isNaN(date.getTime())
    ? createdAt
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(date);

  return `${filename} · ${messageCount} messages · ${dateText}`;
}

export function createStoredRun(args: {
  filename: string;
  dataset: unknown;
  analysis: AnalysisResult;
  briefing: DailyBriefing;
  metadata: AnalysisResponseMetadata;
  createdAt?: string;
}): StoredAnalysisRun {
  const validation = normalizeMessages(args.dataset);
  const messageCount = validation.ok ? validation.messages.length : args.metadata.processedMessageCount;
  const createdAt = args.createdAt ?? new Date().toISOString();
  return {
    id: createRunId(args.filename, createdAt, messageCount),
    label: createRunLabel(args.filename, createdAt, messageCount),
    filename: args.filename,
    createdAt,
    messageCount,
    dataset: args.dataset,
    analysis: args.analysis,
    briefing: args.briefing,
    metadata: args.metadata
  };
}

export function parseStoredRun(value: unknown): StoredAnalysisRun | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!isRecord(value.analysis) || !isRecord(value.briefing) || !isRecord(value.metadata)) {
    return null;
  }

  const filename = stringOrFallback(value.filename, "Uploaded dataset");
  const createdAt = stringOrFallback(value.createdAt, new Date().toISOString());
  const messageCount = numberOrFallback(value.messageCount, 0);

  return {
    id: stringOrFallback(value.id, createRunId(filename, createdAt, messageCount)),
    label: stringOrFallback(value.label, createRunLabel(filename, createdAt, messageCount)),
    filename,
    createdAt,
    messageCount,
    dataset: "dataset" in value ? value.dataset : [],
    analysis: value.analysis as AnalysisResult,
    briefing: value.briefing as DailyBriefing,
    metadata: value.metadata as AnalysisResponseMetadata
  };
}

export function parseRunHistory(raw: string | null): StoredAnalysisRun[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(parseStoredRun)
      .filter((run): run is StoredAnalysisRun => run !== null)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    return [];
  }
}

export function serializeRunHistory(runs: StoredAnalysisRun[]) {
  return JSON.stringify(runs.slice(0, MAX_STORED_RUNS));
}

export function upsertRun(runs: StoredAnalysisRun[], run: StoredAnalysisRun) {
  const withoutExisting = runs.filter((candidate) => candidate.id !== run.id);
  return [run, ...withoutExisting]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_STORED_RUNS);
}

export function selectRun(runs: StoredAnalysisRun[], selectedId: string | null) {
  if (selectedId) {
    const selected = runs.find((run) => run.id === selectedId);
    if (selected) {
      return selected;
    }
  }

  return runs[0] ?? null;
}
