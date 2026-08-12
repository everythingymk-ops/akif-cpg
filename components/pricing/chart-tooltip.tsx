"use client";

/**
 * Recharts tooltip content on the app's popover tokens — replaces the default
 * unstyled white box so charts match every other floating surface.
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    name?: string;
    value?: number | string;
    color?: string;
    dataKey?: string;
  }>;
  label?: string;
  formatter?: (value: number | string, dataKey?: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
      {label !== undefined && <div className="mb-1 font-medium">{label}</div>}
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto pl-3 font-mono tabular-nums">
              {entry.value === undefined || entry.value === null
                ? "—"
                : formatter
                  ? formatter(entry.value, String(entry.dataKey ?? ""))
                  : String(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
