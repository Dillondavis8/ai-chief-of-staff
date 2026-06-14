import type { MessageAnalysis } from "@/lib/ai/schemas";
import type { NormalizedMessage } from "@/lib/messages/schemas";
import { MessageDetail } from "./message-detail";

export function MessageAuditList({
  messages,
  analyses
}: {
  messages: NormalizedMessage[];
  analyses: MessageAnalysis[];
}) {
  const analysisById = new Map(analyses.map((analysis) => [analysis.messageId, analysis]));

  return (
    <section className="panel rounded-lg p-5">
      <h2 className="text-lg font-semibold text-ink">Message audit trail</h2>
      <p className="mt-1 text-sm text-stone-600">Every original message is preserved with classification, lifecycle, rationale, and draft.</p>
      <div className="mt-4 space-y-3">
        {messages.map((message) => (
          <MessageDetail key={message.id} message={message} analysis={analysisById.get(message.id)} />
        ))}
      </div>
    </section>
  );
}
