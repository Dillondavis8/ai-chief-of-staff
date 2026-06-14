import { describe, expect, it } from "vitest";
import sample from "@/data/messages.json";
import { normalizeMessages } from "@/lib/messages/normalize";

describe("normalizeMessages", () => {
  it("normalizes and sorts the supplied sample", () => {
    const result = normalizeMessages(sample);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.messages).toHaveLength(20);
    expect(result.sourceDate).toBe("2026-03-18");
    expect(result.messages[0]).toMatchObject({
      id: "1",
      channel: "email",
      sender: "Sarah Chen <sarah.chen@meridianventures.com>"
    });
  });

  it("does not mutate uploaded input ordering", () => {
    const input = [
      { id: "b", channel: "slack", from: "B", timestamp: "2026-03-18T10:00:00Z", body: "Later" },
      { id: "a", channel: "pager", from: "A", timestamp: "2026-03-18T09:00:00Z", body: "Earlier" }
    ];

    const result = normalizeMessages(input);

    expect(input.map((message) => message.id)).toEqual(["b", "a"]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.messages.map((message) => message.id)).toEqual(["a", "b"]);
    expect(result.messages[0].channel).toBe("other");
  });

  it("rejects duplicate IDs and invalid timestamps with field errors", () => {
    const result = normalizeMessages([
      { id: "1", channel: "email", from: "A", timestamp: "bad", body: "Body" },
      { id: "1", channel: "email", from: "", timestamp: "2026-03-18T09:00:00Z", body: "Body" }
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(400);
    expect(result.errors.some((error) => error.field === "id")).toBe(true);
    expect(result.errors.some((error) => error.field === "timestamp")).toBe(true);
    expect(result.errors.some((error) => error.field === "from")).toBe(true);
  });
});
