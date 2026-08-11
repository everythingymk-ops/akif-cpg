import { describe, expect, it } from "vitest";
import { dec, decNonNegative, decPositive, fmt, roundMoney, roundRate } from "../money";
import { PricingEngineError } from "../types";

describe("dec", () => {
  it("keeps decimal fractions exact (0.1 + 0.2 = 0.3)", () => {
    expect(dec(0.1).plus(dec(0.2)).equals("0.3")).toBe(true);
  });

  it("converts number percentages exactly (0.15 stays 0.15)", () => {
    expect(dec(0.15).toString()).toBe("0.15");
  });

  it("accepts strings and Decimal instances", () => {
    expect(dec("3.65").equals(dec(dec("3.65")))).toBe(true);
  });

  it("rejects non-finite and invalid values", () => {
    expect(() => dec(NaN)).toThrow(PricingEngineError);
    expect(() => dec(Infinity)).toThrow(PricingEngineError);
    expect(() => dec("not-a-number")).toThrow(PricingEngineError);
  });

  it("labels the offending value in the error message", () => {
    expect(() => dec(NaN, "tariff rate")).toThrow(/tariff rate/);
  });
});

describe("decNonNegative / decPositive", () => {
  it("decNonNegative allows zero and rejects negatives", () => {
    expect(decNonNegative(0, "freight").isZero()).toBe(true);
    expect(() => decNonNegative(-0.01, "freight")).toThrow(PricingEngineError);
  });

  it("decPositive rejects zero and negatives", () => {
    expect(decPositive("0.01", "cogs").equals("0.01")).toBe(true);
    expect(() => decPositive(0, "cogs")).toThrow(PricingEngineError);
    expect(() => decPositive(-1, "cogs")).toThrow(PricingEngineError);
  });
});

describe("rounding", () => {
  it("roundMoney rounds half-up to cents", () => {
    expect(roundMoney("5.954").toString()).toBe("5.95");
    expect(roundMoney("5.955").toString()).toBe("5.96");
    expect(roundMoney("2.005").toString()).toBe("2.01");
  });

  it("roundRate defaults to 4 decimal places", () => {
    expect(roundRate("0.094827").toString()).toBe("0.0948");
  });

  it("fmt produces a short display string", () => {
    expect(fmt("10.470588235294")).toBe("10.4706");
    expect(fmt("0.5")).toBe("0.5");
  });
});
