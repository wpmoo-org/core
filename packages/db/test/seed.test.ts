import { describe, expect, it } from "vitest";
import { seedCore } from "../src/seed.js";

describe("seedCore", () => {
  it("is idempotent while the Phase 1 auth-only schema has no seed rows", async () => {
    await expect(seedCore()).resolves.toEqual({ inserted: 0, updated: 0 });
    await expect(seedCore()).resolves.toEqual({ inserted: 0, updated: 0 });
  });
});
