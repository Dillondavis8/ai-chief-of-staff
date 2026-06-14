import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

const DEFAULT_MODEL = "gpt-4.1-mini";
const MODEL_TIMEOUT_MS = 45_000;

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

  constructor(message = "The model provider request failed.", metadata?: { status?: number; code?: string; type?: string }) {
    super(message);
    this.name = "AIProviderError";
    this.status = metadata?.status;
    this.code = metadata?.code;
    this.type = metadata?.type;
  }
}

export function getModelName() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingAIConfigurationError();
  }

  return new OpenAI({
    apiKey,
    timeout: MODEL_TIMEOUT_MS
  });
}

export async function parseStructuredChatCompletion<TSchema extends z.ZodTypeAny>(args: {
  schema: TSchema;
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<z.infer<TSchema>> {
  const client = createClient();
  try {
    const completion = await client.beta.chat.completions.parse({
      model: getModelName(),
      temperature: 0.1,
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
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new ModelOutputError("The model did not return parseable structured output.");
    }

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
            type: "type" in error && typeof error.type === "string" ? error.type : undefined
          }
        : undefined;

    throw new AIProviderError("The model provider request failed.", metadata);
  }
}
