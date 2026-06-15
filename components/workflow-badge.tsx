import type { WorkflowStatus } from "@/lib/workflow/types";

const statusClasses: Record<WorkflowStatus, string> = {
  open: "border-stone-300 bg-white text-stone-800",
  in_progress: "border-blue-200 bg-blue-50 text-blue-900",
  waiting: "border-amber-200 bg-amber-50 text-amber-900",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-900",
  dismissed: "border-stone-300 bg-stone-100 text-stone-700"
};

const labels: Record<WorkflowStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting",
  completed: "Completed",
  dismissed: "Dismissed"
};

export function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${statusClasses[status]}`}>
      Workflow: {labels[status]}
    </span>
  );
}
