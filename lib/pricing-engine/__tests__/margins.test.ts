import { describe, expect, it } from "vitest";
import {
  applyMarginSpec,
  marginRateOf,
  marginToMarkup,
  markupRateOf,
  markupToMargin,
  priceFromMargin,
  priceFromMarkup,
} from "../margins";
import { PricingEngineError } from "../types";

describe("priceFromMargin / priceFromMarkup", () => {
  it("margin: price = cost ÷ (1 − m)", () => {
    expect(priceFromMargin(8, 0.2).equals("10")).toBe(true);
    expect(priceFromMargin("3.65", "0.2").equals("4.5625")).toBe(true);
  });

  it("markup: price = cost × (1 + k)", () => {
    expect(priceFromMarkup(8, 0.2).equals("9.6")).toBe(true);
    expect(priceFromMarkup("3.65", "0.2").equals("4.38")).toBe(true);
  });

  it("the same 20% rate produces different prices on different bases", () => {
    expect(priceFromMargin(8, 0.2).equals(priceFromMarkup(8, 0.2))).toBe(false);
  });

  it("rejects margin ≥ 100%", () => {
    expect(() => priceFromMargin(8, 1)).toThrow(PricingEngineError);
    expect(() => priceFromMargin(8, 1.2)).toThrow(PricingEngineError);
  });

  it("rejects markup ≤ −100%", () => {
    expect(() => priceFromMarkup(8, -1)).toThrow(PricingEngineError);
  });

  it("allows a negative margin (selling below cost)", () => {
    expect(priceFromMargin(10, -0.25).equals("8")).toBe(true);
  });
});

describe("applyMarginSpec", () => {
  it("dispatches strictly on the explicit basis", () => {
    expect(applyMarginSpec(8, { basis: "margin", rate: 0.2 }).equals("10")).toBe(true);
    expect(applyMarginSpec(8, { basis: "markup", rate: 0.2 }).equals("9.6")).toBe(true);
  });
});

describe("realized rates", () => {
  it("marginRateOf: (price − cost) ÷ price", () => {
    expect(marginRateOf(8, 10).equals("0.2")).toBe(true);
  });

  it("markupRateOf: (price − cost) ÷ cost", () => {
    expect(markupRateOf(8, "9.6").equals("0.2")).toBe(true);
  });

  it("guards zero denominators", () => {
    expect(() => marginRateOf(8, 0)).toThrow(PricingEngineError);
    expect(() => markupRateOf(0, 10)).toThrow(PricingEngineError);
  });
});

describe("margin ↔ markup conversion", () => {
  it("20% margin equals 25% markup", () => {
    expect(marginToMarkup("0.2").equals("0.25")).toBe(true);
    expect(markupToMargin("0.25").equals("0.2")).toBe(true);
  });

  it("round-trips exactly for terminating decimals", () => {
    expect(markupToMargin(marginToMarkup("0.5")).equals("0.5")).toBe(true);
  });
});
