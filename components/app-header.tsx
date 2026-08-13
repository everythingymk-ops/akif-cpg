import { SignOutButton } from "@/components/auth/auth-gate";
import { Separator } from "@/components/ui/separator";

/**
 * Shared page-header shell (pricing + portfolio): wordmark, page subtitle and
 * a hairline divider; each page renders its own controls as children inside
 * the same wrapping flex row so layout behavior is identical everywhere.
 */
export function AppHeader({
  subtitle,
  children,
}: {
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold tracking-tight">Akif CPG</span>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center max-xl:hidden" />
      {children}
      <div className="ml-auto">
        <SignOutButton />
      </div>
    </header>
  );
}
