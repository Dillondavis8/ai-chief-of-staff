import { Loader2 } from "lucide-react";

const stages = [
  "Validating messages",
  "Correlating threads",
  "Resolving current state",
  "Drafting executive briefing"
];

export function AnalysisProgress({ elapsedSeconds }: { elapsedSeconds: number }) {
  const activeIndex = Math.min(stages.length - 1, Math.floor(elapsedSeconds / 4));

  return (
    <section className="panel rounded-lg p-5" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-mint" aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-ink">Analysis running</h2>
          <p className="text-sm text-stone-600">{elapsedSeconds}s elapsed</p>
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-4">
        {stages.map((stage, index) => (
          <li
            key={stage}
            className={`rounded-md border px-3 py-2 text-sm ${
              index <= activeIndex ? "border-mint/30 bg-emerald-50 text-emerald-900" : "border-line bg-white text-stone-500"
            }`}
          >
            {stage}
          </li>
        ))}
      </ol>
    </section>
  );
}
