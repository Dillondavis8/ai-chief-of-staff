import { AlertTriangle } from "lucide-react";
import type { ExecutiveFlag } from "@/lib/ai/schemas";
import { SourceBadges } from "./source-badges";

const severityClasses: Record<ExecutiveFlag["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  high: "border-orange-200 bg-orange-50 text-orange-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-stone-200 bg-stone-50 text-stone-700"
};

export function FlagsPanel({ flags }: { flags: ExecutiveFlag[] }) {
  return (
    <section className="panel rounded-lg p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-signal" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">Executive flags</h2>
      </div>
      {flags.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">No active flags.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {flags.map((flag) => (
            <article key={flag.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold capitalize ${severityClasses[flag.severity]}`}>
                  {flag.severity}
                </span>
                <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-semibold capitalize text-stone-700">
                  {flag.category}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-ink">{flag.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">{flag.description}</p>
              {flag.recommendedAction ? (
                <p className="mt-2 text-sm font-medium text-ink">Recommended: {flag.recommendedAction}</p>
              ) : null}
              <div className="mt-3">
                <SourceBadges ids={flag.sourceMessageIds} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
