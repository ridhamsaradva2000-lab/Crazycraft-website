import { cn } from "@/lib/utils";

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "bg-brand-100 text-brand-800",
  contacted: "bg-accent/15 text-accent-dark",
  quoted: "bg-trust/15 text-trust",
  nurturing: "bg-accent/15 text-accent-dark",
  won: "bg-trust/20 text-trust",
  lost: "bg-clay/15 text-clay",
};

const SAMPLE_STATUS_COLORS: Record<string, string> = {
  requested: "bg-brand-100 text-brand-800",
  approved: "bg-accent/15 text-accent-dark",
  payment_pending: "bg-accent/15 text-accent-dark",
  paid: "bg-trust/15 text-trust",
  processing: "bg-accent/15 text-accent-dark",
  shipped: "bg-trust/15 text-trust",
  delivered: "bg-trust/20 text-trust",
  cancelled: "bg-clay/15 text-clay",
};

export function StatusBadge({
  status,
  variant,
  label,
}: {
  status: string;
  variant: "lead" | "sample";
  label: string;
}) {
  const colorMap = variant === "lead" ? LEAD_STATUS_COLORS : SAMPLE_STATUS_COLORS;
  const colorClass = colorMap[status] ?? "bg-paper-muted text-ink-muted";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-xs font-medium",
        colorClass
      )}
    >
      {label}
    </span>
  );
}
