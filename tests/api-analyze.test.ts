import { describe, expect, it } from "vitest";
import sample from "@/data/messages.json";
import { POST } from "@/app/api/analyze/route";

describe("POST /api/analyze", () => {
  it("returns a configuration error when OPENAI_API_KEY is missing", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "";

    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: sample })
      })
    );

    if (previousKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousKey;
    }

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.message).toMatch(/OPENAI/i);
  });
});
