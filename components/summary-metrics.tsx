import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, GitPullRequestDraft, Newspaper } from "lucide-react";

type Metrics = {
  messagesProcessed: number;
  activeDecisions: number;
  delegatedActions: number;
  activeFlags: number;
  ignoredMessages: number;
};

const items: Array<{
  key: "briefing" | keyof Omit<Metrics, "messagesProcessed">;
  label: string;
  icon: typeof Newspaper;
  target: string;
  aria: string;
  value: (metrics: Metrics) => string | number;
  detail: (metrics: Metrics) => string;
}> = [
  {
    key: "briefing",
    label: "Briefing",
    icon: Newspaper,
    target: "?view=briefing",
    aria: "Open Daily Briefing",
    value: () => "<2 min",
    detail: (metrics) => `${metrics.messagesProcessed} messages processed`
  },
  {
    key: "activeDecisions",
    label: "Decide",
    icon: ClipboardList,
    target: "?view=actions&type=decide&status=active",
    aria: "Open Action Center filtered to CEO decisions",
    value: (metrics) => metrics.activeDecisions,
    detail: () => "CEO decisions"
  },
  {
    key: "delegatedActions",
    label: "Delegate",
    icon: GitPullRequestDraft,
    target: "?view=actions&type=delegate&status=active",
    aria: "Open Action Center filtered to delegations",
    value: (metrics) => metrics.delegatedActions,
    detail: () => "Owner handoffs"
  },
  {
    key: "activeFlags",
    label: "Flags",
    icon: AlertCircle,
    target: "?view=actions&type=flag&status=active&flagged=true",
    aria: "Open Action Center filtered to flags",
    value: (metrics) => metrics.activeFlags,
    detail: () => "Key risks"
  },
  {
    key: "ignoredMessages",
    label: "Ignore",
    icon: CheckCircle2,
    target: "?view=audit&category=ignore",
    aria: "Open Audit Trail filtered to ignored messages",
    value: (metrics) => metrics.ignoredMessages,
    detail: () => "No action needed"
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
            <p className="mt-3 text-3xl font-semibold text-ink">{item.value(metrics)}</p>
            <p className="mt-1 text-xs font-medium text-stone-500">{item.detail(metrics)}</p>
          </button>
        );
      })}
    </section>
  );
}
