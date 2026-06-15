import { stripInlineSourceMarkers } from "@/lib/messages/source-markers";

function tidyText(value: string) {
  return value
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanMissingContextItem(value: string) {
  return tidyText(stripInlineSourceMarkers(value).replace(/[.。]+$/g, ""));
}

export function briefingDisplayText(value: string | null | undefined) {
  return tidyText(stripInlineSourceMarkers(value));
}

export function splitBriefingBody(
  value: string | null | undefined,
  structuredMissingContext: string[] = []
) {
  const text = briefingDisplayText(value);
  const structuredItems = structuredMissingContext.map(cleanMissingContextItem).filter(Boolean);
  const missingMatch = /\bMissing\s*:\s*(.+)$/i.exec(text);

  if (!missingMatch) {
    return {
      body: text,
      missingContext: structuredItems
    };
  }

  const inlineItems = missingMatch[1]
    .split(/[\n;]+/)
    .map(cleanMissingContextItem)
    .filter(Boolean);

  return {
    body: tidyText(text.slice(0, missingMatch.index)),
    missingContext: structuredItems.length > 0 ? structuredItems : inlineItems
  };
}
