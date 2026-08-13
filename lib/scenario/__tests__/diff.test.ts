import { describe, expect, it } from "vitest";
import { diffById, diffChangedById } from "../diff";

const a = { id: "a", name: "Target" };
const b = { id: "b", name: "Costco" };
const c = { id: "c", name: "Kroger" };

describe("diffById", () => {
  it("treats everything in the draft as an upsert", () => {
    expect(diffById([a], [a, b])).toEqual({ upserts: [a, b], deletedIds: [] });
  });

  it("reports a row the user removed from what they were shown", () => {
    expect(diffById([a, b], [a])).toEqual({ upserts: [a], deletedIds: ["b"] });
  });

  /**
   * The reason the snapshot exists. If deletions were inferred from the live
   * collection, a record added by someone else after this dialog opened would
   * be missing from the draft and get deleted by a user who never saw it.
   */
  it("never deletes a record that was not in the snapshot", () => {
    const draftWithoutC = [a, b];
    expect(diffById([a, b], draftWithoutC).deletedIds).toEqual([]);
    expect(diffById([a, b, c], draftWithoutC).deletedIds).toEqual(["c"]);
  });

  it("handles an emptied list and a first-time list", () => {
    expect(diffById([a, b], [])).toEqual({ upserts: [], deletedIds: ["a", "b"] });
    expect(diffById([], [a])).toEqual({ upserts: [a], deletedIds: [] });
  });

  it("does not mutate its inputs", () => {
    const snapshot = [a, b];
    const draft = [a];
    diffById(snapshot, draft);
    expect(snapshot).toHaveLength(2);
    expect(draft).toHaveLength(1);
  });
});

describe("diffChangedById", () => {
  it("skips rows that are untouched", () => {
    expect(diffChangedById([a, b], [a, b])).toEqual({ upserts: [], deletedIds: [] });
  });

  it("upserts only the row that actually changed", () => {
    const renamed = { ...a, name: "Target US" };
    expect(diffChangedById([a, b], [renamed, b])).toEqual({
      upserts: [renamed],
      deletedIds: [],
    });
  });

  it("still upserts a brand-new row", () => {
    expect(diffChangedById([a], [a, b])).toEqual({ upserts: [b], deletedIds: [] });
  });

  it("reports changes and deletions together", () => {
    const renamed = { ...a, name: "Target US" };
    expect(diffChangedById([a, b], [renamed])).toEqual({
      upserts: [renamed],
      deletedIds: ["b"],
    });
  });

  it("notices a nested change, not just a top-level rename", () => {
    const nestedBefore = { id: "x", terms: { paymentDays: 60 } };
    const nestedAfter = { id: "x", terms: { paymentDays: 90 } };
    expect(diffChangedById([nestedBefore], [nestedAfter]).upserts).toEqual([nestedAfter]);
  });
});
