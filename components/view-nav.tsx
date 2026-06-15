import { ClipboardList, FileText, Newspaper } from "lucide-react";

type ViewName = "briefing" | "actions" | "audit";

const navItems: Array<{ view: ViewName; label: string; icon: typeof Newspaper }> = [
  { view: "briefing", label: "Briefing", icon: Newspaper },
  { view: "actions", label: "Action Center", icon: ClipboardList },
  { view: "audit", label: "Audit Trail", icon: FileText }
];

export const VIEW_NAV_ID = "primary-view-nav";

export function ViewNav({
  currentView,
  actionCount,
  auditCount,
  onNavigate
}: {
  currentView: ViewName;
  actionCount: number;
  auditCount: number;
  onNavigate: (view: ViewName) => void;
}) {
  return (
    <nav id={VIEW_NAV_ID} className="scroll-mt-4 rounded-lg border border-line bg-white p-1" aria-label="Primary views">
      <div className="flex gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          const count = item.view === "actions" ? actionCount : item.view === "audit" ? auditCount : null;

          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition ${
                isActive ? "bg-ink text-white" : "text-stone-700 hover:bg-paper hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {count !== null ? (
                <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-white/20 text-white" : "bg-paper text-stone-700"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
