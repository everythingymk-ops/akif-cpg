"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { parseProductTemplate, type TemplateParseResult } from "@/lib/import/parseTemplate";
import { TEMPLATE_FILENAME } from "@/lib/import/templateSchema";
import { downloadTemplate, readTemplateFile, TemplateFileError } from "@/lib/import/workbook";
import { Button } from "@/components/ui/button";

/**
 * Spreadsheet entry point for the wizard: download a template, fill it in
 * Excel, upload it back. The upload never creates anything on its own — it
 * hands the parsed product up so the wizard can prefill and let the user
 * review it, and blocking problems are shown right here instead.
 */
export function TemplateActions({
  onImport,
}: {
  /** Called only with a result that produced a product. */
  onImport: (result: TemplateParseResult) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockingIssues, setBlockingIssues] = useState<string[]>([]);

  const handleDownload = async () => {
    setBusy("download");
    setError(null);
    try {
      await downloadTemplate();
    } catch (caught) {
      console.error("Template download failed", caught);
      setError("The template could not be generated. Reload the page and try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (file: File) => {
    setBusy("upload");
    setError(null);
    setBlockingIssues([]);
    try {
      const result = parseProductTemplate(await readTemplateFile(file));
      if (result.product === null) {
        setBlockingIssues(
          result.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => `${issue.location} — ${issue.message}`),
        );
        return;
      }
      onImport(result);
    } catch (caught) {
      if (caught instanceof TemplateFileError) {
        setError(caught.message);
      } else {
        console.error("Template import failed", caught);
        setError("That file could not be read. Try downloading a fresh template.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
        <div className="min-w-[16rem] flex-1">
          <p className="text-sm font-medium">Prefer a spreadsheet?</p>
          <p className="text-xs text-muted-foreground">
            Fill the template in Excel and upload it — you still review everything before the
            product is created.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => void handleDownload()}
          >
            <Download aria-hidden />
            {busy === "download" ? "Preparing…" : "Download template"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden />
            {busy === "upload" ? "Reading…" : "Upload filled template"}
          </Button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        className="sr-only"
        aria-label="Filled product template file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first: picking the same file twice must fire again.
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />

      {error !== null && <p className="mt-2 text-xs text-negative">{error}</p>}

      {blockingIssues.length > 0 && (
        <div className="mt-2 rounded-md border border-negative-border bg-negative-soft p-2">
          <p className="text-xs font-medium text-negative">
            The file is missing something required, so nothing was imported:
          </p>
          <ul className="mt-1 space-y-0.5">
            {blockingIssues.map((issue) => (
              <li key={issue} className="text-xs text-foreground/90">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        The file is named {TEMPLATE_FILENAME} and is read in your browser — it is never uploaded
        anywhere.
      </p>
    </div>
  );
}
