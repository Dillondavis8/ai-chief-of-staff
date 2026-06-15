import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, GitPullRequestDraft, MessageSquare } from "lucide-react";

type Metrics = {
  messagesProcessed: number;
  activeDecisions: number;
  delegatedActions: number;
  activeFlags: number;
  inactiveMessages: number;
};

const items: Array<{
  key: keyof Metrics;
  label: string;
  icon: typeof MessageSquare;
  target: string;
  aria: string;
}> = [
  {
    key: "messagesProcessed",
    label: "Messages processed",
    icon: MessageSquare,
    target: "?view=audit",
    aria: "Open Audit Trail with all messages"
  },
  {
    key: "activeDecisions",
    label: "Active CEO decisions",
    icon: ClipboardList,
    target: "?view=actions&type=decide&status=active",
    aria: "Open Action Center filtered to active CEO decisions"
  },
  {
    key: "delegatedActions",
    label: "Delegated actions",
    icon: GitPullRequestDraft,
    target: "?view=actions&type=delegate&status=active",
    aria: "Open Action Center filtered to unresolved delegations"
  },
  {
    key: "activeFlags",
    label: "Active flags",
    icon: AlertCircle,
    target: "?view=actions&type=flag&status=active&flagged=true",
    aria: "Open Action Center filtered to active flagged actions"
  },
  {
    key: "inactiveMessages",
    label: "Superseded or resolved",
    icon: CheckCircle2,
    target: "?view=audit&lifecycle=superseded%2Cresolved",
    aria: "Open Audit Trail filtered to superseded or resolved messages"
  }
];

export function SummaryMetrics({
  metrics,
  onNavigate
}: {
  metrics: Metrics;
  onNavigate: (target: string) => void;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.target)}
            aria-label={item.aria}
            className="panel group cursor-pointer rounded-lg p-4 text-left transition hover:-translate-y-0.5 hover:border-mint/50 hover:shadow-lg active:translate-y-0"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase text-stone-500">{item.label}</p>
              <div className="flex items-center gap-2 text-mint">
                <Icon className="h-4 w-4" aria-hidden="true" />
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-semibold text-ink">{metrics[item.key]}</p>
          </button>
        );
      })}
    </section>
  );
}
