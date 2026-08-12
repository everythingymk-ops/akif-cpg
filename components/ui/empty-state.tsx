import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Quiet centered empty state: icon + one-line title + optional hint and CTA.
 * Replaces bare one-line paragraphs so "nothing here" always looks deliberate.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 py-8 text-center", className)}>
      {Icon && <Icon className="size-5 text-muted-foreground/60" aria-hidden />}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}
