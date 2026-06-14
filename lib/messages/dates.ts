import type { NormalizedMessage } from "./schemas";

export function isParseableTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

export function compareMessageTime(a: NormalizedMessage, b: NormalizedMessage) {
  const delta = Date.parse(a.timestamp) - Date.parse(b.timestamp);
  if (delta !== 0) {
    return delta;
  }

  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

export function deriveSourceDate(messages: NormalizedMessage[]) {
  if (messages.length === 0) {
    return "";
  }

  return new Date(messages[0].timestamp).toISOString().slice(0, 10);
}

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
