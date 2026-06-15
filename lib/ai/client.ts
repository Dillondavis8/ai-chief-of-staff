import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { z } from "zod";

const DEFAULT_MODEL = "gpt-5.4-mini";
const MODEL_TIMEOUT_MS = 150_000;
const MODEL_MAX_RETRIES = 0;

export class MissingAIConfigurationError extends Error {
  constructor() {
    super("OPENAI_API_KEY is required on the server to run analysis.");
    this.name = "MissingAIConfigurationError";
  }
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

export class AIProviderError extends Error {
  status?: number;
  code?: string;
  type?: string;
  providerName?: string;

  constructor(message = "The model provider request failed.", metadata?: { status?: number; code?: string; type?: string; providerName?: string }) {
    super(message);
    this.name = "AIProviderError";
    this.status = metadata?.status;
    this.code = metadata?.code;
    this.type = metadata?.type;
    this.providerName = metadata?.providerName;
  }
}

export function getModelName() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function usesCompletionTokenLimit(model: string) {
  return /^(gpt-5|o\d|o-|chatgpt-)/i.test(model);
}

function buildStructuredCompletionParams(args: {
  schema: z.ZodTypeAny;
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}): ChatCompletionCreateParamsNonStreaming {
  const model = getModelName();
  const tokenLimit = usesCompletionTokenLimit(model)
    ? { max_completion_tokens: args.maxTokens }
    : { max_tokens: args.maxTokens };

  return {
    model,
    temperature: 0.1,
    ...tokenLimit,
    response_format: zodResponseFormat(args.schema, args.schemaName),
    messages: [
      {
        role: "system",
        content: args.systemPrompt
      },
      {
        role: "user",
        content: args.userPrompt
      }
    ]
  };
}

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingAIConfigurationError();
  }

  return new OpenAI({
    apiKey,
    timeout: MODEL_TIMEOUT_MS,
    maxRetries: MODEL_MAX_RETRIES
  });
}

export async function parseStructuredChatCompletion<TSchema extends z.ZodTypeAny>(args: {
  schema: TSchema;
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<z.infer<TSchema>> {
  const client = createClient();
  const startedAt = performance.now();
  try {
    const completion = await client.beta.chat.completions.parse(
      buildStructuredCompletionParams({
        ...args,
        maxTokens: args.maxTokens ?? 4_000
      })
    );

    if (completion.choices[0]?.finish_reason === "length") {
      throw new ModelOutputError("The model response ended before completing the structured output.");
    }

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new ModelOutputError("The model did not return parseable structured output.");
    }

    console.info(`[ai] structured call completed ${JSON.stringify({
      schemaName: args.schemaName,
      model: getModelName(),
      finishReason: completion.choices[0]?.finish_reason,
      processingMs: Math.round(performance.now() - startedAt)
    })}`);

    return parsed;
  } catch (error) {
    if (error instanceof ModelOutputError) {
      throw error;
    }

    const metadata =
      error && typeof error === "object"
        ? {
            status: "status" in error && typeof error.status === "number" ? error.status : undefined,
            code: "code" in error && typeof error.code === "string" ? error.code : undefined,
            type: "type" in error && typeof error.type === "string" ? error.type : undefined,
            providerName: "name" in error && typeof error.name === "string" ? error.name : undefined
          }
        : undefined;

    const providerMessage = error instanceof Error ? error.message : "Unknown provider error.";
    console.error(`[ai] provider request failed ${JSON.stringify({
      schemaName: args.schemaName,
      model: getModelName(),
      status: metadata?.status,
      code: metadata?.code,
      type: metadata?.type,
      providerName: metadata?.providerName,
      message: providerMessage
    })}`);

    throw new AIProviderError(providerMessage || "The model provider request failed.", metadata);
  }
}
