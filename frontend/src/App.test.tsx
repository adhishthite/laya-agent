import { describe, expect, it } from "vitest";

describe("Frontend Sanity", () => {
  it("verifies environment is valid", () => {
    expect(1 + 1).toBe(2);
  });
});
