import { normalizeMessages } from "@/lib/messages/normalize";
import type { FieldValidationError, MessageValidationResult, NormalizedMessage } from "@/lib/messages/schemas";
import {
  type AnalysisResponseMetadata,
  type AnalysisResult,
  type DailyBriefing
} from "./schemas";
import {
  ANALYSIS_SYSTEM_PROMPT,
  PROMPT_VERSION,
  buildAnalysisUserPrompt,
  buildRepairUserPrompt
} from "./prompts";
import { AIProviderError, getModelName, ModelOutputError, parseStructuredChatCompletion } from "./client";
import { buildDailyBriefing } from "./briefing";
import { buildCompactAnalysisSchema, expandCompactAnalysis } from "./compact-analysis";
import { buildFallbackAnalysis } from "./fallback-analysis";
import { requestThreadedAnalysis, shouldUseThreadedAnalysis } from "./threaded-analysis";
import { validateAnalysisResult } from "./validation";

export class InputValidationError extends Error {
  status: 400 | 413;
  errors: FieldValidationError[];

  constructor(validation: Exclude<MessageValidationResult, { ok: true }>) {
    super("Input validation failed.");
    this.name = "InputValidationError";
    this.status = validation.status;
    this.errors = validation.errors;
  }
}

type AnalysisAttemptResult = {
  analysis: AnalysisResult;
  validationIssues: string[];
  modelCallCount: number;
  analysisMode: AnalysisResponseMetadata["analysisMode"];
  plannedThreadCount: number | null;
  partialAnalysisFallbackCount: number;
  fallbackReasons: string[];
  analysisWarnings: string[];
};

function summarizeAnalysisError(error: AIProviderError | ModelOutputError) {
  if (error instanceof AIProviderError) {
    const status = error.status ? ` status ${error.status}` : "";
    const code = error.code ? ` code ${error.code}` : "";
    return `${error.name}${status}${code}: ${error.message}`;
  }

  return `${error.name}: ${error.message}`;
}

async function requestSinglePassAnalysis(messages: NormalizedMessage[], sourceDate: string): Promise<AnalysisAttemptResult> {
  let modelCallCount = 1;
  const compact = await parseStructuredChatCompletion({
    schema: buildCompactAnalysisSchema(messages.map((message) => message.id)),
    schemaName: "aos_analysis_result",
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt: buildAnalysisUserPrompt(messages, sourceDate),
    maxTokens: 8_000
  });
  let analysis = expandCompactAnalysis(compact, messages, sourceDate);

  let validation = validateAnalysisResult(analysis, messages, sourceDate);
  if (validation.issues.length > 0) {
    modelCallCount += 1;
    const repairedCompact = await parseStructuredChatCompletion({
      schema: buildCompactAnalysisSchema(messages.map((message) => message.id)),
      schemaName: "aos_analysis_result_repaired",
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userPrompt: buildRepairUserPrompt({
        messages,
        sourceDate,
        invalidResult: analysis,
        validationIssues: validation.issues
      }),
      maxTokens: 8_000
    });
    analysis = expandCompactAnalysis(repairedCompact, messages, sourceDate);
    validation = validateAnalysisResult(analysis, messages, sourceDate);
  }

  return {
    analysis,
    validationIssues: validation.issues,
    modelCallCount,
    analysisMode: "single_pass",
    plannedThreadCount: null,
    partialAnalysisFallbackCount: 0,
    fallbackReasons: [],
    analysisWarnings: []
  };
}

export type AnalyzeCommunicationsSuccess = {
  analysis: AnalysisResult;
  briefing: DailyBriefing;
  metadata: AnalysisResponseMetadata;
};

export async function analyzeCommunications(rawMessages: unknown): Promise<AnalyzeCommunicationsSuccess> {
  const startedAt = performance.now();
  const normalized = normalizeMessages(rawMessages);

  if (!normalized.ok) {
    throw new InputValidationError(normalized);
  }

  let usedAnalysisFallback = false;
  let analysis: AnalysisResult;
  let issues: string[] = [];
  let modelCallCount = 0;
  let analysisMode: AnalysisResponseMetadata["analysisMode"] = "single_pass";
  let plannedThreadCount: number | null = null;
  let partialAnalysisFallbackCount = 0;
  let analysisFallbackReason: string | null = null;
  let analysisWarnings: string[] = [];

  try {
    const attempt = shouldUseThreadedAnalysis(normalized.messages)
      ? await requestThreadedAnalysis(normalized.messages, normalized.sourceDate)
      : await requestSinglePassAnalysis(normalized.messages, normalized.sourceDate);

    analysis = attempt.analysis;
    issues = attempt.validationIssues;
    modelCallCount = attempt.modelCallCount;
    analysisMode = attempt.analysisMode;
    plannedThreadCount = attempt.plannedThreadCount;
    partialAnalysisFallbackCount = attempt.partialAnalysisFallbackCount;
    analysisWarnings = attempt.analysisWarnings;

    if (attempt.fallbackReasons.length > 0) {
      analysisWarnings = [...analysisWarnings, ...attempt.fallbackReasons];
    }

    if (issues.length > 0) {
      throw new ModelOutputError(
        `The model returned analysis that failed validation: ${issues.slice(0, 6).join("; ")}`
      );
    }
  } catch (error) {
    if (!(error instanceof AIProviderError) && !(error instanceof ModelOutputError)) {
      throw error;
    }

    const fallbackReason = summarizeAnalysisError(error);
    console.warn("[ai] using deterministic analysis fallback", {
      reason: error.name,
      message: error.message
    });
    analysis = buildFallbackAnalysis(normalized.messages, normalized.sourceDate);
    usedAnalysisFallback = true;
    analysisMode = "deterministic";
    analysisFallbackReason = fallbackReason;
    partialAnalysisFallbackCount = 0;
    plannedThreadCount = null;
  }

  const briefing = buildDailyBriefing(analysis);
  const usedBriefingFallback = false;

  const processingMs = Math.round(performance.now() - startedAt);

  return {
    analysis,
    briefing,
    metadata: {
      model: getModelName(),
      promptVersion: PROMPT_VERSION,
      processedMessageCount: normalized.messages.length,
      processingMs,
      analysisMode,
      modelCallCount,
      plannedThreadCount,
      partialAnalysisFallbackCount,
      analysisFallbackReason,
      analysisWarnings,
      usedAnalysisFallback,
      usedBriefingFallback
    }
  };
}
