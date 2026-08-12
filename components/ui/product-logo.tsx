"use client";

import { useRef, useState } from "react";
import {
  LOGO_ACCEPT,
  logoErrorMessage,
  monogramColorIndex,
  monogramInitials,
  processLogoFile,
  type LogoErrorCode,
} from "@/lib/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "size-5 text-[9px]",
  md: "size-8 text-xs",
  lg: "size-12 text-base",
} as const;

/**
 * Product identity mark: the uploaded logo when present, otherwise a
 * deterministic monogram chip tinted from the chart-token palette. Decorative
 * (aria-hidden) — the product name is adjacent text on every surface.
 */
export function ProductLogo({
  name,
  logoDataUrl,
  size = "sm",
  className,
}: {
  name: string;
  logoDataUrl?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  if (logoDataUrl) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-card ring-1 ring-foreground/10",
          SIZE_CLASSES[size],
          className,
        )}
      >
        {/* Data-URL <img>: next/image adds nothing here (static export, unoptimized). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUrl} alt="" aria-hidden className="size-full object-contain" />
      </span>
    );
  }
  const tokenIndex = monogramColorIndex(name) + 1;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-md font-semibold ring-1 ring-foreground/10",
        SIZE_CLASSES[size],
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, var(--chart-${tokenIndex}) 18%, transparent)`,
        color: `var(--chart-${tokenIndex})`,
      }}
    >
      {monogramInitials(name)}
    </span>
  );
}

/**
 * Upload / change / remove control with preview and inline errors. `onChange`
 * may reject (e.g. storage quota) — the picker surfaces it as `save-failed`
 * and the caller is expected to have rolled its state back.
 */
export function LogoPicker({
  name,
  logoDataUrl,
  onChange,
  disabled,
}: {
  name: string;
  logoDataUrl?: string;
  onChange: (dataUrl: string | undefined) => void | Promise<void>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generationRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LogoErrorCode | null>(null);

  const handleFile = async (file: File) => {
    const generation = ++generationRef.current;
    setBusy(true);
    setError(null);
    const result = await processLogoFile(file);
    if (generation !== generationRef.current) return; // stale pick — dropped
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    try {
      await onChange(result.dataUrl);
      if (generation === generationRef.current) setBusy(false);
    } catch {
      if (generation === generationRef.current) {
        setBusy(false);
        setError("save-failed");
      }
    }
  };

  const handleRemove = async () => {
    generationRef.current++;
    setError(null);
    try {
      await onChange(undefined);
    } catch {
      setError("save-failed");
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <ProductLogo name={name} logoDataUrl={logoDataUrl} size="lg" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {logoDataUrl ? "Change logo" : "Upload logo"}
          </Button>
          {logoDataUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={disabled || busy}
              onClick={handleRemove}
            >
              Remove
            </Button>
          )}
          {busy && <span className="text-xs text-muted-foreground">Processing image…</span>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          aria-label="Product logo file"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so re-picking the same file re-fires change.
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>
      {error && <p className="text-xs text-negative">{logoErrorMessage(error)}</p>}
    </div>
  );
}
