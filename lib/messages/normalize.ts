import {
  MAX_MESSAGE_COUNT,
  MAX_PAYLOAD_BYTES,
  type FieldValidationError,
  type MessageValidationResult,
  type NormalizedChannel,
  type NormalizedMessage
} from "./schemas";
import { byteLength, compareMessageTime, deriveSourceDate, isParseableTimestamp } from "./dates";

type RawMessageRecord = Record<string, unknown>;

const supportedChannels = new Set(["email", "slack", "whatsapp"]);

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeChannel(value: unknown): NormalizedChannel {
  if (typeof value !== "string") {
    return "other";
  }

  const normalized = value.toLowerCase();
  return supportedChannels.has(normalized) ? (normalized as NormalizedChannel) : "other";
}

function addError(
  errors: FieldValidationError[],
  index: number,
  field: string,
  message: string,
  id?: string
) {
  errors.push({ index, field, message, id });
}

export function normalizeMessages(input: unknown): MessageValidationResult {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      status: 400,
      errors: [{ message: "Input must be a JSON array of messages." }]
    };
  }

  if (input.length === 0) {
    return {
      ok: false,
      status: 400,
      errors: [{ message: "Upload at least one message." }]
    };
  }

  const serialized = JSON.stringify(input);
  if (byteLength(serialized) > MAX_PAYLOAD_BYTES || input.length > MAX_MESSAGE_COUNT) {
    return {
      ok: false,
      status: 413,
      errors: [
        {
          message: `Payload is too large. Upload up to ${MAX_MESSAGE_COUNT} messages and ${Math.round(
            MAX_PAYLOAD_BYTES / 1024
          )} KB.`
        }
      ]
    };
  }

  const errors: FieldValidationError[] = [];
  const seenIds = new Set<string>();
  const normalized: NormalizedMessage[] = [];

  input.forEach((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ index, message: "Each item must be an object." });
      return;
    }

    const raw = item as RawMessageRecord;
    const idValue = raw.id;
    const id =
      typeof idValue === "string" || typeof idValue === "number" || typeof idValue === "bigint"
        ? String(idValue).trim()
        : "";

    if (!id) {
      addError(errors, index, "id", "Every message needs a nonempty string or numeric ID.");
    } else if (seenIds.has(id)) {
      addError(errors, index, "id", `Duplicate message ID "${id}".`, id);
    } else {
      seenIds.add(id);
    }

    const sender = asTrimmedString(raw.from);
    if (!sender) {
      addError(errors, index, "from", "Every message needs a nonempty sender.", id || undefined);
    }

    const timestamp = asTrimmedString(raw.timestamp);
    if (!timestamp || !isParseableTimestamp(timestamp)) {
      addError(errors, index, "timestamp", "Every message needs a parseable timestamp.", id || undefined);
    }

    const body = asTrimmedString(raw.body);
    if (!body) {
      addError(errors, index, "body", "Every message needs a nonempty body.", id || undefined);
    }

    if (!id || !sender || !timestamp || !isParseableTimestamp(timestamp) || !body) {
      return;
    }

    const channel = normalizeChannel(raw.channel);
    const recipient = asTrimmedString(raw.to);
    const subject = asTrimmedString(raw.subject);
    const channelName = asTrimmedString(raw.channel_name);

    normalized.push({
      id,
      channel,
      sender,
      recipient,
      subject,
      channelName,
      timestamp,
      body
    });
  });

  if (errors.length > 0) {
    return { ok: false, status: 400, errors };
  }

  const messages = [...normalized].sort(compareMessageTime);

  return {
    ok: true,
    messages,
    sourceDate: deriveSourceDate(messages)
  };
}
