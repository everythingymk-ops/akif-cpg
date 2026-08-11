import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

describe("scaffold smoke test", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("performs exact decimal arithmetic via Decimal.js", () => {
    // 0.1 + 0.2 !== 0.3 with raw JS floats; Decimal.js must be exact.
    expect(new Decimal("0.1").plus("0.2").equals("0.3")).toBe(true);
  });
});
