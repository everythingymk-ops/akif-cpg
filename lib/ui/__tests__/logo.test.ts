import { describe, expect, it } from "vitest";
import {
  ENCODE_QUALITIES,
  ENCODE_SIZES,
  MAX_LOGO_INPUT_BYTES,
  encodeWithinBudget,
  logoErrorMessage,
  monogramColorIndex,
  monogramInitials,
  validateLogoFile,
  type LogoErrorCode,
} from "../logo";

describe("validateLogoFile", () => {
  it("accepts png/jpeg/webp under the input cap", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateLogoFile({ type, size: 1024 })).toBeNull();
    }
  });

  it("rejects SVG and unknown/empty types", () => {
    expect(validateLogoFile({ type: "image/svg+xml", size: 10 })).toBe("unsupported-type");
    expect(validateLogoFile({ type: "text/plain", size: 10 })).toBe("unsupported-type");
    expect(validateLogoFile({ type: "", size: 10 })).toBe("unsupported-type");
  });

  it("rejects oversized inputs", () => {
    expect(validateLogoFile({ type: "image/png", size: MAX_LOGO_INPUT_BYTES + 1 })).toBe(
      "file-too-large",
    );
    expect(validateLogoFile({ type: "image/png", size: MAX_LOGO_INPUT_BYTES })).toBeNull();
  });
});

describe("encodeWithinBudget", () => {
  it("returns the first attempt that fits", () => {
    const result = encodeWithinBudget(() => "data:ok", 100);
    expect(result).toBe("data:ok");
  });

  it("walks qualities at the largest size before shrinking", () => {
    const attempts: Array<[number, number]> = [];
    encodeWithinBudget((size, quality) => {
      attempts.push([size, quality]);
      return "x".repeat(1000);
    }, 10);
    expect(attempts).toHaveLength(ENCODE_SIZES.length * ENCODE_QUALITIES.length);
    expect(attempts[0]).toEqual([ENCODE_SIZES[0], ENCODE_QUALITIES[0]]);
    expect(attempts[1]).toEqual([ENCODE_SIZES[0], ENCODE_QUALITIES[1]]);
    expect(attempts[ENCODE_QUALITIES.length]).toEqual([ENCODE_SIZES[1], ENCODE_QUALITIES[0]]);
  });

  it("returns the first fitting rung mid-ladder", () => {
    const fits = `${ENCODE_SIZES[1]}@${ENCODE_QUALITIES[2]}`;
    const result = encodeWithinBudget(
      (size, quality) => (`${size}@${quality}` === fits ? "small" : "x".repeat(999)),
      10,
    );
    expect(result).toBe("small");
  });

  it("returns null when nothing fits", () => {
    expect(encodeWithinBudget(() => "x".repeat(1000), 10)).toBeNull();
  });

  it("never accepts an empty encoder result (failed WebP pass)", () => {
    expect(encodeWithinBudget(() => "", 100)).toBeNull();
  });
});

describe("monogramInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(monogramInitials("Example Supplement 60 Count")).toBe("ES");
    expect(monogramInitials("kombucha")).toBe("K");
    expect(monogramInitials("  spaced   name  ")).toBe("SN");
  });

  it("handles empty and Turkish names", () => {
    expect(monogramInitials("")).toBe("?");
    expect(monogramInitials("   ")).toBe("?");
    expect(monogramInitials("ürün adı")).toBe("ÜA");
  });
});

describe("monogramColorIndex", () => {
  it("is deterministic and within the palette", () => {
    const index = monogramColorIndex("Example Supplement 60 Count");
    expect(index).toBe(monogramColorIndex("Example Supplement 60 Count"));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(5);
    // Pinned so an accidental hash change shows up as a diff, not a surprise.
    expect(index).toBe(2);
  });

  it("respects a custom palette size", () => {
    for (const name of ["a", "b", "c", "long product name"]) {
      const index = monogramColorIndex(name, 3);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(3);
    }
  });
});

describe("logoErrorMessage", () => {
  it("has copy for every error code", () => {
    const codes: LogoErrorCode[] = [
      "unsupported-type",
      "file-too-large",
      "decode-failed",
      "encode-budget-exceeded",
      "save-failed",
    ];
    for (const code of codes) {
      expect(logoErrorMessage(code)).toBeTruthy();
    }
  });
});
