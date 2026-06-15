"use client";

import { ClipboardCopy } from "lucide-react";
import type { BriefingItem, DailyBriefing as DailyBriefingType } from "@/lib/ai/schemas";
import { briefingDisplayText, splitBriefingBody } from "@/lib/ai/briefing-display";
import { PriorityBadge } from "./status-badge";
import { SourceBadges } from "./source-badges";

type DailyBriefingProps = {
  briefing: DailyBriefingType;
};

const sections: Array<{
  key: keyof Pick<DailyBriefingType, "urgent" | "decisions" | "flags" | "handled" | "personal">;
  label: string;
}> = [
  { key: "urgent", label: "Urgent" },
  { key: "decisions", label: "Decisions needed" },
  { key: "flags", label: "Flags" },
  { key: "handled", label: "Handled" },
  { key: "personal", label: "Personal" }
];

function BriefingRow({ item }: { item: BriefingItem }) {
  const title = briefingDisplayText(item.title);
  const { body } = splitBriefingBody(item.body);

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge value={item.priority} />
        <h4 className="font-semibold text-ink">{title}</h4>
      </div>
      {body ? <p className="mt-2 text-sm leading-6 text-stone-700">{body}</p> : null}
      <div className="mt-3">
        <SourceBadges ids={item.sourceMessageIds} />
      </div>
    </li>
  );
}

export function DailyBriefing({ briefing }: DailyBriefingProps) {
  const title = briefingDisplayText(briefing.title);
  const overview = briefingDisplayText(briefing.overview);

  const copyText = [
    title,
    overview,
    ...sections.flatMap((section) => {
      const items = briefing[section.key];
      if (items.length === 0) {
        return [];
      }

      return [
        section.label,
        ...items.map((item) => {
          const { body } = splitBriefingBody(item.body);
          const mainText = body ? `${briefingDisplayText(item.title)}: ${body}` : briefingDisplayText(item.title);
          return `- ${mainText} (${item.sourceMessageIds.map((id) => `#${id}`).join(", ")})`;
        })
      ];
    })
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <section className="panel rounded-lg p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-stone-500">Daily briefing</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">{title}</h2>
          {overview ? <p className="mt-2 text-sm leading-6 text-stone-600">{overview}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(copyText)}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-stone-400"
          >
            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
            Copy
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {sections.map((section) => {
          const items = briefing[section.key];
          if (items.length === 0) {
            return null;
          }

          return (
            <div key={section.key}>
              <h3 className="mb-2 text-sm font-bold uppercase text-stone-500">{section.label}</h3>
              <ul className="space-y-2">
                {items.map((item) => (
                  <BriefingRow key={`${section.key}-${item.title}-${item.sourceMessageIds.join("-")}`} item={item} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
