import type { NormalizedChannel } from "@/lib/messages/schemas";

const labels: Record<NormalizedChannel, string> = {
  email: "Email",
  slack: "Slack",
  whatsapp: "WhatsApp",
  other: "Other"
};

const classes: Record<NormalizedChannel, string> = {
  email: "border-blue-200 bg-blue-50 text-blue-800",
  slack: "border-violet-200 bg-violet-50 text-violet-800",
  whatsapp: "border-emerald-200 bg-emerald-50 text-emerald-800",
  other: "border-stone-200 bg-stone-50 text-stone-700"
};

export function ChannelBadge({ channel }: { channel: NormalizedChannel }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${classes[channel]}`}>
      {labels[channel]}
    </span>
  );
}
