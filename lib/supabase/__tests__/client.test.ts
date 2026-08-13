import { describe, expect, it } from "vitest";
import { emailForUsername, usernameForEmail } from "../client";

describe("emailForUsername", () => {
  it("turns a username into its internal address", () => {
    expect(emailForUsername("Akif123")).toBe("akif123@akif-cpg.app");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(emailForUsername("  YAHYA123 ")).toBe("yahya123@akif-cpg.app");
  });

  /**
   * Somebody handed their credentials pastes the whole address as often as
   * not. Appending the domain to that made a login that could never succeed.
   */
  it("accepts a full address instead of doubling the domain", () => {
    expect(emailForUsername("akif123@akif-cpg.app")).toBe("akif123@akif-cpg.app");
    expect(emailForUsername(" Akif123@Akif-CPG.app ")).toBe("akif123@akif-cpg.app");
  });
});

describe("usernameForEmail", () => {
  it("shows the name back with a capital, for the header", () => {
    expect(usernameForEmail("akif123@akif-cpg.app")).toBe("Akif123");
  });

  it("is empty when there is no session yet", () => {
    expect(usernameForEmail(undefined)).toBe("");
  });
});
