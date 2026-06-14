import { AlertTriangle } from "lucide-react";

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-900">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm">{message}</p>
        </div>
      </div>
    </section>
  );
}
