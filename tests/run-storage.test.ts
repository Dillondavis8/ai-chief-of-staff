import { describe, expect, it } from "vitest";
import type { AnalysisResult, DailyBriefing } from "@/lib/ai/schemas";
import {
  MAX_STORED_RUNS,
  createStoredRun,
  formatRunFilename,
  parseRunHistory,
  selectRun,
  serializeRunHistory,
  upsertRun
} from "@/lib/runs/storage";

const analysis: AnalysisResult = {
  sourceDate: "2026-03-18",
  messageAnalyses: [],
  threads: [],
  executiveItems: [],
  flags: []
};

const briefing: DailyBriefing = {
  title: "Daily brief",
  overview: null,
  urgent: [],
  decisions: [],
  flags: [],
  handled: [],
  personal: []
};

const metadata = {
  model: "test-model",
  promptVersion: "aos-v4",
  processedMessageCount: 1,
  processingMs: 100,
  analysisMode: "single_pass" as const,
  modelCallCount: 1,
  plannedThreadCount: null,
  partialAnalysisFallbackCount: 0,
  analysisFallbackReason: null,
  analysisWarnings: [],
  usedAnalysisFallback: false,
  usedBriefingFallback: false
};

function run(index: number) {
  return createStoredRun({
    filename: `messages-${index}.json`,
    dataset: [{ id: index, channel: "email", from: "A", timestamp: "2026-03-18T08:00:00Z", body: "Body" }],
    analysis,
    briefing,
    metadata,
    createdAt: `2026-03-18T08:${String(index).padStart(2, "0")}:00Z`
  });
}

describe("run history storage", () => {
  it("formats messy uploaded filenames for display", () => {
    expect(formatRunFilename("Messages JSON (1) (1).json")).toBe("Messages JSON");
    expect(formatRunFilename("board-update_export-copy.json")).toBe("Board Update Export");
  });

  it("round-trips stored runs and ignores malformed JSON", () => {
    const stored = serializeRunHistory([run(1)]);

    expect(parseRunHistory(stored)).toHaveLength(1);
    expect(parseRunHistory("{bad json")).toEqual([]);
  });

  it("selects the requested run or falls back to newest", () => {
    const first = run(1);
    const second = run(2);
    const runs = [second, first];

    expect(selectRun(runs, first.id)?.id).toBe(first.id);
    expect(selectRun(runs, "missing")?.id).toBe(second.id);
  });

  it("upserts and caps history", () => {
    const runs = Array.from({ length: MAX_STORED_RUNS + 2 }, (_, index) => run(index));
    const stored = runs.reduce((current, next) => upsertRun(current, next), [] as ReturnType<typeof run>[]);

    expect(stored).toHaveLength(MAX_STORED_RUNS);
    expect(stored[0].filename).toBe(`messages-${MAX_STORED_RUNS + 1}.json`);
  });
});
