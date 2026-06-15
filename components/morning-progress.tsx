import type { getMorningProgress } from "@/lib/workflow/selectors";

type MorningProgressValue = ReturnType<typeof getMorningProgress>;

export function MorningProgressCard({ progress }: { progress: MorningProgressValue }) {
  return (
    <section className="panel rounded-lg p-5">
      <p className="text-xs font-semibold uppercase text-stone-500">Morning review</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink">
        {progress.handled} of {progress.total} active items handled
      </h2>
      <p className="mt-1 text-sm text-stone-600">{progress.remaining} remaining</p>
      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-label="Morning review progress"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.handled}
      >
        <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${progress.percent}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-paper p-2">
          <dt className="font-semibold text-stone-600">Open</dt>
          <dd className="text-lg font-semibold text-ink">{progress.open}</dd>
        </div>
        <div className="rounded-md bg-paper p-2">
          <dt className="font-semibold text-stone-600">In progress</dt>
          <dd className="text-lg font-semibold text-ink">{progress.inProgress}</dd>
        </div>
        <div className="rounded-md bg-paper p-2">
          <dt className="font-semibold text-stone-600">Waiting</dt>
          <dd className="text-lg font-semibold text-ink">{progress.waiting}</dd>
        </div>
        <div className="rounded-md bg-paper p-2">
          <dt className="font-semibold text-stone-600">Handled</dt>
          <dd className="text-lg font-semibold text-ink">{progress.handled}</dd>
        </div>
      </dl>
    </section>
  );
}
