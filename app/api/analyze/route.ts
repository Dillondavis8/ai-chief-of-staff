import { NextResponse } from "next/server";
import { analyzeCommunications, InputValidationError } from "@/lib/ai/analyze";
import { AIProviderError, MissingAIConfigurationError, ModelOutputError } from "@/lib/ai/client";
import { MAX_PAYLOAD_BYTES } from "@/lib/messages/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        message,
        details
      }
    },
    { status }
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAYLOAD_BYTES + 32_768) {
    return jsonError("Uploaded JSON is too large.", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const messages =
    body !== null && typeof body === "object" && !Array.isArray(body) && "messages" in body
      ? (body as { messages: unknown }).messages
      : body;

  try {
    const response = await analyzeCommunications(messages);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof InputValidationError) {
      return jsonError("Uploaded messages failed validation.", error.status, error.errors);
    }

    if (error instanceof MissingAIConfigurationError) {
      return jsonError("Server-side OpenAI configuration is missing. Set OPENAI_API_KEY and retry.", 503);
    }

    if (error instanceof ModelOutputError) {
      return jsonError("The model response could not be safely validated. Retry the analysis.", 502);
    }

    if (error instanceof AIProviderError) {
      if (error.code === "insufficient_quota") {
        return jsonError("OpenAI rejected the request because this API key has insufficient quota or billing is not enabled.", 503);
      }

      if (error.status === 401) {
        return jsonError("OpenAI rejected the configured API key. Check OPENAI_API_KEY on the server.", 503);
      }

      if (error.status === 429) {
        return jsonError("OpenAI rate-limited the request. Wait briefly and retry.", 503);
      }

      return jsonError("The model provider request failed. Check the server logs and retry.", 502);
    }

    return jsonError("Unexpected server error while analyzing messages.", 500);
  }
}
