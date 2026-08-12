/**
 * Product-logo intake and monogram helpers (browser-facing, non-React).
 *
 * Uploaded images are aggressively downscaled and compressed client-side
 * because the whole workspace persists as ONE localStorage blob: an oversized
 * logo would block every later save (scenarios, UI state), not just its own.
 * Policy pieces (validation, encode ladder, monogram) are pure and unit
 * tested; only `processLogoFile` touches canvas/Image and stays untested
 * (Vitest runs in plain node — no DOM, no canvas).
 */

/** <input accept> — SVG is deliberately unsupported (see validateLogoFile). */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
export const ACCEPTED_LOGO_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];
export const MAX_LOGO_INPUT_BYTES = 8 * 1024 * 1024;
/** Logos render at ≤48px; 256 leaves headroom for retina without bloat. */
export const LOGO_TARGET_SIZE = 256;
/** ~128 KB of UTF-16 in the blob (2 bytes/char) ≈ 2.5% of a 5 MB quota. */
export const MAX_LOGO_DATA_URL_CHARS = 64 * 1024;

export type LogoErrorCode =
  | "unsupported-type"
  | "file-too-large"
  | "decode-failed"
  | "encode-budget-exceeded"
  | "save-failed";

export type LogoProcessResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: LogoErrorCode };

const ERROR_MESSAGES: Record<LogoErrorCode, string> = {
  "unsupported-type": "Use a PNG, JPEG or WebP image. SVG isn't supported — export it as PNG first.",
  "file-too-large": "That file is larger than 8 MB. Choose a smaller image.",
  "decode-failed": "That file couldn't be read as an image. Try a different file.",
  "encode-budget-exceeded": "This image couldn't be compressed enough. Try a simpler or smaller logo.",
  "save-failed":
    "The logo couldn't be saved — browser storage is full. Delete unused scenarios or products and try again.",
};

export function logoErrorMessage(code: LogoErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** Pure pre-decode validation (type + input size). Null = acceptable. */
export function validateLogoFile(file: { type: string; size: number }): LogoErrorCode | null {
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) return "unsupported-type";
  if (file.size > MAX_LOGO_INPUT_BYTES) return "file-too-large";
  return null;
}

/** Quality-then-size ladder walked until the encoder output fits the budget. */
export const ENCODE_QUALITIES: readonly number[] = [0.9, 0.8, 0.65, 0.5, 0.35];
export const ENCODE_SIZES: readonly number[] = [256, 192, 128];

/**
 * Walk sizes × qualities (all qualities at each size, largest size first) and
 * return the first data URL within budget, or null when nothing fits. Empty
 * encoder output means "this attempt failed" (e.g. no WebP support) and never
 * counts as a fit. The encoder is injected so the ladder itself is testable
 * without canvas.
 */
export function encodeWithinBudget(
  encode: (size: number, quality: number) => string,
  maxChars: number = MAX_LOGO_DATA_URL_CHARS,
): string | null {
  for (const size of ENCODE_SIZES) {
    for (const quality of ENCODE_QUALITIES) {
      const dataUrl = encode(size, quality);
      if (dataUrl !== "" && dataUrl.length <= maxChars) return dataUrl;
    }
  }
  return null;
}

/** "Example Supplement 60 Count" → "ES"; single word → one letter; "" → "?". */
export function monogramInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  const letters = tokens.slice(0, 2).map((token) => token[0]);
  return letters.join("").toLocaleUpperCase("en-US");
}

/** Deterministic FNV-1a hash of the name → chart-token index [0, paletteSize). */
export function monogramColorIndex(name: string, paletteSize = 5): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % paletteSize;
}

/**
 * Browser glue: decode → contain-fit into a transparent square canvas (never
 * upscaling) → encode via the ladder, WebP first with a verified prefix
 * (Safari silently falls back to PNG), then PNG.
 */
export async function processLogoFile(file: File): Promise<LogoProcessResult> {
  const invalid = validateLogoFile(file);
  if (invalid) return { ok: false, error: invalid };

  let image: HTMLImageElement;
  try {
    image = await decodeImage(file);
  } catch {
    return { ok: false, error: "decode-failed" };
  }

  const encodeAt = (size: number, type: string, quality: number): string => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return "";
    // Contain: preserve aspect ratio, center, transparent padding, no upscale.
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.imageSmoothingQuality = "high";
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL(type, quality);
  };

  const webp = encodeWithinBudget((size, quality) => {
    const dataUrl = encodeAt(size, "image/webp", quality);
    // A browser without a WebP encoder returns PNG here; reject the sample so
    // the ladder result is honest and let the PNG pass handle it.
    return dataUrl.startsWith("data:image/webp") ? dataUrl : "";
  });
  if (webp) return { ok: true, dataUrl: webp };

  const png = encodeWithinBudget((size, quality) => encodeAt(size, "image/png", quality));
  if (png && png.startsWith("data:image/png")) return { ok: true, dataUrl: png };

  return { ok: false, error: "encode-budget-exceeded" };
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        reject(new Error("empty image"));
        return;
      }
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    image.src = url;
  });
}
