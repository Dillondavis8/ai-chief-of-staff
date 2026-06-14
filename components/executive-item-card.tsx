import { ArrowRight, CheckCircle2, HelpCircle } from "lucide-react";
import type { ExecutiveItem } from "@/lib/ai/schemas";
import { PriorityBadge } from "./status-badge";
import { SourceBadges } from "./source-badges";

export function ExecutiveItemCard({ item }: { item: ExecutiveItem }) {
  return (
    <article className="rounded-lg border border-line bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge value={item.priority} />
            <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-semibold capitalize text-stone-700">
              {item.kind}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-ink">{item.title}</h3>
        </div>
        <SourceBadges ids={item.sourceMessageIds} />
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-700">{item.summary}</p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {item.decisionQuestion ? (
          <div className="rounded-md bg-orange-50 p-3">
            <dt className="flex items-center gap-1.5 font-semibold text-orange-900">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              Decision
            </dt>
            <dd className="mt-1 text-orange-950">{item.decisionQuestion}</dd>
          </div>
        ) : null}
        {item.ownerRole ? (
          <div className="rounded-md bg-emerald-50 p-3">
            <dt className="font-semibold text-emerald-900">Owner</dt>
            <dd className="mt-1 text-emerald-950">{item.ownerRole}</dd>
          </div>
        ) : null}
        {item.deadlineText ? (
          <div className="rounded-md bg-paper p-3">
            <dt className="font-semibold text-stone-700">Deadline</dt>
            <dd className="mt-1 text-ink">{item.deadlineText}</dd>
          </div>
        ) : null}
        {item.recommendedNextStep ? (
          <div className="rounded-md bg-blue-50 p-3">
            <dt className="flex items-center gap-1.5 font-semibold text-blue-900">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              Next step
            </dt>
            <dd className="mt-1 text-blue-950">{item.recommendedNextStep}</dd>
          </div>
        ) : null}
      </dl>

      {item.options && item.options.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-ink">Options</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {item.options.map((option) => (
              <li key={option.label} className="rounded-md border border-line bg-white p-3 text-sm">
                <p className="font-semibold text-ink">{option.label}</p>
                <p className="mt-1 text-stone-600">{option.tradeoff}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.missingContext.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Missing context</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {item.missingContext.map((context) => (
              <li key={context}>{context}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.draftedResponse ? (
        <details className="mt-4 rounded-md border border-line bg-paper/70 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Draft</summary>
          <div className="mt-3 text-sm leading-6 text-stone-700">
            <p className="font-semibold capitalize">{item.draftedResponse.type.replaceAll("_", " ")}</p>
            {item.draftedResponse.to ? <p className="mt-1">To: {item.draftedResponse.to}</p> : null}
            {item.draftedResponse.subject ? <p>Subject: {item.draftedResponse.subject}</p> : null}
            <p className="mt-2 whitespace-pre-wrap">{item.draftedResponse.body}</p>
          </div>
        </details>
      ) : null}

      {item.section === "handled" ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Current state is handled or resolved
        </p>
      ) : null}
    </article>
  );
}
