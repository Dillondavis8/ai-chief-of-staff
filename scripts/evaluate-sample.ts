import sample from "../data/messages.json";
import { analyzeCommunications } from "../lib/ai/analyze";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasAll(source: string[], ids: string[]) {
  return ids.every((id) => source.includes(id));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before running the live sample evaluation.");
  }

  const { analysis, briefing, metadata } = await analyzeCommunications(sample);
  const byMessage = new Map(analysis.messageAnalyses.map((message) => [message.messageId, message]));

  assert(analysis.messageAnalyses.length === 20, "Every sample message should be analyzed exactly once.");
  assert(analysis.threads.some((thread) => hasAll(thread.messageIds, ["2", "9", "16"])), "API migration messages should share a thread.");
  assert(byMessage.get("2")?.lifecycleStatus === "superseded", "API migration progress update should be superseded.");
  assert(byMessage.get("9")?.lifecycleStatus === "superseded", "API migration delay update should be superseded.");
  assert(byMessage.get("16")?.primaryCategory === "decide", "Live checkout failure should require a decision.");
  assert(analysis.threads.some((thread) => hasAll(thread.messageIds, ["5", "6", "17"]) && thread.lifecycleStatus === "resolved"), "Horizon should resolve to handled state.");
  assert(analysis.threads.some((thread) => hasAll(thread.messageIds, ["12", "19"])), "Northwind messages should share a thread.");
  assert(byMessage.get("13")?.primaryCategory === "decide", "People message should be primary Decide.");
  assert((byMessage.get("13")?.actionItems.length ?? 0) >= 2, "People message should extract multiple actions.");
  assert(byMessage.get("4")?.primaryCategory === "delegate", "Security phishing message should be delegated internally.");
  assert(byMessage.get("4")?.draftedResponse.type !== "reply_to_sender", "Security phishing message must not draft a sender reply.");
  assert(analysis.flags.some((flag) => flag.category === "security" && flag.sourceMessageIds.includes("4")), "Security flag should reference message 4.");
  assert(briefing.urgent.length + briefing.decisions.length > 0, "Briefing should contain current decisions.");

  console.log(JSON.stringify({ ok: true, metadata, briefingTitle: briefing.title }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exit(1);
});
