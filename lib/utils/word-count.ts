export function countWords(value: string) {
  const matches = value.trim().match(/\b[\w'-]+\b/g);
  return matches ? matches.length : 0;
}

export function truncateWords(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return value.trim();
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
}
