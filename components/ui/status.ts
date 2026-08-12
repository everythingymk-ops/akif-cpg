/**
 * Shared status color recipes (PRD §59 tone language). Class-string maps only —
 * every screen colors "healthy / review / problem"-style states from here so
 * a tone is defined exactly once. Tokens live in app/globals.css.
 */

export type StatusTone = "positive" | "warning" | "negative" | "neutral";

/** Tone as text color (numbers, verdict phrases). Neutral inherits. */
export const statusText: Record<StatusTone, string> = {
  positive: "text-positive",
  warning: "text-warning",
  negative: "text-negative",
  neutral: "",
};

/** Tone as a small legend/status dot. */
export const statusDot: Record<StatusTone, string> = {
  positive: "bg-positive",
  warning: "bg-warning",
  negative: "bg-negative",
  neutral: "bg-muted-foreground/40",
};

/** Tone as a soft badge (border + soft fill + readable text). */
export const statusBadge: Record<StatusTone, string> = {
  positive: "border-positive-border bg-positive-soft text-positive",
  warning: "border-warning-border bg-warning-soft text-warning",
  negative: "border-negative-border bg-negative-soft text-negative",
  neutral: "border-border bg-muted text-muted-foreground",
};

/** Tone as a soft container panel (validation boxes, callouts). */
export const statusBox: Record<StatusTone, string> = {
  positive: "border-positive-border bg-positive-soft",
  warning: "border-warning-border bg-warning-soft",
  negative: "border-negative-border bg-negative-soft",
  neutral: "border-border bg-muted/50",
};

/** Advisor priorities (PRD §40) → tone. */
export const advisorTone: Record<"critical" | "warning" | "opportunity", StatusTone> = {
  critical: "negative",
  warning: "warning",
  opportunity: "positive",
};

/** Portfolio row status (PRD §44) → tone. */
export const portfolioTone: Record<"green" | "yellow" | "red" | "unknown", StatusTone> = {
  green: "positive",
  yellow: "warning",
  red: "negative",
  unknown: "neutral",
};
