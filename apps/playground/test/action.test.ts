import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { action, safeRedirectTarget } from "../lib/action.js";

describe("action", () => {
  it("validates input before authorize and handler run", async () => {
    const authorize = vi.fn();
    const handler = vi.fn();
    const submit = action("proof.noop", {
      authorize,
      handler,
      schema: z.object({ name: z.string().min(1) })
    });

    await expect(submit({ name: "" })).resolves.toEqual({
      error: { code: "validation.invalid_input" },
      ok: false
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("authorizes before running the mutation handler", async () => {
    const authorize = vi.fn().mockResolvedValue({ id: "user_1" });
    const handler = vi.fn().mockResolvedValue({ saved: true });
    const submit = action("proof.noop", {
      authorize,
      handler,
      schema: z.object({ name: z.string().min(1) })
    });

    await expect(submit({ name: "Core" })).resolves.toEqual({
      data: { saved: true },
      ok: true
    });
    expect(authorize).toHaveBeenCalledWith({
      action: "execute",
      input: { name: "Core" },
      resource: "proof"
    });
    expect(handler).toHaveBeenCalledWith({
      actor: { id: "user_1" },
      input: { name: "Core" },
      policy: expect.objectContaining({ resource: "proof" })
    });
  });

  it("requires double-submit CSRF values for critical actions", async () => {
    const authorize = vi.fn();
    const handler = vi.fn();
    const claim = action("bootstrap.claim", {
      authorize,
      handler,
      schema: z.object({
        csrfCookie: z.string().optional(),
        csrfToken: z.string().optional()
      })
    });

    await expect(claim({})).resolves.toEqual({
      error: { code: "auth.forbidden" },
      ok: false
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("safeRedirectTarget", () => {
  it("allows known internal paths and locale-prefixed variants", () => {
    expect(safeRedirectTarget("/admin/users")).toBe("/admin/users");
    expect(safeRedirectTarget("/de/admin/users")).toBe("/de/admin/users");
  });

  it("rejects external, protocol-relative, encoded, and unknown targets", () => {
    expect(safeRedirectTarget("https://evil.example")).toBeNull();
    expect(safeRedirectTarget("//evil.example")).toBeNull();
    expect(safeRedirectTarget("%2F%2Fevil.example")).toBeNull();
    expect(safeRedirectTarget("/unknown")).toBeNull();
  });
});
