import type { LifecycleStatus, MessageCategory, Priority } from "@/lib/ai/schemas";

const categoryClasses: Record<MessageCategory, string> = {
  ignore: "border-stone-200 bg-stone-50 text-stone-700",
  delegate: "border-mint/25 bg-emerald-50 text-emerald-800",
  decide: "border-signal/25 bg-orange-50 text-orange-900"
};

const lifecycleClasses: Record<LifecycleStatus, string> = {
  active: "border-mint/25 bg-emerald-50 text-emerald-800",
  superseded: "border-stone-200 bg-stone-50 text-stone-700",
  resolved: "border-blue-200 bg-blue-50 text-blue-800",
  informational: "border-slate-200 bg-slate-50 text-slate-700"
};

const priorityClasses: Record<Priority, string> = {
  urgent: "border-red-200 bg-red-50 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-stone-200 bg-stone-50 text-stone-700"
};

export function CategoryBadge({ value }: { value: MessageCategory }) {
  return <Badge className={categoryClasses[value]}>{value}</Badge>;
}

export function LifecycleBadge({ value }: { value: LifecycleStatus }) {
  return <Badge className={lifecycleClasses[value]}>{value}</Badge>;
}

export function PriorityBadge({ value }: { value: Priority }) {
  return <Badge className={priorityClasses[value]}>{value}</Badge>;
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${className}`}>
      {children}
    </span>
  );
}
