import { normalizeMessages } from "@/lib/messages/normalize";
import type { FieldValidationError, MessageValidationResult, NormalizedMessage } from "@/lib/messages/schemas";
import {
  analysisResultSchema,
  dailyBriefingSchema,
  type AnalysisResponseMetadata,
  type AnalysisResult,
  type DailyBriefing
} from "./schemas";
import {
  ANALYSIS_SYSTEM_PROMPT,
  BRIEFING_SYSTEM_PROMPT,
  PROMPT_VERSION,
  buildAnalysisUserPrompt,
  buildBriefingUserPrompt,
  buildConciseBriefingPrompt,
  buildRepairUserPrompt
} from "./prompts";
import { getModelName, ModelOutputError, parseStructuredChatCompletion } from "./client";
import { buildFallbackBriefing } from "./briefing";
import { validateAnalysisResult, validateBriefing } from "./validation";

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
};

async function requestAnalysis(messages: NormalizedMessage[], sourceDate: string): Promise<AnalysisAttemptResult> {
  const analysis = await parseStructuredChatCompletion({
    schema: analysisResultSchema,
    schemaName: "aos_analysis_result",
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt: buildAnalysisUserPrompt(messages, sourceDate)
  });

  const validation = validateAnalysisResult(analysis, messages, sourceDate);
  return { analysis, validationIssues: validation.issues };
}

async function repairAnalysis(args: {
  messages: NormalizedMessage[];
  sourceDate: string;
  invalidResult: AnalysisResult;
  validationIssues: string[];
}) {
  const repaired = await parseStructuredChatCompletion({
    schema: analysisResultSchema,
    schemaName: "aos_analysis_result_repaired",
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt: buildRepairUserPrompt(args)
  });

  const validation = validateAnalysisResult(repaired, args.messages, args.sourceDate);
  return { analysis: repaired, validationIssues: validation.issues };
}

async function requestBriefing(analysis: AnalysisResult): Promise<{
  briefing: DailyBriefing;
  usedFallback: boolean;
}> {
  const briefing = await parseStructuredChatCompletion({
    schema: dailyBriefingSchema,
    schemaName: "aos_daily_briefing",
    systemPrompt: BRIEFING_SYSTEM_PROMPT,
    userPrompt: buildBriefingUserPrompt(analysis)
  });

  const validation = validateBriefing(briefing, analysis);
  if (validation.valid) {
    return { briefing, usedFallback: false };
  }

  const concise = await parseStructuredChatCompletion({
    schema: dailyBriefingSchema,
    schemaName: "aos_daily_briefing_concise",
    systemPrompt: BRIEFING_SYSTEM_PROMPT,
    userPrompt: buildConciseBriefingPrompt(analysis)
  });

  const conciseValidation = validateBriefing(concise, analysis);
  if (conciseValidation.valid) {
    return { briefing: concise, usedFallback: false };
  }

  return {
    briefing: buildFallbackBriefing(analysis),
    usedFallback: true
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

  const firstAttempt = await requestAnalysis(normalized.messages, normalized.sourceDate);
  let analysis = firstAttempt.analysis;
  let issues = firstAttempt.validationIssues;

  if (issues.length > 0) {
    const repaired = await repairAnalysis({
      messages: normalized.messages,
      sourceDate: normalized.sourceDate,
      invalidResult: firstAttempt.analysis,
      validationIssues: issues
    });
    analysis = repaired.analysis;
    issues = repaired.validationIssues;
  }

  if (issues.length > 0) {
    throw new ModelOutputError(
      `The model returned analysis that failed validation after repair: ${issues.slice(0, 6).join("; ")}`
    );
  }

  const { briefing, usedFallback } = await requestBriefing(analysis);
  const processingMs = Math.round(performance.now() - startedAt);

  return {
    analysis,
    briefing,
    metadata: {
      model: getModelName(),
      promptVersion: PROMPT_VERSION,
      processedMessageCount: normalized.messages.length,
      processingMs,
      usedBriefingFallback: usedFallback
    }
  };
}
