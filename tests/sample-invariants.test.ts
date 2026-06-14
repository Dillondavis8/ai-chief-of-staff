import { describe, expect, it } from "vitest";
import sample from "@/data/messages.json";
import { normalizeMessages } from "@/lib/messages/normalize";

describe("supplied sample fixture", () => {
  it("contains the assessment's evolving thread examples", () => {
    const result = normalizeMessages(sample);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const byId = new Map(result.messages.map((message) => [message.id, `${message.subject ?? ""} ${message.body}`]));
    expect(byId.get("16")).toMatch(/3% of users|3%/i);
    expect(byId.get("16")).toMatch(/roll back|hotfix/i);
    expect(byId.get("17")).toMatch(/MVP at 6 weeks/i);
    expect(byId.get("19")).toMatch(/60k ARR/i);
    expect(byId.get("4")).toMatch(/seczure-verify/i);
    expect(byId.get("8")).toMatch(/attached the shortlist/i);
    expect(byId.get("13")).toMatch(/benefits package by end of day Friday/i);
  });
});
