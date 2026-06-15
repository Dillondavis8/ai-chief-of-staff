const labelledMarker = String.raw`(?:msgs?|messages?)\s*#?\s*\d+`;
const numberedMarker = String.raw`#\s*\d+`;
const trailingMarker = String.raw`(?:${labelledMarker}|#?\s*\d+)`;

const bracketedSourceMarkerPattern = new RegExp(
  String.raw`\s*\[\s*(?:${labelledMarker}|${numberedMarker})\s*(?:[,;]\s*${trailingMarker}\s*)*\]`,
  "gi"
);

export function stripInlineSourceMarkers(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(bracketedSourceMarkerPattern, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
