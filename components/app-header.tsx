import { ShieldCheck } from "lucide-react";

export function AppHeader() {
  return (
    <header className="border-b border-line bg-white/86">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-normal text-ink">AI Chief of Staff</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/25 bg-orange-50 px-3 py-1 text-xs font-bold uppercase text-signal">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Demo mode
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Turn a noisy morning inbox into an executive decision brief.
          </p>
        </div>
        <div className="max-w-xl rounded-md border border-line bg-paper px-4 py-3 text-sm font-medium text-ink">
          Recommendations and drafts only. Nothing is sent or assigned automatically.
        </div>
      </div>
    </header>
  );
}
