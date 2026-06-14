import { AlertCircle, CheckCircle2, ClipboardList, GitPullRequestDraft, MessageSquare } from "lucide-react";

type Metrics = {
  messagesProcessed: number;
  activeDecisions: number;
  delegatedActions: number;
  activeFlags: number;
  inactiveMessages: number;
};

const items = [
  { key: "messagesProcessed", label: "Messages processed", icon: MessageSquare },
  { key: "activeDecisions", label: "Active CEO decisions", icon: ClipboardList },
  { key: "delegatedActions", label: "Delegated actions", icon: GitPullRequestDraft },
  { key: "activeFlags", label: "Active flags", icon: AlertCircle },
  { key: "inactiveMessages", label: "Superseded or resolved", icon: CheckCircle2 }
] as const;

export function SummaryMetrics({ metrics }: { metrics: Metrics }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className="panel rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase text-stone-500">{item.label}</p>
              <Icon className="h-4 w-4 text-mint" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-ink">{metrics[item.key]}</p>
          </div>
        );
      })}
    </section>
  );
}
