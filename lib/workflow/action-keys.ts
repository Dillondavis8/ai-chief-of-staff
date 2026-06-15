import type { ExecutiveFlag, ExecutiveItem } from "@/lib/ai/schemas";
import type { CanonicalActionKind } from "./types";

export function normalizeForKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function createActionKeyFromParts(kind: CanonicalActionKind, sourceMessageIds: string[], title: string) {
  const sourceIds = [...sourceMessageIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(",");
  const normalizedTitle = normalizeForKey(title);
  return `${kind}-${stableHash(`${kind}:${sourceIds}:${normalizedTitle}`)}`;
}

export function createActionKey(item: ExecutiveItem) {
  return createActionKeyFromParts(item.kind, item.sourceMessageIds, item.title);
}

export function createFlagActionKey(flag: ExecutiveFlag) {
  return createActionKeyFromParts("flag", flag.sourceMessageIds, flag.title);
}
