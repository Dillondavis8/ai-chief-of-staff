import { Inbox } from "lucide-react";

export function EmptyState() {
  return (
    <section className="panel rounded-lg p-8 text-center">
      <Inbox className="mx-auto h-10 w-10 text-stone-400" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold text-ink">No analysis yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-stone-600">
        Load valid JSON and run analysis to produce the current-state brief, flags, drafts, and audit trail.
      </p>
    </section>
  );
}
