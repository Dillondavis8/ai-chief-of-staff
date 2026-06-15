import type { AnalysisResult } from "./schemas";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import { AIProviderError, ModelOutputError, parseStructuredChatCompletion } from "./client";
import {
  buildRepairUserPrompt,
  buildThreadAnalysisUserPrompt,
  buildThreadPlanRepairPrompt,
  buildThreadPlanUserPrompt
} from "./prompts";
import {
  buildCompactAnalysisSchema,
  compactFromAnalysis,
  expandCompactAnalysis,
  namespaceCompactAnalysis,
  type CompactAnalysis
} from "./compact-analysis";
import { buildFallbackAnalysisForThread } from "./fallback-analysis";
import {
  buildThreadPlanSchema,
  completeThreadPlan,
  validateThreadPlan,
  type PlannedThread,
  type ThreadPlan
} from "./thread-planning";
import { validateAnalysisResult } from "./validation";

const DEFAULT_THREADED_ANALYSIS_MIN_MESSAGES = 30;
const DEFAULT_THREAD_ANALYSIS_CONCURRENCY = 3;

type CallCounter = {
  count: number;
};

type ThreadAnalysisPart = {
  compact: CompactAnalysis;
  usedFallback: boolean;
  fallbackReason?: string;
};

export type ThreadedAnalysisAttemptResult = {
  analysis: AnalysisResult;
  validationIssues: string[];
  analysisMode: "threaded";
  modelCallCount: number;
  plannedThreadCount: number;
  partialAnalysisFallbackCount: number;
  fallbackReasons: string[];
  analysisWarnings: string[];
};

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function threadedAnalysisMinMessages() {
  return envNumber("AOS_THREADED_ANALYSIS_MIN_MESSAGES", DEFAULT_THREADED_ANALYSIS_MIN_MESSAGES);
}

function threadAnalysisConcurrency() {
  return Math.max(1, Math.floor(envNumber("AOS_THREAD_ANALYSIS_CONCURRENCY", DEFAULT_THREAD_ANALYSIS_CONCURRENCY)));
}

export function shouldUseThreadedAnalysis(messages: NormalizedMessage[]) {
  return messages.length >= threadedAnalysisMinMessages();
}

function summarizeError(error: unknown) {
  if (error instanceof AIProviderError || error instanceof ModelOutputError) {
    const status = error instanceof AIProviderError && error.status ? ` status ${error.status}` : "";
    const code = error instanceof AIProviderError && error.code ? ` code ${error.code}` : "";
    return `${error.name}${status}${code}: ${error.message}`;
  }

  return error instanceof Error ? `${error.name}: ${error.message}` : "Unknown analysis failure.";
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<TResult>
) {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function requestThreadPlan(
  messages: NormalizedMessage[],
  sourceDate: string,
  calls: CallCounter
): Promise<{ plan: ThreadPlan; warnings: string[] }> {
  calls.count += 1;
  const firstPlan = await parseStructuredChatCompletion({
    schema: buildThreadPlanSchema(messages.map((message) => message.id)),
    schemaName: "aos_thread_plan",
    systemPrompt: "You group executive communications into primary evolving threads. Return only valid structured data.",
    userPrompt: buildThreadPlanUserPrompt(messages, sourceDate),
    maxTokens: 8_000
  });

  let plan = firstPlan;
  let validation = validateThreadPlan(plan, messages, sourceDate);
  const warnings: string[] = [];

  if (!validation.valid) {
    calls.count += 1;
    const repairedPlan = await parseStructuredChatCompletion({
      schema: buildThreadPlanSchema(messages.map((message) => message.id)),
      schemaName: "aos_thread_plan_repaired",
      systemPrompt: "You repair executive communication thread plans. Return only valid structured data.",
      userPrompt: buildThreadPlanRepairPrompt({
        messages,
        sourceDate,
        invalidPlan: plan,
        validationIssues: validation.issues
      }),
      maxTokens: 8_000
    });

    plan = repairedPlan;
    validation = validateThreadPlan(plan, messages, sourceDate);
  }

  if (!validation.valid) {
    warnings.push(`Thread plan still needed application completion: ${validation.issues.slice(0, 3).join("; ")}`);
  }

  const completedPlan = completeThreadPlan(plan, messages, sourceDate);
  const completedValidation = validateThreadPlan(completedPlan, messages, sourceDate);
  if (!completedValidation.valid) {
    throw new ModelOutputError(`The thread plan could not be completed safely: ${completedValidation.issues.slice(0, 6).join("; ")}`);
  }

  return { plan: completedPlan, warnings };
}

function messagesForThread(thread: PlannedThread, messagesById: Map<string, NormalizedMessage>) {
  return thread.messageIds.map((id) => messagesById.get(id)).filter((message): message is NormalizedMessage => Boolean(message));
}

async function requestThreadAnalysis(args: {
  plan: ThreadPlan;
  thread: PlannedThread;
  messages: NormalizedMessage[];
  sourceDate: string;
  calls: CallCounter;
}) {
  const messageIds = args.messages.map((message) => message.id);
  args.calls.count += 1;
  const compact = await parseStructuredChatCompletion({
    schema: buildCompactAnalysisSchema(messageIds),
    schemaName: "aos_thread_analysis",
    systemPrompt:
      "You analyze one planned executive communication thread. Preserve audit coverage and return only valid compact structured data.",
    userPrompt: buildThreadAnalysisUserPrompt(args),
    maxTokens: 6_000
  });

  let analysis = expandCompactAnalysis(compact, args.messages, args.sourceDate);
  let validation = validateAnalysisResult(analysis, args.messages, args.sourceDate);

  if (validation.issues.length > 0) {
    args.calls.count += 1;
    const repairedCompact = await parseStructuredChatCompletion({
      schema: buildCompactAnalysisSchema(messageIds),
      schemaName: "aos_thread_analysis_repaired",
      systemPrompt:
        "You repair one planned executive communication thread analysis. Preserve audit coverage and return only valid compact structured data.",
      userPrompt: buildRepairUserPrompt({
        messages: args.messages,
        sourceDate: args.sourceDate,
        invalidResult: analysis,
        validationIssues: validation.issues
      }),
      maxTokens: 6_000
    });

    analysis = expandCompactAnalysis(repairedCompact, args.messages, args.sourceDate);
    validation = validateAnalysisResult(analysis, args.messages, args.sourceDate);

    if (validation.issues.length === 0) {
      return repairedCompact;
    }
  }

  if (validation.issues.length > 0) {
    throw new ModelOutputError(`Thread "${args.thread.id}" failed validation: ${validation.issues.slice(0, 6).join("; ")}`);
  }

  return compact;
}

function mergeCompactAnalyses(parts: CompactAnalysis[], sourceDate: string): CompactAnalysis {
  return {
    sourceDate,
    messageAnalyses: parts.flatMap((part) => part.messageAnalyses),
    threads: parts.flatMap((part) => part.threads),
    executiveItems: parts.flatMap((part) => part.executiveItems),
    flags: parts.flatMap((part) => part.flags)
  };
}

export async function requestThreadedAnalysis(
  messages: NormalizedMessage[],
  sourceDate: string
): Promise<ThreadedAnalysisAttemptResult> {
  const calls: CallCounter = { count: 0 };
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const { plan, warnings } = await requestThreadPlan(messages, sourceDate, calls);

  const parts = await mapWithConcurrency(plan.threads, threadAnalysisConcurrency(), async (thread): Promise<ThreadAnalysisPart> => {
    const threadMessages = messagesForThread(thread, messagesById);

    try {
      const compact = await requestThreadAnalysis({
        plan,
        thread,
        messages: threadMessages,
        sourceDate,
        calls
      });
      return {
        compact: namespaceCompactAnalysis(compact, thread.id),
        usedFallback: false
      };
    } catch (error) {
      if (!(error instanceof AIProviderError) && !(error instanceof ModelOutputError)) {
        throw error;
      }

      const fallbackAnalysis = buildFallbackAnalysisForThread(threadMessages, sourceDate, thread);
      return {
        compact: namespaceCompactAnalysis(compactFromAnalysis(fallbackAnalysis), thread.id),
        usedFallback: true,
        fallbackReason: `Thread ${thread.id}: ${summarizeError(error)}`
      };
    }
  });

  const compact = mergeCompactAnalyses(
    parts.map((part) => part.compact),
    sourceDate
  );
  const analysis = expandCompactAnalysis(compact, messages, sourceDate);
  const validation = validateAnalysisResult(analysis, messages, sourceDate);

  return {
    analysis,
    validationIssues: validation.issues,
    analysisMode: "threaded",
    modelCallCount: calls.count,
    plannedThreadCount: plan.threads.length,
    partialAnalysisFallbackCount: parts.filter((part) => part.usedFallback).length,
    fallbackReasons: parts.map((part) => part.fallbackReason).filter((reason): reason is string => Boolean(reason)),
    analysisWarnings: warnings
  };
}
